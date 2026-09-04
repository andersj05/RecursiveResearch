import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  isActiveRun,
  defaultAdaptiveOptions,
  type Chat,
  type HarnessConfig,
  type Project,
  type RunMode,
} from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';
import { useCodexModels } from '../hooks/useCodexModels';
import { useConversation } from '../hooks/useConversation';
import { ConversationMessages, formatTime } from './ConversationMessages';
import { Icon } from './Icon';
import { ModelControls } from './ModelControls';
import { AdaptiveDashboard } from './AdaptiveDashboard';

type WorkspaceTab = 'conversation' | 'orchestration' | 'activity' | 'files';
const tabs = [
  { id: 'conversation', label: 'Conversation', icon: 'chat' },
  { id: 'orchestration', label: 'Orchestration', icon: 'activity' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'files', label: 'Files', icon: 'file' },
] as const;

function formatSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResearchWorkspace({
  project,
  chat,
  revision,
  settings,
  onChatCreated,
  onSaved,
  onConfigure,
}: {
  project: Project;
  chat: Chat | null;
  revision: number;
  settings: HarnessConfig;
  onChatCreated: (chat: Chat) => void;
  onSaved: () => void;
  onConfigure: () => void;
}) {
  const [selectedTab, setTab] = useState<WorkspaceTab | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<RunMode>('chat');
  const [model, setModel] = useState(settings.model);
  const [reasoningEffort, setReasoningEffort] = useState(settings.reasoningEffort);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const {
    detail,
    artifacts,
    error: loadError,
    loading,
    reconnecting,
    refresh,
  } = useConversation(project.id, chat?.id, revision);
  const provider = useCodexModels();
  const activeRun = detail?.runs.find(isActiveRun);
  const tab =
    selectedTab ??
    (activeRun?.harness?.version === 2 && activeRun.status !== 'waiting'
      ? 'orchestration'
      : 'conversation');
  const researchRun = detail?.runs.filter((run) => run.harness?.version === 2).at(-1);
  const selectedMode = activeRun?.mode ?? mode;
  const latestProgress = activeRun
    ? [...(detail?.events ?? [])].reverse().find((event) => event.runId === activeRun.id)?.summary
    : null;
  const messageEnd = useRef<HTMLDivElement>(null);
  const createdChat = useRef<Chat | null>(chat);
  const stickToBottom = useRef(true);
  const connected = provider.status?.state === 'connected';
  const chosenModel =
    provider.models.find((item) => item.model === model) ??
    (model === null
      ? (provider.models.find((item) => item.isDefault) ?? provider.models[0])
      : undefined);
  const modelUnavailable = model !== null && provider.models.length > 0 && !chosenModel;

  useEffect(() => {
    const update = () => {
      stickToBottom.current =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 180;
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (stickToBottom.current) messageEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [detail?.messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (
      !draft.trim() ||
      busy ||
      !connected ||
      !project.available ||
      modelUnavailable ||
      activeRun?.status === 'queued'
    )
      return;
    setBusy(true);
    setError(null);
    try {
      if (activeRun) {
        if (activeRun.status === 'waiting') await api.answerRun(activeRun.id, draft.trim());
        else await api.steerRun(activeRun.id, draft.trim());
      } else {
        const target =
          createdChat.current ??
          (await api.createChat(project.id, draft.trim().replace(/\s+/g, ' ').slice(0, 80)));
        createdChat.current = target;
        const supportedEffort =
          reasoningEffort &&
          chosenModel?.supportedReasoningEfforts.some(
            (item) => item.reasoningEffort === reasoningEffort,
          )
            ? reasoningEffort
            : null;
        await api.startRun(target.id, {
          content: draft.trim(),
          mode,
          model,
          reasoningEffort: supportedEffort,
          ...(mode === 'research' ? { harness: defaultAdaptiveOptions } : {}),
        });
        if (mode === 'research') setTab('orchestration');
        onChatCreated(target);
      }
      setDraft('');
      stickToBottom.current = true;
      refresh();
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!activeRun || stopping) return;
    setStopping(true);
    setError(null);
    try {
      await api.stopRun(activeRun.id);
      refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="research-page">
      <div className="research-heading">
        <div>
          <h1>{detail?.chat.title ?? chat?.title ?? 'New chat'}</h1>
          <p className="folder-location" title={project.folderPath}>
            <Icon name="folder" size={13} />
            {project.folderPath}
          </p>
        </div>
      </div>
      {!project.available && (
        <div className="inline-error" role="alert">
          Project folder unavailable. Reconnect its drive or restore the folder to continue.
        </div>
      )}
      <div className="workspace-tabs" role="tablist" aria-label="Research views">
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            type="button"
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const target = tabs[next];
              if (target) {
                setTab(target.id);
                document.getElementById(`tab-${target.id}`)?.focus();
              }
            }}
          >
            <Icon name={item.icon} size={14} />
            {item.label}
            {item.id === 'files' && artifacts.length > 0 && (
              <span className="tab-count">{artifacts.length}</span>
            )}
          </button>
        ))}
      </div>
      {(error || loadError) && (
        <p className="inline-error research-error" role="alert">
          {error ?? loadError}
        </p>
      )}
      {reconnecting && (
        <p className="connection-notice" role="status">
          Reconnecting…
        </p>
      )}
      {activeRun && (
        <div className="run-progress">
          <span className="status-dot online" />
          <span role="status">
            {latestProgress ?? (activeRun.status === 'queued' ? 'Starting…' : 'Working…')}
          </span>
          {tab !== 'conversation' && (
            <button className="text-button" type="button" onClick={() => setTab('conversation')}>
              {activeRun.status === 'waiting' ? 'Answer question' : 'Add direction'}
            </button>
          )}
          <button
            className="button small"
            type="button"
            onClick={() => void stop()}
            disabled={stopping}
          >
            <Icon name="stop" size={12} />
            {stopping ? 'Stopping…' : 'Stop'}
          </button>
        </div>
      )}
      <div className="research-layout">
        <section
          className="research-main"
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          {tab === 'conversation' && (
            <>
              <div className="conversation-content">
                {loading && !detail ? (
                  <p className="loading-message" role="status">
                    Loading conversation…
                  </p>
                ) : detail?.messages.length ? (
                  <ConversationMessages detail={detail} />
                ) : (
                  <div className="conversation-empty">
                    <span className="empty-symbol" aria-hidden="true">
                      RR
                    </span>
                  </div>
                )}
                <div ref={messageEnd} />
              </div>
              {!connected && provider.status && (
                <div className="composer-connection">
                  <span>
                    {provider.status.state === 'unavailable'
                      ? 'Codex is unavailable.'
                      : 'Connect Codex to start.'}
                  </span>
                  <button type="button" className="text-button" onClick={onConfigure}>
                    Open configuration
                    <Icon name="arrow" size={13} />
                  </button>
                </div>
              )}
              {provider.error && (
                <p className="inline-error" role="alert">
                  {provider.error}
                </p>
              )}
              {modelUnavailable && (
                <p className="inline-error" role="alert">
                  Choose an available model to continue.
                </p>
              )}
              <form className="composer" onSubmit={(event) => void send(event)}>
                <label htmlFor="chat-message" className="visually-hidden">
                  {activeRun
                    ? 'Steer this run'
                    : mode === 'research'
                      ? 'Research topic'
                      : 'Message'}
                </label>
                <textarea
                  id="chat-message"
                  placeholder={
                    activeRun
                      ? 'Add direction to this run…'
                      : mode === 'research'
                        ? 'What would you like to research?'
                        : 'Message…'
                  }
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={
                    activeRun?.harness?.version === 2 && activeRun.status !== 'waiting'
                      ? 4000
                      : 50000
                  }
                  rows={3}
                  disabled={busy || !project.available}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="composer-options">
                  <div className="mode-selector" role="group" aria-label="Task type">
                    <button
                      type="button"
                      aria-pressed={selectedMode === 'chat'}
                      disabled={Boolean(activeRun) || busy}
                      onClick={() => setMode('chat')}
                    >
                      <Icon name="chat" size={13} />
                      Chat
                    </button>
                    <button
                      type="button"
                      aria-pressed={selectedMode === 'research'}
                      disabled={Boolean(activeRun) || busy}
                      onClick={() => setMode('research')}
                    >
                      <Icon name="search" size={13} />
                      Research job
                    </button>
                  </div>
                  <ModelControls
                    compact
                    models={provider.models}
                    model={activeRun?.model ?? model}
                    reasoningEffort={activeRun?.reasoningEffort ?? reasoningEffort}
                    onModelChange={setModel}
                    onReasoningChange={setReasoningEffort}
                    disabled={Boolean(activeRun) || busy || !connected}
                  />
                  <button
                    type="submit"
                    className="button primary small send-button"
                    disabled={
                      busy ||
                      !draft.trim() ||
                      !project.available ||
                      !connected ||
                      modelUnavailable ||
                      activeRun?.status === 'queued'
                    }
                  >
                    {busy
                      ? 'Sending…'
                      : activeRun
                        ? activeRun.status === 'waiting'
                          ? 'Continue research'
                          : 'Send update'
                        : mode === 'research'
                          ? 'Start research'
                          : 'Send'}
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              </form>
            </>
          )}
          {tab === 'orchestration' &&
            (researchRun?.harness?.version === 2 ? (
              <AdaptiveDashboard key={researchRun.id} state={researchRun.harness} />
            ) : (
              <p className="section-empty">
                Start a research job to see delegated agents and tool calls.
              </p>
            ))}
          {tab === 'activity' && (
            <div className="activity-view">
              {detail?.events.length ? (
                <ol className="activity-list">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{event.summary}</strong>
                      </div>
                      <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="section-empty">No activity yet.</p>
              )}
            </div>
          )}
          {tab === 'files' && (
            <div className="files-view">
              {artifacts.length ? (
                <ul className="file-list">
                  {artifacts.map((artifact) => (
                    <li key={artifact.relativePath}>
                      <Icon name="file" size={19} />
                      <div>
                        <a
                          className="artifact-link"
                          href={`/api/projects/${encodeURIComponent(project.id)}/artifact?path=${encodeURIComponent(artifact.relativePath)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <strong>{artifact.name}</strong>
                          <Icon name="external" size={12} />
                        </a>
                        <span title={artifact.relativePath}>{artifact.relativePath}</span>
                      </div>
                      <span className="file-size">{formatSize(artifact.size)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="section-empty">No files yet.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
