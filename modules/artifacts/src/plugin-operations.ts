import type { ArtifactsApplicationApi, ProcessItemsApplicationApi, ProcessItemRecord, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactLineHeadOf, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginArtifactClient, PluginProcessItemClient, PluginManifest, PluginProcessItemInput, PluginConsumableVersion } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginArtifactErrors } from "./plugin-errors.js";
import { pluginArtifactContracts, referenceInput, processInput, artifactInput } from "./plugin-action-contracts.js";

export interface PluginArtifactOperationsInput {
  api: ArtifactsApplicationApi;
  process: ProcessItemsApplicationApi;
  manifest: PluginManifest;
  project_id: string;
  actor_id: string;
  author?: () => string | undefined;
  authorize(permission: "artifact:read" | "artifact:write"): void;
  /** Throws once the original caller of the action this runs for is cancelled or no longer authorized; asked right before a write. */
  assertCallerCurrent(): void;
  assertInput(schema: ActionSchema, value: unknown): void;
}

const UNCONSUMABLE_MESSAGE: Readonly<Record<string, string>> = {
  artifact_unavailable: "这一版成果已失效，不能再使用；请换一个可用的版本",
  artifact_archived: "这一版成果已归档，不能再使用；请换一个可用的版本",
  consumer_missing: "这个插件没有声明能使用这种成果",
};

/** Owner policy over the two stores; the trusted entry supplies identity, live authorization and the shared validator. */
export function createPluginArtifactOperations(input: PluginArtifactOperationsInput): { client: PluginArtifactClient; process: PluginProcessItemClient } {
  const { api, process, project_id, actor_id } = input;
  const access = { api, process, project_id, actor_id };
  const manifest = structuredClone(input.manifest);
  const requirePermission = (permission: "artifact:read" | "artifact:write") => {
    if (!manifest.permissions.some(item => item.permission === permission)) throw pluginArtifactErrors.plugin_denied("Manifest 未声明该成果权限");
    input.authorize(permission);
  };
  const checked = <T>(operation: keyof typeof pluginArtifactContracts, value: T): T => {
    input.assertInput(pluginArtifactContracts[operation].input, value);
    return value;
  };
  const declares = (list: PluginManifest["artifacts"]["produces"] | undefined, value: PluginProcessItemInput) =>
    (list ?? []).some(type => type.artifact_type_id === value.artifact_type_id && type.schema_version === value.schema_version);
  const unused = (other: ArtifactsApplicationApi | ProcessItemsApplicationApi, artifactId: string, what: string) => {
    if (other.query.latestArtifactVersion(project_id, artifactId)) throw pluginArtifactErrors.plugin_incompatible(`这个 ID 已用于${what}`);
  };
  const fixed = <T extends PluginProcessItemInput>(value: T) => ({ ...value, project_id, actor_id: input.author?.() ?? actor_id,
    producer: { plugin_id: manifest.plugin_id, plugin_version: manifest.version, binding_signature: manifest.publisher.signature },
    scope: "personal" as const });
  const ownProcess = (value: ProcessItemRecord | null) => {
    if (value && !ownsRecord(value, manifest, actor_id)) throw pluginArtifactErrors.plugin_denied("这条过程项不是这个插件和用户的");
    return value;
  };
  const issue = (value: ProcessItemRecord, kind: PluginConsumableVersion["kind"]) => consumptionIssue(access, manifest, value, kind);
  return { client: {
    publish(value) {
      requirePermission("artifact:write");
      const projected = checked("publish", artifactInput(value));
      if (!declares(manifest.artifacts.produces, projected)) throw pluginArtifactErrors.plugin_incompatible("Manifest 未声明生产此成果 type/schema");
      unused(process, projected.artifact_id, "过程项");
      input.assertCallerCurrent();
      return api.commands.registerVersion(fixed(projected));
    },
    read(value) {
      requirePermission("artifact:read");
      const reference = checked("read", referenceInput(value));
      const pinned = api.query.getArtifactVersion(project_id, reference);
      const artifact = pinned ?? process.query.getArtifactVersion(project_id, reference);
      if (!artifact) return null;
      const problem = issue(artifact, pinned ? "artifact" : "process_item");
      if (problem?.kind === "denied") throw pluginArtifactErrors.plugin_denied(problem.message);
      if (problem) throw pluginArtifactErrors.plugin_incompatible(problem.message, { reason: problem.reason });
      return artifact;
    },
    head(artifactId) {
      requirePermission("artifact:read");
      checked("head", { artifact_id: artifactId });
      const latest = api.query.latestArtifactVersion(project_id, artifactId);
      if (!latest) return null;
      if (!ownsRecord(latest, manifest, null)) throw pluginArtifactErrors.plugin_denied("这条成果线不是这个插件的");
      return artifactLineHeadOf(latest);
    },
    readOwn(value) {
      requirePermission("artifact:read");
      const pinned = api.query.getArtifactVersion(project_id, checked("own", referenceInput(value)));
      if (pinned && !ownsRecord(pinned, manifest, null)) throw pluginArtifactErrors.plugin_denied("这条成果线不是这个插件的");
      return pinned;
    },
    listConsumable() {
      requirePermission("artifact:read");
      checked("list", {});
      const artifacts = api.query.listArtifacts(project_id);
      // Include even rejected 成果: read always chooses that store when both stores have the same fixed reference.
      const artifactRefs = new Set(artifacts.map(referenceKey));
      return [
        ...artifacts.filter(value => !issue(value, "artifact")).map(value => summary(value, "artifact", value.title)),
        ...process.query.listArtifacts(project_id).filter(value => !artifactRefs.has(referenceKey(value)) && !issue(value, "process_item"))
          .map(value => summary(value, "process_item", value.metadata.title)),
      ];
    },
  }, process: {
    record(value) {
      requirePermission("artifact:write");
      const projected = checked("record", processInput(value));
      if (!declares(manifest.process_items?.produces, projected)) throw pluginArtifactErrors.plugin_incompatible("Manifest 未声明记下这种过程项");
      unused(api, projected.artifact_id, "成果");
      input.assertCallerCurrent();
      return process.commands.registerVersion(fixed(projected));
    },
    head(artifactId) {
      requirePermission("artifact:read");
      checked("process-head", { artifact_id: artifactId });
      const latest = ownProcess(process.query.latestArtifactVersion(project_id, artifactId));
      return latest ? { version: latest.version } : null;
    },
    readOwn(value) {
      requirePermission("artifact:read");
      return ownProcess(process.query.getArtifactVersion(project_id, checked("process-own", referenceInput(value))));
    },
  } };
}

function consumptionIssue(input: Pick<PluginArtifactOperationsInput, "api" | "process" | "project_id" | "actor_id">,
  manifest: PluginManifest, value: ProcessItemRecord, kind: PluginConsumableVersion["kind"]) {
  // Personal 成果 belongs to the Home's person; personal process items still belong to the recording actor.
  if (kind === "process_item" && value.scope === "personal" && value.owner_actor_id !== input.actor_id) {
    return { kind: "denied" as const, message: "不能读取其他用户的个人过程项" };
  }
  const compatibility = kind === "artifact" ? input.api.query.consumptionCompatibility(input.project_id, value, manifest.artifacts.consumes)
    : input.process.query.consumptionCompatibility(input.project_id, value, manifest.process_items?.consumes ?? []);
  return compatibility.consumable ? null : { kind: "incompatible" as const, reason: compatibility.reason,
    message: UNCONSUMABLE_MESSAGE[compatibility.reason] ?? "这一版成果不能在这里使用" };
}

/**
 * Whether a stored version is the caller's own: the plugin ID and the publisher signature it was bound to both match, so a plugin with the
 * same ID and another signature never reads it (PG-107). A personal process item also belongs to the actor that recorded it (`actor`);
 * pass `null` for the 成果库, whose personal versions belong to the Home's person, not to the recording actor.
 */
function ownsRecord(value: Pick<ProcessItemRecord, "producer_plugin_id" | "producer_binding_signature" | "scope" | "owner_actor_id">,
  manifest: Pick<PluginManifest, "plugin_id" | "publisher">, actor: string | null): boolean {
  return value.producer_plugin_id === manifest.plugin_id && value.producer_binding_signature === manifest.publisher.signature
    && (actor === null || value.scope !== "personal" || value.owner_actor_id === actor);
}

const referenceKey = (value: ProcessItemRecord) => JSON.stringify([value.artifact_id, value.version]);
function summary(value: ProcessItemRecord | ArtifactVersionRecord, kind: PluginConsumableVersion["kind"], title: unknown): PluginConsumableVersion {
  return { ...referenceInput(value), kind, artifact_type_id: value.artifact_type_id, schema_version: value.schema_version,
    title: typeof title === "string" && title.trim().length > 0 ? title : null };
}
