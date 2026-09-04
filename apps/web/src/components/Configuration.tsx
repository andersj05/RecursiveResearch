import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { HarnessConfig } from '@recursive-research/contracts';
import type {
  CodexModel,
  CodexQuotaWindow,
  CodexStatus,
  CodexUsage,
} from '@recursive-research/codex-provider';
import { api, describeError, request } from '../lib/api';
import { Icon } from './Icon';
import { ModelControls } from './ModelControls';

function UsageWindow({ window, label }: { window: CodexQuotaWindow; label: string }) {
  const remaining =
    window.usedPercent === null ? null : Math.max(0, Math.min(100, 100 - window.usedPercent));
  const duration = window.windowDurationMins;
  const period = duration
    ? duration >= 1440
      ? `${Math.round(duration / 1440)}-day window`
      : `${Math.round(duration / 60)}-hour window`
    : label;
  return (
    <div className="usage-window">
      <div>
        <span>{period}</span>
        <strong>
          {remaining === null ? 'Unavailable' : `${Math.round(remaining)}% remaining`}
        </strong>
      </div>
      {remaining !== null && (
        <meter min={0} max={100} value={remaining} aria-label={`${period} remaining usage`} />
      )}
      <small>
        {window.resetsAt
          ? `Resets ${new Date(window.resetsAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
          : 'Reset time unavailable'}
      </small>
    </div>
  );
}

export function Configuration({
  settings,
  onSaved,
}: {
  settings: HarnessConfig;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [baseline, setBaseline] = useState(settings);
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [usage, setUsage] = useState<CodexUsage | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    if (!dirty && JSON.stringify(settings) !== JSON.stringify(baseline)) {
      setDraft(settings);
      setBaseline(settings);
      setSaved(false);
    }
  }, [settings, baseline, dirty]);

  const refreshProvider = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await request<CodexStatus>('/codex/status');
      setStatus(next);
      setProviderError(null);
      if (next.state === 'connected') {
        setAuthUrl(null);
        const results = await Promise.allSettled([
          request<CodexModel[]>('/codex/models'),
          request<CodexUsage>('/codex/usage'),
        ]);
        if (results[0].status === 'fulfilled') setModels(results[0].value);
        if (results[1].status === 'fulfilled') setUsage(results[1].value);
        const errors = results
          .filter((result) => result.status === 'rejected')
          .map((result) => describeError(result.reason));
        if (errors.length) setProviderError(errors.join(' '));
      } else {
        setModels([]);
        setUsage(null);
      }
    } catch (cause) {
      setProviderError(describeError(cause));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshProvider();
    const events = new EventSource('/api/events');
    events.onopen = () => void refreshProvider();
    events.addEventListener('provider.updated', () => void refreshProvider());
    return () => events.close();
  }, [refreshProvider]);

  useEffect(() => {
    if (status?.login?.status !== 'pending') return;
    const interval = window.setInterval(() => void refreshProvider(), 3000);
    return () => window.clearInterval(interval);
  }, [refreshProvider, status?.login?.status]);

  async function connect() {
    setConnecting(true);
    setProviderError(null);
    try {
      const login = await request<{ loginId: string; authUrl: string }>('/codex/login', {
        method: 'POST',
      });
      setAuthUrl(login.authUrl);
      await refreshProvider();
    } catch (cause) {
      setProviderError(describeError(cause));
    } finally {
      setConnecting(false);
    }
  }

  async function cancelLogin() {
    if (!status?.login) return;
    setConnecting(true);
    try {
      await request('/codex/login/cancel', {
        method: 'POST',
        body: JSON.stringify({ loginId: status.login.loginId }),
      });
      setAuthUrl(null);
      await refreshProvider();
    } catch (cause) {
      setProviderError(describeError(cause));
    } finally {
      setConnecting(false);
    }
  }

  function change<K extends keyof HarnessConfig>(key: K, value: HarnessConfig[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await api.saveSettings(draft);
      setDraft(updated);
      setBaseline(updated);
      setSaved(true);
      onSaved();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  }

  const buckets =
    usage?.rateLimitsByLimitId && Object.keys(usage.rateLimitsByLimitId).length
      ? Object.values(usage.rateLimitsByLimitId)
      : usage?.rateLimits
        ? [usage.rateLimits]
        : [];
  const pending = status?.login?.status === 'pending';

  return (
    <div className="configuration page-content">
      <div className="page-intro compact">
        <h1>Configuration</h1>
      </div>
      <section className="settings-section" aria-labelledby="codex-heading">
        <div className="settings-heading">
          <div>
            <h2 id="codex-heading">Codex subscription</h2>
          </div>
          <button
            type="button"
            className="button small"
            onClick={() => void refreshProvider()}
            disabled={refreshing}
          >
            <Icon name="refresh" size={14} />
            {refreshing ? 'Checking…' : 'Refresh'}
          </button>
        </div>
        <div className="account-card">
          <div className="account-mark">
            <span className="brand-mark" aria-hidden="true">
              RR
            </span>
          </div>
          <div className="account-copy">
            <strong>
              {status?.state === 'connected'
                ? (status.account?.email ?? 'Codex connected')
                : 'Your Codex subscription'}
            </strong>
            <span>
              {status?.state === 'connected'
                ? (status.account?.planType ?? status.account?.type ?? 'Codex')
                : (status?.message ??
                  (status ? 'Sign in with your ChatGPT account.' : 'Checking connection…'))}
            </span>
          </div>
          <span className={`status-label ${status?.state === 'connected' ? 'connected' : ''}`}>
            <span className="status-dot" />
            {status?.state === 'connected'
              ? 'Connected'
              : pending
                ? 'Awaiting sign-in'
                : 'Not connected'}
          </span>
        </div>
        {status?.state !== 'connected' && !pending && (
          <div className="connection-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => void connect()}
              disabled={connecting || !status || status.state === 'unavailable'}
            >
              {connecting ? 'Preparing sign-in…' : 'Connect Codex'}
              <Icon name="external" size={14} />
            </button>
          </div>
        )}
        {pending && (
          <div className="login-prompt">
            <p>Finish signing in with ChatGPT in your browser.</p>
            <div className="button-row">
              {authUrl && (
                <a
                  className="button primary"
                  href={authUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Continue in browser
                  <Icon name="external" size={14} />
                </a>
              )}
              <button
                className="button quiet"
                type="button"
                disabled={connecting}
                onClick={() => void cancelLogin()}
              >
                Cancel sign-in
              </button>
            </div>
          </div>
        )}
        {status?.login?.error && (
          <p className="inline-error" role="alert">
            {status.login.error}
          </p>
        )}
        {providerError && (
          <p className="inline-error" role="alert">
            {providerError}
          </p>
        )}
        {status?.state === 'connected' && (
          <div className="usage-area">
            <div className="section-title-row">
              <h3>Usage</h3>
            </div>
            {buckets.length ? (
              buckets.map((bucket, index) => (
                <div className="usage-bucket" key={bucket.limitId ?? index}>
                  {buckets.length > 1 && (
                    <p className="eyebrow">{bucket.limitName ?? bucket.limitId ?? 'Codex'}</p>
                  )}
                  <div className="usage-grid">
                    {bucket.primary && (
                      <UsageWindow window={bucket.primary} label="Primary window" />
                    )}
                    {bucket.secondary && (
                      <UsageWindow window={bucket.secondary} label="Secondary window" />
                    )}
                    {!bucket.primary && !bucket.secondary && (
                      <p className="muted-copy">
                        Usage windows are not available for this account.
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted-copy">
                Usage is not available from Codex yet. Refresh to check again.
              </p>
            )}
          </div>
        )}
      </section>
      <form onSubmit={(event) => void save(event)}>
        <section className="settings-section" aria-labelledby="harness-heading">
          <div className="settings-heading">
            <div>
              <h2 id="harness-heading">Chat & research defaults</h2>
            </div>
          </div>
          <ModelControls
            models={models}
            model={draft.model}
            reasoningEffort={draft.reasoningEffort}
            onModelChange={(model) => change('model', model)}
            onReasoningChange={(effort) => change('reasoningEffort', effort)}
          />
          <details className="harness-options">
            <summary>Advanced</summary>
            <div className="numeric-fields">
              <label className="field">
                <span>Concurrent jobs</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  required
                  value={draft.maxParallelAgents}
                  onChange={(event) => change('maxParallelAgents', Number(event.target.value))}
                />
              </label>
              <label className="field">
                <span>Sources per research job</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={draft.maxSourcesPerAgent}
                  onChange={(event) => change('maxSourcesPerAgent', Number(event.target.value))}
                />
              </label>
            </div>
            <label className="field">
              <span>Research instructions</span>
              <textarea
                rows={4}
                value={draft.instructions}
                maxLength={20000}
                onChange={(event) => change('instructions', event.target.value)}
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={draft.requirePrimarySources}
                onChange={(event) => change('requirePrimarySources', event.target.checked)}
              />
              <span>
                <strong>Require primary sources</strong>
              </span>
            </label>
          </details>
        </section>
        <div className="settings-save">
          <span role="status">
            {saved && !dirty ? (
              <>
                <Icon name="check" size={14} />
                Configuration saved
              </>
            ) : dirty ? (
              'Unsaved changes'
            ) : (
              ''
            )}
          </span>
          <button type="submit" className="button primary" disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save configuration'}
            <Icon name="arrow" size={14} />
          </button>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
