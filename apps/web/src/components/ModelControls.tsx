import type { CodexModel } from '@recursive-research/codex-provider';

export function reasoningLabel(value: string) {
  return value === 'xhigh' ? 'Extra high' : value.charAt(0).toUpperCase() + value.slice(1);
}

export function ModelControls({
  models,
  model,
  reasoningEffort,
  onModelChange,
  onReasoningChange,
  disabled = false,
  compact = false,
}: {
  models: CodexModel[];
  model: string | null;
  reasoningEffort: string | null;
  onModelChange: (model: string | null) => void;
  onReasoningChange: (effort: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const selected =
    models.find((item) => item.model === model) ??
    (model === null ? (models.find((item) => item.isDefault) ?? models[0]) : undefined);
  const efforts = selected?.supportedReasoningEfforts ?? [];
  const supported =
    reasoningEffort === null || efforts.some((item) => item.reasoningEffort === reasoningEffort);

  return (
    <div className={compact ? 'model-controls compact-controls' : 'model-controls'}>
      <label className="field">
        <span>Model</span>
        <select
          aria-label="Model"
          disabled={disabled}
          value={model ?? ''}
          onChange={(event) => {
            onModelChange(event.target.value || null);
            onReasoningChange(null);
          }}
        >
          <option value="">
            {selected && !model ? `${selected.displayName} (default)` : 'Codex default'}
          </option>
          {model && !models.some((item) => item.model === model) && (
            <option value={model}>{model} (unavailable)</option>
          )}
          {models.map((item) => (
            <option key={item.id} value={item.model}>
              {item.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Thinking</span>
        <select
          aria-label="Thinking"
          disabled={disabled || !selected}
          value={supported ? (reasoningEffort ?? '') : ''}
          onChange={(event) => onReasoningChange(event.target.value || null)}
        >
          <option value="">
            {selected?.defaultReasoningEffort
              ? `${reasoningLabel(selected.defaultReasoningEffort)} (default)`
              : 'Model default'}
          </option>
          {efforts.map((item) => (
            <option key={item.reasoningEffort} value={item.reasoningEffort}>
              {reasoningLabel(item.reasoningEffort)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
