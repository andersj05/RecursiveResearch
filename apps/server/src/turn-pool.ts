/** FIFO provider concurrency shared by all jobs. Queued acquisition is cancellable. */
export class TurnPool {
  private running = 0;
  private queue: {
    signal: AbortSignal;
    start: () => void;
    reject: (error: unknown) => void;
    abort: () => void;
  }[] = [];
  constructor(public limit = 3) {}
  get status() {
    return { limit: this.limit, active: this.running, queued: this.queue.length };
  }
  async run<T>(signal: AbortSignal, execute: () => Promise<T>): Promise<T> {
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const item = {
        signal,
        reject,
        start: () => {
          signal.removeEventListener('abort', item.abort);
          this.running++;
          resolve();
        },
        abort: () => {
          this.queue = this.queue.filter((entry) => entry !== item);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', item.abort, { once: true });
      this.queue.push(item);
      this.drain();
    });
    try {
      signal.throwIfAborted();
      return await execute();
    } finally {
      this.running--;
      this.drain();
    }
  }
  private drain() {
    while (this.running < this.limit && this.queue.length) {
      const item = this.queue.shift()!;
      if (item.signal.aborted) item.abort();
      else item.start();
    }
  }
}
