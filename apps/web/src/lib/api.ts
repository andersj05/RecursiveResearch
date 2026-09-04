import type {
  Artifact,
  Chat,
  ChatDetail,
  HarnessConfig,
  Message,
  Project,
  Run,
  StartRunInput,
  Workspace,
} from '@recursive-research/contracts';

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.method && options.method !== 'GET' ? { 'X-Recursive-Research': '1' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      'The local server is unavailable. It may be restarting; please try again shortly.',
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      'The local server did not return a response. It may be restarting; please try again shortly.',
    );
  }
  if (!response.ok) {
    const error = (body && typeof body === 'object' ? body : {}) as {
      error?: string | { message?: string };
      message?: string;
    };
    throw new Error(
      typeof error.error === 'string'
        ? error.error
        : (error.error?.message ?? error.message ?? `Request failed (${response.status}).`),
    );
  }
  return body as T;
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const api = {
  workspace: () => request<Workspace>('/workspace'),
  chat: (id: string) => request<ChatDetail>(`/chats/${encodeURIComponent(id)}`),
  artifacts: (projectId: string) =>
    request<Artifact[]>(`/projects/${encodeURIComponent(projectId)}/artifacts`),
  createProject: (name: string, folderPath: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, folderPath }) }),
  pickFolder: () => request<{ folderPath: string | null }>('/folders/pick', { method: 'POST' }),
  createChat: (projectId: string, title: string) =>
    request<Chat>(`/projects/${encodeURIComponent(projectId)}/chats`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  saveMessage: (chatId: string, content: string) =>
    request<Message>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  startRun: (chatId: string, input: StartRunInput) =>
    request<Run>(`/chats/${encodeURIComponent(chatId)}/runs`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  stopRun: (runId: string) =>
    request<Run>(`/runs/${encodeURIComponent(runId)}/cancel`, {
      method: 'POST',
      body: '{}',
    }),
  steerRun: (runId: string, content: string) =>
    request<Run>(`/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
  saveSettings: (settings: HarnessConfig) =>
    request<HarnessConfig>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
};
