import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationApiVersion, defaultAdaptiveOptions } from '@recursive-research/contracts';
import { api } from './api';
afterEach(() => vi.unstubAllGlobals());
describe('client/server compatibility', () => {
  const input = {
    content: 'Research',
    mode: 'research' as const,
    model: null,
    reasoningEffort: null,
    harness: defaultAdaptiveOptions,
  };
  it('blocks mutation against an old server instead of silently downgrading research', async () => {
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ status: 'ok', harness: { execution: true } })),
    );
    vi.stubGlobal('fetch', fetcher);
    await expect(api.startRun('chat-id', input)).rejects.toThrow('Restart RecursiveResearch');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toEqual(['/api/health', expect.anything()]);
  });
  it('sends the complete harness request to a compatible server', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ apiVersion: applicationApiVersion })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'run-id' })));
    vi.stubGlobal('fetch', fetcher);
    await expect(api.startRun('chat-id', input)).resolves.toEqual({ id: 'run-id' });
    const options = fetcher.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(options.body as string)).toEqual(input);
    expect(fetcher.mock.calls[1]![0]).toBe('/api/chats/chat-id/runs');
  });
});
