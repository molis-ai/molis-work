import type { ContextAccess, ContextEdge, ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import type { FeedLedgerPort } from "@molis-ai/molis-work-plugin-feed/store";

/** The key Feed's edge for one key is kept under in the project's ledger: the platform names a plugin's keys `<plugin_id>:<key>` (FI-6, v11). */
export const feedLedgerKey = (key: string): string => `${FEED_PLUGIN_ID}:${key}`;

/**
 * Feed's port over a project's ledger, keeping edges the way the platform keeps a plugin's (`services.contextLedger`): the actor is Feed and
 * each key is under Feed's name, so a test reading the ledger directly sees what the Runtime Feed would have written.
 */
export function feedLedgerPort(ledger: ContextLedgerApi): FeedLedgerPort {
  const prefix = `${FEED_PLUGIN_ID}:`;
  const access = (projectId: string): ContextAccess => ({ actor_id: FEED_PLUGIN_ID, scope: { kind: "personal", id: projectId } });
  const bare = (edge: ContextEdge): ContextEdge => ({ ...edge, key: edge.key.slice(prefix.length) });
  const bareOrNull = (edge: ContextEdge | null) => edge === null ? null : bare(edge);
  return {
    get: (projectId, key) => bareOrNull(ledger.query.get(access(projectId), feedLedgerKey(key))),
    list: (projectId, query) => ledger.query.list(access(projectId), query).filter(edge => edge.key.startsWith(prefix)).map(bare),
    put: (projectId, input) => bare(ledger.commands.put(access(projectId), { ...input, key: feedLedgerKey(input.key) })),
    remove: (projectId, key, cause, recordedAt) => bareOrNull(ledger.commands.remove(access(projectId), feedLedgerKey(key), cause, recordedAt)),
  };
}
