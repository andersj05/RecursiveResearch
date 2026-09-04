import { describe, expect, it } from 'vitest';
import {
  harnessStateSchema,
  stageOutputSchema,
  type HarnessState,
} from '@recursive-research/contracts';
import { advanceHarness, normalizeSourceUrl, researchGraph } from './workflow.js';

const timestamp = '2026-09-04T12:00:00.000Z';
export function initialState(): HarnessState {
  return {
    version: 1,
    stage: 'scope',
    brief: 'Research a topic',
    maxRounds: 2,
    maxSources: 3,
    requirePrimarySources: true,
    instructions: '',
    round: 0,
    question: null,
    answer: null,
    plan: [],
    sources: [],
    gaps: [],
    steps: [],
    stopReason: null,
  };
}
const advance = (state: HarnessState, output: unknown) =>
  advanceHarness(state, JSON.stringify(output), timestamp);

describe('research graph routing', () => {
  it('waits only for a nonempty scope question', () => {
    expect(
      advance(initialState(), { summary: 'Clarify region', question: 'Which region?' }).stage,
    ).toBe('scope');
    expect(advance(initialState(), { summary: 'Clear scope', question: null }).stage).toBe('plan');
    expect(advance(initialState(), { summary: 'Clear scope', question: ' ' }).stage).toBe('plan');
  });
  it('normalizes tracking and fragments without dropping meaningful query parameters', () => {
    expect(normalizeSourceUrl('https://EXAMPLE.com/p?b=2&utm_source=x&a=1#section')).toBe(
      'https://example.com/p?a=1&b=2',
    );
  });
  it('deduplicates evidence and enforces the retained source limit', () => {
    const source = {
      url: 'https://example.com/?utm_source=x',
      title: 'Original',
      finding: 'Evidence',
      primary: true,
    };
    const state = advance(
      { ...initialState(), stage: 'gather', round: 1, maxSources: 1 },
      {
        summary: 'Found evidence',
        sources: [
          source,
          { ...source, url: 'https://example.com/#x' },
          { ...source, url: 'https://different.example/' },
        ],
      },
    );
    expect(state.sources).toEqual([{ ...source, url: 'https://example.com/', round: 1 }]);
    expect(state.stage).toBe('review');
    expect(harnessStateSchema.safeParse(state).success).toBe(true);
  });
  it('repeats only with gaps and remaining budgets, recording the stopping decision', () => {
    const state = { ...initialState(), stage: 'review' as const, round: 1 };
    expect(
      advance(state, { summary: 'Missing support', gaps: ['Find a primary source'] }).stage,
    ).toBe('gather');
    expect(
      advance({ ...state, round: 2 }, { summary: 'Still missing', gaps: ['Open question'] })
        .stopReason,
    ).toContain('round limit');
    expect(advance(state, { summary: 'Covered', gaps: [] }).stage).toBe('report');
  });
  it('rejects malformed and unsafe evidence before routing', () => {
    expect(() => advanceHarness(initialState(), 'not JSON', timestamp)).toThrow();
    expect(() => advance(initialState(), { summary: 'Scope', nextStage: 'shell' })).toThrow();
    expect(() =>
      advance(
        { ...initialState(), stage: 'gather', round: 1 },
        {
          summary: 'Found',
          sources: [{ url: 'javascript:alert(1)', title: 'Bad', finding: 'Bad', primary: false }],
        },
      ),
    ).toThrow();
  });
  it('omits unsupported URI format from provider schemas while validating URLs locally', () => {
    expect(JSON.stringify(stageOutputSchema('gather'))).not.toContain('"format":"uri"');
  });

  it('provides output schemas for all structured graph nodes', () => {
    for (const stage of researchGraph)
      if (stage.id !== 'report')
        expect(stageOutputSchema(stage.id)).toHaveProperty('additionalProperties', false);
  });
});
