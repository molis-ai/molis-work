import { CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE } from "@molis-ai/molis-work-contracts/modules/characters";
import type { SyncSelection } from "@molis-ai/molis-work-module-sync-replication";

/** Platform-owned stores retain their consent identities without impersonating Runtime plugins. */
export interface PlatformSyncCollection {
  readonly selection: SyncSelection;
  readonly title: string;
  readonly owner: "artifacts" | "characters";
  readonly store: "library" | "process" | "characters";
}
export const PLATFORM_SYNC_COLLECTIONS: readonly PlatformSyncCollection[] = [
  { owner: "artifacts", store: "library", title: "成果及固定版本", selection: { plugin_id: "io.molis.work.artifacts", publisher_id: "molis", publisher_signature: "official-artifacts-binding", collection_id: "versions", schema_version: 1 } },
  { owner: "artifacts", store: "process", title: "过程材料与固定版本", selection: { plugin_id: "io.molis.work.artifacts", publisher_id: "molis", publisher_signature: "official-artifacts-binding", collection_id: "process_items", schema_version: 1 } },
  { owner: "characters", store: "characters", title: "角色草稿", selection: { plugin_id: CHARACTER_PLUGIN_ID, publisher_id: "molis", publisher_signature: CHARACTER_PUBLISHER_SIGNATURE, collection_id: "drafts", schema_version: 1 } },
];
