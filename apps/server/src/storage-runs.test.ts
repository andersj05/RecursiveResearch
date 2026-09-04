import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WorkspaceStore } from './storage.js';

const input = {
  content: 'What are the open questions?\nStart with primary sources.',
  model: 'fixture-model',
  reasoningEffort: 'high',
  mode: 'chat' as const,
};

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'recursive-research-runs-test-'));
  const folder = path.join(root, 'project');
  const registry = path.join(root, 'registry');
  await mkdir(folder);
  const store = new WorkspaceStore(registry);
  await store.initialize();
  const project = await store.createProject('Research', folder);
  const chat = await store.createChat(project.id, 'New chat');
  const documentPath = path.join(folder, '.recursive-research', 'workspace.json');
  return { root, folder, registry, store, project, chat, documentPath };
}

describe('durable chat and research runs', () => {
  it('loads existing briefs without losing content or requiring a data migration', async () => {
    const { registry, store, chat, documentPath } = await fixture();
    await store.addMessage(chat.id, 'Original saved brief');
    const legacy = JSON.parse(await readFile(documentPath, 'utf8'));
    delete legacy.runs;
    delete legacy.chats[0].codexThreadId;
    delete legacy.messages[0].runId;
    delete legacy.messages[0].status;
    await writeFile(documentPath, JSON.stringify(legacy));
    const registryPath = path.join(registry, 'registry.json');
    const oldRegistry = JSON.parse(await readFile(registryPath, 'utf8'));
    delete oldRegistry.settings.reasoningEffort;
    await writeFile(registryPath, JSON.stringify(oldRegistry));
    const restarted = new WorkspaceStore(registry);
    await restarted.initialize();
    expect(await restarted.chat(chat.id)).toMatchObject({
      chat: { codexThreadId: null },
      messages: [{ content: 'Original saved brief', runId: null, status: 'complete' }],
      runs: [],
    });
    expect((await restarted.workspace()).settings.reasoningEffort).toBeNull();
    await restarted.createRun(chat.id, input);
    expect((await restarted.chat(chat.id)).messages).toHaveLength(3);
  });

  it('persists selected settings, stream snapshots and provider conversation identity', async () => {
    const { registry, store, chat } = await fixture();
    const run = await store.createRun(chat.id, input);
    expect(run).toMatchObject({ status: 'queued', model: input.model, reasoningEffort: 'high' });
    expect(run).not.toHaveProperty('owner');
    expect((await store.chat(chat.id)).chat.title).toBe('What are the open questions?');
    await store.updateRun(run.id, {
      status: 'running',
      threadId: 'provider-thread',
      turnId: 'provider-turn',
      content: '  A partial answer\n',
    });
    const reopened = new WorkspaceStore(registry);
    await reopened.initialize();
    const partial = await reopened.chat(chat.id);
    expect(partial.runs[0]?.status).toBe('running');
    expect(partial.messages[1]).toMatchObject({
      content: '  A partial answer\n',
      status: 'streaming',
      runId: run.id,
    });
    await reopened.updateRun(run.id, { summary: 'Searching primary sources.' });
    const done = await reopened.updateRun(run.id, {
      status: 'completed',
      content: 'Final answer.',
    });
    expect(done.completedAt).not.toBeNull();
    const context = await reopened.getRunContext(chat.id);
    expect(context.chat.codexThreadId).toBe('provider-thread');
    expect(context.messages[1]).toMatchObject({ content: 'Final answer.', status: 'complete' });
    expect((await reopened.chat(chat.id)).events.map((event) => event.type)).toEqual([
      'run.queued',
      'run.started',
      'tool.progress',
      'run.completed',
    ]);
    const next = await reopened.createRun(chat.id, { ...input, content: 'A follow-up' });
    expect(next.threadId).toBe('provider-thread');
  });

  it('keeps cancelled and failed partial answers and ignores late provider updates', async () => {
    const { store, chat } = await fixture();
    for (const status of ['cancelled', 'failed'] as const) {
      const run = await store.createRun(chat.id, input);
      await store.updateRun(run.id, { status: 'running', content: 'Preserve this draft.' });
      await store.updateRun(run.id, {
        status,
        error: status === 'failed' ? 'Fixture failure.' : null,
      });
      const late = await store.updateRun(run.id, { status: 'completed', content: 'Late output.' });
      expect(late.status).toBe(status);
      const detail = await store.chat(chat.id);
      expect(
        detail.messages.find((message) => message.id === run.assistantMessageId),
      ).toMatchObject({
        content: 'Preserve this draft.',
        status: status === 'cancelled' ? 'interrupted' : 'failed',
      });
    }
  });

  it('excludes concurrent independent processes and recovers only after the owner exits', async () => {
    const { root, store, project, chat } = await fixture();
    const registries = [path.join(root, 'first-owner'), path.join(root, 'second-owner')];
    for (const registry of registries) {
      const other = new WorkspaceStore(registry);
      await other.initialize();
      await other.createProject('Shared research', project.folderPath);
    }
    const worker = `
      import { WorkspaceStore } from './apps/server/src/storage.ts';
      const store = new WorkspaceStore(process.env.RR_TEST_REGISTRY);
      await store.initialize();
      try {
        const run = await store.createRun(process.env.RR_TEST_CHAT, {
          content: 'Process fixture', model: 'fixture-model', reasoningEffort: 'high', mode: 'chat'
        });
        await store.updateRun(run.id, { status: 'running', content: 'Saved before exit.' });
        process.send({ run });
      } catch (error) {
        process.send({ code: error.code, message: error.message });
      }
      await new Promise(resolve => process.once('message', resolve));
      process.disconnect();
    `;
    const children = registries.map((registry) =>
      spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', worker], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        env: { ...process.env, RR_TEST_REGISTRY: registry, RR_TEST_CHAT: chat.id },
      }),
    );
    let savedRunId = '';
    try {
      const results = await Promise.all(
        children.map(async (child) => (await once(child, 'message'))[0]),
      );
      expect(results.filter((result) => result.run)).toHaveLength(1);
      expect(results.filter((result) => result.code === 'RUN_ACTIVE')).toHaveLength(1);
      savedRunId = results.find((result) => result.run).run.id;
      expect(await store.recoverRuns()).toBe(0);
      expect((await store.run(savedRunId)).status).toBe('running');
      await expect(store.updateRun(savedRunId, { status: 'cancelled' })).rejects.toMatchObject({
        code: 'RUN_OWNED',
      });
    } finally {
      await Promise.all(
        children.map(async (child) => {
          const exited = once(child, 'exit');
          if (child.connected) child.send('exit');
          else child.kill();
          await exited;
        }),
      );
    }
    const restarted = new WorkspaceStore(store.dataDirectory);
    await restarted.initialize();
    expect(await restarted.recoverRuns()).toBe(0);
    expect(await restarted.run(savedRunId)).toMatchObject({ status: 'interrupted' });
    expect((await restarted.chat(chat.id)).messages[1]).toMatchObject({
      content: 'Saved before exit.',
      status: 'interrupted',
    });
    await expect(store.createRun(chat.id, input)).resolves.toMatchObject({ status: 'queued' });
  }, 20000);

  it('writes a completed research report in its project and exposes a bounded text preview', async () => {
    const { folder, store, project, chat } = await fixture();
    const run = await store.createRun(chat.id, { ...input, mode: 'research' });
    const completed = await store.updateRun(run.id, {
      status: 'completed',
      content: '# Findings\n\nA report with [a source](https://example.com).',
    });
    expect(completed.reportPath).toBe(`research-${run.id}.md`);
    expect(await store.writeResearchReport(run.id)).toBe(completed.reportPath);
    const content = await store.readArtifact(project.id, completed.reportPath!);
    expect(content).toBe('# Findings\n\nA report with [a source](https://example.com).\n');
    expect(
      await readFile(
        path.join(folder, '.recursive-research', 'artifacts', completed.reportPath!),
        'utf8',
      ),
    ).toBe(content);
    expect(await store.artifacts(project.id)).toHaveLength(1);
    for (const unsafe of [
      '../workspace.json',
      '/outside.md',
      'C:\\outside.md',
      '..\\workspace.json',
      'report.md:stream',
    ])
      await expect(store.readArtifact(project.id, unsafe)).rejects.toMatchObject({
        code: 'UNSAFE_PATH',
      });
    const large = path.join(folder, '.recursive-research', 'artifacts', 'large.md');
    await writeFile(large, 'x'.repeat(2 * 1024 * 1024 + 1));
    await expect(store.readArtifact(project.id, 'large.md')).rejects.toMatchObject({
      code: 'ARTIFACT_TOO_LARGE',
    });
  });

  it('does not overwrite an existing file or mark a failed report write completed', async () => {
    const { folder, store, chat } = await fixture();
    const run = await store.createRun(chat.id, { ...input, mode: 'research' });
    const target = path.join(folder, '.recursive-research', 'artifacts', `research-${run.id}.md`);
    await writeFile(target, 'Existing unrelated file');
    await store.updateRun(run.id, { status: 'running', content: 'A saved partial report' });
    await expect(
      store.updateRun(run.id, { status: 'completed', content: 'A final report' }),
    ).rejects.toMatchObject({ code: 'REPORT_EXISTS' });
    expect((await store.run(run.id)).status).toBe('running');
    expect(await readFile(target, 'utf8')).toBe('Existing unrelated file');
    expect((await store.chat(chat.id)).messages[1]?.content).toBe('A saved partial report');
  });

  it('rejects redirected artifact folders before writing or reading reports', async () => {
    const { root, folder, store, project, chat } = await fixture();
    const artifacts = path.join(folder, '.recursive-research', 'artifacts');
    const outside = path.join(root, 'outside');
    await mkdir(outside);
    await writeFile(path.join(outside, 'private.md'), 'Outside project artifacts');
    await rename(artifacts, `${artifacts}-original`);
    await symlink(outside, artifacts, process.platform === 'win32' ? 'junction' : 'dir');
    const run = await store.createRun(chat.id, { ...input, mode: 'research' });
    await expect(
      store.updateRun(run.id, { status: 'completed', content: 'Report' }),
    ).rejects.toMatchObject({ code: 'UNSAFE_PATH' });
    await expect(store.readArtifact(project.id, 'private.md')).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    });
  });
});
