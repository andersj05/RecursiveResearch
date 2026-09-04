import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, utimes, lstat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from './storage.js';
import { withFileLock } from './file-lock.js';

const run = promisify(execFile);

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'recursive-research-lock-test-'));
  const folder = path.join(root, 'project');
  await mkdir(folder);
  return { root, folder };
}

describe('cross-process workspace coordination', () => {
  it('preserves concurrent initialization, registry changes, and messages from two stores', async () => {
    const { root, folder } = await fixture();
    const otherFolder = path.join(root, 'other');
    await mkdir(otherFolder);
    const stores = [
      new WorkspaceStore(path.join(root, 'registry')),
      new WorkspaceStore(path.join(root, 'registry')),
    ];
    const [first, second] = stores as [WorkspaceStore, WorkspaceStore];
    await Promise.all(stores.map((store) => store.initialize()));
    const [project] = await Promise.all([
      first.createProject('First', folder),
      second.createProject('Second', otherFolder),
    ]);
    expect((await first.workspace()).projects).toHaveLength(2);
    const chat = await first.createChat(project.id, 'Shared chat');
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? first : second).addMessage(chat.id, `Brief ${i}`),
      ),
    );
    const saved = await second.chat(chat.id);
    expect(saved.messages).toHaveLength(12);
    expect(saved.events).toHaveLength(12);
    expect(new Set(saved.messages.map((message) => message.content)).size).toBe(12);
  });

  it('coordinates shared project creation and updates from separate registries', async () => {
    const { root, folder } = await fixture();
    const first = new WorkspaceStore(path.join(root, 'registry-one'));
    const second = new WorkspaceStore(path.join(root, 'registry-two'));
    await Promise.all([first.initialize(), second.initialize()]);
    const [one, two] = await Promise.all([
      first.createProject('Shared project', folder),
      second.createProject('Shared project', folder),
    ]);
    expect(one.id).toBe(two.id);
    const chats = await Promise.all([
      first.createChat(one.id, 'First chat'),
      second.createChat(two.id, 'Second chat'),
    ]);
    expect((await first.workspace()).chats).toHaveLength(2);
    const chat = chats[0]!;
    await Promise.all([
      first.addMessage(chat.id, 'From first registry'),
      second.addMessage(chat.id, 'From second registry'),
    ]);
    expect((await second.chat(chat.id)).messages).toHaveLength(2);
  });

  it('preserves writes by actual independent Node processes using different registries', async () => {
    const { root, folder } = await fixture();
    const registryOne = path.join(root, 'registry-one');
    const registryTwo = path.join(root, 'registry-two');
    const first = new WorkspaceStore(registryOne);
    const second = new WorkspaceStore(registryTwo);
    await Promise.all([first.initialize(), second.initialize()]);
    const project = await first.createProject('Shared project', folder);
    await second.createProject('Shared project', folder);
    const chat = await first.createChat(project.id, 'Shared chat');
    const worker = `
      import { WorkspaceStore } from './apps/server/src/storage.ts';
      const store = new WorkspaceStore(process.env.RR_TEST_REGISTRY);
      await store.initialize();
      for (let i = 0; i < 5; i++) {
        await store.addMessage(process.env.RR_TEST_CHAT, process.env.RR_TEST_PREFIX + i);
      }
    `;
    await Promise.all(
      [registryOne, registryTwo].map((directory, i) =>
        run(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', worker], {
          cwd: fileURLToPath(new URL('../../../', import.meta.url)),
          windowsHide: true,
          timeout: 10_000,
          env: {
            ...process.env,
            RR_TEST_REGISTRY: directory,
            RR_TEST_CHAT: chat.id,
            RR_TEST_PREFIX: `Worker ${i}: `,
          },
        }),
      ),
    );
    const detail = await first.chat(chat.id);
    expect(detail.messages).toHaveLength(10);
    expect(detail.events).toHaveLength(10);
    expect(new Set(detail.messages.map((message) => message.content)).size).toBe(10);
  });

  it('releases failed operations and reclaims an abandoned stale lock', async () => {
    const { root } = await fixture();
    await expect(
      withFileLock(root, async () => {
        throw new Error('Fixture failed');
      }),
    ).rejects.toThrow('Fixture failed');
    await expect(lstat(path.join(root, '.writer.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    const lockPath = path.join(root, '.writer.lock');
    await mkdir(lockPath);
    const staleTime = new Date(Date.now() - 60_000);
    await utimes(lockPath, staleTime, staleTime);
    expect(await withFileLock(root, async () => 'recovered')).toBe('recovered');
    await expect(lstat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('bounds lock contention and returns a safe actionable error', async () => {
    const { root } = await fixture();
    let unlock!: () => void;
    let ready!: () => void;
    const entered = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const holder = withFileLock(root, async () => {
      ready();
      await release;
    });
    await entered;
    try {
      await expect(withFileLock(root, async () => undefined)).rejects.toMatchObject({
        statusCode: 409,
        code: 'LOCKED',
        message:
          'Another RecursiveResearch process is updating this data folder. Wait briefly and retry.',
      });
    } finally {
      unlock();
      await holder;
    }
  });

  it('preserves malformed JSON and returns a recoverable storage error', async () => {
    const { root } = await fixture();
    const directory = path.join(root, 'registry');
    await mkdir(directory);
    const registryPath = path.join(directory, 'registry.json');
    const damaged = '{not-json';
    await writeFile(registryPath, damaged);
    await expect(new WorkspaceStore(directory).initialize()).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_STORAGE',
    });
    expect(await readFile(registryPath, 'utf8')).toBe(damaged);
  });

  it('rejects artifacts when a linked folder now contains another project identity', async () => {
    const { root, folder } = await fixture();
    const otherFolder = path.join(root, 'other-project');
    await mkdir(otherFolder);
    const store = new WorkspaceStore(path.join(root, 'registry'));
    await store.initialize();
    const project = await store.createProject('Original', folder);
    await store.createProject('Other', otherFolder);
    await writeFile(path.join(folder, '.recursive-research', 'artifacts', 'source.md'), 'Fixture');
    expect(await store.artifacts(project.id)).toHaveLength(1);
    await writeFile(
      path.join(folder, '.recursive-research', 'workspace.json'),
      await readFile(path.join(otherFolder, '.recursive-research', 'workspace.json')),
    );
    expect(
      (await store.workspace()).projects.find((item) => item.id === project.id)?.available,
    ).toBe(false);
    await expect(store.artifacts(project.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_MISMATCH',
    });
  });
});
