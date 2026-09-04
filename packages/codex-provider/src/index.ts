import { AppServerRpc, isRecord, type RpcOptions } from './rpc.js';
import {
  CodexProviderError,
  type CodexAccount,
  type CodexLogin,
  type CodexModel,
  type CodexProviderEvent,
  type CodexQuotaWindow,
  type CodexRateLimits,
  type CodexStatus,
  type CodexUsage,
} from './types.js';

export * from './types.js';
export type CodexProviderOptions = RpcOptions;

function invalidResponse(): CodexProviderError {
  return new CodexProviderError(
    'INVALID_RESPONSE',
    'Codex returned an unsupported response. Update the Codex CLI and retry.',
  );
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readAccount(value: unknown): CodexAccount | null {
  if (!isRecord(value) || !('account' in value)) throw invalidResponse();
  if (value.account === null) return null;
  if (!isRecord(value.account) || typeof value.account.type !== 'string') throw invalidResponse();
  return {
    type: value.account.type,
    email: stringOrNull(value.account.email),
    planType: stringOrNull(value.account.planType),
  };
}

function readWindow(value: unknown): CodexQuotaWindow | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw invalidResponse();
  return {
    usedPercent: numberOrNull(value.usedPercent),
    windowDurationMins: numberOrNull(value.windowDurationMins),
    resetsAt: numberOrNull(value.resetsAt),
  };
}

function readRateLimits(value: unknown): CodexRateLimits | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw invalidResponse();
  return {
    limitId: stringOrNull(value.limitId),
    limitName: stringOrNull(value.limitName),
    primary: readWindow(value.primary),
    secondary: readWindow(value.secondary),
    planType: stringOrNull(value.planType),
  };
}

function readModel(value: unknown): CodexModel {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.model !== 'string' ||
    typeof value.displayName !== 'string' ||
    typeof value.defaultReasoningEffort !== 'string' ||
    !Array.isArray(value.supportedReasoningEfforts)
  )
    throw invalidResponse();
  return {
    id: value.id,
    model: value.model,
    displayName: value.displayName,
    description: typeof value.description === 'string' ? value.description : '',
    defaultReasoningEffort: value.defaultReasoningEffort,
    supportedReasoningEfforts: value.supportedReasoningEfforts.map((effort: unknown) => {
      if (!isRecord(effort) || typeof effort.reasoningEffort !== 'string') throw invalidResponse();
      return {
        reasoningEffort: effort.reasoningEffort,
        description: typeof effort.description === 'string' ? effort.description : '',
      };
    }),
    isDefault: value.isDefault === true,
  };
}

/**
 * Managed ChatGPT subscription connection through the official Codex app-server.
 * This foundation intentionally has no model execution or general RPC method.
 */
export class CodexProvider {
  private readonly rpc: AppServerRpc;
  private readonly listeners = new Set<(event: CodexProviderEvent) => void>();
  private login: CodexLogin | null = null;
  private startingLogin: Promise<{ loginId: string; authUrl: string }> | null = null;
  private readonly recentLogins = new Map<string, CodexLogin>();

  constructor(options: CodexProviderOptions = {}) {
    this.rpc = new AppServerRpc(
      options,
      (method, params) => this.onNotification(method, params),
      () => {
        if (this.login?.status === 'pending') {
          this.login = {
            ...this.login,
            status: 'failed',
            error: 'The Codex connection closed before sign-in completed.',
          };
          this.emit({ type: 'login-updated', login: { ...this.login } });
        }
        this.emit({ type: 'connection-closed' });
      },
    );
  }

  async getStatus(): Promise<CodexStatus> {
    try {
      const account = readAccount(await this.rpc.request('account/read', { refreshToken: false }));
      const connected = account?.type === 'chatgpt';
      return {
        state: connected ? 'connected' : 'signed-out',
        account,
        message: connected
          ? null
          : account
            ? 'Codex is using a different authentication method. Sign in with ChatGPT to connect your subscription.'
            : 'Sign in with ChatGPT to connect your Codex subscription.',
        login: this.login ? { ...this.login } : null,
      };
    } catch (error) {
      return {
        state:
          error instanceof CodexProviderError && error.code === 'CLI_NOT_FOUND'
            ? 'unavailable'
            : 'error',
        account: null,
        message:
          error instanceof CodexProviderError
            ? error.message
            : 'The Codex connection is unavailable. Check your local Codex installation.',
        login: this.login ? { ...this.login } : null,
      };
    }
  }

  startLogin(): Promise<{ loginId: string; authUrl: string }> {
    if (this.startingLogin) return this.startingLogin;
    if (this.login?.status === 'pending') {
      return Promise.reject(
        new CodexProviderError(
          'LOGIN_IN_PROGRESS',
          'A Codex sign-in is already pending. Complete or cancel it before starting another.',
        ),
      );
    }
    const attempt = this.beginLogin();
    this.startingLogin = attempt;
    void attempt
      .finally(() => {
        if (this.startingLogin === attempt) this.startingLogin = null;
      })
      .catch(() => {});
    return attempt;
  }

  private async beginLogin(): Promise<{ loginId: string; authUrl: string }> {
    // Codex owns OAuth state, callback hosting, token persistence, and refresh.
    const value = await this.rpc.request('account/login/start', { type: 'chatgpt' });
    if (!isRecord(value) || typeof value.loginId !== 'string' || !value.loginId) {
      throw invalidResponse();
    }
    let url: URL;
    try {
      if (value.type !== 'chatgpt' || typeof value.authUrl !== 'string') throw invalidResponse();
      url = new URL(value.authUrl);
    } catch {
      await this.rpc.request('account/login/cancel', { loginId: value.loginId });
      throw invalidResponse();
    }
    if (
      url.protocol !== 'https:' ||
      !['auth.openai.com', 'chatgpt.com'].includes(url.hostname) ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443')
    ) {
      // Do not leave a managed login running if its navigation URL is unsupported.
      await this.rpc.request('account/login/cancel', { loginId: value.loginId });
      throw invalidResponse();
    }
    this.login = this.recentLogins.get(value.loginId) ?? {
      loginId: value.loginId,
      status: 'pending',
      error: null,
    };
    this.emit({ type: 'login-updated', login: { ...this.login } });
    return { loginId: value.loginId, authUrl: url.href };
  }

  async cancelLogin(loginId: string): Promise<void> {
    if (!this.login || this.login.loginId !== loginId || this.login.status !== 'pending') return;
    await this.rpc.request('account/login/cancel', { loginId });
    this.login = { loginId, status: 'cancelled', error: null };
    this.emit({ type: 'login-updated', login: { ...this.login } });
  }

  async listModels(): Promise<CodexModel[]> {
    const models = new Map<string, CodexModel>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const value = await this.rpc.request('model/list', {
        limit: 100,
        includeHidden: false,
        ...(cursor === undefined ? {} : { cursor }),
      });
      if (!isRecord(value) || !Array.isArray(value.data)) throw invalidResponse();
      for (const item of value.data) {
        if (isRecord(item) && item.hidden === true) continue;
        const model = readModel(item);
        models.set(model.id, model);
      }
      if (value.nextCursor === null || value.nextCursor === undefined) return [...models.values()];
      if (typeof value.nextCursor !== 'string' || seenCursors.has(value.nextCursor))
        throw invalidResponse();
      cursor = value.nextCursor;
      seenCursors.add(cursor);
    }
    throw invalidResponse();
  }

  async getUsage(): Promise<CodexUsage> {
    const account = readAccount(await this.rpc.request('account/read', { refreshToken: false }));
    if (account?.type !== 'chatgpt') {
      throw new CodexProviderError(
        'NOT_SIGNED_IN',
        'Connect a ChatGPT subscription to view Codex usage.',
      );
    }
    const value = await this.rpc.request('account/rateLimits/read');
    if (!isRecord(value) || (!('rateLimits' in value) && !('rateLimitsByLimitId' in value)))
      throw invalidResponse();
    let byId: Record<string, CodexRateLimits> | null = null;
    if (value.rateLimitsByLimitId !== null && value.rateLimitsByLimitId !== undefined) {
      if (!isRecord(value.rateLimitsByLimitId)) throw invalidResponse();
      byId = Object.fromEntries(
        Object.entries(value.rateLimitsByLimitId).map(([key, raw]) => {
          const limits = readRateLimits(raw);
          if (!limits) throw invalidResponse();
          return [key, limits];
        }),
      );
    }
    return { rateLimits: readRateLimits(value.rateLimits), rateLimitsByLimitId: byId };
  }

  subscribe(listener: (event: CodexProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    await this.rpc.close();
    this.listeners.clear();
  }

  private emit(event: CodexProviderEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Subscriber failures must never take down the child-process transport.
      }
    }
  }

  private onNotification(method: string, params: unknown): void {
    if (method === 'account/updated') this.emit({ type: 'account-updated' });
    if (method === 'account/rateLimits/updated') this.emit({ type: 'usage-updated' });
    if (
      method !== 'account/login/completed' ||
      !isRecord(params) ||
      typeof params.loginId !== 'string'
    )
      return;
    const login: CodexLogin = {
      loginId: params.loginId,
      status: params.success === true ? 'completed' : 'failed',
      error:
        params.success === true ? null : 'Codex sign-in did not complete. Try connecting again.',
    };
    // A completion can arrive before the account/login/start response.
    this.recentLogins.set(login.loginId, login);
    if (this.recentLogins.size > 8) {
      const oldest = this.recentLogins.keys().next().value;
      if (oldest !== undefined) this.recentLogins.delete(oldest);
    }
    if (!this.login || this.login.loginId === login.loginId) {
      // Preserve a user's explicit cancellation if a late failure follows it.
      if (this.login?.status === 'cancelled' && login.status === 'failed') return;
      this.login = login;
      this.emit({ type: 'login-updated', login: { ...login } });
    }
  }
}
