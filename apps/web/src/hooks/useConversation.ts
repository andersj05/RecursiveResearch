import { useEffect, useRef, useState } from 'react';
import type { Artifact, ChatDetail } from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';

export function useConversation(projectId: string, chatId: string | undefined, revision: number) {
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (fetching) {
        requested = true;
        return;
      }
      fetching = true;
      const results = await Promise.allSettled([
        chatId ? api.chat(chatId) : Promise.resolve(null),
        api.artifacts(projectId),
      ]);
      fetching = false;
      if (cancelled) return;
      if (results[0].status === 'fulfilled') setDetail(results[0].value);
      if (results[1].status === 'fulfilled') setArtifacts(results[1].value);
      const failures = results
        .filter((item) => item.status === 'rejected')
        .map((item) => describeError(item.reason));
      setError(failures.length ? failures.join(' ') : null);
      setLoading(false);
      if (requested) {
        requested = false;
        void refresh();
      }
    };
    refreshRef.current = () => {
      void refresh();
    };
    const events = new EventSource('/api/events');
    events.onopen = () => {
      setReconnecting(false);
      void refresh();
    };
    events.onerror = () => setReconnecting(true);
    events.addEventListener('run.updated', (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as { chatId?: string };
        if (update.chatId !== chatId) return;
      } catch {
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 100);
    });
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      events.close();
    };
  }, [chatId, projectId]);

  useEffect(() => {
    refreshRef.current();
  }, [revision]);

  return { detail, artifacts, error, loading, reconnecting, refresh: () => refreshRef.current() };
}
