import { harnessOptionsSchema, harnessStateSchema } from './harness.js';
export * from './harness.js';
import { z } from 'zod';

export const idSchema = z.uuid();
const timestamp = z.iso.datetime();

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(100),
  folderPath: z.string().min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
  available: z.boolean(),
});
export type Project = z.infer<typeof projectSchema>;

export const chatSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string().trim().min(1).max(120),
  createdAt: timestamp,
  updatedAt: timestamp,
  codexThreadId: z.string().nullable().default(null),
});
export type Chat = z.infer<typeof chatSchema>;

export const messageSchema = z.object({
  id: idSchema,
  chatId: idSchema,
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(200000),
  createdAt: timestamp,
  runId: idSchema.nullable().default(null),
  status: z.enum(['complete', 'streaming', 'interrupted', 'failed']).default('complete'),
});
export type Message = z.infer<typeof messageSchema>;

export const researchEventSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  chatId: idSchema,
  runId: idSchema.nullable(),
  type: z.enum([
    'brief.saved',
    'run.started',
    'agent.started',
    'source.found',
    'note.added',
    'steering.accepted',
    'run.completed',
    'run.failed',
    'run.queued',
    'run.cancelled',
    'run.interrupted',
    'tool.progress',
  ]),
  summary: z.string(),
  createdAt: timestamp,
});
export type ResearchEvent = z.infer<typeof researchEventSchema>;

export const harnessConfigSchema = z
  .object({
    version: z.literal(1),
    model: z.string().min(1).max(200).nullable(),
    reasoningEffort: z.string().min(1).max(40).nullable().default(null),
    maxParallelAgents: z.number().int().min(1).max(16),
    maxDepth: z.number().int().min(1).max(10),
    maxSourcesPerAgent: z.number().int().min(1).max(100),
    instructions: z.string().max(20000),
    requirePrimarySources: z.boolean(),
  })
  .strict();
export type HarnessConfig = z.infer<typeof harnessConfigSchema>;
export const defaultHarnessConfig: HarnessConfig = {
  version: 1,
  model: null,
  reasoningEffort: null,
  maxParallelAgents: 3,
  maxDepth: 3,
  maxSourcesPerAgent: 12,
  instructions:
    'Prefer primary sources. Record citations, distinguish evidence from inference, and surface open questions.',
  requirePrimarySources: true,
};

export const createProjectSchema = z
  .object({ name: projectSchema.shape.name, folderPath: z.string().trim().min(1).max(4000) })
  .strict();
export const createChatSchema = z.object({ title: chatSchema.shape.title }).strict();
export const createMessageSchema = z
  .object({ content: z.string().trim().min(1).max(50000) })
  .strict();

export const runModeSchema = z.enum(['chat', 'research']);
export type RunMode = z.infer<typeof runModeSchema>;
export const runStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'cancelled',
  'failed',
  'interrupted',
  'waiting',
]);
export const runSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  chatId: idSchema,
  mode: runModeSchema,
  status: runStatusSchema,
  model: z.string(),
  reasoningEffort: z.string(),
  threadId: z.string().nullable(),
  turnId: z.string().nullable(),
  userMessageId: idSchema,
  assistantMessageId: idSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: timestamp.nullable(),
  error: z.string().nullable(),
  reportPath: z.string().nullable(),
  harness: harnessStateSchema.nullable().default(null),
});
export type Run = z.infer<typeof runSchema>;
export const startRunSchema = z
  .object({
    content: createMessageSchema.shape.content,
    mode: runModeSchema.default('chat'),
    harness: harnessOptionsSchema.optional(),
    model: z.string().min(1).max(200).nullable().default(null),
    reasoningEffort: z.string().min(1).max(40).nullable().default(null),
  })
  .strict();
export type StartRunInput = z.infer<typeof startRunSchema>;

export function isActiveRun(run: Pick<Run, 'status'>): boolean {
  return run.status === 'queued' || run.status === 'running' || run.status === 'waiting';
}

export interface Workspace {
  projects: Project[];
  chats: Chat[];
  settings: HarnessConfig;
}
export interface ChatDetail {
  chat: Chat;
  messages: Message[];
  events: ResearchEvent[];
  runs: Run[];
}
export interface Artifact {
  name: string;
  relativePath: string;
  size: number;
  updatedAt: string;
}
export interface ApiError {
  error: { code: string; message: string };
}
