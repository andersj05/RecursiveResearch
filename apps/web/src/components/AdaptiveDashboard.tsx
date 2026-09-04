import { useState } from 'react';
import type { AdaptiveHarnessState, AgentTask } from '@recursive-research/contracts';

const roleNames: Record<AgentTask['role'], string> = {
  planner: 'Planner',
  researcher: 'Researcher',
  skeptic: 'Skeptic',
  synthesizer: 'Synthesis',
  reporter: 'Report',
};
export function AdaptiveDashboard({ state }: { state: AdaptiveHarnessState }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'agents' | 'tools' | 'decisions'>('agents');
  const [filter, setFilter] = useState('all');
  const o = state.orchestration;
  const selected =
    o.tasks.find((task) => task.id === selectedId) ??
    o.tasks.find((task) => task.status === 'running') ??
    o.tasks.at(-1);
  const calls = o.toolCalls.filter((call) => filter === 'all' || call.taskId === filter);
  const children = (parentId: string | null): AgentTask[] =>
    o.tasks
      .filter((task) => task.parentId === parentId)
      .flatMap((task) => [task, ...children(task.id)]);
  const tree = children(null);
  const active = o.tasks.filter((t) => t.status === 'running').length;
  const pending = o.tasks.filter((t) => ['queued', 'pending'].includes(t.status)).length;
  return (
    <section className="adaptive-dashboard" aria-label="Research orchestration">
      <div className="orchestration-metrics">
        {[
          [String(active), 'active agents'],
          [String(pending), 'in frontier'],
          [`${state.round} / ${state.maxRounds}`, 'cycles'],
          [`${state.sources.length} / ${state.maxSources}`, 'sources'],
          [String(o.toolCalls.length + o.droppedToolCalls), 'web actions'],
          [`${Math.floor(o.elapsedMs / 60000)} / ${o.maxMinutes}m`, 'time budget'],
        ].map(([value, label]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="orchestration-toolbar">
        <div className="harness-detail-tabs" role="group" aria-label="Orchestration views">
          {(['agents', 'tools', 'decisions'] as const).map((id) => (
            <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
              {id === 'agents' ? 'Agent tree' : id === 'tools' ? 'Tool trace' : 'Loop decisions'}
            </button>
          ))}
        </div>
        <span>
          {o.turnsStarted} turns · {o.maxAgents} parallel · depth ≤ {o.maxDepth}
        </span>
      </div>
      {view === 'agents' && (
        <div className="agent-workbench">
          <div className="agent-tree" aria-label="Delegated assignments">
            {o.tasks.length ? (
              tree.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className={`agent-row status-${task.status}`}
                  aria-pressed={selected?.id === task.id}
                  onClick={() => setSelectedId(task.id)}
                  style={{ paddingLeft: `${14 + Math.min(task.depth, 4) * 14}px` }}
                >
                  <span className="agent-row-meta">
                    <span>
                      {task.id} · {roleNames[task.role]}
                    </span>
                    <span>{task.status}</span>
                  </span>
                  <strong>{task.question}</strong>
                  <small>
                    {task.parentId ? `↳ ${task.parentId}` : 'orchestrator'} ·{' '}
                    {task.round ? `cycle ${task.round}` : 'planning'} · priority {task.priority}
                  </small>
                </button>
              ))
            ) : (
              <p className="section-empty">The planner will create the first research branches.</p>
            )}
          </div>
          <aside className="agent-inspector" aria-label="Selected assignment">
            {selected && (
              <>
                <div className="harness-section-heading">
                  <h3>{roleNames[selected.role]}</h3>
                  <span>{selected.status}</span>
                </div>
                <h3>{selected.question}</h3>
                {selected.reason && <p>{selected.reason}</p>}
                {selected.summary && <p className="agent-summary">{selected.summary}</p>}
                {selected.error && <p className="inline-error">{selected.error}</p>}
                <dl className="agent-facts">
                  <div>
                    <dt>Parent</dt>
                    <dd>{selected.parentId ?? 'Orchestrator'}</dd>
                  </div>
                  <div>
                    <dt>Depth / cycle</dt>
                    <dd>
                      {selected.depth} / {selected.round}
                    </dd>
                  </div>
                  <div>
                    <dt>Sources</dt>
                    <dd>{selected.sourceUrls.length}</dd>
                  </div>
                  <div>
                    <dt>Thread</dt>
                    <dd>{selected.threadId ?? 'Not started'}</dd>
                  </div>
                  <div>
                    <dt>Turn</dt>
                    <dd>{selected.turnId ?? 'Not started'}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFilter(selected.id);
                    setView('tools');
                  }}
                >
                  Inspect tool calls →
                </button>
                {selected.request && (
                  <details className="expert-details">
                    <summary>
                      Provider request · {selected.request.model ?? 'default model'}
                    </summary>
                    <p>
                      Captured input sent to the provider adapter. Each assignment starts an
                      isolated thread. The adapter applies read-only execution policy.
                    </p>
                    <pre>
                      {JSON.stringify(
                        {
                          threadId: selected.threadId,
                          turnId: selected.turnId,
                          ...selected.request,
                          outputSchema: selected.request.outputSchema
                            ? readSchema(selected.request.outputSchema)
                            : null,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}
              </>
            )}
          </aside>
        </div>
      )}
      {view === 'tools' && (
        <div className="tool-trace">
          <div className="trace-heading">
            <label>
              Assignment
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option value="all">All agents</option>
                {o.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.id} · {roleNames[task.role]}
                  </option>
                ))}
              </select>
            </label>
            <span>Provider-reported native web actions</span>
          </div>
          {o.droppedToolCalls > 0 && (
            <p>Showing the latest 2,000 actions; {o.droppedToolCalls} earlier actions omitted.</p>
          )}
          {calls.length ? (
            <ol>
              {[...calls].reverse().map((call) => (
                <li key={`${call.taskId}:${call.itemId}`}>
                  <details>
                    <summary>
                      <span className="tool-action">{call.action}</span>
                      <span className="tool-target">
                        {call.query ||
                          call.queries?.join(' · ') ||
                          call.url ||
                          'Arguments not supplied by provider'}
                      </span>
                      <small>
                        {call.taskId} · {call.status}
                      </small>
                    </summary>
                    <pre>{JSON.stringify(call, null, 2)}</pre>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <p className="section-empty">No web actions recorded for this selection.</p>
          )}
        </div>
      )}
      {view === 'decisions' && (
        <div className="loop-decisions">
          {o.decisions.length ? (
            <ol>
              {o.decisions.map((decision) => (
                <li key={decision.round}>
                  <strong>Cycle {decision.round}</strong>
                  <p>{decision.summary}</p>
                  <small>
                    {decision.newSources} new sources · {decision.addedTasks} synthesis directions
                    admitted
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="section-empty">
              Each synthesis records whether to continue and which gaps to pursue.
            </p>
          )}
          <p>
            {o.rejectedDirections} duplicate or out-of-budget directions rejected ·{' '}
            {o.stagnantRounds} consecutive cycles without new sources
          </p>
        </div>
      )}
      {(o.synthesis || state.gaps.length > 0 || o.contradictions.length > 0) && (
        <details className="working-synthesis">
          <summary>
            Working synthesis{' '}
            <span>
              {state.gaps.length} gaps · {o.contradictions.length} contradictions
            </span>
          </summary>
          <p>{o.synthesis}</p>
          {state.gaps.length > 0 && (
            <>
              <h3>Questions to resolve</h3>
              <ul>
                {state.gaps.map((gap, i) => (
                  <li key={i}>{gap}</li>
                ))}
              </ul>
            </>
          )}
          {o.contradictions.length > 0 && (
            <>
              <h3>Conflicting evidence</h3>
              <ul>
                {o.contradictions.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </section>
  );
}

function readSchema(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
