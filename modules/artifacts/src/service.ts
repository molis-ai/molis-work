import type {
  ArchiveArtifactVersionInput,
  ArtifactConsumptionCompatibility,
  ArtifactConsumerType,
  ArtifactIdentityRecord,
  ArtifactListQuery,
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
  defaultArtifactsErrorFactory,
  type ArtifactsErrorFactory,
} from "./errors.js";
import { ArtifactsRepository } from "./repository.js";
import { normalizeRegistration } from "./registration.js";
import { requiredText } from "./validation.js";

export interface ArtifactEventInput {
  eventId: string;
  projectId: string;
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
  /**
   * Whether the producer declared this type for this store (specs/artifact-positioning A7): a problem to refuse the write
   * with, or null. The host answers from the Manifests it knows; without it every declared-or-not type is written.
   */
  declared?: (producer: { plugin_id: string }, type: { artifact_type_id: string; schema_version: number }, kind: VersionStoreKind) => string | null;
}

/** A write the host's Manifest check refuses never reaches the store (specs/artifact-positioning A7). */
function declaredOnly<T extends { producer_plugin_id: string; artifact_type_id: string; schema_version: number }>(normalized: T,
  declared: ArtifactsServiceOptions["declared"], kind: VersionStoreKind, error: ArtifactsErrorFactory): T {
  const undeclared = declared?.({ plugin_id: normalized.producer_plugin_id }, normalized, kind);
  if (undeclared) throw error("artifact.type_undeclared", undeclared, { artifact_type_id: normalized.artifact_type_id, producer_plugin_id: normalized.producer_plugin_id });
  return normalized;
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

  getArtifactVersion(projectId: string, reference: ArtifactReference): R | null {
    return this.repository.getVersion(projectId, reference.artifact_id, reference.version);
  }

  listArtifactVersions(projectId: string, artifactId: string): R[] {
    return this.repository.listVersions(projectId, artifactId);
  }

  latestArtifactVersion(projectId: string, artifactId: string): R | null {
    return this.repository.latestVersion(projectId, artifactId);
  }

  listArtifacts(projectId: string, query?: ArtifactListQuery): R[] {
    return this.repository.listArtifacts(projectId, query);
  }

  consumptionCompatibility(
    projectId: string,
    reference: ArtifactReference,
    supportedTypes: ArtifactConsumerType[],
  ): ArtifactConsumptionCompatibility {
    const artifact = this.requireVersion(projectId, reference);
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
    const normalized = declaredOnly(normalizeRegistration<R, I>(input, { error: this.error, library: this.repository.tables.library, readOwner: (owner, scope) => this.repository.readOwner(owner, scope) }), this.options.declared, this.kind, this.error);
    return this.repository.immediate(() => {
      const globalIdentity = this.repository.getIdentityById(normalized.artifact_id);
      if (globalIdentity && globalIdentity.project_id !== normalized.project_id) {
        throw this.error("artifact.board_mismatch", "成果 ID 已属于另一个 Project", {
          artifact_id: normalized.artifact_id,
        });
      }
      let identity = globalIdentity;
      if (identity) this.assertIdentity(identity, normalized);

      const existing = this.repository.getVersion(
        normalized.project_id,
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
          observed_event_cursor: this.repository.eventCursor(normalized.project_id),
          replayed: true,
        };
      }

      const latest = this.repository.latestVersion(normalized.project_id, normalized.artifact_id);
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
          normalized.project_id,
          normalized.artifact_id,
          normalized.supersedes_version,
        )) {
          throw this.error("artifact.supersession_missing", "找不到被替代的成果版本");
        }
      }

      const at = this.now();
      if (!identity) {
        identity = {
          project_id: normalized.project_id,
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
        projectId: record.project_id,
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
      const artifact = this.requireOwnedVersion(input.project_id, input, input.actor_id);
      if (artifact.availability === "unavailable") {
        return {
          artifact,
          observed_event_cursor: this.repository.eventCursor(input.project_id),
          replayed: true,
        };
      }
      this.repository.markUnavailable(input.artifact_id, input.version, reason);
      const at = this.now();
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:${this.kind}:${input.artifact_id}:${input.version}:unavailable`,
        projectId: input.project_id,
        actorId: input.actor_id,
        type: `${this.kind}.unavailable`,
        objectType: this.kind,
        objectId: `${input.artifact_id}@${input.version}`,
        reason,
        payload: { artifact_id: input.artifact_id, version: input.version },
        at,
      });
      return {
        artifact: this.requireVersion(input.project_id, input),
        observed_event_cursor: observedEventCursor,
        replayed: false,
      };
    });
  }

  archiveVersion(input: ArchiveArtifactVersionInput): FixedVersionResult<R> {
    return this.repository.immediate(() => {
      const artifact = this.requireOwnedVersion(input.project_id, input, input.actor_id);
      if (artifact.lifecycle_state === "archived") {
        return {
          artifact,
          observed_event_cursor: this.repository.eventCursor(input.project_id),
          replayed: true,
        };
      }
      const at = this.now();
      this.repository.archiveVersion(input.artifact_id, input.version, input.actor_id, at);
      const observedEventCursor = this.options.appendEvent({
        eventId: `event:${this.kind}:${input.artifact_id}:${input.version}:archived`,
        projectId: input.project_id,
        actorId: input.actor_id,
        type: `${this.kind}.archived`,
        objectType: this.kind,
        objectId: `${input.artifact_id}@${input.version}`,
        reason: STORE_EVENT_REASONS[this.kind].archived,
        payload: { artifact_id: input.artifact_id, version: input.version },
        at,
      });
      return {
        artifact: this.requireVersion(input.project_id, input),
        observed_event_cursor: observedEventCursor,
        replayed: false,
      };
    });
  }

  private assertIdentity(
    identity: ArtifactIdentityRecord,
    input: Omit<FixedVersionRecord, "created_at">,
  ): void {
    // An identity written before a Home named its owner still names its producer: it is read as the Home's owner.
    const owner = this.repository.readOwner(identity.owner_actor_id, input.scope);
    if (owner !== input.owner_actor_id) {
      throw this.error("artifact.not_owner", "只有成果 owner 可以注册新 version", {
        owner_actor_id: owner,
        actor_id: input.created_by,
        requested_owner_actor_id: input.owner_actor_id,
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

  private requireVersion(projectId: string, reference: ArtifactReference): R {
    const artifact = this.repository.getVersion(projectId, reference.artifact_id, reference.version);
    if (!artifact) throw this.error("artifact.not_found", "找不到成果版本");
    return artifact;
  }

  /**
   * A version's state is changed by its owner, or by whoever produced it (a producer retracts its own output when its
   * source is gone). With the person as owner of every personal 成果 in a Home, this keeps the producer able to do what it
   * could before and lets the person do it too.
   */
  private requireOwnedVersion(
    projectId: string,
    reference: ArtifactReference,
    actorId: string,
  ): R {
    const artifact = this.requireVersion(projectId, reference);
    if (artifact.owner_actor_id !== actorId && artifact.created_by !== actorId) {
      throw this.error("artifact.not_owner", "只有成果的 owner 或生产它的行为者可以修改版本状态");
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
