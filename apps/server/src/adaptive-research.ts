import { ZodError } from 'zod';
import {
  investigationOutputSchema,
  investigationPlanSchema,
  investigationResultSchema,
  synthesisResultSchema,
  type AdaptiveHarnessState,
  type AgentTask,
} from '@recursive-research/contracts';
import {
  createTask,
  admitDirections,
  nextResearchBatch,
  mergeInvestigation,
  stoppingReason,
  investigationInstructions,
  investigationPrompt,
  isResearchTask,
} from '@recursive-research/harness';
import {
  CodexProviderError,
  type CodexTurnEvent,
  type CodexTurnInput,
  type CodexProvider,
} from '@recursive-research/codex-provider';
import { AppError } from './errors.js';
import { TurnPool } from './turn-pool.js';

type Provider = Pick<CodexProvider, 'executeTurn' | 'steerTurn'>;
const now = () => new Date().toISOString();

/** Owns the mutable orchestration snapshot; all persistence receives immutable copies. */
export class AdaptiveResearch {
  readonly state: AdaptiveHarnessState;
  private writes: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private writeFailure?: unknown;
  private executionFailure?: unknown;
  private readonly started = Date.now();
  private readonly previousElapsed: number;
  constructor(
    state: AdaptiveHarnessState,
    private readonly provider: Provider,
    private readonly pool: TurnPool,
    private readonly input: Pick<CodexTurnInput, 'cwd' | 'model' | 'effort'>,
    private readonly controller: AbortController,
    private readonly save: (state: AdaptiveHarnessState, summary?: string) => Promise<void>,
    private readonly reportEvent: (event: CodexTurnEvent) => void,
  ) {
    this.state = structuredClone(state);
    this.previousElapsed = state.orchestration.elapsedMs;
  }
  private checkpoint(summary?: string): Promise<void> {
    this.state.orchestration.elapsedMs = this.previousElapsed + Date.now() - this.started;
    const snapshot = structuredClone(this.state);
    this.writes = this.writes.then(() => {
      if (this.writeFailure) throw this.writeFailure;
      return this.save(snapshot, summary);
    });
    void this.writes.catch((error) => {
      this.writeFailure = error;
      this.controller.abort();
    });
    return this.writes;
  }
  private activity() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.checkpoint();
    }, 200);
  }
  private event(task: AgentTask, event: CodexTurnEvent) {
    if (event.type === 'thread') task.threadId = event.threadId;
    if (event.type === 'started') {
      task.threadId = event.threadId;
      task.turnId = event.turnId;
    }
    if (event.type === 'progress') task.summary = event.message.slice(0, 2000);
    if (event.type === 'web-tool') {
      const calls = this.state.orchestration.toolCalls;
      const existing = calls.find(
        (call) => call.taskId === task.id && call.itemId === event.call.itemId,
      );
      if (existing) Object.assign(existing, event.call, { updatedAt: now() });
      else {
        if (calls.length === 2000) {
          calls.shift();
          this.state.orchestration.droppedToolCalls++;
        }
        calls.push({ ...event.call, taskId: task.id, recordedAt: now(), updatedAt: now() });
      }
    }
    if (task.role === 'reporter' && (event.type === 'message' || event.type === 'text-delta'))
      this.reportEvent(event);
    if (event.type !== 'message' && event.type !== 'text-delta') this.activity();
  }
  private async invoke(task: AgentTask): Promise<string> {
    const signal = this.controller.signal;
    const input: CodexTurnInput = {
      ...this.input,
      prompt: investigationPrompt(this.state, task),
      instructions: investigationInstructions(this.state, task.role),
      mode: isResearchTask(task) ? 'research' : 'chat',
      ...(task.role !== 'reporter' ? { outputSchema: investigationOutputSchema(task.role) } : {}),
    };
    task.request = {
      ...this.input,
      mode: input.mode,
      prompt: input.prompt,
      instructions: input.instructions,
      outputSchema: input.outputSchema ? JSON.stringify(input.outputSchema) : null,
    };
    task.status = 'queued';
    await this.checkpoint(`Queued ${task.id}: ${task.question.slice(0, 100)}`);
    return this.pool.run(signal, async () => {
      signal.throwIfAborted();
      task.status = 'running';
      task.startedAt = now();
      this.state.orchestration.turnsStarted++;
      await this.checkpoint(`${task.id} ${task.role} started.`);
      const result = await this.provider.executeTurn(
        input,
        (event) => this.event(task, event),
        signal,
      );
      signal.throwIfAborted();
      if (result.status !== 'completed')
        throw new CodexProviderError('TURN_FAILED', 'The research turn was interrupted.');
      task.threadId = result.threadId;
      task.turnId = result.turnId;
      return result.text;
    });
  }
  private complete(task: AgentTask, summary: string) {
    task.status = 'completed';
    task.summary = summary.slice(0, 2000);
    task.completedAt = now();
  }
  private async investigate(task: AgentTask) {
    task.round = this.state.round;
    try {
      const result = investigationResultSchema.parse(JSON.parse(await this.invoke(task)));
      mergeInvestigation(this.state, task, result, now());
      this.complete(task, result.summary);
    } catch (error) {
      if (this.controller.signal.aborted || this.writeFailure) throw error;
      if (!(
        error instanceof SyntaxError ||
        error instanceof ZodError ||
        (error instanceof CodexProviderError &&
          ['TURN_FAILED', 'INVALID_RESPONSE'].includes(error.code))
      )) {
        this.executionFailure = error;
        this.controller.abort();
        throw error;
      }
      task.status = 'failed';
      task.completedAt = now();
      task.error =
        error instanceof CodexProviderError
          ? error.message
          : 'Agent returned an invalid structured result.';
      task.summary = '';
    }
    await this.checkpoint(`${task.id} ${task.status}.`);
  }
  async run(): Promise<{ status: 'completed' | 'waiting'; text: string }> {
    try {
      if (
        !this.state.orchestration.tasks.some(
          (task) => task.role === 'planner' && task.status === 'completed',
        )
      ) {
        this.state.stage = 'plan';
        const planner = createTask(this.state, 'planner', 'Decompose the research brief', now());
        const result = investigationPlanSchema.parse(JSON.parse(await this.invoke(planner)));
        this.complete(planner, result.summary);
        this.state.orchestration.synthesis = result.summary;
        this.state.plan = result.directions.map((direction) => direction.question);
        admitDirections(this.state, result.directions, now(), planner.id);
        if (result.question?.trim()) {
          this.state.question = result.question.trim();
          this.state.stage = 'scope';
          await this.checkpoint('Waiting for essential scope clarification.');
          return { status: 'waiting', text: result.question.trim() };
        }
      }
      while (!this.state.stopReason) {
        this.controller.signal.throwIfAborted();
        const elapsed = this.previousElapsed + Date.now() - this.started;
        if (elapsed >= this.state.orchestration.maxMinutes * 60000 * 0.9) {
          this.state.stopReason = 'Time budget reserved for the final report.';
          break;
        }
        const batch = nextResearchBatch(this.state);
        if (!batch.length) {
          this.state.stopReason = 'No new admissible research directions remain.';
          break;
        }
        this.state.round++;
        this.state.stage = 'gather';
        const before = this.state.sources.length;
        await this.checkpoint(
          `Cycle ${this.state.round}: delegating ${batch.length} research assignments.`,
        );
        const results = await Promise.allSettled(batch.map((task) => this.investigate(task)));
        const failure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (failure) throw failure.reason;
        this.controller.signal.throwIfAborted();
        this.state.stage = 'review';
        const synthesis = createTask(
          this.state,
          'synthesizer',
          `Synthesize cycle ${this.state.round} and choose the next directions`,
          now(),
        );
        const result = synthesisResultSchema.parse(JSON.parse(await this.invoke(synthesis)));
        this.complete(synthesis, result.summary);
        this.state.orchestration.synthesis = result.summary;
        this.state.gaps = result.gaps;
        this.state.orchestration.contradictions = result.contradictions;
        const addedTasks = admitDirections(this.state, result.directions, now());
        const newSources = this.state.sources.length - before;
        this.state.orchestration.stagnantRounds = newSources
          ? 0
          : this.state.orchestration.stagnantRounds + 1;
        this.state.stopReason = stoppingReason(this.state, result.sufficient);
        this.state.orchestration.decisions.push({
          round: this.state.round,
          summary: this.state.stopReason ?? result.summary,
          newSources,
          addedTasks,
          createdAt: now(),
        });
        await this.checkpoint(
          this.state.stopReason ??
            `Cycle ${this.state.round} synthesized; selecting follow-up research.`,
        );
      }
      for (const task of this.state.orchestration.tasks)
        if (task.status === 'pending') {
          task.status = 'skipped';
          task.summary = this.state.stopReason ?? '';
        }
      this.state.stage = 'report';
      const reporter = createTask(
        this.state,
        'reporter',
        'Write the concise research answer',
        now(),
      );
      const text = await this.invoke(reporter);
      if (!text.trim() || text.length > 200000)
        throw new AppError(502, 'INVALID_REPORT', 'The agent did not produce a valid report.');
      this.complete(reporter, 'Final research answer ready.');
      await this.checkpoint('Research completed.');
      return { status: 'completed', text };
    } catch (error) {
      for (const task of this.state.orchestration.tasks) {
        if (['pending', 'queued', 'running'].includes(task.status)) {
          task.status = this.controller.signal.aborted ? 'cancelled' : 'failed';
          task.completedAt = now();
          if (task.status === 'failed')
            task.error = 'Execution ended before this assignment completed.';
        }
      }
      if (!this.writeFailure) await this.checkpoint('Research stopped before completion.');
      if (error instanceof SyntaxError || error instanceof ZodError)
        throw new AppError(
          502,
          'INVALID_ORCHESTRATION',
          'The orchestrator returned an invalid result. Saved evidence remains available.',
        );
      throw this.writeFailure ?? this.executionFailure ?? error;
    } finally {
      if (this.timer) clearTimeout(this.timer);
      await this.writes.catch(() => {});
    }
  }
  /** Durable run-level guidance is included in every subsequent child prompt. */
  async steer(content: string): Promise<void> {
    if (content.length > 4000 || this.state.orchestration.steering.length >= 20)
      throw new AppError(
        400,
        'GUIDANCE_LIMIT',
        'Use at most 4,000 characters per update and 20 updates per run.',
      );
    this.controller.signal.throwIfAborted();
    this.state.orchestration.steering.push(content);
    await this.checkpoint('Guidance saved for subsequent assignments.');
    const active = this.state.orchestration.tasks.filter(
      (task) => task.status === 'running' && task.threadId && task.turnId,
    );
    // A finishing child can reject steering; durable guidance still reaches the next stage.
    await Promise.allSettled(
      active.map((task) => this.provider.steerTurn(task.threadId!, task.turnId!, content)),
    );
  }
}
