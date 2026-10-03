import type {
  ArchiveArtifactVersionInput,
  ArtifactConsumptionCompatibility,
  ArtifactConsumerType,
  ArtifactIdentityRecord,
  ArtifactListQuery,
  ArtifactOrigin,
  ArtifactReference,
  ArtifactVersionRecord,
  FixedVersionCommandApi,
  FixedVersionQueryApi,
  FixedVersionRecord,
  FixedVersionResult,
  MarkArtifactUnavailableInput,
  RecordFixedVersionInput,
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
  objectType: VersionStoreKind;
  objectId: string;
  reason: string;
  payload: Record<string, unknown>;
  at: string;
}

/** Which store a service writes: the 成果库, or the process items plugins pass between each other. */
export type VersionStoreKind = "artifact" | "process_item";

const STORE_EVENT_REASONS: Record<VersionStoreKind, { published: string; registered: string; archived: string }> = {
  artifact: { published: "Plugin 发布了成果", registered: "Plugin 注册了新的成果版本", archived: "成果版本已归档" },
  process_item: { published: "插件记下了过程项", registered: "插件记下了过程项的新版本", archived: "过程项版本已归档" },
};

export interface ArtifactsServiceOptions {
  /** Defaults to the 成果库. */
  kind?: VersionStoreKind;
  now?: () => string;
  errorFactory?: ArtifactsErrorFactory;
  appendEvent: (input: ArtifactEventInput) => number;
}

export class ArtifactsService<
  R extends FixedVersionRecord = ArtifactVersionRecord,
  I extends RecordFixedVersionInput = RegisterArtifactVersionInput,
> implements FixedVersionQueryApi<R>, FixedVersionCommandApi<R, I> {
  private readonly now: () => string;
  private readonly error: ArtifactsErrorFactory;
  private readonly kind: VersionStoreKind;

  constructor(
    readonly repository: ArtifactsRepository<R>,
    private readonly options: ArtifactsServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.error = options.errorFactory ?? defaultArtifactsErrorFactory;
    this.kind = options.kind ?? "artifact";
  }

  getArtifactVersion(boardId: string, reference: ArtifactReference): R | null {
    return this.repository.getVersion(boardId, reference.artifact_id, reference.version);
  }

  listArtifactVersions(boardId: string, artifactId: string): R[] {
    return this.repository.listVersions(boardId, artifactId);
  }

  latestArtifactVersion(boardId: string, artifactId: string): R | null {
    return this.repository.latestVersion(boardId, artifactId);
  }

  listArtifacts(boardId: string, query?: ArtifactListQuery): R[] {
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

  registerVersion(input: I): FixedVersionResult<R> {
    const normalized = this.normalizeRegistration(input);
    return this.repository.immediate(() => {
      const globalIdentity = this.repository.getIdentityById(normalized.artifact_id);
      if (globalIdentity && globalIdentity.board_id !== normalized.board_id) {
        throw this.error("artifact.board_mismatch", "成果 ID 已属于另一个 Project", {
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
          throw this.error("artifact.version_conflict", "同一成果 id + version 已有不同内容", {
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
        throw this.error("artifact.version_not_increasing", "成果版本必须由 Plugin 严格递增", {
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
          throw this.error("artifact.supersession_missing", "找不到被替代的成果版本");
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
      const record = { ...normalized, created_at: at } as R;
      this.repository.insertVersion(record);
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:${this.kind}:${record.artifact_id}:${record.version}:registered`,
        boardId: record.board_id,
        actorId: record.created_by,
        type: latest ? `${this.kind}.version_registered` : `${this.kind}.published`,
        objectType: this.kind,
        objectId: `${record.artifact_id}@${record.version}`,
        reason: latest ? STORE_EVENT_REASONS[this.kind].registered : STORE_EVENT_REASONS[this.kind].published,
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

  markUnavailable(input: MarkArtifactUnavailableInput): FixedVersionResult<R> {
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
        eventId: `event:${this.kind}:${input.artifact_id}:${input.version}:unavailable`,
        boardId: input.board_id,
        actorId: input.actor_id,
        type: `${this.kind}.unavailable`,
        objectType: this.kind,
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

  archiveVersion(input: ArchiveArtifactVersionInput): FixedVersionResult<R> {
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
        eventId: `event:${this.kind}:${input.artifact_id}:${input.version}:archived`,
        boardId: input.board_id,
        actorId: input.actor_id,
        type: `${this.kind}.archived`,
        objectType: this.kind,
        objectId: `${input.artifact_id}@${input.version}`,
        reason: STORE_EVENT_REASONS[this.kind].archived,
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

  private normalizeRegistration(input: I): Omit<R, "created_at"> {
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
      throw this.error("artifact.scope_invalid", "成果 scope 无效");
    }
    if (scope === "team_project" && input.team_share_authorized !== true) {
      throw this.error(
        "artifact.team_share_not_authorized",
        "共享到 Team Project 需要用户或 Team 的明确授权",
      );
    }

    let payload: FixedVersionRecord["payload"] = null;
    let contentRef: string | null = null;
    let digest: string;
    let sizeBytes: number;
    let availability: FixedVersionRecord["availability"] = "available";
    let unavailableReason: string | null = null;
    if (input.content.kind === "inline") {
      try {
        payload = normalizeArtifactPayload(input.content.payload);
      } catch (error) {
        throw this.error("artifact.payload_invalid", "成果 inline payload 不是可往返的 JSON", {
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
          throw this.error("artifact.hash_mismatch", "Storage 返回的内容摘要与 成果 Envelope 不一致");
        }
      }
      if (input.content.available === false) {
        availability = "unavailable";
        unavailableReason = "Content reference 在注册时不可读取";
      }
    } else {
      throw this.error("artifact.content_invalid", "成果 content kind 无效");
    }
    if (input.expected_digest) {
      const expected = normalizedDigest(input.expected_digest, "expected_digest", this.error);
      if (expected !== digest) {
        throw this.error("artifact.hash_mismatch", "成果内容摘要与 expected_digest 不一致");
      }
    }

    const base: Omit<FixedVersionRecord, "created_at"> = {
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
      metadata: normalizedMetadata(input.metadata, this.error),
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
    if (!this.repository.tables.library) return base as Omit<R, "created_at">;
    // The 成果库 keeps what people see: where the version came from, its title and its real media type (A1).
    const library = input as unknown as RegisterArtifactVersionInput;
    return {
      ...base,
      origin: this.normalizeOrigin(library.origin),
      title: boundedText(library.title, "title", 200, this.error),
      media_type: mediaType(library.media_type, this.error),
      trace: this.normalizeTrace(library.trace),
    } as unknown as Omit<R, "created_at">;
  }

  private normalizeOrigin(value: unknown): ArtifactOrigin {
    const origin = value as Partial<ArtifactOrigin> | null | undefined;
    if (origin?.kind === "pinned") {
      const subject = (origin as { subject?: { kind?: unknown; id?: unknown } }).subject;
      return { kind: "pinned", subject: { kind: requiredText(subject?.kind, "origin.subject.kind", this.error),
        id: requiredText(subject?.id, "origin.subject.id", this.error) },
        revision: boundedText((origin as { revision?: unknown }).revision, "origin.revision", 200, this.error) };
    }
    if (origin?.kind === "imported") {
      return { kind: "imported", file_name: boundedText((origin as { file_name?: unknown }).file_name, "origin.file_name", 255, this.error) };
    }
    throw this.error("artifact.origin_invalid", "成果必须写明来源：固定下来的工作对象，或导入的文件");
  }

  private normalizeTrace(value: unknown): ArtifactReference[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw this.error("artifact.input_invalid", "trace 必须是过程项引用的列表", { path: "trace" });
    return value.map((item: { artifact_id?: unknown; version?: unknown } | null, index) => ({
      artifact_id: requiredText(item?.artifact_id, `trace[${index}].artifact_id`, this.error),
      version: positiveInteger(item?.version, `trace[${index}].version`, this.error),
    }));
  }

  private assertIdentity(
    identity: ArtifactIdentityRecord,
    input: Omit<FixedVersionRecord, "created_at">,
  ): void {
    if (identity.owner_actor_id !== input.created_by) {
      throw this.error("artifact.not_owner", "只有成果 owner 可以注册新 version", {
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
        "Producer binding 已变化，请将结果作为新的成果处理",
      );
    }
  }

  private requireVersion(boardId: string, reference: ArtifactReference): R {
    const artifact = this.repository.getVersion(boardId, reference.artifact_id, reference.version);
    if (!artifact) throw this.error("artifact.not_found", "找不到成果版本");
    return artifact;
  }

  private requireOwnedVersion(
    boardId: string,
    reference: ArtifactReference,
    actorId: string,
  ): R {
    const artifact = this.requireVersion(boardId, reference);
    if (artifact.owner_actor_id !== actorId) {
      throw this.error("artifact.not_owner", "只有成果 owner 可以修改版本状态");
    }
    return artifact;
  }
}

function sameVersion(
  existing: FixedVersionRecord,
  requested: Omit<FixedVersionRecord, "created_at">,
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

function normalizedMetadata(value: unknown, error: ArtifactsErrorFactory): ArtifactVersionRecord["metadata"] {
  try {
    return normalizeArtifactMetadata(value);
  } catch (cause) {
    throw error("artifact.metadata_invalid", "成果 metadata 必须是可往返的 JSON 对象", {
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }
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

function boundedText(value: unknown, path: string, limit: number, error: ArtifactsErrorFactory): string {
  const text = requiredText(value, path, error);
  if (text.length > limit) throw error("artifact.input_invalid", `${path} 不能超过 ${limit} 个字符`, { path });
  return text;
}

/** A real media type such as `text/markdown`; parameters are not part of what a 成果 records. */
function mediaType(value: unknown, error: ArtifactsErrorFactory): string {
  const text = requiredText(value, "media_type", error).toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(text)) {
    throw error("artifact.input_invalid", "media_type 必须是 类型/子类型，例如 text/markdown", { path: "media_type" });
  }
  return text;
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
