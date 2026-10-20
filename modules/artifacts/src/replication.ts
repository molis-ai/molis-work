import type { ArtifactVersionRecord, ProcessItemRecord } from '@molis-ai/molis-work-contracts/modules/artifacts';
import { ARTIFACT_TABLES, PROCESS_ITEM_TABLES, type ArtifactsSqliteDatabase } from './repository.js';
import type { ArtifactsServiceOptions } from './service.js';
import { createFixedVersionReplication } from './fixed-version-replication.js';
import { validateFixedVersionBundle, type PortableVersionBundle } from './fixed-version-replication-shape.js';

/** Only a trusted personal-space Host constructs this port. No HTTP caller supplies authority. */
export interface ArtifactReplicationContext {
  spaceId: string;
  projectId: string;
  authorize(): void;
}
export type PortableArtifact = PortableVersionBundle<ArtifactVersionRecord>;
export type PortableProcessItem = PortableVersionBundle<ProcessItemRecord>;

/** A trusted Host validates complete decoded content before creating its target project. This performs no writes. */
export function validateArtifactReplication(input: unknown, context: ArtifactReplicationContext): PortableArtifact {
  context.authorize();
  const value = validateFixedVersionBundle<ArtifactVersionRecord>(input, context, true);
  context.authorize(); return value;
}
export function validateProcessItemReplication(input: unknown, context: ArtifactReplicationContext): PortableProcessItem {
  context.authorize();
  const value = validateFixedVersionBundle<ProcessItemRecord>(input, context, false);
  context.authorize(); return value;
}

/** Library versions remain immutable; the existing envelope and public entrypoint retain their shape. */
export function createArtifactReplication(db: ArtifactsSqliteDatabase, context: ArtifactReplicationContext, options: ArtifactsServiceOptions) {
  return createFixedVersionReplication<ArtifactVersionRecord>(db, context, options, ARTIFACT_TABLES);
}
/** Process items use their own owner tables. Restoring a fixed value neither installs nor executes its producer. */
export function createProcessItemReplication(db: ArtifactsSqliteDatabase, context: ArtifactReplicationContext, options: ArtifactsServiceOptions) {
  return createFixedVersionReplication<ProcessItemRecord>(db, context, options, PROCESS_ITEM_TABLES);
}
