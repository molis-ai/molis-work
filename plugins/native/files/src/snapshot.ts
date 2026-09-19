/** The snapshot every downstream comparison is built from. Defined in Contracts. */
export {
  FILE_SNAPSHOT_MAX_INLINE_BYTES,
  FILE_SNAPSHOT_SCHEMA_VERSION,
  FILE_SNAPSHOT_TYPE,
  fileSnapshotFitsInline,
  fileSnapshotInlineBytes,
  parseFileSnapshot,
  pathLabel as snapshotLabelOf,
  type FileSnapshot,
  type FileSnapshotWorkspaceRef,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

import { pathLabel, type FileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

export function snapshotLabel(snapshot: FileSnapshot): string {
  return pathLabel(snapshot.path);
}
