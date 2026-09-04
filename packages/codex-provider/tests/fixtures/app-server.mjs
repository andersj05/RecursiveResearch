import readline from 'node:readline';

// A process-level protocol fixture; no network, filesystem state, or real Codex.
const mode = process.argv[2];
let initialized = false;
let acknowledged = false;
let loggedIn = mode !== 'signed-out';
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ id, result });
const model = (id, isDefault = false) => ({
  id,
  model: id,
  displayName: `Model ${id}`,
  description: 'Fixture model',
  defaultReasoningEffort: 'medium',
  supportedReasoningEfforts: [{ reasoningEffort: 'medium', description: 'Balanced' }],
  isDefault,
});

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  if (method === 'initialize') {
    if (initialized) process.exit(2);
    initialized = true;
    if (mode === 'hang') return;
    reply(id, { userAgent: 'fixture' });
    return;
  }
  if (method === 'initialized') {
    if (!initialized) process.exit(3);
    acknowledged = true;
    return;
  }
  if (!acknowledged) process.exit(4);
  if (mode === 'exit') process.exit(5);
  if (mode === 'malformed') {
    process.stdout.write('this is not JSON\n');
    return;
  }
  if (mode === 'rpc-error') {
    send({
      id,
      error: { code: 401, message: 'sensitive-fixture-token in a private server error' },
    });
    return;
  }
  switch (method) {
    case 'account/read':
      reply(id, {
        account: loggedIn
          ? {
              type: mode === 'api-key' ? 'apiKey' : 'chatgpt',
              email: 'fixture@example.test',
              planType: 'pro',
              accessToken: 'sensitive-fixture-token',
            }
          : null,
        requiresOpenaiAuth: true,
      });
      break;
    case 'model/list':
      reply(id, {
        data: params.cursor
          ? [model('two')]
          : [model('one', true), { ...model('hidden'), hidden: true }],
        nextCursor: mode === 'repeating-cursor' || !params.cursor ? 'next' : null,
      });
      break;
    case 'account/rateLimits/read':
      reply(id, {
        rateLimits: {
          limitId: 'codex',
          primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 },
          secondary: null,
        },
        rateLimitsByLimitId: {
          codex: {
            limitId: 'codex',
            primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 },
            secondary: null,
          },
          other: {
            limitId: 'other',
            limitName: 'Other bucket',
            primary: { usedPercent: null },
            secondary: null,
          },
        },
        accessToken: 'sensitive-fixture-token',
      });
      break;
    case 'account/login/start': {
      if (mode === 'early-login') {
        loggedIn = true;
        send({
          method: 'account/login/completed',
          params: { loginId: 'login-fixture', success: true },
        });
        send({ method: 'account/updated', params: { authMode: 'chatgpt' } });
      }
      const response = JSON.stringify({
        id,
        result: {
          type: 'chatgpt',
          loginId: 'login-fixture',
          authUrl:
            mode === 'bad-url'
              ? 'https://example.test/steal'
              : 'https://auth.openai.com/authorize?state=fixture',
        },
      });
      // Split a frame across stdout chunks to exercise real JSONL framing.
      process.stdout.write(response.slice(0, 15));
      setTimeout(() => process.stdout.write(`${response.slice(15)}\n`), 10);
      break;
    }
    case 'account/login/cancel':
      reply(id, { status: 'canceled' });
      setTimeout(
        () =>
          send({
            method: 'account/login/completed',
            params: { loginId: params.loginId, success: false, error: 'sensitive-fixture-token' },
          }),
        5,
      );
      break;
    default:
      send({ id, error: { code: -32601, message: 'Unknown fixture method.' } });
  }
});
