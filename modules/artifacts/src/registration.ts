import type {
  ArtifactScope,
  FixedVersionRecord,
  RecordFixedVersionInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

import { artifactContentDigest, artifactContentSize, canonicalArtifactJson, normalizeArtifactPayload } from "./content.js";
import type { ArtifactsErrorFactory } from "./errors.js";
import { libraryFields, nonNegativeInteger, normalizedDigest, normalizedMetadata, positiveInteger, requiredText } from "./validation.js";

/** What a registration is checked against: how to report, whether it is the 成果库 (which also records origin and title), and how an owner reads. */
export interface RegistrationContext {
  error: ArtifactsErrorFactory;
  library: boolean;
  readOwner(stored: string, scope: ArtifactScope): string;
}

/** A registration checked and shaped into the version it will be written as; the store's own rules (identity, order) apply after. */
export function normalizeRegistration<R extends FixedVersionRecord, I extends RecordFixedVersionInput>(
  input: I, { error, library, readOwner }: RegistrationContext,
): Omit<R, "created_at"> {
  const projectId = requiredText(input.project_id, "project_id", error);
  const artifactId = requiredText(input.artifact_id, "artifact_id", error);
  const actorId = requiredText(input.actor_id, "actor_id", error);
  const artifactTypeId = requiredText(input.artifact_type_id, "artifact_type_id", error);
  const version = positiveInteger(input.version, "version", error);
  const schemaVersion = positiveInteger(input.schema_version, "schema_version", error);
  const pluginId = requiredText(input.producer?.plugin_id, "producer.plugin_id", error);
  const pluginVersion = requiredText(input.producer?.plugin_version, "producer.plugin_version", error);
  const bindingSignature = requiredText(
    input.producer?.binding_signature,
    "producer.binding_signature",
    error,
  );
  const scope = input.scope ?? "personal";
  if (scope !== "personal" && scope !== "team_project") {
    throw error("artifact.scope_invalid", "成果 scope 无效");
  }
  if (scope === "team_project" && input.team_share_authorized !== true) {
    throw error(
      "artifact.team_share_not_authorized",
      "共享到 Team Project 需要用户或 Team 的明确授权",
    );
  }

  const ownerActorId = ownerOf(input, scope, actorId, readOwner, error);

  let payload: FixedVersionRecord["payload"] = null;
  let contentRef: string | null = null;
  let digest: string;
  let sizeBytes: number;
  let availability: FixedVersionRecord["availability"] = "available";
  let unavailableReason: string | null = null;
  if (input.content.kind === "inline") {
    try {
      payload = normalizeArtifactPayload(input.content.payload);
    } catch (failure) {
      throw error("artifact.payload_invalid", "成果 inline payload 不是可往返的 JSON", {
        cause: failure instanceof Error ? failure.message : String(failure),
      });
    }
    const serialized = canonicalArtifactJson(payload);
    digest = artifactContentDigest(serialized);
    sizeBytes = artifactContentSize(serialized);
  } else if (input.content.kind === "reference") {
    contentRef = requiredText(input.content.content_ref, "content.content_ref", error);
    digest = normalizedDigest(input.content.digest, "content.digest", error);
    sizeBytes = nonNegativeInteger(input.content.size_bytes, "content.size_bytes", error);
    if (input.content.observed_digest) {
      const observed = normalizedDigest(input.content.observed_digest, "content.observed_digest", error);
      if (observed !== digest) {
        throw error("artifact.hash_mismatch", "Storage 返回的内容摘要与 成果 Envelope 不一致");
      }
    }
    if (input.content.available === false) {
      availability = "unavailable";
      unavailableReason = "Content reference 在注册时不可读取";
    }
  } else {
    throw error("artifact.content_invalid", "成果 content kind 无效");
  }
  if (input.expected_digest) {
    const expected = normalizedDigest(input.expected_digest, "expected_digest", error);
    if (expected !== digest) {
      throw error("artifact.hash_mismatch", "成果内容摘要与 expected_digest 不一致");
    }
  }

  const base: Omit<FixedVersionRecord, "created_at"> = {
    project_id: projectId,
    artifact_id: artifactId,
    version,
    artifact_type_id: artifactTypeId,
    schema_version: schemaVersion,
    producer_plugin_id: pluginId,
    producer_plugin_version: pluginVersion,
    producer_binding_signature: bindingSignature,
    owner_actor_id: ownerActorId,
    content_kind: input.content.kind,
    payload,
    content_ref: contentRef,
    content_digest: digest,
    size_bytes: sizeBytes,
    metadata: normalizedMetadata(input.metadata, error),
    scope,
    availability,
    unavailable_reason: unavailableReason,
    lifecycle_state: "active",
    supersedes_version: input.supersedes_version == null
      ? null
      : positiveInteger(input.supersedes_version, "supersedes_version", error),
    created_by: actorId,
    archived_at: null,
    archived_by: null,
  };
  // The 成果库 also keeps what people see: where the version came from, its title and its real media type (A1).
  return (library ? { ...base, ...libraryFields(input, error) } : base) as Omit<R, "created_at">;
}

/**
 * Who a registration belongs to: the owner it names, else its producer. In a Home that names its owner every personal 成果
 * belongs to that person, so a registration naming anyone else as the owner of a personal version is refused.
 */
function ownerOf(input: RecordFixedVersionInput, scope: ArtifactScope, actorId: string,
  readOwner: RegistrationContext["readOwner"], error: ArtifactsErrorFactory): string {
  const named = input.owner_actor_id === undefined ? undefined : requiredText(input.owner_actor_id, "owner_actor_id", error);
  const owner = readOwner(named ?? actorId, scope);
  if (named !== undefined && owner !== named) {
    throw error("artifact.owner_invalid", "这个 Home 里的个人成果属于本机的人", { owner_actor_id: named, home_owner: owner });
  }
  return owner;
}
