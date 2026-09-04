import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  lstat,
  realpath,
  readdir,
  unlink,
} from 'node:fs/promises';
import { homedir, hostname } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import {
  projectSchema,
  chatSchema,
  messageSchema,
  researchEventSchema,
  runSchema,
  harnessStateSchema,
  harnessConfigSchema,
  defaultHarnessConfig,
  isActiveRun as activeRun,
  type Project,
  type Chat,
  type Message,
  type HarnessConfig,
  type Workspace,
  type ChatDetail,
  type Artifact,
  type Run,
  type StartRunInput,
} from '@recursive-research/contracts';
import { AppError } from './errors.js';
import { assertFileLocksHeld, withFileLock } from './file-lock.js';

const registrySchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
  settings: harnessConfigSchema,
});
const documentSchema = z.object({
  version: z.literal(1),
  project: projectSchema,
  chats: z.array(chatSchema),
  messages: z.array(messageSchema),
  events: z.array(researchEventSchema),
  runs: z
    .array(
      runSchema.extend({
        owner: z.object({ pid: z.number().int().positive(), host: z.string() }),
      }),
    )
    .default([]),
});
type Registry = z.infer<typeof registrySchema>;
type ProjectDocument = z.infer<typeof documentSchema>;
const now = () => new Date().toISOString();
type StoredRun = ProjectDocument['runs'][number];
export interface ResolvedRunInput extends Omit<StartRunInput, 'model' | 'reasoningEffort'> {
  model: string;
  reasoningEffort: string;
  harnessState?: Run['harness'];
}

export interface RunUpdate {
  status?: Run['status'];
  content?: string;
  threadId?: string | null;
  turnId?: string | null;
  error?: string | null;
  summary?: string;
  harness?: Run['harness'];
}

/** EPERM and foreign hosts are not evidence that the owner stopped running. */
function ownerIsDead(run: StoredRun): boolean {
  if (run.owner.host !== hostname()) return false;
  try {
    process.kill(run.owner.pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

function publicRun(run: StoredRun): Run {
  return runSchema.parse(run);
}

function assertRunOwner(run: StoredRun): void {
  if (run.owner.pid !== process.pid || run.owner.host !== hostname())
    throw new AppError(
      409,
      'RUN_OWNED',
      'This run belongs to another RecursiveResearch server. Use that server to stop it.',
    );
}

function recoverAbandonedRuns(document: ProjectDocument): number {
  let recovered = 0;
  for (const run of document.runs) {
    if (!activeRun(run) || run.status === 'waiting' || !ownerIsDead(run)) continue;
    const timestamp = now();
    if (run.harness?.version === 2)
      for (const task of run.harness.orchestration.tasks) {
        if (['pending', 'queued', 'running'].includes(task.status)) {
          task.status = 'interrupted';
          task.completedAt = now();
        }
      }
    run.status = 'interrupted';
    run.error = 'The server stopped before this run finished. Send a new message to continue.';
    run.updatedAt = timestamp;
    run.completedAt = timestamp;
    const chat = document.chats.find((item) => item.id === run.chatId);
    if (chat) chat.updatedAt = timestamp;
    document.project.updatedAt = timestamp;
    const assistant = document.messages.find((message) => message.id === run.assistantMessageId);
    if (assistant) assistant.status = 'interrupted';
    document.events.push({
      id: randomUUID(),
      projectId: run.projectId,
      chatId: run.chatId,
      runId: run.id,
      type: 'run.interrupted',
      summary: run.error,
      createdAt: timestamp,
    });
    recovered++;
  }
  return recovered;
}

export function defaultDataDirectory(): string {
  return (
    process.env.RECURSIVE_RESEARCH_DATA_DIR ||
    (process.platform === 'win32'
      ? path.join(
          process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'),
          'RecursiveResearch',
        )
      : path.join(homedir(), '.local', 'share', 'recursive-research'))
  );
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function assertOrdinary(target: string, kind: 'file' | 'directory'): Promise<void> {
  const stat = await lstat(target);
  if (stat.isSymbolicLink() || (kind === 'file' ? !stat.isFile() : !stat.isDirectory())) {
    throw new AppError(
      409,
      'UNSAFE_PATH',
      'The project data path must be an ordinary folder or file, not a symbolic link.',
    );
  }
}

async function ensureDirectory(target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await assertOrdinary(target, 'directory');
}

async function readJson<T>(target: string, schema: z.ZodType<T>): Promise<T> {
  await assertOrdinary(target, 'file');
  const contents = await readFile(target, 'utf8');
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new AppError(
      409,
      'INVALID_STORAGE',
      'Saved data is not valid JSON. Back up the folder before repairing it.',
    );
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      409,
      'INVALID_STORAGE',
      'Saved data has an unsupported format. Back up the folder before repairing it.',
    );
  return result.data;
}

/** Same-directory rename keeps readers on the previous or next complete snapshot. */
async function atomicJson(target: string, data: unknown): Promise<void> {
  assertFileLocksHeld();
  try {
    await assertOrdinary(target, 'file');
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    assertFileLocksHeld();
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, target);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (!['EACCES', 'EBUSY', 'EPERM'].includes(code ?? '') || attempt === 5) throw error;
        // Windows scanners and indexers can briefly hold the destination. Keep
        // the writer lock while retrying the same atomic replacement.
        assertFileLocksHeld();
        await delay(20 * (attempt + 1));
      }
    }
  } finally {
    await unlink(temporary).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }
}

export class WorkspaceStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public readonly dataDirectory: string) {}

  async initialize(): Promise<void> {
    await ensureDirectory(this.dataDirectory);
    await this.serialized(async () => {
      try {
        await this.registry();
      } catch (error) {
        if (!isMissing(error)) throw error;
        await atomicJson(this.registryPath(), {
          version: 1,
          projects: [],
          settings: defaultHarnessConfig,
        });
      }
    });
    await this.recoverRuns();
  }

  private registryPath(): string {
    return path.join(this.dataDirectory, 'registry.json');
  }
  private registry(): Promise<Registry> {
    return readJson(this.registryPath(), registrySchema);
  }
  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(() => withFileLock(this.dataDirectory, operation));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async documentLocation(project: Project): Promise<string> {
    const actualRoot = await realpath(project.folderPath);
    if (path.resolve(actualRoot) !== path.resolve(project.folderPath)) {
      throw new AppError(
        409,
        'PROJECT_MOVED',
        'The linked project folder has changed. Reconnect its actual location.',
      );
    }
    const directory = path.join(actualRoot, '.recursive-research');
    await assertOrdinary(directory, 'directory');
    return path.join(directory, 'workspace.json');
  }

  private async document(project: Project): Promise<ProjectDocument> {
    const document = await readJson(await this.documentLocation(project), documentSchema);
    if (document.project.id !== project.id)
      throw new AppError(
        409,
        'PROJECT_MISMATCH',
        'The folder now belongs to a different research project.',
      );
    document.project.folderPath = project.folderPath;
    document.project.available = true;
    return document;
  }

  async workspace(): Promise<Workspace> {
    const registry = await this.registry();
    const projects: Project[] = [];
    const chats: Chat[] = [];
    for (const saved of registry.projects) {
      try {
        const document = await this.document(saved);
        projects.push(document.project);
        chats.push(...document.chats);
      } catch {
        projects.push({ ...saved, available: false });
      }
    }
    return { projects, chats, settings: registry.settings };
  }

  createProject(name: string, folderPath: string): Promise<Project> {
    return this.serialized(async () => {
      if (!path.isAbsolute(folderPath))
        throw new AppError(
          400,
          'ABSOLUTE_PATH_REQUIRED',
          'Choose an existing folder using its full path.',
        );
      let root: string;
      try {
        root = await realpath(folderPath);
        await assertOrdinary(root, 'directory');
      } catch {
        throw new AppError(
          400,
          'FOLDER_UNAVAILABLE',
          'That folder does not exist or cannot be accessed. Choose an existing folder.',
        );
      }
      const registry = await this.registry();
      const equalPath = (a: string, b: string) =>
        process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
      if (registry.projects.some((project) => equalPath(project.folderPath, root))) {
        throw new AppError(409, 'PROJECT_EXISTS', 'This folder is already connected to a project.');
      }
      const dataRoot = path.join(root, '.recursive-research');
      await ensureDirectory(dataRoot);
      return withFileLock(dataRoot, async () => {
        const file = path.join(dataRoot, 'workspace.json');
        let project: Project;
        try {
          const document = await readJson(file, documentSchema);
          project = { ...document.project, folderPath: root, available: true };
          // Reconnect a moved project without replacing its chats or identity.
          const previous = registry.projects.find((item) => item.id === project.id);
          if (previous) {
            try {
              await this.document(previous);
            } catch {
              registry.projects = registry.projects.filter((item) => item.id !== project.id);
            }
            if (registry.projects.some((item) => item.id === project.id))
              throw new AppError(
                409,
                'DUPLICATE_PROJECT',
                'This project is already connected from another folder.',
              );
          }
        } catch (error) {
          if (!isMissing(error)) throw error;
          const timestamp = now();
          project = {
            id: randomUUID(),
            name,
            folderPath: root,
            createdAt: timestamp,
            updatedAt: timestamp,
            available: true,
          };
          await atomicJson(file, { version: 1, project, chats: [], messages: [], events: [] });
        }
        for (const directory of ['artifacts', 'notes', 'runs', 'memory'])
          await ensureDirectory(path.join(dataRoot, directory));
        registry.projects.push(project);
        await atomicJson(this.registryPath(), registry);
        return project;
      });
    });
  }

  private async findProject(id: string): Promise<Project> {
    const project = (await this.registry()).projects.find((item) => item.id === id);
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    return project;
  }

  createChat(projectId: string, title: string): Promise<Chat> {
    return this.serialized(async () => {
      const project = await this.findProject(projectId);
      return withFileLock(path.dirname(await this.documentLocation(project)), async () => {
        const document = await this.document(project);
        const timestamp = now();
        const chat: Chat = {
          id: randomUUID(),
          projectId,
          title,
          createdAt: timestamp,
          updatedAt: timestamp,
          codexThreadId: null,
        };
        document.chats.push(chat);
        document.project.updatedAt = timestamp;
        await atomicJson(await this.documentLocation(project), document);
        return chat;
      });
    });
  }

  private async findChat(
    id: string,
  ): Promise<{ project: Project; document: ProjectDocument; chat: Chat }> {
    for (const project of (await this.registry()).projects) {
      let document: ProjectDocument;
      try {
        document = await this.document(project);
      } catch {
        continue;
      }
      const chat = document.chats.find((item) => item.id === id);
      if (chat) return { project, document, chat };
    }
    throw new AppError(
      404,
      'CHAT_NOT_FOUND',
      'Chat not found, or its project folder is unavailable.',
    );
  }

  async chat(id: string): Promise<ChatDetail> {
    const { document, chat } = await this.findChat(id);
    return {
      chat,
      messages: document.messages.filter((item) => item.chatId === id),
      events: document.events.filter((item) => item.chatId === id),
      runs: document.runs.filter((item) => item.chatId === id).map(publicRun),
    };
  }

  addMessage(chatId: string, content: string): Promise<Message> {
    return this.serialized(async () => {
      const { project } = await this.findChat(chatId);
      return withFileLock(path.dirname(await this.documentLocation(project)), async () => {
        // Another registry may share this project. Reload only after acquiring
        // its own lock instead of writing the earlier findChat snapshot.
        const document = await this.document(project);
        const chat = document.chats.find((item) => item.id === chatId);
        if (!chat) throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found.');
        const timestamp = now();
        const message: Message = {
          id: randomUUID(),
          chatId,
          role: 'user',
          content,
          createdAt: timestamp,
          runId: null,
          status: 'complete',
        };
        document.messages.push(message);
        document.events.push({
          id: randomUUID(),
          projectId: project.id,
          chatId,
          runId: null,
          type: 'brief.saved',
          summary: 'Research brief saved to the project folder.',
          createdAt: timestamp,
        });
        chat.updatedAt = timestamp;
        document.project.updatedAt = timestamp;
        await atomicJson(await this.documentLocation(project), document);
        return message;
      });
    });
  }

  async getRunContext(
    chatId: string,
  ): Promise<{ project: Project; chat: Chat; messages: Message[] }> {
    const { project, document, chat } = await this.findChat(chatId);
    return {
      project,
      chat,
      messages: document.messages.filter((message) => message.chatId === chatId),
    };
  }

  createRun(chatId: string, input: ResolvedRunInput): Promise<Run> {
    return this.serialized(async () => {
      const { project } = await this.findChat(chatId);
      return withFileLock(path.dirname(await this.documentLocation(project)), async () => {
        const document = await this.document(project);
        const chat = document.chats.find((item) => item.id === chatId);
        if (!chat) throw new AppError(404, 'CHAT_NOT_FOUND', 'Chat not found.');
        recoverAbandonedRuns(document);
        if (document.runs.some((run) => run.chatId === chatId && activeRun(run)))
          throw new AppError(409, 'RUN_ACTIVE', 'This chat already has a run in progress.');
        const timestamp = now();
        const userMessageId = randomUUID();
        const assistantMessageId = randomUUID();
        const run = runSchema.parse({
          id: randomUUID(),
          projectId: project.id,
          chatId,
          mode: input.mode,
          status: 'queued',
          model: input.model,
          reasoningEffort: input.reasoningEffort,
          threadId: input.harness ? null : chat.codexThreadId,
          turnId: null,
          userMessageId,
          assistantMessageId,
          createdAt: timestamp,
          updatedAt: timestamp,
          completedAt: null,
          error: null,
          reportPath: null,
          harness: input.harnessState ?? null,
        });
        const content = z.string().trim().min(1).max(50000).parse(input.content);
        if (chat.title === 'New chat' || chat.title === 'New research')
          chat.title = content.split(/\r?\n/, 1)[0]!.slice(0, 80);
        document.messages.push(
          {
            id: userMessageId,
            chatId,
            runId: run.id,
            role: 'user',
            status: 'complete',
            content,
            createdAt: timestamp,
          },
          {
            id: assistantMessageId,
            chatId,
            runId: run.id,
            role: 'assistant',
            status: 'streaming',
            content: '',
            createdAt: timestamp,
          },
        );
        document.runs.push({ ...run, owner: { pid: process.pid, host: hostname() } });
        document.events.push({
          id: randomUUID(),
          projectId: project.id,
          chatId,
          runId: run.id,
          type: 'run.queued',
          summary: input.mode === 'research' ? 'Research queued.' : 'Chat queued.',
          createdAt: timestamp,
        });
        chat.updatedAt = timestamp;
        document.project.updatedAt = timestamp;
        await atomicJson(await this.documentLocation(project), document);
        return run;
      });
    });
  }

  private async findRun(
    id: string,
  ): Promise<{ project: Project; document: ProjectDocument; run: StoredRun }> {
    for (const project of (await this.registry()).projects) {
      let document: ProjectDocument;
      try {
        document = await this.document(project);
      } catch {
        continue;
      }
      const run = document.runs.find((item) => item.id === id);
      if (run) return { project, document, run };
    }
    throw new AppError(
      404,
      'RUN_NOT_FOUND',
      'Run not found, or its project folder is unavailable.',
    );
  }

  async run(id: string): Promise<Run> {
    return publicRun((await this.findRun(id)).run);
  }

  private mutateRun<T>(
    id: string,
    operation: (document: ProjectDocument, run: StoredRun) => Promise<T>,
  ): Promise<T> {
    return this.serialized(async () => {
      const { project } = await this.findRun(id);
      return withFileLock(path.dirname(await this.documentLocation(project)), async () => {
        const document = await this.document(project);
        const run = document.runs.find((item) => item.id === id);
        if (!run) throw new AppError(404, 'RUN_NOT_FOUND', 'Run not found.');
        const result = await operation(document, run);
        await atomicJson(await this.documentLocation(project), document);
        return result;
      });
    });
  }

  updateRun(id: string, update: RunUpdate): Promise<Run> {
    return this.mutateRun(id, async (document, run) => {
      // Ignore late provider notifications after the terminal snapshot.
      if (!activeRun(run)) return publicRun(run);
      assertRunOwner(run);
      const chat = document.chats.find((item) => item.id === run.chatId);
      const assistant = document.messages.find((item) => item.id === run.assistantMessageId);
      if (!chat || !assistant)
        throw new AppError(409, 'INVALID_STORAGE', 'The run is missing its saved conversation.');
      if (update.status === 'queued' && run.status === 'running')
        throw new AppError(409, 'INVALID_RUN_STATE', 'A running job cannot return to the queue.');
      if (update.content !== undefined)
        assistant.content = messageSchema.shape.content.parse(update.content);
      if (update.threadId !== undefined) {
        run.threadId = update.threadId;
        if (!run.harness) chat.codexThreadId = update.threadId;
      }
      if (update.harness !== undefined)
        run.harness = harnessStateSchema.nullable().parse(update.harness);
      if (update.turnId !== undefined) run.turnId = update.turnId;
      if (update.error !== undefined) run.error = update.error;
      const timestamp = now();
      const changedStatus = update.status !== undefined && update.status !== run.status;
      if (update.status !== undefined) run.status = update.status;
      run.updatedAt = timestamp;
      chat.updatedAt = timestamp;
      document.project.updatedAt = timestamp;
      if (run.status === 'waiting') assistant.status = 'complete';
      if (!activeRun(run)) {
        run.completedAt = timestamp;
        assistant.status =
          run.status === 'completed'
            ? 'complete'
            : run.status === 'failed'
              ? 'failed'
              : 'interrupted';
        if (run.status === 'completed' && run.mode === 'research')
          run.reportPath = await this.saveResearchReport(document, run);
      }
      if (changedStatus || update.summary) {
        const statusEvents = {
          waiting: 'note.added',
          queued: 'run.queued',
          running: 'run.started',
          completed: 'run.completed',
          cancelled: 'run.cancelled',
          failed: 'run.failed',
          interrupted: 'run.interrupted',
        } as const;
        document.events.push({
          id: randomUUID(),
          projectId: run.projectId,
          chatId: run.chatId,
          runId: run.id,
          type: changedStatus ? statusEvents[run.status] : 'tool.progress',
          summary: update.summary ?? run.error ?? `Run ${run.status}.`,
          createdAt: timestamp,
        });
      }
      return publicRun(run);
    });
  }

  /** Atomically claims a durable clarification; waiting has no live provider owner. */
  answerHarness(id: string, answer: string): Promise<Run> {
    return this.mutateRun(id, async (document, run) => {
      if (run.status !== 'waiting' || !run.harness?.question)
        throw new AppError(409, 'NOT_WAITING', 'This research is no longer waiting for an answer.');
      run.owner = { pid: process.pid, host: hostname() };
      run.harness.answer = z.string().trim().min(1).max(50000).parse(answer);
      run.harness.stage = 'plan';
      run.status = 'queued';
      run.turnId = null;
      run.updatedAt = now();
      const assistant = document.messages.find((item) => item.id === run.assistantMessageId);
      if (assistant) assistant.status = 'streaming';
      document.messages.push({
        id: randomUUID(),
        chatId: run.chatId,
        runId: run.id,
        role: 'user',
        content: answer,
        status: 'complete',
        createdAt: now(),
      });
      return publicRun(run);
    });
  }

  cancelWaitingHarness(id: string): Promise<Run> {
    return this.mutateRun(id, async (document, run) => {
      if (run.status !== 'waiting')
        throw new AppError(409, 'NOT_WAITING', 'Research has already continued.');
      run.status = 'cancelled';
      run.completedAt = now();
      run.updatedAt = now();
      document.events.push({
        id: randomUUID(),
        projectId: run.projectId,
        chatId: run.chatId,
        runId: run.id,
        type: 'run.cancelled',
        summary: 'Research stopped while waiting for clarification.',
        createdAt: now(),
      });
      return publicRun(run);
    });
  }

  async recoverRuns(): Promise<number> {
    return this.serialized(async () => {
      let recovered = 0;
      for (const project of (await this.registry()).projects) {
        let location: string;
        try {
          location = await this.documentLocation(project);
          await this.document(project);
        } catch {
          // An unavailable or malformed project stays untouched and reconnectable.
          continue;
        }
        recovered += await withFileLock(path.dirname(location), async () => {
          const document = await this.document(project);
          const count = recoverAbandonedRuns(document);
          if (count) await atomicJson(location, document);
          return count;
        });
      }
      return recovered;
    });
  }

  private async saveResearchReport(document: ProjectDocument, run: StoredRun): Promise<string> {
    if (run.mode !== 'research')
      throw new AppError(409, 'NOT_RESEARCH', 'Only research runs create reports.');
    const assistant = document.messages.find((item) => item.id === run.assistantMessageId);
    if (!assistant?.content.trim())
      throw new AppError(409, 'EMPTY_REPORT', 'The research run did not produce a report.');
    const root = path.join(
      path.dirname(await this.documentLocation(document.project)),
      'artifacts',
    );
    await assertOrdinary(root, 'directory');
    const name = `research-${run.id}.md`;
    const target = path.join(root, name);
    const content = `${assistant.content.trimEnd()}\n`;
    assertFileLocksHeld();
    try {
      await writeFile(target, content, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await assertOrdinary(target, 'file');
      // A previous write can have succeeded before publishing workspace.json.
      // Accept that exact retry, but never overwrite an unrelated existing file.
      if ((await readFile(target, 'utf8')) !== content)
        throw new AppError(409, 'REPORT_EXISTS', 'A different file already uses this report name.');
    }
    assertFileLocksHeld();
    return name;
  }

  writeResearchReport(id: string): Promise<string> {
    return this.mutateRun(id, async (document, run) => {
      if (activeRun(run)) assertRunOwner(run);
      if (run.reportPath) return run.reportPath;
      run.reportPath = await this.saveResearchReport(document, run);
      return run.reportPath;
    });
  }

  saveSettings(settings: HarnessConfig): Promise<HarnessConfig> {
    return this.serialized(async () => {
      const registry = await this.registry();
      registry.settings = harnessConfigSchema.parse(settings);
      await atomicJson(this.registryPath(), registry);
      return registry.settings;
    });
  }

  async artifacts(projectId: string): Promise<Artifact[]> {
    const project = await this.findProject(projectId);
    await this.document(project);
    const location = await this.documentLocation(project);
    const root = path.join(path.dirname(location), 'artifacts');
    await assertOrdinary(root, 'directory');
    const output: Artifact[] = [];
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 8 || output.length >= 1000) return;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.isSymbolicLink() || output.length >= 1000) continue;
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(target, depth + 1);
        else if (entry.isFile()) {
          const stat = await lstat(target);
          if (!stat.isFile() || stat.isSymbolicLink()) continue;
          output.push({
            name: entry.name,
            relativePath: path.relative(root, target).split(path.sep).join('/'),
            size: stat.size,
            updatedAt: stat.mtime.toISOString(),
          });
        }
      }
    };
    await visit(root, 0);
    return output;
  }

  async readArtifact(projectId: string, relativePath: string): Promise<string> {
    const project = await this.findProject(projectId);
    await this.document(project);
    const root = path.join(path.dirname(await this.documentLocation(project)), 'artifacts');
    await assertOrdinary(root, 'directory');
    const segments = relativePath.split('/');
    if (
      path.isAbsolute(relativePath) ||
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..' || /[\\:\0]/.test(segment),
      )
    )
      throw new AppError(400, 'UNSAFE_PATH', 'Choose a file inside the project artifacts folder.');
    let target = root;
    for (let index = 0; index < segments.length; index++) {
      target = path.join(target, segments[index]!);
      await assertOrdinary(target, index === segments.length - 1 ? 'file' : 'directory');
    }
    const relative = path.relative(await realpath(root), await realpath(target));
    if (
      !relative ||
      relative.startsWith(`..${path.sep}`) ||
      relative === '..' ||
      path.isAbsolute(relative)
    )
      throw new AppError(400, 'UNSAFE_PATH', 'Choose a file inside the project artifacts folder.');
    const limit = 2 * 1024 * 1024;
    if ((await lstat(target)).size > limit)
      throw new AppError(413, 'ARTIFACT_TOO_LARGE', 'This file is too large to preview.');
    const content = await readFile(target, 'utf8');
    if (Buffer.byteLength(content) > limit)
      throw new AppError(413, 'ARTIFACT_TOO_LARGE', 'This file is too large to preview.');
    return content;
  }
}
