import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CodexProviderError,
  type CodexTurnEvent,
  type CodexTurnInput,
} from '@recursive-research/codex-provider';
import { defaultHarnessConfig, type StartRunInput } from '@recursive-research/contracts';
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
