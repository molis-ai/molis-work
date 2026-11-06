import type {SpaceSyncPolicy} from '@molis-ai/molis-work-contracts/modules/sync-replication';
/** Exact publisher, collection and format identity; no display-name or array-position inference. */
export const syncNamespace=(s:SpaceSyncPolicy['selections'][number])=>JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,s.schema_version]);
