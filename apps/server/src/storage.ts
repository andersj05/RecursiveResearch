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
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import {
  projectSchema,
  chatSchema,
  messageSchema,
  researchEventSchema,
  harnessConfigSchema,
  defaultHarnessConfig,
  type Project,
  type Chat,
  type Message,
  type HarnessConfig,
  type Workspace,
  type ChatDetail,
  type Artifact,
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
});
type Registry = z.infer<typeof registrySchema>;
type ProjectDocument = z.infer<typeof documentSchema>;
const now = () => new Date().toISOString();

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
    await rename(temporary, target);
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
}
