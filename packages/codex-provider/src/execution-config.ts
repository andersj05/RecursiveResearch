import { CodexProviderError } from './types.js';
import { isRecord } from './rpc.js';

// These overrides apply only to our child process, never the shared config file.
// Codex still owns the existing account and its credential store.
export const executionFeatures = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'remote_plugin',
  'multi_agent',
  'multi_agent_v2',
  'hooks',
  'memories',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'image_generation',
  'code_mode',
  'code_mode_host',
  'code_mode_only',
  'skill_mcp_dependency_install',
  'workspace_dependencies',
  'tool_suggest',
  'view_image',
] as const;

export const executionConfigArgs = [
  ...executionFeatures.flatMap((feature) => ['-c', `features.${feature}=false`]),
  '-c',
  'mcp_servers={}',
  '-c',
  'notify=[]',
  '-c',
  'tools.view_image=false',
  '-c',
  'project_doc_max_bytes=0',
];

export function executionConfig(
  value: unknown,
  mode: 'chat' | 'research',
): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.config)) {
    throw new CodexProviderError(
      'INVALID_RESPONSE',
      'Codex could not verify the execution configuration.',
    );
  }
  const config = value.config;
  const features = config.features;
  // A config reader may include unrelated secrets: inspect names and booleans only.
  // Fail closed if CLI layering did not honor process-local tool restrictions.
  if (!isRecord(features) || executionFeatures.some((key) => features[key] !== false)) {
    throw new CodexProviderError(
      'EXECUTION_UNAVAILABLE',
      'This Codex installation could not apply the research tool restrictions. Update Codex and reconnect.',
    );
  }
  const overrides: Record<string, unknown> = {
    ...Object.fromEntries(executionFeatures.map((feature) => [`features.${feature}`, false])),
    web_search: mode === 'research' ? 'live' : 'disabled',
    mcp_servers: {},
    notify: [],
    'tools.view_image': false,
    project_doc_max_bytes: 0,
  };
  // Explicit per-server overrides also cover CLIs which merge empty maps.
  if (isRecord(config.mcp_servers)) {
    overrides.mcp_servers = Object.fromEntries(
      Object.keys(config.mcp_servers).map((name) => [name, { enabled: false }]),
    );
  }
  return overrides;
}
