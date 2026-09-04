import { z } from 'zod';
import { evidenceSchema, sequentialHarnessStateSchema } from './harness.js';

const note = z.string().trim().min(1).max(1600);
export const directionSchema = z
  .object({
    question: z.string().trim().min(1).max(600),
    reason: z.string().trim().min(1).max(600),
    priority: z.number().int().min(1).max(5),
    role: z.enum(['researcher', 'skeptic']),
    parentId: z.string().max(80).nullable(),
  })
  .strict();
export const investigationPlanSchema = z
  .object({
    summary: note,
    question: z.string().max(1200).nullable(),
    directions: z.array(directionSchema).min(1).max(6),
  })
  .strict();
export const investigationResultSchema = z
  .object({
    summary: note,
    sources: z.array(evidenceSchema).max(24),
    leads: z.array(directionSchema).max(4),
    uncertainties: z.array(z.string().max(600)).max(6),
  })
  .strict();
export const synthesisResultSchema = z
  .object({
    summary: note,
    gaps: z.array(z.string().max(600)).max(8),
    contradictions: z.array(z.string().max(600)).max(8),
    sufficient: z.boolean(),
    directions: z.array(directionSchema).max(6),
  })
  .strict();

export const webToolCallSchema = z.object({
  itemId: z.string().max(200),
  action: z.enum(['search', 'openPage', 'findInPage', 'unknown']),
  status: z.enum(['started', 'completed']),
  query: z.string().max(4000).optional(),
  queries: z.array(z.string().max(2000)).max(12).optional(),
  url: z.string().max(4000).optional(),
  pattern: z.string().max(2000).optional(),
});
export type WebToolCall = z.infer<typeof webToolCallSchema>;
export const agentTaskSchema = z.object({
  id: z.string().max(80),
  parentId: z.string().max(80).nullable(),
  role: z.enum(['planner', 'researcher', 'skeptic', 'synthesizer', 'reporter']),
  question: z.string().max(1600),
  reason: z.string().max(1600),
  priority: z.number().int().min(1).max(5),
  depth: z.number().int().min(0).max(8),
  round: z.number().int().min(0).max(12),
  status: z.enum([
    'pending',
    'queued',
    'running',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
    'skipped',
  ]),
  summary: z.string().max(2000),
  error: z.string().max(1000).nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  threadId: z.string().nullable(),
  turnId: z.string().nullable(),
  sourceUrls: z.array(z.string().max(4000)).max(24),
  request: z
    .object({
      model: z.string(),
      effort: z.string(),
      mode: z.enum(['chat', 'research']),
      prompt: z.string().max(200000),
      instructions: z.string().max(12000),
      outputSchema: z.string().max(30000).nullable(),
      cwd: z.string(),
    })
    .nullable(),
});
export type AgentTask = z.infer<typeof agentTaskSchema>;
export const orchestrationSchema = z.object({
  maxAgents: z.number().int().min(1).max(6),
  maxTasks: z.number().int().min(2).max(48),
  maxDepth: z.number().int().min(1).max(8),
  maxMinutes: z.number().int().min(1).max(120),
  elapsedMs: z.number().nonnegative(),
  tasks: z.array(agentTaskSchema).max(80),
  toolCalls: z
    .array(
      webToolCallSchema.extend({
        taskId: z.string(),
        recordedAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }),
    )
    .max(2000),
  droppedToolCalls: z.number().int().nonnegative(),
  turnsStarted: z.number().int().nonnegative(),
  synthesis: z.string().max(2000),
  contradictions: z.array(z.string().max(600)).max(8),
  decisions: z
    .array(
      z.object({
        round: z.number().int(),
        summary: z.string().max(2000),
        newSources: z.number().int(),
        addedTasks: z.number().int(),
        createdAt: z.iso.datetime(),
      }),
    )
    .max(12),
  stagnantRounds: z.number().int().nonnegative(),
  rejectedDirections: z.number().int().nonnegative(),
  steering: z.array(z.string().max(4000)).max(20),
});
export const adaptiveHarnessStateSchema = sequentialHarnessStateSchema.extend({
  version: z.literal(2),
  gaps: z.array(z.string().max(600)).max(8),
  maxRounds: z.number().int().min(1).max(12),
  maxSources: z.number().int().min(2).max(500),
  round: z.number().int().min(0).max(12),
  sources: z
    .array(
      evidenceSchema.extend({
        round: z.number().int().min(1).max(12),
        observations: z
          .array(
            z.object({
              taskId: z.string(),
              finding: z.string().max(2000),
              primary: z.boolean(),
              recordedAt: z.iso.datetime(),
            }),
          )
          .max(48),
      }),
    )
    .max(500),
  steps: z
    .array(
      z.object({
        stage: z.enum(['scope', 'plan', 'gather', 'review', 'report']),
        round: z.number().int(),
        summary: z.string().max(4000),
        completedAt: z.iso.datetime(),
      }),
    )
    .max(40),
  orchestration: orchestrationSchema,
});
export type AdaptiveHarnessState = z.infer<typeof adaptiveHarnessStateSchema>;
export const adaptiveOptionsSchema = z
  .object({
    strategy: z.literal('adaptive'),
    maxRounds: z.number().int().min(1).max(12),
    maxSources: z.number().int().min(2).max(500),
    maxAgents: z.number().int().min(1).max(6),
    maxTasks: z.number().int().min(2).max(48),
    maxDepth: z.number().int().min(1).max(8),
    maxMinutes: z.number().int().min(1).max(120),
  })
  .strict();
export type AdaptiveOptions = z.infer<typeof adaptiveOptionsSchema>;
export const harnessRuntimeSchema = z.object({
  provider: z.enum(['codex', 'injected']),
  launch: z
    .object({ executable: z.string(), args: z.array(z.string()), shell: z.literal(false) })
    .nullable(),
  transport: z.string(),
  scheduler: z.object({ active: z.number(), queued: z.number(), limit: z.number() }),
  methods: z.array(z.string()),
});
export type HarnessRuntime = z.infer<typeof harnessRuntimeSchema>;
export const defaultAdaptiveOptions: AdaptiveOptions = {
  strategy: 'adaptive',
  maxRounds: 6,
  maxSources: 120,
  maxAgents: 3,
  maxTasks: 18,
  maxDepth: 4,
  maxMinutes: 45,
};

export function investigationOutputSchema(role: AgentTask['role']) {
  const schema =
    role === 'planner'
      ? investigationPlanSchema
      : role === 'synthesizer'
        ? synthesisResultSchema
        : investigationResultSchema;
  return z.toJSONSchema(schema, {
    override: ({ jsonSchema }) => {
      if (jsonSchema.format === 'uri') delete jsonSchema.format;
    },
  });
}
