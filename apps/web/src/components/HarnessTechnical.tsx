import { useEffect, useState } from 'react';
import type { HarnessRuntime } from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';

const stages = [
  {
    name: 'Plan',
    detail:
      'A planner decomposes the brief into 2–6 independent questions. It asks for clarification only when useful work cannot start.',
    tools: 'Structured planning · user clarification',
  },
  {
    name: 'Delegate',
    detail:
      'The server deduplicates normalized questions and admits them within task and depth limits. Highest priority runs first, then shallower depth and creation time. A shared FIFO pool bounds concurrency across jobs.',
    tools: 'Frontier admission · global turn scheduler',
  },
  {
    name: 'Investigate',
    detail:
      'Independent researchers and skeptics search, open sources, follow references, summarize evidence, and propose child questions. Each has its own Codex thread and bounded context.',
    tools: 'Native web search · open page · find in page',
  },
  {
    name: 'Synthesize',
    detail:
      'A separate turn reconciles source observations, identifies contradictions and gaps, and proposes the next frontier. Model judgments guide research; the server enforces limits.',
    tools: 'Source notebook · gap review · next directions',
  },
  {
    name: 'Report',
    detail:
      'Stop at sufficient coverage without unresolved gaps, a source/cycle limit, an empty frontier, or two cycles with no new sources. Reserve the last 10% of time for a concise cited answer; the hard timeout still applies.',
    tools: 'Concise synthesis · server-saved Markdown',
  },
];
export function HarnessTechnical() {
  const [selected, setSelected] = useState(2);
  const [runtime, setRuntime] = useState<HarnessRuntime | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let disposed = false;
    const load = () =>
      void api
        .harnessRuntime()
        .then((value) => {
          if (!disposed) {
            setRuntime(value);
            setError('');
          }
        })
        .catch((cause) => {
          if (!disposed) setError(describeError(cause));
        });
    load();
    const timer = setInterval(load, 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const stage = stages[selected]!;
  return (
    <section className="harness-technical" aria-label="Harness architecture">
      <div className="harness-section-heading">
        <h2>Adaptive research loop</h2>
        <span>Server-owned orchestration</span>
      </div>
      <div className="adaptive-topology" aria-label="Research stages">
        {stages.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span>0{index + 1}</span>
            <strong>{item.name}</strong>
          </button>
        ))}
        <div className="topology-return">
          ↖ New leads and unresolved gaps return to the frontier
        </div>
      </div>
      <div className="topology-detail">
        <h3>{stage.name}</h3>
        <p>{stage.detail}</p>
        <code>{stage.tools}</code>
      </div>
      <details className="expert-details">
        <summary>Runtime, commands & algorithms</summary>
        <p>
          Web tools execute inside Codex. Their provider-reported arguments appear in each run’s
          Tool trace; they are native actions, not shell commands.
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {runtime && (
          <>
            <h3>Actual process launch</h3>
            {runtime.launch ? (
              <pre>{JSON.stringify(runtime.launch, null, 2)}</pre>
            ) : (
              <p>An injected provider is running. No Codex process command is available.</p>
            )}
            <p>
              {runtime.transport} · {runtime.scheduler.active} active / {runtime.scheduler.limit}{' '}
              global slots · {runtime.scheduler.queued} queued
            </p>
            <pre>{runtime.methods.join('\n')}</pre>
          </>
        )}
        <h3>Execution policy</h3>
        <p>
          Every provider turn is read-only, without approval prompts. Only researchers and skeptics
          get web search. Shell, filesystem writes, external connectors, and native provider
          delegation are disabled. The application launches and cancels child turns.
        </p>
        <h3>Evidence & context</h3>
        <p>
          HTTP(S) source URLs are normalized and deduplicated; observations remain attributed to
          their agents. Context ranks sources by assignment-word overlap, then recency, selecting up
          to 16 for research and 60 for synthesis. The complete retained notebook stays in the
          project. Repeated claims are not independent verification.
        </p>
        <h3>Failure handling</h3>
        <p>
          A malformed research result fails that assignment and leaves other evidence available.
          Provider or storage failures stop the run. Clarification is persisted and can continue
          after restart; interrupted active runs remain inspectable and require a new run.
        </p>
      </details>
    </section>
  );
}
