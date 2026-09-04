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
});
export type Chat = z.infer<typeof chatSchema>;

export const messageSchema = z.object({
  id: idSchema,
  chatId: idSchema,
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().trim().min(1).max(50000),
  createdAt: timestamp,
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
  ]),
  summary: z.string(),
  createdAt: timestamp,
});
export type ResearchEvent = z.infer<typeof researchEventSchema>;

export const harnessConfigSchema = z
  .object({
    version: z.literal(1),
    model: z.string().min(1).max(200).nullable(),
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
export const createMessageSchema = z.object({ content: messageSchema.shape.content }).strict();

export interface Workspace {
  projects: Project[];
  chats: Chat[];
  settings: HarnessConfig;
}
export interface ChatDetail {
  chat: Chat;
  messages: Message[];
  events: ResearchEvent[];
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
