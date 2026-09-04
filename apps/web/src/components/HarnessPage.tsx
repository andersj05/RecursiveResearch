import { useEffect, useState, type FormEvent } from 'react';
import {
  defaultAdaptiveOptions,
  isActiveRun,
  type Project,
  type Workspace,
} from '@recursive-research/contracts';
import { useCodexModels } from '../hooks/useCodexModels';
import { useConversation } from '../hooks/useConversation';
import { api, describeError } from '../lib/api';
import { HarnessGraph } from './HarnessGraph';
import { HarnessTechnical } from './HarnessTechnical';
import { AdaptiveDashboard } from './AdaptiveDashboard';
import { ModelControls } from './ModelControls';
import { ConversationMessages, formatTime } from './ConversationMessages';
import { Icon } from './Icon';

type Props = {
  workspace: Workspace;
  revision: number;
  initialProjectId: string | null;
  onSaved: () => void;
  onConfigure: () => void;
  onCreateProject: () => void;
};

export function HarnessPage(props: Props) {
  const [projectId, setProjectId] = useState(
    props.initialProjectId ??
      sessionStorage.getItem('harness.project') ??
      props.workspace.projects[0]?.id ??
      '',
  );
  useEffect(() => {
    sessionStorage.setItem('harness.project', projectId);
  }, [projectId]);
  const project = props.workspace.projects.find((item) => item.id === projectId);
  return (
    <div className="harness-page">
      <div className="harness-page-heading">
        <div>
          <h1>Research harness</h1>
          <p>Delegate, investigate, and follow the evidence.</p>
        </div>
        <label className="harness-project-select">
          Project
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="" disabled>
              Select a project
            </option>
            {props.workspace.projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {!item.available ? ' · unavailable' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>
      {project ? (
        <HarnessSession key={project.id} {...props} project={project} />
      ) : (
        <>
          <HarnessTechnical />
          <div className="harness-empty">
            <p>Choose a project folder to keep your research and reports together.</p>
            <button className="button primary" type="button" onClick={props.onCreateProject}>
              New project
              <Icon name="plus" size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function HarnessSession({
  project,
  workspace,
  revision,
  onSaved,
  onConfigure,
}: Props & { project: Project }) {
  const chats = workspace.chats.filter((chat) => chat.projectId === project.id);
  const [chatId, setChatId] = useState(() => {
    const saved = sessionStorage.getItem(`harness.chat.${project.id}`);
    return chats.some((chat) => chat.id === saved) ? saved! : '';
  });
  useEffect(() => {
    sessionStorage.setItem(`harness.chat.${project.id}`, chatId);
  }, [project.id, chatId]);
  const [createdChatId, setCreatedChatId] = useState('');
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState('');
  const [model, setModel] = useState(workspace.settings.model);
  const [effort, setEffort] = useState(workspace.settings.reasoningEffort);
  const [maxRounds, setMaxRounds] = useState(defaultAdaptiveOptions.maxRounds);
  const [maxSources, setMaxSources] = useState(defaultAdaptiveOptions.maxSources);
  const [limits, setLimits] = useState(defaultAdaptiveOptions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'evidence' | 'steps' | 'report'>('steps');
  const provider = useCodexModels();
  const conversation = useConversation(project.id, chatId || undefined, revision);
  const run = conversation.detail?.runs.filter((item) => item.harness).at(-1);
  const state = run?.harness;
  const active = run && isActiveRun(run);
  const connected = provider.status?.state === 'connected';
  const chosenModel =
    provider.models.find((item) => item.model === model) ??
    (model === null
      ? (provider.models.find((item) => item.isDefault) ?? provider.models[0])
      : undefined);
  const progress = conversation.detail?.events
    .filter((event) => event.runId === run?.id)
    .at(-1)?.summary;

  async function start(event: FormEvent) {
    event.preventDefault();
    if (busy || !draft.trim() || !chosenModel || !connected || !project.available) return;
    setBusy(true);
    setError(null);
    try {
      const id =
        createdChatId ||
        (await api.createChat(project.id, draft.trim().replace(/\s+/g, ' ').slice(0, 80))).id;
      setCreatedChatId(id);
      await api.startRun(id, {
        content: draft.trim(),
        mode: 'research',
        model: chosenModel.model,
        reasoningEffort: chosenModel.supportedReasoningEfforts.some(
          (item) => item.reasoningEffort === effort,
        )
          ? effort
          : null,
        harness: { ...limits, maxRounds, maxSources },
      });
      setChatId(id);
      setDraft('');
      setCreatedChatId('');
      setDetailTab('steps');
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }
  async function act(kind: 'stop' | 'answer' | 'steer') {
    if (!run || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === 'stop') await api.stopRun(run.id);
      else if (kind === 'answer') await api.answerRun(run.id, answer.trim());
      else await api.steerRun(run.id, answer.trim());
      setAnswer('');
      conversation.refresh();
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <details className="architecture-disclosure">
        <summary>Architecture & runtime</summary>
        {state?.version === 1 ? <HarnessGraph run={run} /> : <HarnessTechnical />}
      </details>
      <div className="harness-session-heading">
        <h2>{chatId ? 'Research run' : 'New research'}</h2>
        <label>
          History
          <select
            aria-label="Research history"
            value={chatId}
            disabled={busy}
            onChange={(event) => {
              setChatId(event.target.value);
              setAnswer('');
              setError(null);
            }}
          >
            <option value="">New research</option>
            {chats.map((chat) => (
              <option key={chat.id} value={chat.id}>
                {chat.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(error || conversation.error || provider.error) && (
        <p className="inline-error" role="alert">
          {error ?? conversation.error ?? provider.error}
        </p>
      )}
      {!project.available && (
        <p className="inline-error" role="alert">
          Reconnect the project folder to run or continue research.
        </p>
      )}
      {conversation.reconnecting && (
        <p role="status" className="connection-notice">
          Reconnecting to research updates…
        </p>
      )}
      {!connected && (
        <div className="composer-connection">
          <span>{!provider.status ? 'Checking Codex…' : 'Connect Codex to run research.'}</span>
          <button className="text-button" type="button" onClick={onConfigure}>
            Open configuration
            <Icon name="arrow" size={14} />
          </button>
        </div>
      )}
      {!chatId ? (
        <form className="harness-launch" onSubmit={(event) => void start(event)}>
          <label htmlFor="research-brief">What would you like to understand?</label>
          <textarea
            id="research-brief"
            placeholder="A topic, a decision, or a question. Include any constraints that matter."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={50000}
            rows={4}
            required
          />
          <div className="harness-launch-controls">
            <ModelControls
              models={provider.models}
              model={model}
              reasoningEffort={effort}
              onModelChange={setModel}
              onReasoningChange={setEffort}
              disabled={busy || !connected}
              compact
            />
            <label>
              Research cycles
              <select
                value={maxRounds}
                onChange={(event) => setMaxRounds(Number(event.target.value))}
                disabled={busy}
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Retained sources
              <input
                type="number"
                min={2}
                max={500}
                value={maxSources}
                onChange={(event) => setMaxSources(Number(event.target.value))}
                required
                disabled={busy}
              />
            </label>
            <button
              className="button primary"
              type="submit"
              disabled={busy || !draft.trim() || !connected || !chosenModel || !project.available}
            >
              {busy ? 'Starting…' : 'Start research'}
              <Icon name="arrow" size={14} />
            </button>
          </div>
          <details className="expert-details">
            <summary>Delegation & time limits</summary>
            <div className="adaptive-budget-controls">
              {(
                [
                  ['maxAgents', 'Parallel agents', 1, 6],
                  ['maxTasks', 'Research assignments', 2, 48],
                  ['maxDepth', 'Branch depth', 1, 8],
                  ['maxMinutes', 'Time limit (minutes)', 1, 120],
                ] as const
              ).map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={limits[key]}
                    required
                    disabled={busy}
                    onChange={(event) =>
                      setLimits({ ...limits, [key]: Number(event.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <p className="harness-budget-note">
            Up to {limits.maxTasks + 2 + maxRounds} model turns · {limits.maxAgents} parallel agents
            · {limits.maxMinutes} minutes.{' '}
            {workspace.settings.requirePrimarySources
              ? 'Primary sources preferred.'
              : 'Primary and secondary sources.'}
          </p>
        </form>
      ) : conversation.loading ? (
        <p role="status">Loading research…</p>
      ) : !run ? (
        <div className="harness-empty">
          <p>This conversation has no harness runs.</p>
          <button className="button" type="button" onClick={() => setChatId('')}>
            New research
          </button>
        </div>
      ) : (
        <>
          <section className="harness-run-status" aria-label="Run status">
            <div>
              <strong>{conversation.detail?.chat.title}</strong>
              <span role="status">
                {run.status === 'waiting'
                  ? 'Waiting for your answer'
                  : run.status === 'running' || run.status === 'queued'
                    ? (progress ?? 'Starting…')
                    : run.status.charAt(0).toUpperCase() + run.status.slice(1)}
              </span>
            </div>
            <span>
              {state?.sources.length} / {state?.maxSources} sources
            </span>
            {active && (
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={() => void act('stop')}
              >
                <Icon name="stop" size={12} />
                {busy ? 'Working…' : 'Stop'}
              </button>
            )}
          </section>
          {run.error && (
            <p className="inline-error" role="alert">
              {run.error}
            </p>
          )}
          {run.status === 'waiting' && (
            <form
              className="harness-clarification"
              onSubmit={(event) => {
                event.preventDefault();
                void act('answer');
              }}
            >
              <div className="harness-clarification-mark">?</div>
              <div>
                <h3>A question before we continue</h3>
                <label htmlFor="harness-answer">{state?.question}</label>
                <textarea
                  id="harness-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  maxLength={50000}
                  rows={2}
                  required
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy || !answer.trim() || !connected || !project.available}
                >
                  {busy ? 'Continuing…' : 'Continue research'}
                  <Icon name="arrow" size={14} />
                </button>
              </div>
            </form>
          )}
          {active && run.status !== 'waiting' && (
            <details className="harness-steering">
              <summary>Add direction</summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void act('steer');
                }}
              >
                <label htmlFor="harness-steer">
                  Guidance for active agents and subsequent assignments
                </label>
                <textarea
                  id="harness-steer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={2}
                  maxLength={state?.version === 2 ? 4000 : 50000}
                  required
                />
                <button
                  className="button small"
                  disabled={
                    busy ||
                    !answer.trim() ||
                    (state?.version !== 2 && !run.turnId) ||
                    !connected ||
                    !project.available
                  }
                >
                  Send update
                </button>
              </form>
            </details>
          )}
          {state?.stopReason && <p className="harness-stop-reason">{state.stopReason}</p>}
          <div className="harness-detail-tabs" role="group" aria-label="Run details">
            {(['steps', 'evidence', 'report'] as const).map((tab) => (
              <button
                type="button"
                aria-pressed={detailTab === tab}
                key={tab}
                onClick={() => setDetailTab(tab)}
              >
                {tab === 'steps'
                  ? state?.version === 2
                    ? 'Orchestration'
                    : 'Execution log'
                  : tab === 'evidence'
                    ? `Evidence (${state?.sources.length ?? 0})`
                    : 'Report'}
              </button>
            ))}
          </div>
          {detailTab === 'steps' && state?.version === 2 && (
            <AdaptiveDashboard key={run.id} state={state} />
          )}
          {detailTab === 'steps' && state?.version !== 2 && (
            <div className="harness-log">
              {state?.steps.length ? (
                <ol>
                  {state.steps.map((step, index) => (
                    <li key={index}>
                      <span className="harness-log-number">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <h3>
                          {step.stage}
                          {step.round > 0 && <span>Round {step.round}</span>}
                        </h3>
                        <p>{step.summary}</p>
                      </div>
                      <time dateTime={step.completedAt}>{formatTime(step.completedAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="section-empty">Completed stages will appear here.</p>
              )}
              {state?.answer && (
                <p className="harness-saved-answer">
                  <strong>Your clarification:</strong> {state.answer}
                </p>
              )}
            </div>
          )}
          {detailTab === 'evidence' && (
            <div className="harness-evidence">
              <p className="harness-evidence-note">
                Source findings are recorded by the agent and have not been independently verified.
              </p>
              {state?.sources.length ? (
                <ol>
                  {state.sources.map((source, index) => (
                    <li key={source.url}>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <a href={source.url} target="_blank" rel="noopener noreferrer">
                          {source.title}
                          <Icon name="external" size={12} />
                        </a>
                        <p>{source.finding}</p>
                        <small>
                          {new URL(source.url).hostname} ·{' '}
                          {source.primary ? 'Primary' : 'Secondary'} · Round {source.round}
                        </small>
                        {'observations' in source && Array.isArray(source.observations) && (
                          <details className="source-observations">
                            <summary>{source.observations.length} agent observations</summary>
                            {source.observations.map((observation) => (
                              <p key={observation.taskId}>
                                <strong>{observation.taskId}</strong> · {observation.finding}
                              </p>
                            ))}
                          </details>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="section-empty">No sources retained yet.</p>
              )}
            </div>
          )}
          {detailTab === 'report' &&
            (state?.stage === 'report' && conversation.detail ? (
              <ConversationMessages
                detail={{
                  ...conversation.detail,
                  messages: conversation.detail.messages.filter(
                    (message) => message.id === run.assistantMessageId,
                  ),
                }}
              />
            ) : (
              <p className="section-empty">The report will appear after evidence review.</p>
            ))}
        </>
      )}
    </>
  );
}
