import type {
  ArchiveArtifactVersionInput,
  ArtifactConsumptionCompatibility,
  ArtifactConsumerType,
  ArtifactIdentityRecord,
  ArtifactListQuery,
  ArtifactReference,
  ArtifactsCommandApi,
  ArtifactsQueryApi,
  ArtifactVersionRecord,
  ArtifactVersionResult,
  MarkArtifactUnavailableInput,
  RegisterArtifactVersionInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

import {
  artifactContentDigest,
  artifactContentSize,
  canonicalArtifactJson,
  normalizeArtifactMetadata,
  normalizeArtifactPayload,
} from "./content.js";
import {
  defaultArtifactsErrorFactory,
  type ArtifactsErrorFactory,
} from "./errors.js";
import { ArtifactsRepository } from "./repository.js";

export interface ArtifactEventInput {
  eventId: string;
  boardId: string;
  actorId: string;
  type: string;
  objectType: "artifact";
  objectId: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

export interface ArtifactsServiceOptions {
  now?: () => string;
  errorFactory?: ArtifactsErrorFactory;
  appendEvent: (input: ArtifactEventInput) => number;
}

export class ArtifactsService implements ArtifactsQueryApi, ArtifactsCommandApi {
  private readonly now: () => string;
  private readonly error: ArtifactsErrorFactory;

  constructor(
    readonly repository: ArtifactsRepository,
    private readonly options: ArtifactsServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.error = options.errorFactory ?? defaultArtifactsErrorFactory;
  }

  getArtifactVersion(boardId: string, reference: ArtifactReference): ArtifactVersionRecord | null {
    return this.repository.getVersion(boardId, reference.artifact_id, reference.version);
  }

  listArtifactVersions(boardId: string, artifactId: string): ArtifactVersionRecord[] {
    return this.repository.listVersions(boardId, artifactId);
  }

  latestArtifactVersion(boardId: string, artifactId: string): ArtifactVersionRecord | null {
    return this.repository.latestVersion(boardId, artifactId);
  }

  listArtifacts(boardId: string, query?: ArtifactListQuery): ArtifactVersionRecord[] {
    return this.repository.listArtifacts(boardId, query);
  }

  consumptionCompatibility(
    boardId: string,
    reference: ArtifactReference,
    supportedTypes: ArtifactConsumerType[],
  ): ArtifactConsumptionCompatibility {
    const artifact = this.requireVersion(boardId, reference);
    if (artifact.lifecycle_state === "archived") {
      return { artifact: reference, consumable: false, reason: "artifact_archived" };
    }
    if (artifact.availability === "unavailable") {
      return { artifact: reference, consumable: false, reason: "artifact_unavailable" };
    }
    const compatible = supportedTypes.some((candidate) =>
      candidate.artifact_type_id === artifact.artifact_type_id
      && candidate.schema_version === artifact.schema_version);
    return {
      artifact: reference,
      consumable: compatible,
      reason: compatible ? "compatible_consumer" : "consumer_missing",
    };
  }

  registerVersion(input: RegisterArtifactVersionInput): ArtifactVersionResult {
    const normalized = this.normalizeRegistration(input);
    return this.repository.immediate(() => {
      const globalIdentity = this.repository.getIdentityById(normalized.artifact_id);
      if (globalIdentity && globalIdentity.board_id !== normalized.board_id) {
        throw this.error("artifact.board_mismatch", "Artifact ID 已属于另一个 Project", {
          artifact_id: normalized.artifact_id,
        });
      }
      let identity = globalIdentity;
      if (identity) this.assertIdentity(identity, normalized);

      const existing = this.repository.getVersion(
        normalized.board_id,
        normalized.artifact_id,
        normalized.version,
      );
      if (existing) {
        if (!sameVersion(existing, normalized)) {
          throw this.error("artifact.version_conflict", "同一 Artifact id + version 已有不同内容", {
            artifact_id: normalized.artifact_id,
            version: normalized.version,
          });
        }
        return {
          artifact: existing,
          observed_event_cursor: this.repository.eventCursor(normalized.board_id),
          replayed: true,
        };
      }

      const latest = this.repository.latestVersion(normalized.board_id, normalized.artifact_id);
      if (latest && normalized.version <= latest.version) {
        throw this.error("artifact.version_not_increasing", "Artifact version 必须由 Plugin 严格递增", {
          artifact_id: normalized.artifact_id,
          latest_version: latest.version,
          requested_version: normalized.version,
        });
      }
      if (normalized.supersedes_version !== null) {
        if (normalized.supersedes_version >= normalized.version) {
          throw this.error("artifact.supersession_invalid", "supersedes_version 必须早于当前 version");
        }
        if (!this.repository.getVersion(
          normalized.board_id,
          normalized.artifact_id,
          normalized.supersedes_version,
        )) {
          throw this.error("artifact.supersession_missing", "找不到被替代的 Artifact version");
        }
      }

      const at = this.now();
      if (!identity) {
        identity = {
          board_id: normalized.board_id,
          artifact_id: normalized.artifact_id,
          owner_actor_id: normalized.owner_actor_id,
          producer_plugin_id: normalized.producer_plugin_id,
          producer_binding_signature: normalized.producer_binding_signature,
          created_at: at,
        };
        this.repository.insertIdentity(identity);
      }
      const record: ArtifactVersionRecord = { ...normalized, created_at: at };
      this.repository.insertVersion(record);
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:artifact:${record.artifact_id}:${record.version}:registered`,
        boardId: record.board_id,
        actorId: record.created_by,
        type: latest ? "artifact.version_registered" : "artifact.published",
        objectType: "artifact",
        objectId: `${record.artifact_id}@${record.version}`,
        reason: latest ? "Plugin 注册了新的 Artifact version" : "Plugin 发布了 Artifact",
        payload: {
          artifact_id: record.artifact_id,
          version: record.version,
          artifact_type_id: record.artifact_type_id,
          schema_version: record.schema_version,
          scope: record.scope,
          content_digest: record.content_digest,
        },
        at,
      });
      return { artifact: record, observed_event_cursor: observedEventCursor, replayed: false };
    });
  }

  markUnavailable(input: MarkArtifactUnavailableInput): ArtifactVersionResult {
    const reason = requiredText(input.reason, "reason", this.error);
    return this.repository.immediate(() => {
      const artifact = this.requireOwnedVersion(input.board_id, input, input.actor_id);
      if (artifact.availability === "unavailable") {
        return {
          artifact,
          observed_event_cursor: this.repository.eventCursor(input.board_id),
          replayed: true,
        };
      }
      this.repository.markUnavailable(input.artifact_id, input.version, reason);
      const at = this.now();
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:artifact:${input.artifact_id}:${input.version}:unavailable`,
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "artifact.unavailable",
        objectType: "artifact",
        objectId: `${input.artifact_id}@${input.version}`,
        reason,
        payload: { artifact_id: input.artifact_id, version: input.version },
        at,
      });
      return {
        artifact: this.requireVersion(input.board_id, input),
        observed_event_cursor: observedEventCursor,
        replayed: false,
      };
    });
  }

  archiveVersion(input: ArchiveArtifactVersionInput): ArtifactVersionResult {
    return this.repository.immediate(() => {
      const artifact = this.requireOwnedVersion(input.board_id, input, input.actor_id);
      if (artifact.lifecycle_state === "archived") {
        return {
          artifact,
          observed_event_cursor: this.repository.eventCursor(input.board_id),
          replayed: true,
        };
      }
      const at = this.now();
      this.repository.archiveVersion(input.artifact_id, input.version, input.actor_id, at);
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:artifact:${input.artifact_id}:${input.version}:archived`,
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "artifact.archived",
        objectType: "artifact",
        objectId: `${input.artifact_id}@${input.version}`,
        reason: "Artifact version 已归档",
        payload: { artifact_id: input.artifact_id, version: input.version },
        at,
      });
      return {
        artifact: this.requireVersion(input.board_id, input),
        observed_event_cursor: observedEventCursor,
        replayed: false,
      };
    });
  }

  private normalizeRegistration(input: RegisterArtifactVersionInput): Omit<ArtifactVersionRecord, "created_at"> {
    const boardId = requiredText(input.board_id, "board_id", this.error);
    const artifactId = requiredText(input.artifact_id, "artifact_id", this.error);
    const actorId = requiredText(input.actor_id, "actor_id", this.error);
    const artifactTypeId = requiredText(input.artifact_type_id, "artifact_type_id", this.error);
    const version = positiveInteger(input.version, "version", this.error);
    const schemaVersion = positiveInteger(input.schema_version, "schema_version", this.error);
    const pluginId = requiredText(input.producer?.plugin_id, "producer.plugin_id", this.error);
    const pluginVersion = requiredText(input.producer?.plugin_version, "producer.plugin_version", this.error);
    const bindingSignature = requiredText(
      input.producer?.binding_signature,
      "producer.binding_signature",
      this.error,
    );
    const scope = input.scope ?? "personal";
    if (scope !== "personal" && scope !== "team_project") {
      throw this.error("artifact.scope_invalid", "Artifact scope 无效");
    }
    if (scope === "team_project" && input.team_share_authorized !== true) {
      throw this.error(
        "artifact.team_share_not_authorized",
        "共享到 Team Project 需要用户或 Team 的明确授权",
      );
    }

    let payload: ArtifactVersionRecord["payload"] = null;
    let contentRef: string | null = null;
    let digest: string;
    let sizeBytes: number;
    let availability: ArtifactVersionRecord["availability"] = "available";
    let unavailableReason: string | null = null;
    if (input.content.kind === "inline") {
      try {
        payload = normalizeArtifactPayload(input.content.payload);
      } catch (error) {
        throw this.error("artifact.payload_invalid", "Artifact inline payload 不是可往返的 JSON", {
          cause: error instanceof Error ? error.message : String(error),
        });
      }
      const serialized = canonicalArtifactJson(payload);
      digest = artifactContentDigest(serialized);
      sizeBytes = artifactContentSize(serialized);
    } else if (input.content.kind === "reference") {
      contentRef = requiredText(input.content.content_ref, "content.content_ref", this.error);
      digest = normalizedDigest(input.content.digest, "content.digest", this.error);
      sizeBytes = nonNegativeInteger(input.content.size_bytes, "content.size_bytes", this.error);
      if (input.content.observed_digest) {
        const observed = normalizedDigest(input.content.observed_digest, "content.observed_digest", this.error);
        if (observed !== digest) {
          throw this.error("artifact.hash_mismatch", "Storage 返回的内容摘要与 Artifact Envelope 不一致");
        }
      }
      if (input.content.available === false) {
        availability = "unavailable";
        unavailableReason = "Content reference 在注册时不可读取";
      }
    } else {
      throw this.error("artifact.content_invalid", "Artifact content kind 无效");
    }
    if (input.expected_digest) {
      const expected = normalizedDigest(input.expected_digest, "expected_digest", this.error);
      if (expected !== digest) {
        throw this.error("artifact.hash_mismatch", "Artifact 内容摘要与 expected_digest 不一致");
      }
    }

    return {
      board_id: boardId,
      artifact_id: artifactId,
      version,
      artifact_type_id: artifactTypeId,
      schema_version: schemaVersion,
      producer_plugin_id: pluginId,
      producer_plugin_version: pluginVersion,
      producer_binding_signature: bindingSignature,
      owner_actor_id: actorId,
      content_kind: input.content.kind,
      payload,
      content_ref: contentRef,
      content_digest: digest,
      size_bytes: sizeBytes,
      metadata: this.normalizeMetadata(input.metadata),
      scope,
      availability,
      unavailable_reason: unavailableReason,
      lifecycle_state: "active",
      supersedes_version: input.supersedes_version == null
        ? null
        : positiveInteger(input.supersedes_version, "supersedes_version", this.error),
      created_by: actorId,
      archived_at: null,
      archived_by: null,
    };
  }

  private assertIdentity(
    identity: ArtifactIdentityRecord,
    input: Omit<ArtifactVersionRecord, "created_at">,
  ): void {
    if (identity.owner_actor_id !== input.created_by) {
      throw this.error("artifact.not_owner", "只有 Artifact owner 可以注册新 version", {
        owner_actor_id: identity.owner_actor_id,
        actor_id: input.created_by,
      });
    }
    if (
      identity.producer_plugin_id !== input.producer_plugin_id
      || identity.producer_binding_signature !== input.producer_binding_signature
    ) {
      throw this.error(
        "artifact.producer_mismatch",
        "Producer binding 已变化，请将结果作为新的 Artifact 处理",
      );
    }
  }

  private normalizeMetadata(value: unknown): ArtifactVersionRecord["metadata"] {
    try {
      return normalizeArtifactMetadata(value);
    } catch (error) {
      throw this.error("artifact.metadata_invalid", "Artifact metadata 必须是可往返的 JSON 对象", {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private requireVersion(boardId: string, reference: ArtifactReference): ArtifactVersionRecord {
    const artifact = this.repository.getVersion(boardId, reference.artifact_id, reference.version);
    if (!artifact) throw this.error("artifact.not_found", "找不到 Artifact version");
    return artifact;
  }

  private requireOwnedVersion(
    boardId: string,
    reference: ArtifactReference,
    actorId: string,
  ): ArtifactVersionRecord {
    const artifact = this.requireVersion(boardId, reference);
    if (artifact.owner_actor_id !== actorId) {
      throw this.error("artifact.not_owner", "只有 Artifact owner 可以修改版本状态");
    }
    return artifact;
  }
}

function sameVersion(
  existing: ArtifactVersionRecord,
  requested: Omit<ArtifactVersionRecord, "created_at">,
): boolean {
  const {
    created_at: _createdAt,
    availability: _Availability,
    unavailable_reason: _UnavailableReason,
    lifecycle_state: _LifecycleState,
    archived_at: _ArchivedAt,
    archived_by: _ArchivedBy,
    ...existingEnvelope
  } = existing;
  const {
    availability: _RequestedAvailability,
    unavailable_reason: _RequestedUnavailableReason,
    lifecycle_state: _RequestedLifecycleState,
    archived_at: _RequestedArchivedAt,
    archived_by: _RequestedArchivedBy,
    ...requestedEnvelope
  } = requested;
  return JSON.stringify(existingEnvelope) === JSON.stringify(requestedEnvelope);
}

function requiredText(
  value: unknown,
  path: string,
  error: ArtifactsErrorFactory,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw error("artifact.input_invalid", `${path} 不能为空`, { path });
  return normalized;
}

function positiveInteger(value: unknown, path: string, error: ArtifactsErrorFactory): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw error("artifact.input_invalid", `${path} 必须是正整数`, { path });
  }
  return Number(value);
}

function nonNegativeInteger(value: unknown, path: string, error: ArtifactsErrorFactory): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw error("artifact.input_invalid", `${path} 必须是非负整数`, { path });
  }
  return Number(value);
}

function normalizedDigest(value: unknown, path: string, error: ArtifactsErrorFactory): string {
  const digest = requiredText(value, path, error).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) {
    throw error("artifact.digest_invalid", `${path} 必须是 sha256 digest`, { path });
  }
  return digest;
}
