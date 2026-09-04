import Markdown from 'react-markdown';
import { isActiveRun, type ChatDetail } from '@recursive-research/contracts';
import { Icon } from './Icon';
import { reasoningLabel } from './ModelControls';

export function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ConversationMessages({ detail }: { detail: ChatDetail }) {
  return (
    <div className="message-list" aria-label="Messages">
      {detail.messages.map((message) => {
        const run = detail.runs.find((item) => item.id === message.runId);
        const assistant = message.role === 'assistant';
        const active = run && isActiveRun(run);
        return (
          <article key={message.id} className={`message message-${message.role}`}>
            <div className="message-meta">
              <span className="message-avatar" aria-hidden="true">
                {assistant ? 'RR' : message.role === 'user' ? 'Y' : 'RR'}
              </span>
              <strong>
                {message.role === 'user'
                  ? 'You'
                  : message.role === 'system'
                    ? 'Workspace'
                    : 'RecursiveResearch'}
              </strong>
              <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            </div>
            {assistant && run && (
              <div className="response-settings">
                {run.mode === 'research' && <span>Research</span>}
                <span>{run.model}</span>
                <span>{reasoningLabel(run.reasoningEffort)}</span>
              </div>
            )}
            {message.content ? (
              assistant ? (
                <div className="markdown-content">
                  <Markdown
                    skipHtml
                    disallowedElements={['img']}
                    urlTransform={(url) => (/^https?:\/\//i.test(url) ? url : '')}
                    components={{
                      a: ({ children, href }) =>
                        href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {children}
                          </a>
                        ) : (
                          <span>{children}</span>
                        ),
                    }}
                  >
                    {message.content}
                  </Markdown>
                </div>
              ) : (
                <p>{message.content}</p>
              )
            ) : active ? (
              <p className="response-pending">
                {run.status === 'queued' ? 'Starting…' : 'Working…'}
              </p>
            ) : null}
            {assistant && run && !active && run.status !== 'completed' && (
              <p
                className={run.error ? 'inline-error' : 'message-state'}
                role={run.error ? 'alert' : undefined}
              >
                {run.error ??
                  (run.status === 'cancelled'
                    ? 'Stopped'
                    : run.status === 'interrupted'
                      ? 'Interrupted'
                      : 'Run failed')}
              </p>
            )}
            {assistant && run?.reportPath && (
              <a
                className="text-button report-link"
                href={`/api/projects/${encodeURIComponent(run.projectId)}/artifact?path=${encodeURIComponent(run.reportPath)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="file" size={13} />
                Open research report
                <Icon name="external" size={12} />
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}
