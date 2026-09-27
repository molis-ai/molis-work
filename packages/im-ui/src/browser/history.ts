import type { ImMessage, ImMessagePage } from '@molis-ai/molis-work-contracts/services/im';
import type { Api } from './types.js';
/** One continuous history window, including messages received while a topic was away. */
export function createHistory(api: Api) {
  const coveredThrough = new Map<string, number>();
  const merge = (old: ImMessage[], next: ImMessage[]): ImMessage[] => [...new Map([...old, ...next].map(message => [message.id, message])).values()].sort((a, b) => a.sequence - b.sequence);
  async function latest(path: string, existing: ImMessage[], oldest: ImMessagePage | null, current: () => boolean): Promise<ImMessagePage> {
    let batch = await api<ImMessagePage>(path + '/messages');
    let messages = batch.messages;
    const newest = messages.at(-1)?.sequence;
    // A send acknowledgement may be newer than many unread remote messages.
    // Only a completed history fetch can advance the catchup boundary.
    const boundary = existing.length ? coveredThrough.get(path) ?? oldest?.messages.at(-1)?.sequence : undefined;
    while (boundary !== undefined && batch.has_more && batch.messages[0]!.sequence > boundary && current()) {
      batch = await api<ImMessagePage>(path + '/messages?before=' + batch.next_before);
      messages = merge(batch.messages, messages);
    }
    // The pagination cursor belongs to the oldest covered page, not the newest fetch.
    const retained = existing[0]?.sequence;
    const fetched = messages[0]?.sequence;
    const cursor = oldest && retained !== undefined && fetched !== undefined && retained < fetched ? oldest : batch;
    if (current() && newest !== undefined) {
      coveredThrough.set(path, existing.length ? Math.max(coveredThrough.get(path) ?? 0, newest) : newest);
    }
    return { messages: merge(existing, messages), has_more: cursor.has_more, next_before: cursor.next_before };
  }
  return { merge, latest, reset: () => coveredThrough.clear() };
}
