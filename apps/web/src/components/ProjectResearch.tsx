import { useState } from 'react';
import type { ChatDetail } from '@recursive-research/contracts';
import { AdaptiveDashboard } from './AdaptiveDashboard';
import { HarnessGraph } from './HarnessGraph';
import { ConversationMessages, formatTime } from './ConversationMessages';
import { Icon } from './Icon';

export function ProjectResearch({ detail }: { detail: ChatDetail }) {
  const runs = detail.runs.filter((run) => run.mode === 'research');
  const [selectedId, setSelectedId] = useState('');
  const [view, setView] = useState<'run' | 'sources' | 'report'>('run');
  const run = runs.find((item) => item.id === selectedId) ?? runs.at(-1);
  if (!run)
    return <p className="section-empty">Choose Research in the conversation to start a run.</p>;
  const state = run.harness;
  return (
    <div className="project-research">
      <div className="project-research-heading">
        <div>
          <h2>Research run</h2>
          <span className="research-run-meta">
            {run.status} · {run.model} · {formatTime(run.createdAt)}
          </span>
        </div>
        <label>
          Run history
          <select
            aria-label="Research run history"
            value={run.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {[...runs].reverse().map((item) => (
              <option key={item.id} value={item.id}>
                {formatTime(item.createdAt)} · {item.status} ·{' '}
                {(
                  item.harness?.brief ??
                  detail.messages.find((message) => message.id === item.userMessageId)?.content ??
                  'Research'
                ).slice(0, 60)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <details className="research-brief-details">
        <summary>Research brief & settings</summary>
        <p>
          {state?.brief ??
            detail.messages.find((message) => message.id === run.userMessageId)?.content}
        </p>
        {state && (
          <p>
            {state.maxRounds} cycles · {state.maxSources} sources
            {state.version === 2
              ? ` · ${state.orchestration.maxAgents} parallel agents · ${state.orchestration.maxTasks} assignments · depth ${state.orchestration.maxDepth} · ${state.orchestration.maxMinutes} minutes`
              : ''}
          </p>
        )}
        {state?.answer && (
          <p>
            <strong>Your clarification:</strong> {state.answer}
          </p>
        )}
      </details>
      {run.error && (
        <p className="inline-error" role="alert">
          {run.error}
        </p>
      )}
      {state?.stopReason && <p className="harness-stop-reason">{state.stopReason}</p>}
      <div className="harness-detail-tabs" role="group" aria-label="Research details">
        {(['run', 'sources', 'report'] as const).map((id) => (
          <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>
            {id === 'run'
              ? 'Live run'
              : id === 'sources'
                ? `Sources (${state?.sources.length ?? 0})`
                : 'Report'}
          </button>
        ))}
      </div>
      {view === 'run' &&
        (state?.version === 2 ? (
          <AdaptiveDashboard key={run.id} state={state} />
        ) : state ? (
          <HarnessGraph run={run} />
        ) : (
          <p className="section-empty">
            This run used a single research turn. Its answer is in Report.
          </p>
        ))}
      {view === 'sources' && (
        <div className="harness-evidence">
          <p className="harness-evidence-note">
            Agent-recorded findings; citations have not been independently verified.
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
                      {new URL(source.url).hostname} · {source.primary ? 'Primary' : 'Secondary'} ·
                      Cycle {source.round}
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
            <p className="section-empty">No sources retained for this run.</p>
          )}
        </div>
      )}
      {view === 'report' &&
        (state && state.stage !== 'report' ? (
          <p className="section-empty">The report appears after research and synthesis.</p>
        ) : (
          <ConversationMessages
            detail={{
              ...detail,
              messages: detail.messages.filter((message) => message.id === run.assistantMessageId),
            }}
          />
        ))}
    </div>
  );
}
