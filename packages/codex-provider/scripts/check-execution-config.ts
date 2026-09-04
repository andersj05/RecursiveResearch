import { AppServerRpc, isRecord } from '../src/rpc.js';
import { executionConfig } from '../src/execution-config.js';
import { CodexProviderError } from '../src/types.js';

// Explicit live protocol check only: no turn, inference, login, or config writes.
const rpc = new AppServerRpc(
  { executable: process.env.CODEX_EXECUTABLE },
  () => {},
  () => {},
);
let stage = 'config/read';
try {
  const config = executionConfig(
    await rpc.request('config/read', { cwd: process.cwd(), includeLayers: false }),
    'research',
  );
  stage = 'thread/start';
  const result = await rpc.request('thread/start', {
    cwd: process.cwd(),
    ephemeral: true,
    approvalPolicy: 'never',
    sandbox: 'read-only',
    config,
    developerInstructions: 'This is a protocol check. No user turn will be started.',
  });
  const permissionsVerified =
    isRecord(result) &&
    result.approvalPolicy === 'never' &&
    isRecord(result.sandbox) &&
    result.sandbox.type === 'readOnly' &&
    result.sandbox.networkAccess === false;
  stage = 'mcpServerStatus/list';
  if (!isRecord(result) || !isRecord(result.thread)) throw new Error('Unsupported thread response');
  const inventory = await rpc.request('mcpServerStatus/list', {
    threadId: result.thread.id,
    limit: 100,
  });
  const externalToolsDisabled =
    isRecord(inventory) &&
    Array.isArray(inventory.data) &&
    inventory.data.every(
      (server) =>
        isRecord(server) &&
        server.runtimeStatus === 'disabled' &&
        isRecord(server.tools) &&
        Object.keys(server.tools).length === 0,
    ) &&
    inventory.nextCursor === null;
  console.log(
    JSON.stringify({ executionConfigVerified: true, permissionsVerified, externalToolsDisabled }),
  );
  if (!permissionsVerified || !externalToolsDisabled) process.exitCode = 1;
} catch (error) {
  console.error(
    `${stage}: ${error instanceof CodexProviderError ? error.message : 'Execution configuration check failed.'}`,
  );
  process.exitCode = 1;
} finally {
  await rpc.close();
}
