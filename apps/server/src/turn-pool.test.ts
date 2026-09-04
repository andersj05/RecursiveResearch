import { expect, it } from 'vitest';
import { TurnPool } from './turn-pool.js';

it('bounds global concurrency and removes cancelled queued work', async () => {
  const pool = new TurnPool(1);
  let release!: () => void;
  const first = pool.run(
    new AbortController().signal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  const controller = new AbortController();
  let called = false;
  const queued = pool.run(controller.signal, async () => {
    called = true;
  });
  const rejected = expect(queued).rejects.toBeDefined();
  controller.abort();
  await rejected;
  expect(pool.status).toEqual({ limit: 1, active: 1, queued: 0 });
  release();
  await first;
  expect(called).toBe(false);
  expect(pool.status.active).toBe(0);
});
