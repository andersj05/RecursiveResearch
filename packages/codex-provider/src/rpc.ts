import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { CodexProviderError } from './types.js';
import { executionConfigArgs } from './execution-config.js';

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: CodexProviderError) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface RpcOptions {
  /** An executable, never a shell command. Defaults to codex on PATH. */
  executable?: string;
  /** For embedding/tests; application config must not expose arbitrary arguments. */
  executableArgs?: string[];
  cwd?: string;
  requestTimeoutMs?: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Small, private, bounded transport. No raw server payload is logged. */
export class AppServerRpc {
  private child: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private closed = false;
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly options: RpcOptions,
    private readonly onNotification: (method: string, params: unknown) => void,
    private readonly onDisconnect: (error: CodexProviderError) => void,
  ) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    await this.ensureReady();
    const child = this.child;
    if (!child) throw this.closedError();
    return this.sendRequest(child, method, params);
  }

  private ensureReady(): Promise<void> {
    if (this.closed) return Promise.reject(this.closedError());
    if (this.ready) return this.ready;

    const attempt = this.connect();
    this.ready = attempt;
    void attempt.catch(() => {
      if (this.ready === attempt) this.ready = null;
    });
    return attempt;
  }

  private async connect(): Promise<void> {
    const child = spawn(
      this.options.executable ?? 'codex',
      [...(this.options.executableArgs ?? []), 'app-server', ...executionConfigArgs],
      {
        cwd: this.options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      },
    );
    this.child = child;
    const decoder = new StringDecoder('utf8');
    let buffer = '';
    const maxFrameBytes = 4 * 1024 * 1024;

    child.stdout.on('data', (chunk: Buffer) => {
      if (this.child !== child) return;
      buffer += decoder.write(chunk);
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line, 'utf8') > maxFrameBytes) {
          this.fail(child, this.protocolError());
          return;
        }
        if (line) this.receive(child, line);
        if (this.child !== child) return;
      }
      if (Buffer.byteLength(buffer, 'utf8') > maxFrameBytes) {
        this.fail(child, this.protocolError());
      }
    });
    // Drain diagnostics without retaining potential paths, tokens, or auth URLs.
    child.stderr.resume();
    child.on('error', (error: NodeJS.ErrnoException) => {
      this.fail(
        child,
        error.code === 'ENOENT'
          ? new CodexProviderError(
              'CLI_NOT_FOUND',
              'Codex CLI was not found. Install Codex CLI or set CODEX_EXECUTABLE to its executable path, then restart RecursiveResearch.',
            )
          : new CodexProviderError(
              'CONNECTION_CLOSED',
              'Codex CLI could not start. Check its executable and local permissions.',
            ),
      );
    });
    child.stdin.on('error', () => this.fail(child, this.closedError()));
    child.stdout.on('error', () => this.fail(child, this.closedError()));
    child.stderr.on('error', () => this.fail(child, this.closedError()));
    child.on('exit', () => this.fail(child, this.closedError()));

    try {
      await this.sendRequest(child, 'initialize', {
        clientInfo: {
          name: 'recursive_research',
          title: 'RecursiveResearch',
          version: '0.1.0',
        },
      });
      if (this.child !== child || this.closed) throw this.closedError();
      child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
    } catch (error) {
      this.fail(child, error instanceof CodexProviderError ? error : this.closedError());
      throw error;
    }
  }

  private sendRequest(
    child: ChildProcessWithoutNullStreams,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    if (this.child !== child || child.stdin.destroyed || this.closed) {
      return Promise.reject(this.closedError());
    }
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A timed-out login must not continue silently on an orphaned transport.
        this.fail(
          child,
          new CodexProviderError(
            'REQUEST_TIMEOUT',
            `Codex did not respond to ${method} in time. Retry the connection.`,
          ),
        );
      }, this.options.requestTimeoutMs ?? 20_000);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        `${JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) })}\n`,
        (error) => {
          if (error) this.fail(child, this.closedError());
        },
      );
    });
  }

  private receive(child: ChildProcessWithoutNullStreams, line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.fail(child, this.protocolError());
      return;
    }
    if (!isRecord(message)) {
      this.fail(child, this.protocolError());
      return;
    }

    if (typeof message.method === 'string') {
      if ('id' in message) {
        // This package grants no tool, file, approval, or external-token authority.
        child.stdin.write(
          `${JSON.stringify({
            id: message.id,
            error: { code: -32601, message: 'Client does not support server requests.' },
          })}\n`,
        );
      } else {
        this.onNotification(message.method, message.params);
      }
      return;
    }

    if (typeof message.id !== 'number') {
      this.fail(child, this.protocolError());
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (isRecord(message.error)) {
      const code = typeof message.error.code === 'number' ? ` (${message.error.code})` : '';
      const experimental =
        typeof message.error.message === 'string' &&
        message.error.message.includes('requires experimentalApi capability');
      pending.reject(
        new CodexProviderError(
          'RPC_ERROR',
          experimental
            ? 'This Codex operation requires experimental protocol support.'
            : `Codex rejected the request${code}. Check the Codex CLI connection and retry.`,
        ),
      );
    } else if ('result' in message) {
      pending.resolve(message.result);
    } else {
      pending.reject(this.protocolError());
    }
  }

  private fail(child: ChildProcessWithoutNullStreams, error: CodexProviderError): void {
    if (this.child !== child) return;
    this.child = null;
    this.ready = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    child.stdin.destroy();
    child.kill('SIGKILL');
    this.onDisconnect(error);
  }

  disconnect(error: CodexProviderError): void {
    if (this.child) this.fail(this.child, error);
  }

  async close(): Promise<void> {
    this.closed = true;
    const child = this.child;
    if (!child) return;
    // Start watching before end(), because a small/fake server can exit immediately.
    const exited = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 1_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    child.stdin.end();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.closedError());
    }
    this.pending.clear();
    await exited;
    this.fail(child, this.closedError());
  }

  private closedError(): CodexProviderError {
    return new CodexProviderError(
      'CONNECTION_CLOSED',
      'The Codex connection closed. Refresh to reconnect.',
    );
  }

  private protocolError(): CodexProviderError {
    return new CodexProviderError(
      'INVALID_RESPONSE',
      'Codex returned an unsupported response. Update the Codex CLI and retry.',
    );
  }
}
