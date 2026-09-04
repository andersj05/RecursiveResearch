import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { z, ZodError } from 'zod';
import {
  createProjectSchema,
  createChatSchema,
  createMessageSchema,
  harnessConfigSchema,
  idSchema,
  startRunSchema,
} from '@recursive-research/contracts';
import { CodexProvider, CodexProviderError } from '@recursive-research/codex-provider';
import { harnessCapabilities } from '@recursive-research/harness';
import { WorkspaceStore, defaultDataDirectory } from './storage.js';
import { pickFolder } from './folder-picker.js';
import { AppError } from './errors.js';
import { RunCoordinator } from './run-coordinator.js';

type Provider = Pick<
  CodexProvider,
  | 'getStatus'
  | 'startLogin'
  | 'cancelLogin'
  | 'listModels'
  | 'getUsage'
  | 'subscribe'
  | 'close'
  | 'executeTurn'
  | 'steerTurn'
>;
export interface AppOptions {
  dataDirectory?: string;
  provider?: Provider;
  folderPicker?: () => Promise<string | null>;
  port?: number;
  serveWeb?: boolean;
}

export async function createApp(options: AppOptions = {}) {
  const port = options.port ?? 4318;
  const app = Fastify({ logger: false, bodyLimit: 100000 });
  const store = new WorkspaceStore(options.dataDirectory ?? defaultDataDirectory());
  await store.initialize();
  const provider =
    options.provider ?? new CodexProvider({ executable: process.env.CODEX_EXECUTABLE });
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const origins = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ]);
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    '127.0.0.1:5173',
    'localhost:5173',
  ]);
  const notify = (event: string, data?: { chatId: string; runId: string }) =>
    events.emit('change', event, data);
  const runs = new RunCoordinator(store, provider, notify);
  const unsubscribe = provider.subscribe(() => notify('provider.updated'));
  const streams = new Set<import('node:http').ServerResponse>();

  // Loopback binding alone does not protect a local HTTP API from hostile websites.
  app.addHook('onRequest', async (request) => {
    if (!hosts.has(request.headers.host ?? ''))
      throw new AppError(403, 'HOST_REJECTED', 'Use the local RecursiveResearch address.');
    if (request.headers.origin && !origins.has(request.headers.origin))
      throw new AppError(
        403,
        'ORIGIN_REJECTED',
        'Requests must come from the local RecursiveResearch app.',
      );
    if (request.headers['sec-fetch-site'] === 'cross-site')
      throw new AppError(403, 'ORIGIN_REJECTED', 'Cross-site requests are not allowed.');
    if (
      !['GET', 'HEAD'].includes(request.method) &&
      request.headers['x-recursive-research'] !== '1'
    ) {
      throw new AppError(
        403,
        'CLIENT_HEADER_REQUIRED',
        'Use the local app to change project data.',
      );
    }
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: error.issues
            .map((issue) => `${issue.path.join('.') || 'Input'}: ${issue.message}`)
            .join('; '),
        },
      });
    if (error instanceof AppError)
      return reply
        .code(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    if (error instanceof CodexProviderError)
      return reply.code(503).send({ error: { code: error.code, message: error.message } });
    const code = (error as NodeJS.ErrnoException).code;
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500)
      return reply.code(status).send({
        error: {
          code: 'INVALID_REQUEST',
          message: 'The request could not be read. Check its format and size.',
        },
      });
    return reply.code(500).send({
      error: {
        code: 'LOCAL_OPERATION_FAILED',
        message: ['EACCES', 'EPERM', 'ENOENT'].includes(code ?? '')
          ? 'The local folder is unavailable or not writable. Check its location and permissions.'
          : 'The local operation failed. Check the project data and restart the app.',
      },
    });
  });

  const routeId = (params: unknown) => z.object({ id: idSchema }).parse(params).id;
  app.get('/api/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    harness: harnessCapabilities,
  }));
  app.get('/api/workspace', async () => {
    await runs.reconcile();
    return store.workspace();
  });
  app.post('/api/folders/pick', async () => ({
    folderPath: await (options.folderPicker ?? pickFolder)(),
  }));
  app.post('/api/projects', async (request, reply) => {
    const input = createProjectSchema.parse(request.body);
    const project = await store.createProject(input.name, input.folderPath);
    notify('workspace.changed');
    return reply.code(201).send(project);
  });
  app.post('/api/projects/:id/chats', async (request, reply) => {
    const chat = await store.createChat(
      routeId(request.params),
      createChatSchema.parse(request.body).title,
    );
    notify('workspace.changed');
    return reply.code(201).send(chat);
  });
  app.get('/api/chats/:id', async (request) => {
    await runs.reconcile();
    return store.chat(routeId(request.params));
  });
  app.post('/api/chats/:id/messages', async (request, reply) => {
    const message = await store.addMessage(
      routeId(request.params),
      createMessageSchema.parse(request.body).content,
    );
    notify('workspace.changed');
    return reply.code(201).send(message);
  });
  app.post('/api/chats/:id/runs', async (request, reply) => {
    const run = await runs.start(routeId(request.params), startRunSchema.parse(request.body));
    return reply.code(202).send(run);
  });
  app.get('/api/runs/:id', async (request) => {
    await runs.reconcile();
    return store.run(routeId(request.params));
  });
  app.post('/api/runs/:id/cancel', async (request, reply) => {
    const run = await runs.cancel(routeId(request.params));
    return reply.code(202).send(run);
  });
  app.post('/api/runs/:id/steer', async (request) =>
    runs.steer(routeId(request.params), createMessageSchema.parse(request.body).content),
  );
  app.get('/api/projects/:id/artifacts', async (request) =>
    store.artifacts(routeId(request.params)),
  );
  app.get('/api/projects/:id/artifact', async (request, reply) => {
    const { path } = z
      .object({ path: z.string().min(1).max(4000) })
      .strict()
      .parse(request.query);
    const content = await store.readArtifact(routeId(request.params), path);
    return reply.type('text/plain; charset=utf-8').send(content);
  });
  app.put('/api/settings', async (request) => {
    const settings = await store.saveSettings(harnessConfigSchema.parse(request.body));
    notify('workspace.changed');
    return settings;
  });
  app.get('/api/codex/status', async () => provider.getStatus());
  app.get('/api/codex/models', async () => provider.listModels());
  app.get('/api/codex/usage', async () => provider.getUsage());
  app.post('/api/codex/login', async () => provider.startLogin());
  app.post('/api/codex/login/cancel', async (request) => {
    const { loginId } = z
      .object({ loginId: z.string().min(1).max(200) })
      .strict()
      .parse(request.body);
    await provider.cancelLogin(loginId);
    return { ok: true };
  });

  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    streams.add(reply.raw);
    const send = (event: string, data: unknown = {}) => {
      // Slow tabs reconnect and reload durable state instead of buffering forever.
      if (!reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) reply.raw.end();
    };
    send('connected');
    events.on('change', send);
    const heartbeat = setInterval(() => reply.raw.write(': heartbeat\n\n'), 20000);
    heartbeat.unref();
    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      events.off('change', send);
      streams.delete(reply.raw);
    });
  });

  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (options.serveWeb !== false && existsSync(webRoot)) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.method !== 'GET')
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
      return reply.sendFile('index.html');
    });
  }
  app.addHook('preClose', async () => {
    for (const stream of streams) stream.end();
  });
  app.addHook('onClose', async () => {
    unsubscribe();
    await runs.close();
    events.removeAllListeners();
  });
  return app;
}
