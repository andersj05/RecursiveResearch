import type { AdaptiveOptions } from '@recursive-research/contracts';
const fields = [
  ['maxRounds', 'Research cycles', 1, 12],
  ['maxAgents', 'Parallel agents', 1, 6],
  ['maxTasks', 'Research assignments', 2, 48],
  ['maxDepth', 'Branch depth', 1, 8],
  ['maxSources', 'Retained sources', 2, 500],
  ['maxMinutes', 'Time limit (minutes)', 1, 120],
] as const;
export function ResearchLimits({
  value,
  onChange,
  disabled = false,
}: {
  value: AdaptiveOptions;
  onChange: (value: AdaptiveOptions) => void;
  disabled?: boolean;
}) {
  return (
    <div className="research-limit-fields">
      {fields.map(([key, label, min, max]) => (
        <label className="field" key={key}>
          <span>{label}</span>
          <input
            type="number"
            min={min}
            max={max}
            step={1}
            value={value[key]}
            required
            disabled={disabled}
            onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })}
          />
        </label>
      ))}
    </div>
  );
}
