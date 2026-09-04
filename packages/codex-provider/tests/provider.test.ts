import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CodexProvider,
  type CodexProviderEvent,
  type CodexTurnEvent,
  type CodexTurnInput,
} from '../src/index.js';

const fixture = fileURLToPath(new URL('./fixtures/app-server.mjs', import.meta.url));
const providers: CodexProvider[] = [];

function createProvider(mode = 'normal', timeout = 3_000): CodexProvider {
  const provider = new CodexProvider({
    executable: process.execPath,
    executableArgs: [fixture, mode],
    requestTimeoutMs: timeout,
  });
  providers.push(provider);
  return provider;
}

afterEach(async () => {
  await Promise.all(providers.splice(0).map((provider) => provider.close()));
});

const turnInput: CodexTurnInput = {
  cwd: process.cwd(),
  prompt: 'A research question',
  instructions: 'Answer the question.',
  model: 'one',
  effort: 'medium',
  mode: 'chat',
};

describe('Codex turn execution', () => {
  it('preserves early events, selected model/effort/search mode, and final-answer text without reasoning', async () => {
    const provider = createProvider('early-turn');
    const events: CodexTurnEvent[] = [];
    const result = await provider.executeTurn(
      { ...turnInput, model: 'two', effort: 'high', mode: 'research' },
      (event) => events.push(event),
    );
    expect(result).toMatchObject({
      threadId: 'thread-1',
      turnId: 'turn-1',
      status: 'completed',
      text: 'two/high/live: A research question',
    });
    expect(events[0]).toEqual({ type: 'thread', threadId: 'thread-1' });
    expect(events[1]).toEqual({ type: 'started', threadId: 'thread-1', turnId: 'turn-1' });
    expect(
      events.filter((event) => event.type === 'message' && event.itemId === 'answer'),
    ).toHaveLength(1);
    expect(events.some((event) => event.type === 'text-delta')).toBe(true);
    expect(events.some((event) => event.type === 'progress')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('private reasoning');
    expect(result.text).not.toContain('Checking sources');
  });

  it('forwards per-turn output schemas without changing execution restrictions', async () => {
    const provider = createProvider('structured-output');
    const outputSchema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    };
    const result = await provider.executeTurn({ ...turnInput, outputSchema }, () => {});
    expect(JSON.parse(result.text)).toEqual(outputSchema);
  });

  it('isolates concurrent threads and resumes stored thread IDs with updated controls', async () => {
    const provider = createProvider();
    const [first, second] = await Promise.all([
      provider.executeTurn({ ...turnInput, prompt: 'First' }, () => {}),
      provider.executeTurn({ ...turnInput, prompt: 'Second' }, () => {}),
    ]);
    expect(first.threadId).not.toBe(second.threadId);
    expect(first.text).toBe('one/medium/disabled: First');
    expect(second.text).toBe('one/medium/disabled: Second');
    const resumed = await provider.executeTurn(
      { ...turnInput, threadId: first.threadId, prompt: 'Follow up', model: 'two', effort: 'low' },
      () => {},
    );
    expect(resumed.threadId).toBe(first.threadId);
    expect(resumed.text).toBe('two/low/disabled: Follow up');
  });

  it('steers a running turn and rejects duplicate turns on the same thread', async () => {
    const provider = createProvider('turn-wait');
    let started!: (event: Extract<CodexTurnEvent, { type: 'started' }>) => void;
    const ready = new Promise<Extract<CodexTurnEvent, { type: 'started' }>>((resolve) => {
      started = resolve;
    });
    const running = provider.executeTurn(turnInput, (event) => {
      if (event.type === 'started') started(event);
    });
    const ids = await ready;
    await expect(
      provider.executeTurn({ ...turnInput, threadId: ids.threadId }, () => {}),
    ).rejects.toMatchObject({ code: 'TURN_IN_PROGRESS' });
    await provider.steerTurn(ids.threadId, ids.turnId, 'Focus on primary sources.');
    expect((await running).text).toBe('Focus on primary sources.');
  });

  it('cancels running and pre-start turns', async () => {
    const provider = createProvider('turn-wait');
    const controller = new AbortController();
    const result = await provider.executeTurn(
      turnInput,
      (event) => {
        if (event.type === 'started') controller.abort();
      },
      controller.signal,
    );
    expect(result.status).toBe('interrupted');
    await expect(
      provider.executeTurn(turnInput, () => {}, controller.signal),
    ).rejects.toMatchObject({ code: 'TURN_CANCELLED' });
  });

  it('rejects unsafe settings, failed turns, malformed responses, and disconnects without raw diagnostics', async () => {
    for (const [mode, code] of [
      ['unsafe-config', 'EXECUTION_UNAVAILABLE'],
      ['unsafe-thread', 'EXECUTION_UNAVAILABLE'],
      ['mcp-leak', 'EXECUTION_UNAVAILABLE'],
      ['turn-failure', 'TURN_FAILED'],
      ['bad-turn', 'INVALID_RESPONSE'],
      ['turn-exit', 'CONNECTION_CLOSED'],
    ] as const) {
      await expect(createProvider(mode).executeTurn(turnInput, () => {})).rejects.toMatchObject({
        code,
        message: expect.not.stringContaining('sensitive-fixture-token'),
      });
    }
  });

  it('rejects an in-flight turn when the connection closes', async () => {
    const provider = createProvider('turn-wait');
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const running = provider.executeTurn(turnInput, (event) => {
      if (event.type === 'started') started();
    });
    const rejected = expect(running).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
    await ready;
    await provider.close();
    await rejected;
  });
});

describe('Codex subscription boundary', () => {
  it('initializes one shared transport for concurrent reads and only returns allowed account metadata', async () => {
    const provider = createProvider();
    const [status, models, usage] = await Promise.all([
      provider.getStatus(),
      provider.listModels(),
      provider.getUsage(),
    ]);
    expect(status).toEqual({
      state: 'connected',
      account: { type: 'chatgpt', email: 'fixture@example.test', planType: 'pro' },
      message: null,
      login: null,
    });
    expect(models.map((model) => model.id)).toEqual(['one', 'two']);
    expect(models[0]?.supportedReasoningEfforts).toEqual([
      { reasoningEffort: 'medium', description: 'Balanced' },
    ]);
    expect(usage.rateLimitsByLimitId?.['codex']?.primary?.usedPercent).toBe(25);
    expect(usage.rateLimitsByLimitId?.['other']?.primary).toEqual({
      usedPercent: null,
      windowDurationMins: null,
      resetsAt: null,
    });
    expect(usage.rateLimits?.secondary).toBeNull();
    expect(JSON.stringify({ status, models, usage })).not.toContain('sensitive-fixture-token');
  });

  it('reports signed-out and API-key sessions without treating them as a connected subscription', async () => {
    const signedOut = createProvider('signed-out');
    expect((await signedOut.getStatus()).state).toBe('signed-out');
    await expect(signedOut.getUsage()).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
    const apiKey = createProvider('api-key');
    expect((await apiKey.getStatus()).state).toBe('signed-out');
    await expect(apiKey.getUsage()).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });

  it('returns the managed browser URL and cancels a pending login without exposing errors', async () => {
    const provider = createProvider('signed-out');
    const events: CodexProviderEvent[] = [];
    provider.subscribe((event) => events.push(event));
    const login = await provider.startLogin();
    expect(login).toEqual({
      loginId: 'login-fixture',
      authUrl: 'https://auth.openai.com/authorize?state=fixture',
    });
    expect((await provider.getStatus()).login?.status).toBe('pending');
    await expect(provider.startLogin()).rejects.toMatchObject({ code: 'LOGIN_IN_PROGRESS' });
    await provider.cancelLogin(login.loginId);
    expect((await provider.getStatus()).login?.status).toBe('cancelled');
    expect(events.some((event) => event.type === 'login-updated')).toBe(true);
    expect(JSON.stringify(events)).not.toContain('sensitive-fixture-token');
  });

  it('handles a completion notification that precedes the login response', async () => {
    const provider = createProvider('early-login');
    await provider.startLogin();
    expect((await provider.getStatus()).login?.status).toBe('completed');
  });

  it('rejects untrusted browser destinations and repeated pagination cursors', async () => {
    await expect(createProvider('bad-url').startLogin()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(createProvider('repeating-cursor').listModels()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('returns actionable metadata when the CLI is missing', async () => {
    const provider = new CodexProvider({
      executable: 'recursive-research-nonexistent-codex-binary',
    });
    providers.push(provider);
    const status = await provider.getStatus();
    expect(status.state).toBe('unavailable');
    expect(status.message).toContain('CODEX_EXECUTABLE');
  });

  it('bounds hung startup and rejects malformed output and disconnected requests', async () => {
    await expect(createProvider('hang', 150).listModels()).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    await expect(createProvider('malformed').listModels()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    await expect(createProvider('exit').listModels()).rejects.toMatchObject({
      code: 'CONNECTION_CLOSED',
    });
  });

  it('does not return raw RPC diagnostics or reopen an explicitly closed provider', async () => {
    const provider = createProvider('rpc-error');
    const status = await provider.getStatus();
    expect(status.state).toBe('error');
    expect(status.message).toContain('(401)');
    expect(status.message).not.toContain('sensitive-fixture-token');
    await provider.close();
    await expect(provider.listModels()).rejects.toMatchObject({ code: 'CONNECTION_CLOSED' });
  });
});
