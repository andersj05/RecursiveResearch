import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CodexProvider, type CodexProviderEvent } from '../src/index.js';

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
