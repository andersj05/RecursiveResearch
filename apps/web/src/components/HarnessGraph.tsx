import { useState } from 'react';
import { researchGraph, researchTools } from '@recursive-research/harness';
import type { HarnessStage, Run } from '@recursive-research/contracts';

export function HarnessGraph({ run }: { run?: Run }) {
  const [selected, setSelected] = useState<HarnessStage>('gather');
  const node = researchGraph.find((item) => item.id === selected)!;
  const state = run?.harness;
  const [showTools, setShowTools] = useState(false);
  return (
    <section className="harness-engine" aria-label="Research workflow">
      <div className="harness-section-heading">
        <h2>The research loop</h2>
        <span>
          {state ? `${state.round} / ${state.maxRounds} rounds` : 'Select a stage to inspect'}
        </span>
      </div>
      <div className="harness-engine-layout">
        <div className="harness-graph">
          <ol className="harness-nodes" aria-label="Execution stages in order">
            {researchGraph.map((item, index) => {
              const current = state?.stage === item.id;
              const completed = state?.steps.some((step) => step.stage === item.id);
              const status =
                current && run?.status === 'waiting'
                  ? 'Needs your input'
                  : current && run?.status === 'running'
                    ? 'Running'
                    : current && run?.status === 'queued'
                      ? 'Queued'
                      : current &&
                          run &&
                          ['failed', 'cancelled', 'interrupted'].includes(run.status)
                        ? run.status
                        : completed
                          ? 'Done'
                          : 'Pending';
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={selected === item.id}
                    aria-label={`${item.title}${state ? `: ${status}` : ''}`}
                    className={`harness-node ${current ? 'current' : ''}`}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="harness-node-number">{completed ? '✓' : `0${index + 1}`}</span>
                    <strong>{item.title}</strong>
                    <span>
                      {state
                        ? status
                        : [
                            'Set scope',
                            'Define questions',
                            'Read sources',
                            'Find gaps',
                            'Synthesize',
                          ][index]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div
            className="harness-loop"
            aria-label="Review returns to Gather when gaps and budget remain"
          >
            <span>← Gaps remain + budget available</span>
          </div>
          <div className="harness-branch">
            <span>↳ Clarification needed → wait for your answer → Plan</span>
          </div>
        </div>
        <aside className="harness-inspector" aria-label={`${node.title} stage details`}>
          <span className="harness-inspector-label">
            {String(researchGraph.indexOf(node) + 1).padStart(2, '0')} / STAGE
          </span>
          <h3>{node.title}</h3>
          <p>{node.description}</p>
          <h4>Decision rule</h4>
          <p>{node.rule}</p>
          <h4>Available here</h4>
          {node.tools.length ? (
            <ul>
              {node.tools.map((id) => (
                <li key={id}>{researchTools.find((tool) => tool.id === id)?.name}</li>
              ))}
            </ul>
          ) : (
            <p>Research context only; no external tools.</p>
          )}
        </aside>
      </div>
      <button
        type="button"
        className="harness-tools-toggle"
        aria-expanded={showTools}
        aria-controls="harness-tool-catalog"
        onClick={() => setShowTools(!showTools)}
      >
        {showTools ? '−' : '+'} Tools & algorithms{' '}
        <span>4 capabilities · bounded sequential execution</span>
      </button>
      {showTools && (
        <div id="harness-tool-catalog" className="harness-tool-catalog">
          {researchTools.map((tool) => (
            <article key={tool.id}>
              <span>{tool.kind}</span>
              <h3>{tool.name}</h3>
              <p>{tool.description}</p>
              <small>
                Available:{' '}
                {researchGraph
                  .filter((stage) => (stage.tools as readonly string[]).includes(tool.id))
                  .map((stage) => stage.title)
                  .join(', ')}
              </small>
            </article>
          ))}
          <div className="harness-algorithm">
            <h3>How the loop stops</h3>
            <p>
              Review identifies gaps. Gathering repeats only while gaps exist, rounds remain, and
              the notebook has space. URLs are normalized by removing fragments and common tracking
              parameters; the first finding for each URL is retained. A report records the stopping
              reason and unresolved questions.
            </p>
            <p>
              Review is a model assessment. Sources and claims are not independently verified. One
              agent runs one stage at a time; each stage receives the saved brief, plan, and
              evidence. Active work has a 20-minute limit per execution segment; waiting uses no
              execution time.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
