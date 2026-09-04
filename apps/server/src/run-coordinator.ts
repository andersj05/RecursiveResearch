import type { CodexModel, CodexTurnEvent, CodexProvider } from '@recursive-research/codex-provider';
import { CodexProviderError } from '@recursive-research/codex-provider';
import {
  isActiveRun,
  stageOutputSchema,
  type HarnessState,
  type Run,
  type StartRunInput,
} from '@recursive-research/contracts';
import {
  advanceHarness,
  stageInstructions,
  stagePrompt,
  buildTurnInstructions,
} from '@recursive-research/harness';
import { WorkspaceStore } from './storage.js';
import { AppError } from './errors.js';

export type ExecutionProvider = Pick<
  CodexProvider,
  'getStatus' | 'listModels' | 'executeTurn' | 'steerTurn' | 'close'
>;
type RunPatch = Parameters<WorkspaceStore['updateRun']>[1];
type Notify = (event: string, data?: { chatId: string; runId: string }) => void;
interface Worker {
  run: Run;
  controller: AbortController;
  parts: Map<string, string>;
  text: string;
  queue: Promise<void>;
  done: Promise<void>;
  flushTimer?: ReturnType<typeof setTimeout>;
  failure?: unknown;
  timedOut: boolean;
  stopping: boolean;
  shutdown: boolean;
  finishing: boolean;
  lastProgress: string;
}

function safeError(error: unknown): string {
  return error instanceof AppError || error instanceof CodexProviderError
    ? error.message
    : 'The response could not be completed. Check the Codex connection and project folder, then retry.';
}

/** Owns live processes; the store owns durable run state and the provider owns Codex. */
export class RunCoordinator {
  private readonly active = new Map<string, Worker>();
  private readonly pendingWrites = new Map<string, { worker: Worker; patch: RunPatch }>();
  private reconciling: Promise<void> | null = null;
  private readonly startingChats = new Set<string>();
  private closing = false;
  constructor(
    private readonly store: WorkspaceStore,
    private readonly provider: ExecutionProvider,
    private readonly notify: Notify,
    private readonly timeoutMs = { chat: 5 * 60_000, research: 20 * 60_000 },
  ) {}

  async start(chatId: string, input: StartRunInput): Promise<Run> {
    if (input.harness && input.mode !== 'research')
      throw new AppError(400, 'INVALID_MODE', 'The harness requires Research mode.');
    await this.reconcile();
    if ([...this.pendingWrites.values()].some(({ worker }) => worker.run.chatId === chatId))
      throw new AppError(
        503,
        'SAVE_PENDING',
        'The previous response is waiting for its project folder. Reconnect the folder and retry.',
      );
    if (this.closing)
      throw new AppError(503, 'SERVER_STOPPING', 'The app is restarting. Try again shortly.');
    const finishing = [...this.active.values()].filter((worker) => worker.finishing);
    if (finishing.length) await Promise.all(finishing.map((worker) => worker.done));
    if (this.closing)
      throw new AppError(503, 'SERVER_STOPPING', 'The app is restarting. Try again shortly.');
    const { settings } = await this.store.workspace();
    if (
      this.startingChats.has(chatId) ||
      [...this.active.values()].some((worker) => worker.run.chatId === chatId)
    )
      throw new AppError(
        409,
        'CHAT_BUSY',
        'This chat already has a response in progress. Stop it or wait for it to finish.',
      );
    if (this.active.size + this.startingChats.size >= settings.maxParallelAgents)
      throw new AppError(
        409,
        'RUN_LIMIT',
        'The concurrent job limit has been reached. Wait for a job to finish or change the limit in Configuration.',
      );
    this.startingChats.add(chatId);
    try {
      const context = await this.store.getRunContext(chatId);
      const status = await this.provider.getStatus();
      if (status.state !== 'connected')
        throw new AppError(
          409,
          'CODEX_CONNECTION_REQUIRED',
          status.message || 'Connect your Codex subscription in Configuration.',
        );
      const models = await this.provider.listModels();
      const requestedModel = input.model ?? settings.model;
      const model = requestedModel
        ? models.find((item) => item.model === requestedModel)
        : (models.find((item) => item.isDefault) ?? models[0]);
      if (!model)
        throw new AppError(
          400,
          'MODEL_UNAVAILABLE',
          'The selected model is not available. Choose a model from the current Codex account.',
        );
      const configuredEffort = settings.reasoningEffort;
      const effort =
        input.reasoningEffort ??
        (configuredEffort &&
        model.supportedReasoningEfforts.some((item) => item.reasoningEffort === configuredEffort)
          ? configuredEffort
          : model.defaultReasoningEffort);
      this.validateEffort(model, effort);
      if (this.closing)
        throw new AppError(503, 'SERVER_STOPPING', 'The app is restarting. Try again shortly.');
      const harness: HarnessState | null = input.harness
        ? {
            version: 1,
            stage: 'scope',
            brief: input.content,
            ...input.harness,
            requirePrimarySources: settings.requirePrimarySources,
            instructions: settings.instructions,
            round: 0,
            question: null,
            answer: null,
            plan: [],
            sources: [],
            gaps: [],
            steps: [],
            stopReason: null,
          }
        : null;
      const run = await this.store.createRun(chatId, {
        ...input,
        model: model.model,
        reasoningEffort: effort,
        harnessState: harness,
      });
      const worker: Worker = {
        run,
        controller: new AbortController(),
        parts: new Map(),
        text: '',
        queue: Promise.resolve(),
        done: Promise.resolve(),
        timedOut: false,
        stopping: false,
        shutdown: false,
        finishing: false,
        lastProgress: '',
      };
      this.active.set(run.id, worker);
      // Older saved briefs have no provider thread. Carry their context into the first turn.
      const history = run.threadId
        ? ''
        : context.messages
            .filter((message) => message.content.trim() && message.status !== 'failed')
            .slice(-20)
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n\n')
            .slice(-60000);
      const prompt = history
        ? `Previous conversation:\n${history}\n\nCurrent user message:\n${input.content}`
        : input.content;
      worker.done = this.execute(worker, {
        threadId: run.threadId ?? undefined,
        cwd: context.project.folderPath,
        prompt,
        model: model.model,
        effort,
        mode: input.mode,
        instructions: buildTurnInstructions(input.mode, settings),
      });
      this.notify('workspace.changed');
      return run;
    } finally {
      this.startingChats.delete(chatId);
    }
  }

  private validateEffort(model: CodexModel, effort: string): void {
    if (!model.supportedReasoningEfforts.some((item) => item.reasoningEffort === effort))
      throw new AppError(
        400,
        'THINKING_UNAVAILABLE',
        'That thinking level is not supported by this model. Choose one of its available levels.',
      );
  }

  private enqueue(worker: Worker, patch: RunPatch): void {
    worker.queue = worker.queue
      .then(async () => {
        if (worker.failure) return;
        worker.run = await this.store.updateRun(worker.run.id, patch);
        this.notify('run.updated', { chatId: worker.run.chatId, runId: worker.run.id });
      })
      .catch((error: unknown) => {
        worker.failure = error;
        worker.controller.abort();
      });
  }

  private event(worker: Worker, event: CodexTurnEvent): void {
    if (event.type === 'thread') this.enqueue(worker, { threadId: event.threadId });
    else if (event.type === 'started')
      this.enqueue(worker, { status: 'running', threadId: event.threadId, turnId: event.turnId });
    else if (event.type === 'progress') {
      const summary = event.message.slice(0, 500);
      if (summary !== worker.lastProgress) {
        worker.lastProgress = summary;
        this.enqueue(worker, { summary });
      }
    } else if (event.type === 'text-delta' || event.type === 'message') {
      worker.parts.set(
        event.itemId,
        event.type === 'message'
          ? event.text
          : (worker.parts.get(event.itemId) ?? '') + event.delta,
      );
      worker.text = [...worker.parts.values()].join('\n\n');
      if (worker.text.length > 200000) {
        worker.failure = new AppError(
          413,
          'RESPONSE_TOO_LARGE',
          'The response exceeded the saved-message size limit. Ask for a more focused response.',
        );
        worker.text = worker.text.slice(0, 200000);
        worker.controller.abort();
      } else if (!worker.flushTimer) {
        worker.flushTimer = setTimeout(() => {
          worker.flushTimer = undefined;
          this.enqueue(worker, { content: worker.text });
        }, 300);
      }
    }
  }

  private async execute(
    worker: Worker,
    input: Parameters<CodexProvider['executeTurn']>[0],
  ): Promise<void> {
    const timeout = setTimeout(() => {
      worker.timedOut = true;
      worker.controller.abort();
    }, this.timeoutMs[input.mode]);
    timeout.unref();
    try {
      if (worker.run.harness) {
        await this.executeHarness(worker, input);
        return;
      }
      const result = await this.provider.executeTurn(
        input,
        (event) => this.event(worker, event),
        worker.controller.signal,
      );
      worker.finishing = true;
      if (worker.flushTimer) clearTimeout(worker.flushTimer);
      await worker.queue;
      if (worker.failure) throw worker.failure;
      if (worker.timedOut)
        throw new AppError(
          408,
          'RUN_TIMEOUT',
          'The job reached its time limit. Try a smaller request.',
        );
      worker.text = result.text.slice(0, 200000);
      await this.persistTerminal(worker, {
        status:
          result.status === 'completed'
            ? 'completed'
            : worker.shutdown
              ? 'interrupted'
              : 'cancelled',
        content: worker.text,
        threadId: result.threadId,
        turnId: result.turnId,
      });
    } catch (error) {
      worker.finishing = true;
      if (worker.flushTimer) clearTimeout(worker.flushTimer);
      await worker.queue;
      const failure = worker.failure ?? error;
      const cancelled = worker.stopping && !worker.failure && !worker.timedOut;
      await this.persistTerminal(worker, {
        status: worker.shutdown ? 'interrupted' : cancelled ? 'cancelled' : 'failed',
        content: worker.text,
        error: worker.shutdown
          ? 'The app stopped before this response finished.'
          : cancelled
            ? null
            : worker.timedOut
              ? 'The job reached its time limit. Try a smaller request.'
              : safeError(failure),
      });
    } finally {
      clearTimeout(timeout);
      this.active.delete(worker.run.id);
      this.notify('run.updated', { chatId: worker.run.chatId, runId: worker.run.id });
      this.notify('workspace.changed');
    }
  }

  private async executeHarness(
    worker: Worker,
    input: Parameters<CodexProvider['executeTurn']>[0],
  ): Promise<void> {
    let state = worker.run.harness!;
    while (true) {
      worker.controller.signal.throwIfAborted();
      if (state.stage === 'gather') state = { ...state, round: state.round + 1 };
      this.enqueue(worker, {
        status: 'running',
        turnId: null,
        harness: state,
        summary: `${state.stage === 'gather' ? `Gather � round ${state.round}` : state.stage.charAt(0).toUpperCase() + state.stage.slice(1)} started.`,
      });
      await worker.queue;
      if (worker.failure) throw worker.failure;
      worker.controller.signal.throwIfAborted();
      const report = state.stage === 'report';
      worker.parts.clear();
      const result = await this.provider.executeTurn(
        {
          ...input,
          // Each stage receives bounded, validated context, never a prior raw provider transcript.
          threadId: undefined,
          mode: state.stage === 'gather' ? 'research' : 'chat',
          prompt: stagePrompt(state),
          instructions: stageInstructions(state),
          outputSchema: report
            ? undefined
            : stageOutputSchema(state.stage as Exclude<HarnessState['stage'], 'report'>),
        },
        (event) => {
          if (report || (event.type !== 'message' && event.type !== 'text-delta'))
            this.event(worker, event);
        },
        worker.controller.signal,
      );
      if (worker.flushTimer) {
        clearTimeout(worker.flushTimer);
        worker.flushTimer = undefined;
      }
      await worker.queue;
      if (worker.failure) throw worker.failure;
      worker.controller.signal.throwIfAborted();
      if (result.status !== 'completed')
        throw new CodexProviderError('TURN_CANCELLED', 'The research stage was interrupted.');
      if (report) {
        if (result.text.length > 200000)
          throw new AppError(
            413,
            'RESPONSE_TOO_LARGE',
            'The report exceeded the saved-message limit.',
          );
        state = {
          ...state,
          steps: [
            ...state.steps,
            {
              stage: 'report',
              round: state.round,
              summary: 'Research report saved.',
              completedAt: new Date().toISOString(),
            },
          ],
        };
        worker.finishing = true;
        worker.text = result.text;
        await this.persistTerminal(worker, {
          status: 'completed',
          content: result.text,
          harness: state,
        });
        return;
      }
      try {
        state = advanceHarness(state, result.text, new Date().toISOString());
      } catch {
        throw new AppError(
          502,
          'INVALID_STAGE_OUTPUT',
          'The research stage returned an invalid result. Its last valid checkpoint is saved; start a new research run to retry.',
        );
      }
      worker.text = state.steps
        .map(
          (step) =>
            `### ${step.stage.charAt(0).toUpperCase() + step.stage.slice(1)}${step.round ? ` � round ${step.round}` : ''}\n\n${step.summary}`,
        )
        .join('\n\n');
      if (state.stage === 'scope' && state.question) {
        worker.finishing = true;
        worker.text += `\n\n**Question:** ${state.question}`;
        await this.persistTerminal(worker, {
          status: 'waiting',
          harness: state,
          content: worker.text,
          turnId: null,
          summary: 'Waiting for your clarification.',
        });
        return;
      }
      this.enqueue(worker, {
        harness: state,
        content: worker.text,
        turnId: null,
        summary: state.steps.at(-1)!.summary.slice(0, 500),
      });
      await worker.queue;
      if (worker.failure) throw worker.failure;
    }
  }

  async answer(id: string, content: string): Promise<Run> {
    await this.reconcile();
    const run = await this.store.run(id);
    if (this.closing)
      throw new AppError(503, 'SERVER_STOPPING', 'The app is restarting. Try again shortly.');
    const finishing = this.active.get(id);
    if (finishing?.finishing) await finishing.done;
    const { settings } = await this.store.workspace();
    if (this.startingChats.has(run.chatId) || this.active.has(id))
      throw new AppError(409, 'CHAT_BUSY', 'Research is already continuing.');
    if (this.active.size + this.startingChats.size >= settings.maxParallelAgents)
      throw new AppError(409, 'RUN_LIMIT', 'Wait for an active job to finish before continuing.');
    this.startingChats.add(run.chatId);
    try {
      const context = await this.store.getRunContext(run.chatId);
      if ((await this.provider.getStatus()).state !== 'connected')
        throw new AppError(409, 'CODEX_CONNECTION_REQUIRED', 'Connect Codex to continue research.');
      const model = (await this.provider.listModels()).find((item) => item.model === run.model);
      if (!model)
        throw new AppError(
          400,
          'MODEL_UNAVAILABLE',
          'The original model is unavailable. Stop this run and start a new one with an available model.',
        );
      this.validateEffort(model, run.reasoningEffort);
      if (this.closing)
        throw new AppError(503, 'SERVER_STOPPING', 'The app is restarting. Try again shortly.');
      const claimed = await this.store.answerHarness(id, content);
      const worker: Worker = {
        run: claimed,
        controller: new AbortController(),
        parts: new Map(),
        text: context.messages.find((item) => item.id === run.assistantMessageId)?.content ?? '',
        queue: Promise.resolve(),
        done: Promise.resolve(),
        timedOut: false,
        stopping: false,
        shutdown: false,
        finishing: false,
        lastProgress: '',
      };
      this.active.set(id, worker);
      worker.done = this.execute(worker, {
        cwd: context.project.folderPath,
        prompt: '',
        instructions: '',
        model: claimed.model,
        effort: claimed.reasoningEffort,
        mode: 'research',
      });
      this.notify('workspace.changed');
      return claimed;
    } finally {
      this.startingChats.delete(run.chatId);
    }
  }

  async cancel(id: string): Promise<Run> {
    const knownWorker = this.active.get(id);
    if (knownWorker?.finishing) {
      await knownWorker.done;
      return this.cancel(id);
    }
    if (knownWorker) {
      // Stop must work even while the chosen project drive is disconnected.
      knownWorker.stopping = true;
      knownWorker.controller.abort();
      try {
        return await this.store.run(id);
      } catch {
        return knownWorker.run;
      }
    }
    await this.reconcile();
    const run = await this.store.run(id);
    if (run.status === 'waiting') {
      const cancelled = await this.store.cancelWaitingHarness(id);
      this.notify('workspace.changed');
      return cancelled;
    }
    if (!isActiveRun(run)) return run;
    const worker = this.active.get(id);
    if (!worker)
      throw new AppError(
        409,
        'RUN_OWNED_ELSEWHERE',
        'This job is running in another app process. Stop it from that process.',
      );
    worker.stopping = true;
    worker.controller.abort();
    // Cancellation is asynchronous; the UI keeps the saved active state until Codex acknowledges.
    return this.store.run(id);
  }

  async steer(id: string, content: string): Promise<Run> {
    const run = await this.store.run(id);
    const worker = this.active.get(id);
    if (
      !worker ||
      !isActiveRun(run) ||
      !run.threadId ||
      !run.turnId ||
      worker.controller.signal.aborted
    )
      throw new AppError(
        409,
        'RUN_NOT_STEERABLE',
        'Wait for the response to start, or send a new message after it finishes.',
      );
    await this.provider.steerTurn(run.threadId, run.turnId, content);
    // The provider acknowledged this guidance. Persist it only after acceptance.
    await this.store.addMessage(run.chatId, content);
    this.enqueue(worker, { summary: 'Additional guidance received.' });
    await worker.queue;
    this.notify('workspace.changed');
    return this.store.run(id);
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const worker of this.active.values()) {
      worker.shutdown = true;
      worker.controller.abort();
    }
    await this.provider.close();
    await Promise.allSettled([...this.active.values()].map((worker) => worker.done));
    await this.reconcile();
  }

  private async persistTerminal(worker: Worker, patch: RunPatch): Promise<void> {
    try {
      worker.run = await this.store.updateRun(worker.run.id, patch);
      this.pendingWrites.delete(worker.run.id);
    } catch (error) {
      let retry = patch;
      if (
        patch.status === 'completed' &&
        error instanceof AppError &&
        ['EMPTY_REPORT', 'REPORT_EXISTS'].includes(error.code)
      ) {
        // A report that cannot be created is a terminal application error, not a
        // disconnected-drive retry. Preserve the answer and finish the run as failed.
        retry = { ...patch, status: 'failed', error: error.message };
        try {
          worker.run = await this.store.updateRun(worker.run.id, retry);
          this.pendingWrites.delete(worker.run.id);
          return;
        } catch {
          // The project may also have become unavailable between these attempts.
        }
      }
      // Keep the final response in memory until its drive returns. Never leave a
      // finished job stranded as an active run owned by this still-live process.
      this.pendingWrites.set(worker.run.id, { worker, patch: retry });
    }
  }

  /** Retry only already-authorized writes when a client reloads or reconnects. */
  reconcile(): Promise<void> {
    if (this.reconciling) return this.reconciling;
    const operation = (async () => {
      let changed = false;
      for (const [id, pending] of this.pendingWrites) {
        try {
          pending.worker.run = await this.store.updateRun(id, pending.patch);
          this.pendingWrites.delete(id);
          changed = true;
        } catch {
          /* The folder may still be unavailable; retain the snapshot. */
        }
      }
      if (changed) this.notify('workspace.changed');
    })();
    this.reconciling = operation;
    void operation.finally(() => {
      if (this.reconciling === operation) this.reconciling = null;
    });
    return operation;
  }
}
