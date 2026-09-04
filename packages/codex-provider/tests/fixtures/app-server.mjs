import readline from 'node:readline';

// A process-level protocol fixture; no network, filesystem state, or real Codex.
const mode = process.argv[2];
let initialized = false;
let acknowledged = false;
let loggedIn = mode !== 'signed-out';
const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ id, result });
const features = Object.fromEntries(
  process.argv
    .filter((arg) => /^features\.[\w_]+=false$/.test(arg))
    .map((arg) => [arg.slice(9, -6), false]),
);
const threads = new Map();
let nextThread = 0;
let nextTurn = 0;
const notify = (method, params) => send({ method, params });
const completed = (threadId, turnId, status = 'completed', items = []) =>
  notify('turn/completed', {
    threadId,
    turn: {
      id: turnId,
      status,
      items,
      error: status === 'failed' ? { message: 'sensitive-fixture-token' } : null,
    },
  });
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
    case 'config/read':
      reply(id, {
        config: {
          features: mode === 'unsafe-config' ? { ...features, shell_tool: true } : features,
          mcp_servers: { fixture: { command: 'never-execute-this', enabled: true } },
          secret: 'sensitive-fixture-token',
        },
      });
      break;
    case 'thread/start':
    case 'thread/resume': {
      if (
        params.sandbox !== 'read-only' ||
        params.approvalPolicy !== 'never' ||
        params.config.mcp_servers.fixture.enabled !== false
      )
        process.exit(10);
      if (
        Object.entries(params.config).some(
          ([key, value]) => key.startsWith('features.') && value !== false,
        )
      )
        process.exit(11);
      const threadId = params.threadId ?? `thread-${++nextThread}`;
      threads.set(threadId, {
        config: params.config,
        cwd: params.cwd,
        instructions: params.developerInstructions,
      });
      reply(id, {
        thread: { id: threadId },
        approvalPolicy: 'never',
        sandbox: {
          type: mode === 'unsafe-thread' ? 'workspaceWrite' : 'readOnly',
          networkAccess: false,
        },
      });
      break;
    }
    case 'mcpServerStatus/list':
      reply(id, { data: mode === 'mcp-leak' ? [{ name: 'fixture' }] : [], nextCursor: null });
      break;
    case 'turn/start': {
      const { threadId } = params;
      const thread = threads.get(threadId);
      if (
        !thread ||
        thread.cwd !== params.cwd ||
        params.approvalPolicy !== 'never' ||
        params.sandboxPolicy.type !== 'readOnly' ||
        params.sandboxPolicy.networkAccess !== false ||
        params.summary !== 'none'
      )
        process.exit(12);
      if (mode === 'turn-exit') process.exit(13);
      const turnId = `turn-${++nextTurn}`;
      thread.turnId = turnId;
      const response = () =>
        reply(id, mode === 'bad-turn' ? {} : { turn: { id: turnId, status: 'inProgress' } });
      const events = () => {
        notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
        notify('item/started', { threadId, turnId, item: { type: 'webSearch', id: 'search' } });
        notify('item/reasoning/textDelta', {
          threadId,
          turnId,
          delta: 'private reasoning never returned',
        });
        notify('item/completed', {
          threadId,
          turnId,
          item: {
            type: 'reasoning',
            id: 'reasoning',
            content: ['private reasoning never returned'],
          },
        });
        notify('item/agentMessage/delta', {
          threadId,
          turnId,
          itemId: 'commentary',
          delta: 'Checking sources.',
        });
        notify('item/completed', {
          threadId,
          turnId,
          item: {
            id: 'commentary',
            type: 'agentMessage',
            phase: 'commentary',
            text: 'Checking sources.',
          },
        });
        if (mode === 'turn-wait') return;
        const text =
          mode === 'structured-output'
            ? JSON.stringify(params.outputSchema ?? null)
            : `${params.model}/${params.effort}/${thread.config.web_search}: ${params.input[0].text}`;
        notify('item/agentMessage/delta', {
          threadId,
          turnId,
          itemId: 'answer',
          delta: text.slice(0, 5),
        });
        notify('item/agentMessage/delta', {
          threadId,
          turnId,
          itemId: 'answer',
          delta: text.slice(5),
        });
        const item = { id: 'answer', type: 'agentMessage', phase: 'final_answer', text };
        notify('item/completed', { threadId, turnId, item });
        completed(threadId, turnId, mode === 'turn-failure' ? 'failed' : 'completed', [item]);
      };
      if (mode === 'early-turn') {
        events();
        setTimeout(response, 10);
      } else {
        response();
        setTimeout(events, 10);
      }
      break;
    }
    case 'turn/steer': {
      const thread = threads.get(params.threadId);
      if (params.expectedTurnId !== thread.turnId) process.exit(14);
      reply(id, { turnId: thread.turnId });
      completed(params.threadId, thread.turnId, 'completed', [
        { type: 'agentMessage', id: 'steered', phase: 'final_answer', text: params.input[0].text },
      ]);
      break;
    }
    case 'turn/interrupt':
      reply(id, {});
      completed(params.threadId, params.turnId, 'interrupted');
      break;
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
