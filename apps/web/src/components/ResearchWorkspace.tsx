import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Artifact, Chat, ChatDetail, Project } from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';
import { Icon } from './Icon';

type WorkspaceTab = 'brief' | 'activity' | 'files';

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

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
  onChatCreated,
  onSaved,
  onConfigure,
}: {
  project: Project;
  chat: Chat | null;
  revision: number;
  onChatCreated: (chat: Chat) => void;
  onSaved: () => void;
  onConfigure: () => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>('brief');
  const [detail, setDetail] = useState<ChatDetail | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const messageEnd = useRef<HTMLDivElement>(null);
  const chatId = chat?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = async () => {
      const results = await Promise.allSettled([
        chatId ? api.chat(chatId) : Promise.resolve(null),
        api.artifacts(project.id),
      ]);
      if (cancelled) return;
      if (results[0].status === 'fulfilled') setDetail(results[0].value);
      if (results[1].status === 'fulfilled') setArtifacts(results[1].value);
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => describeError(result.reason));
      if (failures.length) setError(failures.join(' '));
      setLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [chatId, project.id, revision]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [detail?.messages.length]);

  async function saveBrief(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      let activeChat = chat;
      if (!activeChat)
        activeChat = await api.createChat(
          project.id,
          draft.trim().replace(/\s+/g, ' ').slice(0, 80),
        );
      const message = await api.saveMessage(activeChat.id, draft.trim());
      setDetail((current) => ({
        chat: activeChat,
        messages: [...(current?.messages ?? []), message],
        events: current?.events ?? [],
      }));
      setDraft('');
      setNotice('Research brief saved to your project folder.');
      onChatCreated(activeChat);
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="research-page">
      <div className="research-heading">
        <div>
          <p className="eyebrow">
            +-- projects / {project.name.toLowerCase().replace(/\s+/g, '-')}
          </p>
          <h1>{chat?.title ?? 'A new line of inquiry.'}</h1>
          <p className="folder-location" title={project.folderPath}>
            <Icon name="folder" size={14} />
            {project.folderPath}
          </p>
        </div>
        <span className="tag">{project.available ? 'Local project' : 'Folder unavailable'}</span>
      </div>
      {!project.available && (
        <div className="inline-error" role="alert">
          This project folder is unavailable. Reconnect its drive or restore the folder to continue
          saving.
        </div>
      )}
      <div className="workspace-tabs" role="tablist" aria-label="Research views">
        {(
          [
            { id: 'brief', label: 'Conversation', icon: 'chat' },
            { id: 'activity', label: 'Activity', icon: 'activity' },
            { id: 'files', label: 'Files', icon: 'file' },
          ] as const
        ).map((item) => (
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
              const tabs: WorkspaceTab[] = ['brief', 'activity', 'files'];
              const current = tabs.indexOf(tab);
              const next =
                event.key === 'ArrowRight'
                  ? (current + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (current + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const target = tabs[next];
              if (target) {
                setTab(target);
                document.getElementById(`tab-${target}`)?.focus();
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
        <span className="tabs-status">
          <span className="status-dot" />
          No agents running
        </span>
      </div>
      {error && (
        <p className="inline-error research-error" role="alert">
          {error}
        </p>
      )}
      <div className="research-layout">
        <section
          className="research-main"
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
        >
          {tab === 'brief' && (
            <>
              <div className="conversation-content">
                {loading && !detail ? (
                  <p className="loading-message" role="status">
                    Loading conversation…
                  </p>
                ) : detail?.messages.length ? (
                  <div className="message-list">
                    {detail.messages.map((message) => (
                      <article key={message.id} className="message">
                        <div className="message-meta">
                          <span className="message-avatar">
                            {message.role === 'user' ? '>_' : 'rr'}
                          </span>
                          <strong>
                            {message.role === 'user'
                              ? 'You'
                              : message.role === 'system'
                                ? 'Workspace'
                                : 'Research agent'}
                          </strong>
                          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                        </div>
                        <p>{message.content}</p>
                        <span className="message-state">
                          <Icon name="check" size={12} />
                          Saved locally
                        </span>
                      </article>
                    ))}
                    <div ref={messageEnd} />
                  </div>
                ) : (
                  <div className="conversation-empty">
                    <span className="empty-symbol" aria-hidden="true">
                      {'>'}_
                    </span>
                    <p className="eyebrow">A QUESTION IS A STARTING POINT</p>
                    <h2>
                      What would you like
                      <br />
                      to understand?
                    </h2>
                    <p>
                      Describe the topic, add context, and define what a useful answer would look
                      like. Your brief will be saved here.
                    </p>
                  </div>
                )}
              </div>
              <form className="composer" onSubmit={(event) => void saveBrief(event)}>
                <label htmlFor="research-brief" className="visually-hidden">
                  Research brief
                </label>
                <textarea
                  id="research-brief"
                  placeholder="Ask a question. Follow an idea. Outline your research…"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setNotice('');
                  }}
                  maxLength={50000}
                  rows={4}
                  disabled={busy || !project.available}
                />
                <div className="composer-toolbar">
                  <span>
                    <Icon name="file" size={13} />
                    Research brief
                  </span>
                  <button
                    type="submit"
                    className="button primary small"
                    disabled={busy || !draft.trim() || !project.available}
                  >
                    {busy ? 'Saving…' : 'Save brief'}
                    <Icon name="arrow" size={14} />
                  </button>
                </div>
              </form>
              <p className="composer-caption" role="status">
                {notice || 'Briefs are saved locally. Agent execution is not connected yet.'}
              </p>
            </>
          )}
          {tab === 'activity' && (
            <div className="activity-view">
              <div className="section-title-row">
                <h2>Research activity</h2>
                <span>Live workspace events</span>
              </div>
              {detail?.events.length ? (
                <ol className="activity-list">
                  {detail.events.map((event) => (
                    <li key={event.id}>
                      <span className="activity-dot" />
                      <div>
                        <strong>{event.summary}</strong>
                        <span>{event.type}</span>
                      </div>
                      <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="section-empty">
                  <Icon name="activity" size={25} />
                  <h3>Room for the process.</h3>
                  <p>
                    Save a brief to begin the activity log. Future research runs will add agent
                    progress, sources, and steering events here.
                  </p>
                </div>
              )}
            </div>
          )}
          {tab === 'files' && (
            <div className="files-view">
              <div className="section-title-row">
                <h2>Project files</h2>
                <span>
                  {artifacts.length} {artifacts.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <p className="muted-copy">
                Files managed by RecursiveResearch in your connected folder.
              </p>
              {artifacts.length ? (
                <ul className="file-list">
                  {artifacts.map((artifact) => (
                    <li key={artifact.relativePath}>
                      <Icon name="file" size={19} />
                      <div>
                        <strong>{artifact.name}</strong>
                        <span title={artifact.relativePath}>{artifact.relativePath}</span>
                      </div>
                      <span className="file-size">{formatSize(artifact.size)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="section-empty">
                  <Icon name="folder" size={25} />
                  <h3>Everything has a place.</h3>
                  <p>
                    Your saved briefs and future research artifacts will live in this project
                    folder. No research artifacts have been generated yet.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
        <aside className="research-context" aria-label="Research context">
          <div className="context-section">
            <p className="eyebrow">+-- research status</p>
            <h2>{detail?.messages.length ? 'A question to build on.' : 'Ready for your brief.'}</h2>
            <p>
              Capture the question now.
              <br />
              Build the research process next.
            </p>
            <div className="context-state">
              <span className="status-dot" />
              Harness not connected
            </div>
          </div>
          <div className="context-section">
            <p className="eyebrow">+-- working directory</p>
            <Icon name="folder" size={20} />
            <strong className="context-project-name">{project.name}</strong>
            <p className="context-path">{project.folderPath}</p>
            <span className="context-small">Saved on your computer</span>
          </div>
          <div className="context-section">
            <p className="eyebrow">+-- agent defaults</p>
            <p>Set your Codex connection and preferences before building the harness.</p>
            <button type="button" className="text-button" onClick={onConfigure}>
              Configuration
              <Icon name="arrow" size={13} />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
