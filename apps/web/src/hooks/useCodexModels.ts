import { useCallback, useEffect, useState } from 'react';
import type { CodexModel, CodexStatus } from '@recursive-research/codex-provider';
import { describeError, request } from '../lib/api';

export function useCodexModels() {
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await request<CodexStatus>('/codex/status');
      setStatus(next);
      setModels(next.state === 'connected' ? await request<CodexModel[]>('/codex/models') : []);
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const events = new EventSource('/api/events');
    events.onopen = () => void refresh();
    events.addEventListener('provider.updated', () => void refresh());
    return () => events.close();
  }, [refresh]);

  return { status, models, error, refresh };
}
