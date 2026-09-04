import { CodexProvider, CodexProviderError } from '../src/index.js';

// Explicit, read-only live smoke check. No login, turns, or quota-consuming inference.
const provider = new CodexProvider({ executable: process.env.CODEX_EXECUTABLE });
try {
  const status = await provider.getStatus();
  console.log(JSON.stringify({ connectionState: status.state }));
  if (status.state !== 'connected') {
    console.error(status.message ?? 'Connect a ChatGPT subscription in Codex first.');
    process.exitCode = 1;
  } else {
    const [models, usage] = await Promise.all([provider.listModels(), provider.getUsage()]);
    console.log(
      JSON.stringify({
        modelCount: models.length,
        usageBucketCount: usage.rateLimitsByLimitId
          ? Object.keys(usage.rateLimitsByLimitId).length
          : usage.rateLimits
            ? 1
            : 0,
      }),
    );
  }
} catch (error) {
  console.error(
    error instanceof CodexProviderError ? error.message : 'Codex connection check failed.',
  );
  process.exitCode = 1;
} finally {
  await provider.close();
}
