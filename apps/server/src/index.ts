import { createApp } from './app.js';

const port = Number(process.env.PORT || 4318);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be an integer between 1024 and 65535.');
const app = await createApp({ port });
try {
  await app.listen({ port, host: '127.0.0.1' });
  console.log(`RecursiveResearch is running at http://127.0.0.1:${port}`);
} catch {
  console.error(
    `Unable to start RecursiveResearch on port ${port}. Check whether it is already running.`,
  );
  await app.close();
  process.exitCode = 1;
}
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
}
process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});
