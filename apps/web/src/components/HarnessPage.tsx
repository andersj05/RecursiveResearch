import { useEffect, useState, type FormEvent } from 'react';
import { defaultAdaptiveOptions, type HarnessConfig } from '@recursive-research/contracts';
import { api, describeError } from '../lib/api';
import { HarnessTechnical } from './HarnessTechnical';
import { ResearchLimits } from './ResearchLimits';
import { Icon } from './Icon';

const editable = (settings: HarnessConfig) => ({
  research: settings.research ?? defaultAdaptiveOptions,
  instructions: settings.instructions,
  requirePrimarySources: settings.requirePrimarySources,
  maxParallelAgents: settings.maxParallelAgents,
});
export function HarnessPage({
  settings,
  onSaved,
}: {
  settings: HarnessConfig;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(() => editable(settings));
  const [baseline, setBaseline] = useState(() => editable(settings));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    const next = editable(settings);
    if (!dirty && JSON.stringify(next) !== JSON.stringify(baseline)) {
      setDraft(next);
      setBaseline(next);
    }
  }, [settings, dirty, baseline]);
  function change(next: typeof draft) {
    setDraft(next);
    setSaved(false);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const latest = await api.workspace();
      const result = await api.saveSettings({ ...latest.settings, ...draft });
      setBaseline(editable(result));
      setDraft(editable(result));
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="harness-page">
      <div className="harness-page-heading">
        <div>
          <h1>Research harness</h1>
          <p>Defaults, tools, and orchestration. Start research from a project chat.</p>
        </div>
      </div>
      <form className="harness-defaults" onSubmit={(event) => void save(event)}>
        <div className="settings-section-heading">
          <h2>Research defaults</h2>
          <span>Applied to new research runs</span>
        </div>
        <ResearchLimits
          value={draft.research}
          onChange={(research) => change({ ...draft, research })}
          disabled={busy}
        />
        <p className="harness-budget-note">
          Override these limits in any project chat before starting research. Existing runs keep
          their settings.
        </p>
        <details className="expert-details">
          <summary>Research guidance & global limits</summary>
          <label className="field">
            <span>Research instructions</span>
            <textarea
              rows={4}
              maxLength={20000}
              value={draft.instructions}
              disabled={busy}
              onChange={(event) => change({ ...draft, instructions: event.target.value })}
            />
          </label>
          <div className="harness-policy-fields">
            <label className="field">
              <span>Global concurrent jobs / turns</span>
              <input
                type="number"
                min={1}
                max={16}
                required
                value={draft.maxParallelAgents}
                disabled={busy}
                onChange={(event) =>
                  change({ ...draft, maxParallelAgents: Number(event.target.value) })
                }
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.requirePrimarySources}
                disabled={busy}
                onChange={(event) =>
                  change({ ...draft, requirePrimarySources: event.target.checked })
                }
              />
              <span>Prefer primary sources</span>
            </label>
          </div>
        </details>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="harness-defaults-footer">
          <span role="status">{dirty ? 'Unsaved changes' : saved ? 'Defaults saved' : ''}</span>
          <button
            type="button"
            className="button"
            disabled={!dirty || busy}
            onClick={() => {
              setDraft(baseline);
              setError(null);
              setSaved(false);
            }}
          >
            Discard changes
          </button>
          <button className="button primary" type="submit" disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save defaults'}
            <Icon name="check" size={14} />
          </button>
        </div>
      </form>
      <HarnessTechnical />
    </div>
  );
}
