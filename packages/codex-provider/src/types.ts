/** Public metadata only. Codex owns every credential and its refresh lifecycle. */
export interface CodexAccount {
  type: string;
  email: string | null;
  planType: string | null;
}

export interface CodexLogin {
  loginId: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  error: string | null;
}

export interface CodexStatus {
  state: 'connected' | 'signed-out' | 'unavailable' | 'error';
  account: CodexAccount | null;
  message: string | null;
  login: CodexLogin | null;
}

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: { reasoningEffort: string; description: string }[];
  isDefault: boolean;
}

export interface CodexQuotaWindow {
  usedPercent: number | null;
  windowDurationMins: number | null;
  /** Unix timestamp in seconds. */
  resetsAt: number | null;
}

export interface CodexRateLimits {
  limitId: string | null;
  limitName: string | null;
  primary: CodexQuotaWindow | null;
  secondary: CodexQuotaWindow | null;
  planType: string | null;
}

export interface CodexUsage {
  rateLimits: CodexRateLimits | null;
  /** Prefer these buckets over the legacy single-bucket view when present. */
  rateLimitsByLimitId: Record<string, CodexRateLimits> | null;
}

export type CodexProviderEvent =
  | { type: 'account-updated' }
  | { type: 'usage-updated' }
  | { type: 'login-updated'; login: CodexLogin }
  | { type: 'connection-closed' };

export type CodexErrorCode =
  | 'CLI_NOT_FOUND'
  | 'CONNECTION_CLOSED'
  | 'REQUEST_TIMEOUT'
  | 'RPC_ERROR'
  | 'INVALID_RESPONSE'
  | 'LOGIN_IN_PROGRESS'
  | 'NOT_SIGNED_IN';

export class CodexProviderError extends Error {
  constructor(
    public readonly code: CodexErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CodexProviderError';
  }
}
