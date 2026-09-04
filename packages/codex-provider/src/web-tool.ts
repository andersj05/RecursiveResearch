import type { WebToolCall } from '@recursive-research/contracts';
import { isRecord } from './rpc.js';

/** Explicit public tool arguments only; never forward arbitrary provider objects. */
export function projectWebTool(
  item: Record<string, unknown>,
  status: WebToolCall['status'],
): WebToolCall | null {
  if (typeof item.id !== 'string') return null;
  const action = isRecord(item.action) ? item.action : {};
  const type = ['search', 'openPage', 'findInPage'].includes(String(action.type))
    ? (action.type as WebToolCall['action'])
    : typeof item.query === 'string'
      ? 'search'
      : 'unknown';
  const call: WebToolCall = { itemId: item.id.slice(0, 200), action: type, status };
  if (type === 'search') {
    const query = typeof action.query === 'string' ? action.query : item.query;
    if (typeof query === 'string') call.query = query.slice(0, 4000);
    if (Array.isArray(action.queries))
      call.queries = action.queries
        .filter((v): v is string => typeof v === 'string')
        .slice(0, 12)
        .map((v) => v.slice(0, 2000));
  }
  if ((type === 'openPage' || type === 'findInPage') && typeof action.url === 'string')
    call.url = action.url.slice(0, 4000);
  if (type === 'findInPage' && typeof action.pattern === 'string')
    call.pattern = action.pattern.slice(0, 2000);
  return call;
}
