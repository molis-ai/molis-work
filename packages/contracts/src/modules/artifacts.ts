import type { ContractDescriptor } from "../platform/package.js";

export const modulesArtifactsContract = {
  contractId: "io.molis.work.module.artifacts.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/artifacts.md",
} as const satisfies ContractDescriptor;

export type ArtifactJsonValue =
  | null
  | boolean
  | number
  | string
  | ArtifactJsonValue[]
  | { [key: string]: ArtifactJsonValue };

export type ArtifactMetadata = Record<string, ArtifactJsonValue>;
export type ArtifactScope = "personal" | "team_project";
export type ArtifactAvailability = "available" | "unavailable";
export type ArtifactLifecycleState = "active" | "archived";

export interface ArtifactReference {
  artifact_id: string;
  version: number;
}

export const ARTIFACT_SUBJECT_KIND = "artifact";

/** A subject names one immutable version, including IDs containing path or version delimiters. */
export function artifactSubjectId(reference: ArtifactReference): string {
  if (typeof reference.artifact_id !== "string" || !reference.artifact_id.trim()
    || !Number.isSafeInteger(reference.version) || reference.version < 1) {
    throw new TypeError("Artifact subject requires an ID and an exact positive version");
  }
  return JSON.stringify([reference.artifact_id, reference.version]);
}

/** Reject implicit latest references and noncanonical aliases of the same subject. */
export function parseArtifactSubjectId(subjectId: string): ArtifactReference | null {
  try {
    const value: unknown = JSON.parse(subjectId);
    if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "string" || !value[0].trim()
      || !Number.isSafeInteger(value[1]) || value[1] < 1) return null;
    const reference = { artifact_id: value[0], version: value[1] as number };
    return artifactSubjectId(reference) === subjectId ? reference : null;
  } catch { return null; }
}

export interface ArtifactProducerIdentity {
  plugin_id: string;
  plugin_version: string;
  binding_signature: string;
}

export interface InlineArtifactContent {
  kind: "inline";
  payload: ArtifactJsonValue;
}

export interface ReferencedArtifactContent {
  kind: "reference";
  content_ref: string;
  /** Digest attested by the Storage/Blob adapter. */
  digest: string;
  size_bytes: number;
  /** Optional observed digest lets the Module reject a caller-side hash mismatch. */
  observed_digest?: string | null;
  available?: boolean;
}

export type ArtifactContentInput = InlineArtifactContent | ReferencedArtifactContent;

export interface ArtifactIdentityRecord {
  board_id: string;
  artifact_id: string;
  owner_actor_id: string;
  producer_plugin_id: string;
  producer_binding_signature: string;
  created_at: string;
}

export interface ArtifactVersionRecord extends ArtifactReference {
  board_id: string;
  artifact_type_id: string;
  schema_version: number;
  producer_plugin_id: string;
  producer_plugin_version: string;
  producer_binding_signature: string;
  owner_actor_id: string;
  content_kind: ArtifactContentInput["kind"];
  payload: ArtifactJsonValue | null;
  content_ref: string | null;
  content_digest: string;
  size_bytes: number;
  metadata: ArtifactMetadata;
  scope: ArtifactScope;
  availability: ArtifactAvailability;
  unavailable_reason: string | null;
  lifecycle_state: ArtifactLifecycleState;
  supersedes_version: number | null;
  created_by: string;
  created_at: string;
  archived_at: string | null;
  archived_by: string | null;
}

export interface RegisterArtifactVersionInput extends ArtifactReference {
  board_id: string;
  actor_id: string;
  artifact_type_id: string;
  schema_version: number;
  producer: ArtifactProducerIdentity;
  content: ArtifactContentInput;
  expected_digest?: string | null;
  metadata?: ArtifactMetadata;
  scope?: ArtifactScope;
  /** Required only when the user or Team authority explicitly publishes this version. */
  team_share_authorized?: boolean;
  supersedes_version?: number | null;
}

export interface MarkArtifactUnavailableInput extends ArtifactReference {
  board_id: string;
  actor_id: string;
  reason: string;
}

export interface ArchiveArtifactVersionInput extends ArtifactReference {
  board_id: string;
  actor_id: string;
}

export interface ArtifactVersionResult {
  artifact: ArtifactVersionRecord;
  observed_event_cursor: number;
  replayed: boolean;
}

export interface ArtifactListQuery {
  artifact_type_id?: string;
  schema_version?: number;
  scope?: ArtifactScope;
  lifecycle_state?: ArtifactLifecycleState;
}

export interface ArtifactConsumerType {
  artifact_type_id: string;
  schema_version: number;
}

export interface ArtifactConsumptionCompatibility {
  artifact: ArtifactReference;
  consumable: boolean;
  reason: "compatible_consumer" | "consumer_missing" | "artifact_unavailable" | "artifact_archived";
}

export interface ArtifactsQueryApi {
  getArtifactVersion(boardId: string, reference: ArtifactReference): ArtifactVersionRecord | null;
  listArtifactVersions(boardId: string, artifactId: string): ArtifactVersionRecord[];
  latestArtifactVersion(boardId: string, artifactId: string): ArtifactVersionRecord | null;
  listArtifacts(boardId: string, query?: ArtifactListQuery): ArtifactVersionRecord[];
  consumptionCompatibility(
    boardId: string,
    reference: ArtifactReference,
    supportedTypes: ArtifactConsumerType[],
  ): ArtifactConsumptionCompatibility;
}

export interface ArtifactsCommandApi {
  registerVersion(input: RegisterArtifactVersionInput): ArtifactVersionResult;
  markUnavailable(input: MarkArtifactUnavailableInput): ArtifactVersionResult;
  archiveVersion(input: ArchiveArtifactVersionInput): ArtifactVersionResult;
}

export interface ArtifactsApplicationApi {
  query: ArtifactsQueryApi;
  commands: ArtifactsCommandApi;
}
