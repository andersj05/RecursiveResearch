import { describe, expect, it } from 'vitest';
import { projectWebTool } from '../src/web-tool.js';

describe('public web tool telemetry', () => {
  it('projects search, open, and find arguments without arbitrary payloads', () => {
    expect(
      projectWebTool(
        {
          id: 's1',
          query: 'fallback',
          action: { type: 'search', queries: ['primary research'], secret: 'hidden' },
          credentials: 'hidden',
        },
        'started',
      ),
    ).toEqual({
      itemId: 's1',
      action: 'search',
      status: 'started',
      query: 'fallback',
      queries: ['primary research'],
    });
    expect(
      projectWebTool(
        { id: 'o1', action: { type: 'openPage', url: 'https://example.com/' } },
        'completed',
      ),
    ).toMatchObject({ action: 'openPage', url: 'https://example.com/', status: 'completed' });
    expect(
      projectWebTool(
        {
          id: 'f1',
          action: { type: 'findInPage', url: 'https://example.com/', pattern: 'methods' },
        },
        'completed',
      ),
    ).toMatchObject({ action: 'findInPage', pattern: 'methods' });
  });
  it('handles missing metadata honestly and bounds query payloads', () => {
    expect(projectWebTool({ id: 'unknown' }, 'started')?.action).toBe('unknown');
    expect(projectWebTool({ action: { type: 'search' } }, 'started')).toBeNull();
    expect(
      projectWebTool({ id: 'large', query: 'x'.repeat(5000) }, 'completed')?.query,
    ).toHaveLength(4000);
  });
});
