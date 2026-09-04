import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CodexProviderError,
  type CodexTurnEvent,
  type CodexTurnInput,
} from '@recursive-research/codex-provider';
import {
  defaultHarnessConfig,
  defaultAdaptiveOptions,
  type StartRunInput,
} from '@recursive-research/contracts';
import { WorkspaceStore } from './storage.js';
import { RunCoordinator, type ExecutionProvider } from './run-coordinator.js';

const coordinators: RunCoordinator[] = [];
type Execute = ExecutionProvider['executeTurn'];
async function fixture(execute?: Execute, timeouts?: { chat: number; research: number }) {
  const root = await mkdtemp(path.join(tmpdir(), 'recursive-research-runtime-'));
  const folder = path.join(root, 'project');
  await mkdir(folder);
  const store = new WorkspaceStore(path.join(root, 'registry'));
  await store.initialize();
  const project = await store.createProject('Research', folder);
  const chat = await store.createChat(project.id, 'New chat');
  const model = {
    id: 'model-a',
    model: 'model-a',
    displayName: 'Model A',
    description: '',
    defaultReasoningEffort: 'low',
    supportedReasoningEfforts: [
      { reasoningEffort: 'low', description: '' },
      { reasoningEffort: 'high', description: '' },
    ],
    isDefault: true,
  };
  const provider: ExecutionProvider = {
    getStatus: vi.fn(async () => ({
      state: 'connected' as const,
      account: { type: 'chatgpt', email: null, planType: null },
      message: null,
      login: null,
    })),
    listModels: vi.fn(async () => [model]),
    executeTurn: vi.fn<Execute>(
      execute ??
        (async (_input, emit) => {
          emit({ type: 'thread', threadId: 'thread-a' });
          emit({ type: 'started', threadId: 'thread-a', turnId: 'turn-a' });
          emit({ type: 'text-delta', itemId: 'message-a', delta: 'A streamed ' });
          emit({ type: 'text-delta', itemId: 'message-a', delta: 'answer.' });
          emit({ type: 'message', itemId: 'message-a', text: 'A streamed answer.' });
          return {
            threadId: 'thread-a',
            turnId: 'turn-a',
            status: 'completed',
            text: 'A streamed answer.',
          };
        }),
    ),
    steerTurn: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  };
  const notify = vi.fn();
  const coordinator = new RunCoordinator(store, provider, notify, timeouts);
  coordinators.push(coordinator);
  return { store, chat, project, provider, coordinator, notify };
}
const input: StartRunInput = {
  content: 'Explain source provenance.',
  mode: 'chat',
  model: 'model-a',
  reasoningEffort: 'high',
};

const heldTurn: Execute = async (
  _input: CodexTurnInput,
  emit: (event: CodexTurnEvent) => void,
  signal?: AbortSignal,
) => {
  emit({ type: 'thread', threadId: 'thread-a' });
  emit({ type: 'started', threadId: 'thread-a', turnId: 'turn-a' });
  emit({ type: 'text-delta', itemId: 'message-a', delta: 'Partial response' });
  await new Promise<void>((_resolve, reject) => {
    const abort = () => reject(new CodexProviderError('TURN_CANCELLED', 'Turn stopped.'));
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
  return {
    threadId: 'thread-a',
    turnId: 'turn-a',
    status: 'interrupted',
    text: 'Partial response',
  };
};

afterEach(async () => {
  await Promise.all(coordinators.splice(0).map((item) => item.close()));
});

describe('Codex run coordination', () => {
  it('sends selected model/thinking, persists the answer and resumes the conversation', async () => {
    const { store, chat, coordinator, provider, notify } = await fixture();
    const run = await coordinator.start(chat.id, input);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 3000,
    });
    const detail = await store.chat(chat.id);
    expect(detail.messages.map((message) => message.content)).toEqual([
      input.content,
      'A streamed answer.',
    ]);
    expect(detail.chat.codexThreadId).toBe('thread-a');
    expect(provider.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'model-a', effort: 'high', mode: 'chat' }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
    expect(notify).toHaveBeenCalledWith('run.updated', { chatId: chat.id, runId: run.id });
    const second = await coordinator.start(chat.id, {
      ...input,
      content: 'Compare that with a bibliography.',
    });
    await vi.waitFor(async () => expect((await store.run(second.id)).status).toBe('completed'));
    expect(provider.executeTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        threadId: 'thread-a',
        prompt: 'Compare that with a bibliography.',
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('saves a completed research job as an artifact in its own project', async () => {
    const { store, chat, project, coordinator, provider } = await fixture();
    const run = await coordinator.start(chat.id, { ...input, mode: 'research' });
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 3000,
    });
    const completed = await store.run(run.id);
    expect(completed.reportPath).toBeTruthy();
    expect(await store.readArtifact(project.id, completed.reportPath!)).toContain(
      'A streamed answer.',
    );
    expect(provider.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'research',
        instructions: expect.stringContaining('web search'),
      }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('finishes an empty research result as failed instead of retrying it as a drive outage', async () => {
    const { store, chat, coordinator } = await fixture(async () => ({
      threadId: 'thread-a',
      turnId: 'turn-a',
      status: 'completed',
      text: '',
    }));
    const run = await coordinator.start(chat.id, { ...input, mode: 'research' });
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('failed'));
    expect((await store.run(run.id)).error).toContain('did not produce a report');
  });

  it('stops an active response, preserves its partial text and accepts steering only when active', async () => {
    const { store, chat, coordinator, provider } = await fixture(heldTurn);
    const run = await coordinator.start(chat.id, input);
    await vi.waitFor(async () => expect((await store.run(run.id)).turnId).toBe('turn-a'));
    await coordinator.steer(run.id, 'Focus on original sources.');
    expect(provider.steerTurn).toHaveBeenCalledWith(
      'thread-a',
      'turn-a',
      'Focus on original sources.',
    );
    await coordinator.cancel(run.id);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('cancelled'));
    expect(
      (await store.chat(chat.id)).messages.find((message) => message.id === run.assistantMessageId)
        ?.content,
    ).toBe('Partial response');
    await expect(coordinator.steer(run.id, 'Late guidance')).rejects.toMatchObject({
      code: 'RUN_NOT_STEERABLE',
    });
  });

  it('rejects unavailable models/thinking and duplicate or over-budget runs before inference', async () => {
    const { store, chat, project, coordinator, provider } = await fixture(heldTurn);
    await expect(coordinator.start(chat.id, { ...input, model: 'missing' })).rejects.toMatchObject({
      code: 'MODEL_UNAVAILABLE',
    });
    await expect(
      coordinator.start(chat.id, { ...input, reasoningEffort: 'impossible' }),
    ).rejects.toMatchObject({ code: 'THINKING_UNAVAILABLE' });
    expect(provider.executeTurn).not.toHaveBeenCalled();
    await store.saveSettings({ ...defaultHarnessConfig, maxParallelAgents: 1 });
    const otherChat = await store.createChat(project.id, 'Second chat');
    const run = await coordinator.start(chat.id, input);
    await expect(coordinator.start(chat.id, input)).rejects.toMatchObject({ code: 'CHAT_BUSY' });
    await expect(coordinator.start(otherChat.id, input)).rejects.toMatchObject({
      code: 'RUN_LIMIT',
    });
    await coordinator.cancel(run.id);
  });

  it('bounds execution time and refuses signed-out accounts without saving a sent message', async () => {
    const { store, chat, coordinator, provider } = await fixture(heldTurn, {
      chat: 150,
      research: 150,
    });
    const run = await coordinator.start(chat.id, input);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('failed'));
    expect((await store.run(run.id)).error).toContain('time limit');
    vi.mocked(provider.getStatus).mockResolvedValue({
      state: 'signed-out',
      account: null,
      message: 'Connect Codex.',
      login: null,
    });
    const before = (await store.chat(chat.id)).messages.length;
    await expect(coordinator.start(chat.id, input)).rejects.toMatchObject({
      code: 'CODEX_CONNECTION_REQUIRED',
    });
    expect((await store.chat(chat.id)).messages).toHaveLength(before);
  });

  it('applies saved thinking to the default model and retries a terminal snapshot when storage returns', async () => {
    const { store, chat, coordinator, provider } = await fixture();
    await store.saveSettings({ ...defaultHarnessConfig, reasoningEffort: 'high' });
    const originalUpdate = store.updateRun.bind(store);
    let blocked = true;
    const update = vi.spyOn(store, 'updateRun').mockImplementation(async (id, patch) => {
      if (patch.status === 'completed' && blocked) {
        blocked = false;
        throw new Error('temporary drive failure');
      }
      return originalUpdate(id, patch);
    });
    const run = await coordinator.start(chat.id, { ...input, reasoningEffort: null });
    await vi.waitFor(() => expect(blocked).toBe(false));
    expect((await store.run(run.id)).status).toMatch(/queued|running/);
    update.mockImplementation(originalUpdate);
    await coordinator.reconcile();
    expect((await store.run(run.id)).status).toBe('completed');
    expect(provider.executeTurn).toHaveBeenCalledWith(
      expect.objectContaining({ effort: 'high' }),
      expect.any(Function),
      expect.any(AbortSignal),
    );
  });

  it('stops the known model turn before attempting an unavailable project read', async () => {
    const { store, chat, coordinator } = await fixture(heldTurn);
    const run = await coordinator.start(chat.id, input);
    await vi.waitFor(async () => expect((await store.run(run.id)).turnId).toBe('turn-a'));
    const read = vi.spyOn(store, 'run').mockRejectedValueOnce(new Error('drive unavailable'));
    await expect(coordinator.cancel(run.id)).resolves.toMatchObject({ id: run.id });
    read.mockRestore();
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('cancelled'));
  });
});

describe('sequential research harness', () => {
  const research = {
    ...input,
    mode: 'research' as const,
    harness: { maxRounds: 2, maxSources: 3 },
  };
  function scripted(outputs: unknown[]): Execute {
    let index = 0;
    return async (_input, emit) => {
      const turn = `stage-${index}`;
      emit({ type: 'started', threadId: turn, turnId: turn });
      const output = outputs[index++];
      const text = typeof output === 'string' ? output : JSON.stringify(output);
      emit({ type: 'message', itemId: turn, text });
      return { threadId: turn, turnId: turn, status: 'completed', text };
    };
  }
  const source = {
    url: 'https://example.com/research',
    title: 'Primary source',
    finding: 'A supported finding',
    primary: true,
  };
  it('executes the graph, limits search to gathering and publishes a report', async () => {
    const { coordinator, store, chat, project, provider } = await fixture(
      scripted([
        { summary: 'Clear scope', question: null },
        { questions: ['What is known?'] },
        { summary: 'Evidence found', sources: [source] },
        { summary: 'Coverage complete', gaps: [] },
        '# Research report\n\nA finding [Source](https://example.com/research).',
      ]),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 5000,
    });
    const saved = await store.run(run.id);
    expect(saved.harness?.steps.map((step) => step.stage)).toEqual([
      'scope',
      'plan',
      'gather',
      'review',
      'report',
    ]);
    expect(saved.harness?.sources).toHaveLength(1);
    expect(saved.harness?.stopReason).toContain('no remaining');
    expect(await store.readArtifact(project.id, saved.reportPath!)).toContain('# Research report');
    const calls = vi.mocked(provider.executeTurn).mock.calls;
    expect(calls.map(([turn]) => turn.mode)).toEqual(['chat', 'chat', 'research', 'chat', 'chat']);
    expect(calls.every(([turn]) => turn.threadId === undefined)).toBe(true);
    expect((await store.chat(chat.id)).chat.codexThreadId).toBeNull();
  });
  it('persists clarification, releases capacity, continues after coordinator restart, and rejects duplicate answers', async () => {
    const { coordinator, store, chat, provider, notify } = await fixture(
      scripted([
        { summary: 'Need region', question: 'Which region?' },
        { questions: ['Regional evidence?'] },
        { summary: 'Evidence found', sources: [source] },
        { summary: 'Covered', gaps: [] },
        '# Report',
      ]),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('waiting'), {
      timeout: 5000,
    });
    expect((await store.run(run.id)).reportPath).toBeNull();
    await coordinator.close();
    const resumed = new RunCoordinator(store, provider, notify);
    coordinators.push(resumed);
    const answers = await Promise.allSettled([
      resumed.answer(run.id, 'Europe'),
      resumed.answer(run.id, 'Asia'),
    ]);
    expect(answers.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 5000,
    });
    const acceptedAnswer = answers[0]?.status === 'fulfilled' ? 'Europe' : 'Asia';
    expect((await store.run(run.id)).harness?.answer).toBe(acceptedAnswer);
    expect(vi.mocked(provider.executeTurn).mock.calls[1]?.[0].prompt).toContain(acceptedAnswer);
    expect(
      (await store.chat(chat.id)).messages
        .filter((message) => ['Europe', 'Asia'].includes(message.content))
        .map((message) => message.content),
    ).toEqual([acceptedAnswer]);
  });
  it('enforces the round budget even when every review requests more research', async () => {
    const { coordinator, store, chat, provider } = await fixture(
      scripted([
        { summary: 'Clear', question: null },
        { questions: ['What is known?'] },
        { summary: 'No evidence', sources: [] },
        { summary: 'Need sources', gaps: ['Missing evidence'] },
        { summary: 'Still no evidence', sources: [] },
        { summary: 'Need sources', gaps: ['Missing evidence'] },
        '# Limitations\nNo supporting evidence was found.',
      ]),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 5000,
    });
    expect(provider.executeTurn).toHaveBeenCalledTimes(7);
    expect((await store.run(run.id)).harness?.round).toBe(2);
    expect((await store.run(run.id)).harness?.stopReason).toContain('round limit');
    expect((await store.run(run.id)).harness?.gaps).toEqual(['Missing evidence']);
  });

  it('fails invalid output without leaking raw structured text or starting another stage', async () => {
    const { coordinator, store, chat, provider } = await fixture(
      scripted(['invalid stage output']),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('failed'));
    expect(provider.executeTurn).toHaveBeenCalledTimes(1);
    expect((await store.run(run.id)).error).toContain('invalid result');
    expect((await store.chat(chat.id)).messages.at(-1)?.content).not.toContain(
      'invalid stage output',
    );
  });
  it('stops a waiting run without contacting a provider', async () => {
    const { coordinator, store, chat, provider } = await fixture(
      scripted([{ summary: 'Need region', question: 'Which region?' }]),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('waiting'));
    await coordinator.cancel(run.id);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('cancelled'));
    expect(provider.executeTurn).toHaveBeenCalledTimes(1);
    await expect(coordinator.answer(run.id, 'Europe')).rejects.toThrow();
  });
  it('stops active gathering and never launches review or a report', async () => {
    const first = scripted([
      { summary: 'Clear', question: null },
      { questions: ['Find evidence'] },
    ]);
    let count = 0;
    const { coordinator, store, chat, provider } = await fixture((...args) =>
      ++count <= 2 ? first(...args) : heldTurn(...args),
    );
    const run = await coordinator.start(chat.id, research);
    await vi.waitFor(async () => expect((await store.run(run.id)).turnId).toBe('turn-a'));
    await coordinator.cancel(run.id);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('cancelled'));
    expect(provider.executeTurn).toHaveBeenCalledTimes(3);
    expect((await store.run(run.id)).harness?.stage).toBe('gather');
    expect((await store.run(run.id)).reportPath).toBeNull();
  });
});

describe('adaptive delegated research coordination', () => {
  const adaptiveInput: StartRunInput = {
    ...input,
    mode: 'research',
    harness: { ...defaultAdaptiveOptions, maxRounds: 2, maxTasks: 6, maxSources: 8, maxAgents: 2 },
  };
  const direction = (question: string) => ({
    question,
    reason: 'Resolve evidence gap',
    priority: 4,
    role: 'researcher',
    parentId: null,
  });
  const source = (name: string) => ({
    url: `https://example.com/${name}`,
    title: name,
    finding: `Evidence for ${name}`,
    primary: true,
  });
  it('delegates concurrent branches, evolves the frontier, records tools, and writes a concise report', async () => {
    let active = 0;
    let peak = 0;
    let investigations = 0;
    let reviews = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { coordinator, store, chat, provider } = await fixture(async (turn, emit) => {
      const context = JSON.parse(turn.prompt);
      const task = context.assignment;
      emit({ type: 'started', threadId: task.id, turnId: task.id });
      let output: unknown;
      if (task.role === 'planner')
        output = {
          summary: 'Research plan',
          question: null,
          directions: [direction('A'), direction('B')],
        };
      else if (task.role === 'synthesizer')
        output = {
          summary: 'Working synthesis',
          sufficient: ++reviews === 2,
          gaps: reviews === 1 ? ['Follow C'] : [],
          contradictions: [],
          directions: [],
        };
      else if (task.role === 'reporter')
        output = '# Findings\nA concise answer with [evidence](https://example.com/A).';
      else {
        active++;
        peak = Math.max(peak, active);
        investigations++;
        if (investigations === 2) release();
        emit({
          type: 'web-tool',
          call: { itemId: 'search', action: 'search', status: 'started', query: task.question },
        });
        await barrier;
        emit({
          type: 'web-tool',
          call: { itemId: 'search', action: 'search', status: 'completed', query: task.question },
        });
        output = {
          summary: `Finding ${task.question}`,
          sources: [source(task.question)],
          leads: task.question === 'A' ? [direction('C')] : [],
          uncertainties: [],
        };
        active--;
      }
      return {
        threadId: task.id,
        turnId: task.id,
        status: 'completed',
        text: typeof output === 'string' ? output : JSON.stringify(output),
      };
    });
    const run = await coordinator.start(chat.id, adaptiveInput);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 8000,
    });
    const saved = await store.run(run.id);
    expect(saved.harness?.version).toBe(2);
    if (saved.harness?.version !== 2) throw new Error('Expected adaptive state');
    expect(peak).toBe(2);
    expect(investigations).toBe(3);
    const tasks = saved.harness.orchestration.tasks;
    expect(tasks.find((t) => t.question === 'C')?.parentId).toBe(
      tasks.find((t) => t.question === 'A')?.id,
    );
    expect(saved.harness.sources).toHaveLength(3);
    expect(saved.harness.orchestration.toolCalls).toHaveLength(3);
    expect(saved.harness.orchestration.toolCalls.every((t) => t.status === 'completed')).toBe(true);
    expect(provider.executeTurn).toHaveBeenCalledTimes(7);
    expect(saved.reportPath).toBeTruthy();
    expect((await store.chat(chat.id)).messages.at(-1)?.content).not.toContain('Working synthesis');
  });
  it('cancels every active child and launches no synthesis after Stop', async () => {
    let running = 0;
    const { coordinator, store, chat, provider } = await fixture(async (turn, emit, signal) => {
      const task = JSON.parse(turn.prompt).assignment;
      if (task.role === 'planner')
        return {
          threadId: 'planner',
          turnId: 'planner',
          status: 'completed',
          text: JSON.stringify({
            summary: 'Plan',
            question: null,
            directions: [direction('A'), direction('B')],
          }),
        };
      running++;
      try {
        return await heldTurn(turn, emit, signal);
      } finally {
        running--;
      }
    });
    const run = await coordinator.start(chat.id, adaptiveInput);
    await vi.waitFor(() => expect(running).toBe(2), { timeout: 5000 });
    await coordinator.cancel(run.id);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('cancelled'));
    expect(running).toBe(0);
    expect(provider.executeTurn).toHaveBeenCalledTimes(3);
    const saved = (await store.run(run.id)).harness;
    if (saved?.version !== 2) throw new Error('Expected adaptive state');
    expect(
      saved.orchestration.tasks
        .filter((t) => t.role === 'researcher')
        .every((t) => t.status === 'cancelled'),
    ).toBe(true);
  });
  it('continues with partial evidence when one research agent returns invalid output', async () => {
    const { coordinator, store, chat } = await fixture(async (turn) => {
      const task = JSON.parse(turn.prompt).assignment;
      const output =
        task.role === 'planner'
          ? { summary: 'Plan', question: null, directions: [direction('A'), direction('B')] }
          : task.role === 'synthesizer'
            ? {
                summary: 'Partial result',
                sufficient: false,
                gaps: ['B failed'],
                contradictions: [],
                directions: [],
              }
            : task.role === 'reporter'
              ? 'Partial findings; one branch failed.'
              : task.question === 'A'
                ? { summary: 'A found', sources: [source('A')], leads: [], uncertainties: [] }
                : 'not JSON';
      return {
        threadId: task.id,
        turnId: task.id,
        status: 'completed',
        text: typeof output === 'string' ? output : JSON.stringify(output),
      };
    });
    const run = await coordinator.start(chat.id, adaptiveInput);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('completed'), {
      timeout: 5000,
    });
    const saved = (await store.run(run.id)).harness;
    if (saved?.version !== 2) throw new Error('Expected adaptive state');
    expect(saved.sources).toHaveLength(1);
    expect(saved.orchestration.tasks.find((t) => t.question === 'B')?.status).toBe('failed');
    expect(saved.gaps).toEqual(['B failed']);
  });
  it('persists clarification across restart and includes the answer in delegated prompts', async () => {
    const first = await fixture(async () => ({
      threadId: 'planner',
      turnId: 'planner',
      status: 'completed',
      text: JSON.stringify({
        summary: 'Choose scope',
        question: 'Which region?',
        directions: [direction('Regional evidence')],
      }),
    }));
    const run = await first.coordinator.start(first.chat.id, adaptiveInput);
    await vi.waitFor(async () => expect((await first.store.run(run.id)).status).toBe('waiting'), {
      timeout: 5000,
    });
    expect(first.coordinator.runtime().active).toBe(0);
    await first.coordinator.close();
    const execute = vi.fn<Execute>(async (turn) => {
      const context = JSON.parse(turn.prompt);
      expect(context.answer).toBe('Europe');
      const role = context.assignment.role;
      expect(role).not.toBe('planner');
      const output =
        role === 'researcher'
          ? { summary: 'Evidence', sources: [source('Europe')], leads: [], uncertainties: [] }
          : role === 'synthesizer'
            ? {
                summary: 'Supported',
                gaps: [],
                contradictions: [],
                sufficient: true,
                directions: [],
              }
            : 'Concise findings.';
      return {
        threadId: 'resumed',
        turnId: role,
        status: 'completed',
        text: typeof output === 'string' ? output : JSON.stringify(output),
      };
    });
    const next = new RunCoordinator(
      first.store,
      { ...first.provider, executeTurn: execute },
      () => {},
    );
    coordinators.push(next);
    await next.answer(run.id, 'Europe');
    await vi.waitFor(async () => expect((await first.store.run(run.id)).status).toBe('completed'), {
      timeout: 5000,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it('aborts sibling turns immediately on an infrastructure failure', async () => {
    let release!: () => void;
    const siblingStarted = new Promise<void>((resolve) => {
      release = resolve;
    });
    let aborted = false;
    const { coordinator, store, chat } = await fixture(async (turn, emit, signal) => {
      const task = JSON.parse(turn.prompt).assignment;
      if (task.role === 'planner')
        return {
          threadId: 'planner',
          turnId: 'planner',
          status: 'completed',
          text: JSON.stringify({
            summary: 'Plan',
            question: null,
            directions: [direction('A'), direction('B')],
          }),
        };
      if (task.question === 'A') {
        await siblingStarted;
        throw new CodexProviderError('NOT_SIGNED_IN', 'Connect your Codex subscription.');
      }
      release();
      try {
        return await heldTurn(turn, emit, signal);
      } finally {
        aborted = !!signal?.aborted;
      }
    });
    const run = await coordinator.start(chat.id, adaptiveInput);
    await vi.waitFor(async () => expect((await store.run(run.id)).status).toBe('failed'), {
      timeout: 5000,
    });
    expect(aborted).toBe(true);
    expect((await store.run(run.id)).error).toContain('Connect your Codex');
    expect(coordinator.runtime().active).toBe(0);
  });
  it('saves steering for future assignments and sends it to every active child', async () => {
    let active = 0;
    const { coordinator, store, chat, provider } = await fixture(async (turn, emit, signal) => {
      const task = JSON.parse(turn.prompt).assignment;
      if (task.role === 'planner')
        return {
          threadId: 'planner',
          turnId: 'planner',
          status: 'completed',
          text: JSON.stringify({
            summary: 'Plan',
            question: null,
            directions: [direction('A'), direction('B')],
          }),
        };
      active++;
      return heldTurn(turn, emit, signal);
    });
    const run = await coordinator.start(chat.id, adaptiveInput);
    await vi.waitFor(() => expect(active).toBe(2), { timeout: 5000 });
    await coordinator.steer(run.id, 'Prioritize original studies.');
    expect(provider.steerTurn).toHaveBeenCalledTimes(2);
    const state = (await store.run(run.id)).harness;
    if (state?.version !== 2) throw new Error('Expected adaptive');
    expect(state.orchestration.steering).toEqual(['Prioritize original studies.']);
    expect((await store.chat(chat.id)).messages.at(-1)?.content).toBe(
      'Prioritize original studies.',
    );
    await coordinator.cancel(run.id);
  });
});
