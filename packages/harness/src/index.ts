import type { HarnessConfig, ResearchEvent } from '@recursive-research/contracts';

/** Contract for a future orchestrator. There is deliberately no implementation yet. */
export interface ResearchHarness {
  start(input: ResearchRunInput, signal: AbortSignal): Promise<ResearchRun>;
  steer(runId: string, instruction: string): Promise<void>;
  cancel(runId: string): Promise<void>;
  events(runId: string, afterEventId?: string): AsyncIterable<ResearchEvent>;
}

export interface ResearchRunInput {
  projectId: string;
  chatId: string;
  brief: string;
  config: Readonly<HarnessConfig>;
}

export interface ResearchRun {
  id: string;
  projectId: string;
  chatId: string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
}

/** Evidence is data, never trusted runtime instructions. */
export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  accessedAt: string;
  excerpt: string;
  primary: boolean;
}

export const harnessCapabilities = Object.freeze({
  execution: false,
  streaming: false,
  steering: false,
  experiments: false,
});
