import { Icon } from './Icon';

export function Welcome({
  projectCount,
  onCreate,
  onConfigure,
}: {
  projectCount: number;
  onCreate: () => void;
  onConfigure: () => void;
}) {
  return (
    <div className="welcome page-content">
      <div className="page-intro">
        <p className="eyebrow">
          <span>$</span> research --open-ended
        </p>
        <h1>
          Good research starts
          <br />
          with a better question.
        </h1>
        <p className="lede">
          A workspace for following ideas, gathering evidence,
          <br className="desktop-break" /> and seeing where the next question leads.
        </p>
      </div>
      <section className="welcome-window" aria-labelledby="start-title">
        <div className="window-bar">
          <span>workspace / getting-started</span>
          <span>LOCAL FIRST</span>
        </div>
        <div className="welcome-window-body">
          <div>
            <p className="eyebrow">01 / SET THE GROUNDWORK</p>
            <h2 id="start-title">Give your next question a home.</h2>
            <p>
              Connect a project to a folder on your computer. Keep every conversation, source, and
              idea in one place as your research grows.
            </p>
            <button type="button" className="button primary" onClick={onCreate}>
              <Icon name="plus" />
              New project
              <Icon name="arrow" />
            </button>
          </div>
          <div
            className="research-tree"
            aria-label="A research question branches into evidence, connections, and new questions"
          >
            <div className="tree-node root-node">
              <span className="tree-marker">?</span>an open question
            </div>
            <div className="tree-branches">
              <div className="tree-node">
                <span className="tree-marker">↳</span>gather evidence
              </div>
              <div className="tree-node">
                <span className="tree-marker">↳</span>connect ideas
              </div>
              <div className="tree-node last-node">
                <span className="tree-marker">↳</span>ask what comes next
                <span className="blinking-cursor" aria-hidden="true">
                  _
                </span>
              </div>
            </div>
            <span className="tree-caption">curiosity, with a working directory.</span>
          </div>
        </div>
      </section>
      <div className="welcome-bottom">
        <section className="plain-section">
          <p className="eyebrow">+-- your workspace</p>
          <h2>Local files. Room to explore.</h2>
          <p>
            Projects organize your chats. Each chat holds a research brief you can revisit and
            refine.
          </p>
          <div className="workspace-fact">
            <span>Connected projects</span>
            <strong>{String(projectCount).padStart(2, '0')}</strong>
          </div>
        </section>
        <section className="plain-section">
          <p className="eyebrow">+-- prepare the harness</p>
          <h2>Set up the way you research.</h2>
          <p>
            Connect your Codex account and save your agent defaults. Parallel research and steering
            are the next layer.
          </p>
          <button type="button" className="text-button" onClick={onConfigure}>
            Open configuration
            <Icon name="arrow" size={14} />
          </button>
        </section>
      </div>
      <div className="page-footnote">
        <span className="status-dot" />
        Workspace foundation<span className="footnote-separator">/</span>Agent execution is not
        connected yet.
      </div>
    </div>
  );
}
