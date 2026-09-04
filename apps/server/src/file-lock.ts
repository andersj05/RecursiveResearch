import { AsyncLocalStorage } from 'node:async_hooks';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { lock } from 'proper-lockfile';
import { AppError } from './errors.js';

interface HeldLock {
  directory: string;
  compromised: boolean;
}
const context = new AsyncLocalStorage<readonly HeldLock[]>();

function lostLock(): AppError {
  return new AppError(
    409,
    'LOCKED',
    'The data folder lock was interrupted. Refresh the workspace before trying again.',
  );
}

/** Check immediately before publishing a snapshot if lock renewal has failed. */
export function assertFileLocksHeld(): void {
  if (context.getStore()?.some((held) => held.compromised)) throw lostLock();
}

/**
 * Cooperating processes always lock the registry first, then project metadata.
 * The lock lives inside the application-owned directory, beside its JSON file.
 */
export async function withFileLock<T>(
  targetExistingDirectory: string,
  operation: () => Promise<T>,
): Promise<T> {
  assertFileLocksHeld();
  const directory = await realpath(targetExistingDirectory);
  const inherited = context.getStore() ?? [];
  if (inherited.some((held) => held.directory === directory)) return operation();
  const lockfilePath = path.join(directory, '.writer.lock');
  try {
    const stat = await lstat(lockfilePath);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new AppError(409, 'UNSAFE_PATH', 'The data folder has an unsupported lock path.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const held: HeldLock = { directory, compromised: false };
  let release: () => Promise<void>;
  try {
    release = await lock(directory, {
      realpath: true,
      lockfilePath,
      stale: 30_000,
      update: 10_000,
      retries: { retries: 20, factor: 1, minTimeout: 50, maxTimeout: 50 },
      onCompromised: () => {
        held.compromised = true;
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ELOCKED')
      throw new AppError(
        409,
        'LOCKED',
        'Another RecursiveResearch process is updating this data folder. Wait briefly and retry.',
      );
    throw error;
  }

  let result: T;
  let releaseFailed = false;
  try {
    result = await context.run([...inherited, held], async () => {
      assertFileLocksHeld();
      const result = await operation();
      assertFileLocksHeld();
      return result;
    });
  } finally {
    // A compromised lease has already been released by the library. Never remove
    // a replacement lock now owned by another writer.
    if (!held.compromised) {
      try {
        await release();
      } catch {
        releaseFailed = true;
      }
    }
  }
  if (releaseFailed) throw lostLock();
  return result;
}
