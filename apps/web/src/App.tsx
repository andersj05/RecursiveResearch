import { useCallback, useEffect, useState } from 'react';
import type { Chat, Project, Workspace } from '@recursive-research/contracts';
import { HarnessPage } from './components/HarnessPage';
import { Configuration } from './components/Configuration';
import { Icon } from './components/Icon';
import { ProjectDialog } from './components/ProjectDialog';
import { ResearchWorkspace } from './components/ResearchWorkspace';
import { Welcome } from './components/Welcome';
import { api, describeError } from './lib/api';

export function App() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [view, setView] = useState<'workspace' | 'configuration' | 'harness'>(window.location.hash.startsWith('#harness') ? 'harness' : 'workspace');
  useEffect(() => {
    if (view === 'harness') window.history.replaceState(null, '', '#harness');
    else if (window.location.hash.startsWith('#harness'))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [view]);

  const [projectId, setProjectId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    try {
      setWorkspace(await api.workspace());
      setError(null);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const stream = new EventSource('/api/events');
    stream.onopen = () => {
      void refresh();
      setRevision((current) => current + 1);
    };
    stream.addEventListener('workspace.changed', () => {
      void refresh();
      setRevision((current) => current + 1);
    });
    return () => stream.close();
  }, [refresh]);

  const project = workspace?.projects.find((item) => item.id === projectId) ?? null;
  const chat =
    workspace?.chats.find((item) => item.id === chatId && item.projectId === projectId) ?? null;

  function selectProject(next: Project, nextChat?: Chat) {
    setProjectId(next.id);
    setChatId(
      nextChat?.id ?? workspace?.chats.find((item) => item.projectId === next.id)?.id ?? null,
    );
    setView('workspace');
    setSidebarOpen(false);
    setCollapsed((current) => {
      const updated = new Set(current);
      updated.delete(next.id);
      return updated;
    });
  }

  function configure() {
    setView('configuration');
    setSidebarOpen(false);
  }

  function chatCreated(next: Chat) {
    setChatId(next.id);
    setWorkspace((current) =>
      current
        ? { ...current, chats: [next, ...current.chats.filter((item) => item.id !== next.id)] }
        : current,
    );
  }

  async function newChat(next: Project) {
    setBusy(true);
    try {
      const created = await api.createChat(next.id, 'New chat');
      chatCreated(created);
      selectProject(next, created);
      await refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  function projectCreated(next: Project) {
    setWorkspace((current) =>
      current ? { ...current, projects: [...current.projects, next] } : current,
    );
    setProjectId(next.id);
    setChatId(null);
    setView('workspace');
    setShowProjectDialog(false);
    setSidebarOpen(false);
    void refresh();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}
        aria-label="Project navigation"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && sidebarOpen) {
            setSidebarOpen(false);
            document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
          }
        }}
      >
        <button
          className="brand"
          type="button"
          onClick={() => {
            setView('workspace');
            setProjectId(null);
            setChatId(null);
            setSidebarOpen(false);
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            RR
          </span>
          <span>
            Recursive<span className="brand-second">Research</span>
          </span>
        </button>
        <div className="sidebar-content">
          <button
            type="button"
            className="button new-project-button"
            onClick={() => setShowProjectDialog(true)}
            disabled={!workspace}
          >
            <Icon name="plus" size={15} />
            New project
          </button>
          <div className="sidebar-section-label">
            <span>Projects</span>
          </div>
          <nav className="project-navigation" aria-label="Projects and chats">
            {workspace?.projects.length ? (
              workspace.projects.map((item) => {
                const chats = workspace.chats.filter((thread) => thread.projectId === item.id);
                const isCollapsed = collapsed.has(item.id);
                return (
                  <div className="sidebar-project" key={item.id}>
                    <div
                      className={`project-navigation-row ${projectId === item.id && view === 'workspace' ? 'selected-project' : ''}`}
                    >
                      <button
                        className="icon-button collapse-project"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${item.name}`}
                        aria-expanded={!isCollapsed}
                        type="button"
                        onClick={() =>
                          setCollapsed((current) => {
                            const updated = new Set(current);
                            if (updated.has(item.id)) updated.delete(item.id);
                            else updated.add(item.id);
                            return updated;
                          })
                        }
                      >
                        <Icon name="chevron" size={11} className={isCollapsed ? '' : 'expanded'} />
                      </button>
                      <button
                        type="button"
                        className="project-select"
                        onClick={() => selectProject(item)}
                        title={item.folderPath}
                      >
                        <Icon name="folder" size={15} />
                        <span>{item.name}</span>
                        {!item.available && (
                          <span className="unavailable-dot" title="Folder unavailable">
                            !
                          </span>
                        )}
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`New chat in ${item.name}`}
                        title="New chat"
                        disabled={busy || !item.available}
                        onClick={() => void newChat(item)}
                      >
                        <Icon name="plus" size={13} />
                      </button>
                    </div>
                    {!isCollapsed && (
                      <div className="chat-navigation">
                        {chats.length ? (
                          chats.map((thread) => (
                            <button
                              key={thread.id}
                              type="button"
                              className={`chat-select ${chatId === thread.id && view === 'workspace' ? 'active' : ''}`}
                              aria-current={
                                chatId === thread.id && view === 'workspace' ? 'page' : undefined
                              }
                              onClick={() => selectProject(item, thread)}
                            >
                              <Icon name="chat" size={13} />
                              <span>{thread.title}</span>
                            </button>
                          ))
                        ) : (
                          <button
                            type="button"
                            className="empty-chat-link"
                            disabled={busy || !item.available}
                            onClick={() => void newChat(item)}
                          >
                            + New chat
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="empty-projects">
                <span>No projects yet</span>
              </div>
            )}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <button
            type="button"
            className={`configuration-link ${view === 'harness' ? 'active' : ''}`}
            aria-current={view === 'harness' ? 'page' : undefined}
            onClick={() => {
              setView('harness');
              setSidebarOpen(false);
            }}
          >
            <Icon name="activity" size={16} />
            Research harness
            <Icon name="chevron" size={12} />
          </button>
          <button
            type="button"
            className={`configuration-link ${view === 'configuration' ? 'active' : ''}`}
            aria-current={view === 'configuration' ? 'page' : undefined}
            onClick={configure}
          >
            <Icon name="settings" size={16} />
            Configuration
            <Icon name="chevron" size={12} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="app-header">
          <div className="header-path">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <button
              type="button"
              onClick={() => {
                setView('workspace');
                setProjectId(null);
                setChatId(null);
              }}
            >
              Home
            </button>
            {(view !== 'workspace' || project) && <span className="path-divider">/</span>}
            {(view !== 'workspace' || project) && (
              <span>
                {view === 'configuration'
                  ? 'Configuration'
                  : view === 'harness'
                    ? 'Research harness'
                    : project?.name}
              </span>
            )}
          </div>
          {project && view === 'workspace' ? (
            <button
              type="button"
              className="button small"
              disabled={busy || !project.available}
              onClick={() => void newChat(project)}
            >
              <Icon name="plus" size={13} />
              New chat
            </button>
          ) : null}
        </header>
        <main id="main-content" tabIndex={-1}>
          {error && (
            <div className="app-error" role="alert">
              <span>{workspace ? error : `Could not reach the local workspace. ${error}`}</span>
              <button type="button" className="text-button" onClick={() => void refresh()}>
                Retry
                <Icon name="refresh" size={13} />
              </button>
            </div>
          )}
          {!workspace ? (
            <div className="startup-state">
              <span className="brand-mark" aria-hidden="true">
                RR
              </span>
              <h1>Opening workspace…</h1>
              <p>
                {error
                  ? 'Start the local server, then retry the connection.'
                  : 'Loading projects and preferences…'}
              </p>
            </div>
          ) : view === 'configuration' ? (
            <Configuration settings={workspace.settings} onSaved={() => void refresh()} />
          ) : view === 'harness' ? (
            <HarnessPage
              workspace={workspace}
              revision={revision}
              initialProjectId={projectId}
              onSaved={() => {
                void refresh();
                setRevision((current) => current + 1);
              }}
              onConfigure={configure}
              onCreateProject={() => setShowProjectDialog(true)}
            />
          ) : project ? (
            <ResearchWorkspace
              key={`${project.id}:${chat?.id ?? 'new'}`}
              project={project}
              chat={chat}
              revision={revision}
              settings={workspace.settings}
              onChatCreated={chatCreated}
              onSaved={() => {
                void refresh();
                setRevision((current) => current + 1);
              }}
              onConfigure={configure}
            />
          ) : (
            <Welcome
              projects={workspace.projects}
              onSelect={selectProject}
              onCreate={() => setShowProjectDialog(true)}
            />
          )}
        </main>
      </div>
      {showProjectDialog && (
        <ProjectDialog onClose={() => setShowProjectDialog(false)} onCreated={projectCreated} />
      )}
    </div>
  );
}
