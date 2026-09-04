import { mkdtemp, mkdir, readFile, writeFile, rename, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { defaultHarnessConfig } from '@recursive-research/contracts';
import { createApp } from './app.js';

const apps: FastifyInstance[] = [];
// Retain isolated OS temp fixtures for diagnosis; never use a real project or Codex account.
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'recursive-research-test-'));
  const folder = path.join(root, 'research');
  await mkdir(folder);
  const options = {
    dataDirectory: path.join(root, 'registry'),
    serveWeb: false,
    provider: {
      getStatus: async () => ({
        state: 'signed-out' as const,
        account: null,
        message: null,
        login: null,
      }),
      startLogin: async () => ({ loginId: 'login', authUrl: 'https://auth.openai.com/test' }),
      cancelLogin: async () => {},
      listModels: async () => [],
      getUsage: async () => ({ rateLimits: null, rateLimitsByLimitId: null }),
      subscribe: () => () => {},
      close: async () => {},
    },
    folderPicker: async () => folder,
  };
  const app = await createApp(options);
  apps.push(app);
  return { app, folder, root, options };
}

const headers = {
  host: '127.0.0.1:4318',
  origin: 'http://127.0.0.1:5173',
  'x-recursive-research': '1',
};
const get = (app: FastifyInstance, url: string) => app.inject({ method: 'GET', url, headers });
const post = (app: FastifyInstance, url: string, payload: object) =>
  app.inject({ method: 'POST', url, headers, payload });

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('local workspace API', () => {
  it('persists briefs, event history, settings and folder linkage across a restart', async () => {
    const { app, folder, options } = await fixture();
    const projectReply = await post(app, '/api/projects', {
      name: 'Graph theory',
      folderPath: folder,
    });
    expect(projectReply.statusCode).toBe(201);
    const project = projectReply.json();
    const chat = (
      await post(app, `/api/projects/${project.id}/chats`, { title: 'Open questions' })
    ).json();
    const replies = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        post(app, `/api/chats/${chat.id}/messages`, { content: `Research brief ${i}` }),
      ),
    );
    expect(replies.every((reply) => reply.statusCode === 201)).toBe(true);
    const config = { ...defaultHarnessConfig, maxParallelAgents: 5 };
    expect(
      (await app.inject({ method: 'PUT', url: '/api/settings', headers, payload: config }))
        .statusCode,
    ).toBe(200);
    await app.close();
    const restarted = await createApp(options);
    apps.push(restarted);
    const workspace = (await get(restarted, '/api/workspace')).json();
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.settings.maxParallelAgents).toBe(5);
    const detail = (await get(restarted, `/api/chats/${chat.id}`)).json();
    expect(detail.messages).toHaveLength(8);
    expect(detail.events).toHaveLength(8);
    expect(detail.messages.every((message: { role: string }) => message.role === 'user')).toBe(
      true,
    );
    const disk = JSON.parse(
      await readFile(path.join(folder, '.recursive-research', 'workspace.json'), 'utf8'),
    );
    expect(disk.messages).toHaveLength(8);
    expect((await get(restarted, '/api/health')).json().harness.execution).toBe(false);
  });

  it('keeps projects separate and reconnects a moved folder without losing chats', async () => {
    const { app, folder, root } = await fixture();
    const project = (
      await post(app, '/api/projects', { name: 'First', folderPath: folder })
    ).json();
    const chat = (
      await post(app, `/api/projects/${project.id}/chats`, { title: 'Saved chat' })
    ).json();
    const otherFolder = path.join(root, 'other');
    await mkdir(otherFolder);
    const second = (
      await post(app, '/api/projects', { name: 'Second', folderPath: otherFolder })
    ).json();
    expect(second.id).not.toBe(project.id);
    expect(
      (await post(app, '/api/projects', { name: 'Duplicate', folderPath: folder })).statusCode,
    ).toBe(409);
    const moved = path.join(root, 'moved');
    await rename(folder, moved);
    const unavailable = (await get(app, '/api/workspace'))
      .json()
      .projects.find((item: { id: string }) => item.id === project.id);
    expect(unavailable.available).toBe(false);
    const reconnected = await post(app, '/api/projects', { name: 'Reconnect', folderPath: moved });
    expect(reconnected.statusCode).toBe(201);
    expect(reconnected.json().id).toBe(project.id);
    expect((await get(app, `/api/chats/${chat.id}`)).json().chat.title).toBe('Saved chat');
  });

  it('does not overwrite malformed data or follow a redirected metadata directory', async () => {
    const { app, folder, root } = await fixture();
    const metadata = path.join(folder, '.recursive-research');
    await mkdir(metadata);
    const damaged = '{"version":9000}';
    await writeFile(path.join(metadata, 'workspace.json'), damaged);
    expect(
      (await post(app, '/api/projects', { name: 'Damaged', folderPath: folder })).statusCode,
    ).toBe(409);
    expect(await readFile(path.join(metadata, 'workspace.json'), 'utf8')).toBe(damaged);
    const linkedRoot = path.join(root, 'linked-root');
    const target = path.join(root, 'outside');
    await mkdir(linkedRoot);
    await mkdir(target);
    await symlink(
      target,
      path.join(linkedRoot, '.recursive-research'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(
      (await post(app, '/api/projects', { name: 'Redirected', folderPath: linkedRoot })).statusCode,
    ).toBe(409);
  });

  it('requires same-origin client requests and validates mutations at the boundary', async () => {
    const { app, folder } = await fixture();
    const request = {
      method: 'POST' as const,
      url: '/api/projects',
      payload: { name: 'Topic', folderPath: folder },
    };
    expect(
      (await app.inject({ ...request, headers: { ...headers, origin: 'https://evil.example' } }))
        .statusCode,
    ).toBe(403);
    expect((await app.inject({ ...request, headers: { host: '127.0.0.1:4318' } })).statusCode).toBe(
      403,
    );
    expect(
      (await app.inject({ ...request, headers: { ...headers, host: 'evil.example:4318' } }))
        .statusCode,
    ).toBe(403);
    expect((await post(app, '/api/projects', { name: '', folderPath: folder })).statusCode).toBe(
      400,
    );
    expect(
      (await post(app, '/api/projects', { name: 'Relative', folderPath: '../relative' }))
        .statusCode,
    ).toBe(400);
    expect((await get(app, '/api/chats/not-a-uuid')).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/settings',
          headers,
          payload: { ...defaultHarnessConfig, maxParallelAgents: 100 },
        })
      ).statusCode,
    ).toBe(400);
    expect((await get(app, '/api/workspace')).json().projects).toEqual([]);
  });

  it('lists actual artifacts and exposes account integration without invoking a model', async () => {
    const { app, folder } = await fixture();
    expect((await post(app, '/api/folders/pick', {})).json().folderPath).toBe(folder);
    const project = (
      await post(app, '/api/projects', { name: 'Notes', folderPath: folder })
    ).json();
    await writeFile(
      path.join(folder, '.recursive-research', 'artifacts', 'sources.md'),
      'A source ledger',
    );
    const artifacts = (await get(app, `/api/projects/${project.id}/artifacts`)).json();
    expect(artifacts).toMatchObject([{ name: 'sources.md', relativePath: 'sources.md', size: 15 }]);
    expect((await get(app, '/api/codex/status')).json().state).toBe('signed-out');
    expect((await post(app, '/api/codex/login', {})).json().loginId).toBe('login');
  });
});
