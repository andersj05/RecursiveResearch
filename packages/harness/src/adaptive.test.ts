import { describe, expect, it } from 'vitest';
import {
  defaultAdaptiveOptions,
  defaultHarnessConfig,
  adaptiveHarnessStateSchema,
} from '@recursive-research/contracts';
import {
  admitDirections,
  createAdaptiveState,
  createTask,
  mergeInvestigation,
  nextResearchBatch,
  stoppingReason,
  investigationPrompt,
} from './adaptive.js';
const now = '2026-09-04T20:00:00.000Z';
const direction = (question: string, priority = 3, parentId: string | null = null) => ({
  question,
  priority,
  parentId,
  reason: 'Unresolved evidence',
  role: 'researcher' as const,
});
const initial = () =>
  createAdaptiveState('Research this topic', defaultAdaptiveOptions, defaultHarnessConfig);

describe('adaptive research policy', () => {
  it('admits a prioritized frontier, deduplicates questions, and records lineage', () => {
    const state = initial();
    const planner = createTask(state, 'planner', 'Plan', now);
    expect(
      admitDirections(
        state,
        [direction('Low priority', 1), direction('Important?', 5)],
        now,
        planner.id,
      ),
    ).toBe(2);
    expect(admitDirections(state, [direction('Important!', 4)], now)).toBe(0);
    expect(nextResearchBatch(state).map((t) => t.question)).toEqual(['Important?', 'Low priority']);
    const parent = nextResearchBatch(state)[0]!;
    admitDirections(state, [direction('Follow evidence')], now, parent.id);
    expect(state.orchestration.tasks.at(-1)).toMatchObject({ parentId: parent.id, depth: 2 });
  });
  it('enforces assignment/depth bounds and rejects fabricated parents', () => {
    const state = initial();
    state.orchestration.maxTasks = 2;
    state.orchestration.maxDepth = 1;
    admitDirections(state, [direction('A')], now);
    expect(
      admitDirections(state, [direction('B', 3, 'agent-1'), direction('C', 3, 'missing')], now),
    ).toBe(0);
    expect(admitDirections(state, [direction('D'), direction('E')], now)).toBe(1);
    expect(state.orchestration.rejectedDirections).toBe(3);
  });
  it('preserves conflicting observations for a shared normalized source', () => {
    const state = initial();
    state.round = 1;
    const a = createTask(state, 'researcher', 'A', now);
    const b = createTask(state, 'skeptic', 'B', now);
    const source = {
      url: 'https://example.com/p?utm_source=a',
      title: 'Study',
      finding: 'Supports the claim',
      primary: true,
    };
    mergeInvestigation(
      state,
      a,
      { summary: 'A', sources: [source], leads: [direction('New question')], uncertainties: [] },
      now,
    );
    mergeInvestigation(
      state,
      b,
      {
        summary: 'B',
        sources: [
          { ...source, url: 'https://example.com/p#section', finding: 'Limited by the sample' },
        ],
        leads: [],
        uncertainties: ['Does this generalize?'],
      },
      now,
    );
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]?.observations.map((o) => o.taskId)).toEqual([a.id, b.id]);
    expect(state.orchestration.tasks.at(-1)?.parentId).toBe(a.id);
    expect(adaptiveHarnessStateSchema.safeParse(state).success).toBe(true);
  });
  it('does not accept a sufficient verdict with contradictions or gaps', () => {
    const state = initial();
    state.round = 1;
    admitDirections(state, [direction('Investigate')], now);
    state.sources.push({
      url: 'https://example.com/',
      title: 'Source',
      finding: 'Finding',
      primary: true,
      round: 1,
      observations: [],
    });
    state.gaps = ['Missing primary evidence'];
    expect(stoppingReason(state, true)).toBeNull();
    state.gaps = [];
    state.orchestration.contradictions = ['Conflicting results'];
    expect(stoppingReason(state, true)).toBeNull();
    state.orchestration.stagnantRounds = 2;
    expect(stoppingReason(state, false)).toContain('no new sources');
  });
  it('keeps all stored sources while bounding the context sent to a child', () => {
    const state = initial();
    state.round = 1;
    for (let i = 0; i < 120; i++)
      state.sources.push({
        url: `https://example.com/${i}`,
        title: `Source ${i}`,
        finding: 'Finding',
        primary: true,
        round: 1,
        observations: [],
      });
    const task = createTask(state, 'researcher', 'Find evidence', now);
    const prompt = JSON.parse(investigationPrompt(state, task));
    expect(prompt.evidence).toHaveLength(16);
    expect(prompt.retainedSourceCount).toBe(120);
    expect(state.sources).toHaveLength(120);
  });
});
