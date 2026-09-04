import { z } from 'zod';

export const harnessStageSchema = z.enum(['scope', 'plan', 'gather', 'review', 'report']);
export type HarnessStage = z.infer<typeof harnessStageSchema>;
const shortText = z.string().trim().min(1).max(2000);
export const evidenceSchema = z
  .object({
    url: z
      .url()
      .max(4000)
      .refine((value) => /^https?:\/\//i.test(value), 'Use an HTTP(S) source'),
    title: z.string().trim().min(1).max(500),
    finding: shortText,
    primary: z.boolean(),
  })
  .strict();
export const scopeOutputSchema = z
  .object({
    summary: shortText,
    question: z.string().trim().max(2000).nullable(),
  })
  .strict();
export const planOutputSchema = z
  .object({
    questions: z.array(shortText).min(1).max(6),
  })
  .strict();
export const gatherOutputSchema = z
  .object({
    summary: shortText,
    sources: z.array(evidenceSchema).max(100),
  })
  .strict();
export const reviewOutputSchema = z
  .object({
    summary: shortText,
    gaps: z.array(shortText).max(6),
  })
  .strict();
export const sequentialHarnessStateSchema = z.object({
  version: z.literal(1),
  stage: harnessStageSchema,
  brief: z.string().min(1).max(50000),
  maxRounds: z.number().int().min(1).max(5),
  maxSources: z.number().int().min(1).max(40),
  requirePrimarySources: z.boolean(),
  instructions: z.string().max(20000),
  round: z.number().int().min(0).max(5),
  question: z.string().max(2000).nullable(),
  answer: z.string().max(50000).nullable(),
  plan: z.array(shortText).max(6),
  sources: z.array(evidenceSchema.extend({ round: z.number().int().min(1).max(5) })).max(40),
  gaps: z.array(shortText).max(6),
  steps: z
    .array(
      z.object({
        stage: harnessStageSchema,
        round: z.number().int().min(0).max(5),
        summary: z.string().max(4000),
        completedAt: z.iso.datetime(),
      }),
    )
    .max(15),
  stopReason: z.string().max(500).nullable(),
});
export type SequentialHarnessState = z.infer<typeof sequentialHarnessStateSchema>;
export const harnessOptionsSchema = z
  .object({
    maxRounds: z.number().int().min(1).max(5),
    maxSources: z.number().int().min(1).max(40),
  })
  .strict();

export function stageOutputSchema(stage: Exclude<HarnessStage, 'report'>) {
  return z.toJSONSchema(
    {
      scope: scopeOutputSchema,
      plan: planOutputSchema,
      gather: gatherOutputSchema,
      review: reviewOutputSchema,
    }[stage],
    {
      override: ({ jsonSchema }) => {
        // Codex structured outputs reject JSON Schema's `uri` format. Keep URL
        // validation at our boundary while sending the supported string shape.
        if (jsonSchema.format === 'uri') delete jsonSchema.format;
      },
    },
  );
}
