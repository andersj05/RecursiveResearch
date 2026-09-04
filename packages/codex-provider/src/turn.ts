import { projectWebTool } from './web-tool.js';
import { isRecord, type AppServerRpc } from './rpc.js';
import { CodexProviderError, type CodexTurnEvent, type CodexTurnResult } from './types.js';

function invalidResponse(): CodexProviderError {
  return new CodexProviderError(
    'INVALID_RESPONSE',
    'Codex returned an unsupported turn response. Update Codex and retry.',
  );
}

/** One active turn. Events may precede the turn/start response. */
export class TurnExecution {
  readonly completion: Promise<CodexTurnResult>;
  private resolve!: (result: CodexTurnResult) => void;
  private reject!: (error: CodexProviderError) => void;
  private readonly messages = new Map<string, { text: string; final: boolean }>();
  private readonly completedItems = new Set<string>();
  private buffer: { method: string; params: Record<string, unknown> }[] = [];
  private bufferedBytes = 0;
  private turnId: string | null = null;
  private settled = false;
  private interrupted = false;
  private interruptTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly threadId: string,
    private readonly rpc: AppServerRpc,
    private readonly onEvent: (event: CodexTurnEvent) => void,
  ) {
    this.completion = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // A disconnect can reject while executeTurn is still awaiting turn/start.
    void this.completion.catch(() => {});
  }

  get id(): string | null {
    return this.turnId;
  }

  bind(value: unknown): void {
    if (
      !isRecord(value) ||
      !isRecord(value.turn) ||
      typeof value.turn.id !== 'string' ||
      !value.turn.id
    ) {
      throw invalidResponse();
    }
    this.turnId = value.turn.id;
    this.emit({ type: 'started', threadId: this.threadId, turnId: this.turnId });
    const pending = this.buffer;
    this.buffer = [];
    this.bufferedBytes = 0;
    for (const event of pending) this.receive(event.method, event.params);
    if (value.turn.status !== 'inProgress') this.finish(value.turn);
    if (this.interrupted) this.interrupt();
  }

  receive(method: string, params: unknown): void {
    if (this.settled || !isRecord(params) || params.threadId !== this.threadId) return;
    if (
      !['item/agentMessage/delta', 'item/started', 'item/completed', 'turn/completed'].includes(
        method,
      )
    )
      return;
    if (!this.turnId) {
      // Buffer only relevant events, with a bound even for an unresponsive provider.
      this.bufferedBytes += Buffer.byteLength(JSON.stringify(params));
      if (this.buffer.length >= 2_048 || this.bufferedBytes > 4 * 1024 * 1024) {
        this.fail(invalidResponse());
        return;
      }
      this.buffer.push({ method, params });
      return;
    }
    const eventTurnId =
      method === 'turn/completed' && isRecord(params.turn) ? params.turn.id : params.turnId;
    if (eventTurnId !== this.turnId) return;
    if (method === 'turn/completed') {
      this.finish(params.turn);
      return;
    }
    if (method === 'item/agentMessage/delta') {
      if (typeof params.itemId !== 'string' || typeof params.delta !== 'string') {
        this.fail(invalidResponse());
        return;
      }
      if (this.completedItems.has(params.itemId)) return;
      const message = this.messages.get(params.itemId) ?? { text: '', final: false };
      message.text += params.delta;
      this.messages.set(params.itemId, message);
      this.emit({ type: 'text-delta', itemId: params.itemId, delta: params.delta });
      return;
    }
    if (!isRecord(params.item)) {
      this.fail(invalidResponse());
      return;
    }
    const item = params.item;
    if (item.type === 'agentMessage' && method === 'item/completed') {
      this.readMessage(item);
    } else if (item.type === 'webSearch') {
      const call = projectWebTool(item, method === 'item/started' ? 'started' : 'completed');
      if (call) this.emit({ type: 'web-tool', call });
      this.emit({
        type: 'progress',
        message: method === 'item/started' ? 'Searching the web' : 'Sources reviewed',
      });
    } else if (item.type === 'contextCompaction' && method === 'item/started') {
      this.emit({ type: 'progress', message: 'Condensing conversation context' });
    }
    // Reasoning, tool arguments, raw diagnostics, and other private payloads are ignored.
  }

  interrupt(): void {
    this.interrupted = true;
    if (this.settled || !this.turnId || this.interruptTimer) return;
    this.interruptTimer = setTimeout(() => {
      this.rpc.disconnect(
        new CodexProviderError(
          'TURN_CANCELLED',
          'Codex did not confirm the stop request. The connection was closed to stop execution.',
        ),
      );
    }, 15_000);
    this.interruptTimer.unref();
    void this.rpc
      .request('turn/interrupt', { threadId: this.threadId, turnId: this.turnId })
      .catch((error: unknown) => {
        this.fail(error instanceof CodexProviderError ? error : invalidResponse());
      });
  }

  fail(error: CodexProviderError): void {
    if (this.settled) return;
    this.settled = true;
    this.cleanup();
    this.reject(error);
  }

  private finish(turn: unknown): void {
    if (this.settled) return;
    if (!isRecord(turn) || !this.turnId || turn.id !== this.turnId) {
      this.fail(invalidResponse());
      return;
    }
    if (turn.status === 'failed') {
      this.fail(
        new CodexProviderError(
          'TURN_FAILED',
          'Codex could not complete this turn. Check the selected model and account usage, then retry.',
        ),
      );
      return;
    }
    if (turn.status !== 'completed' && turn.status !== 'interrupted') {
      this.fail(invalidResponse());
      return;
    }
    if (Array.isArray(turn.items)) {
      for (const item of turn.items)
        if (isRecord(item) && item.type === 'agentMessage') this.readMessage(item);
    }
    if (this.settled) return;
    const messages = [...this.messages.values()];
    const finalMessages = messages.filter((message) => message.final);
    this.settled = true;
    this.cleanup();
    this.resolve({
      threadId: this.threadId,
      turnId: this.turnId,
      status: turn.status,
      text: (finalMessages.length ? finalMessages : messages)
        .map((message) => message.text)
        .join('\n\n'),
    });
  }

  private readMessage(item: Record<string, unknown>): void {
    if (typeof item.id !== 'string' || typeof item.text !== 'string') {
      this.fail(invalidResponse());
      return;
    }
    const existing = this.messages.get(item.id);
    this.messages.set(item.id, { text: item.text, final: item.phase === 'final_answer' });
    if (!this.completedItems.has(item.id) || existing?.text !== item.text) {
      this.emit({ type: 'message', itemId: item.id, text: item.text });
    }
    this.completedItems.add(item.id);
  }

  private emit(event: CodexTurnEvent): void {
    try {
      this.onEvent(event);
    } catch {
      /* Subscriber failures do not break transport. */
    }
  }

  private cleanup(): void {
    if (this.interruptTimer) clearTimeout(this.interruptTimer);
    this.buffer = [];
    this.bufferedBytes = 0;
  }
}
