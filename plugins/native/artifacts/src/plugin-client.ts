import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginArtifactClient, PluginManifest, PluginStartContext, PluginArtifactPublishInput, PluginProcessItemClient, PluginProcessItemInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { ActionDefinition, ActionRegistryPort, SyncActionClient, ActionCallContext, ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { id, version, text, object, nullable, record, processRecord, reference, origin, array } from "./action-schemas.js";

export class PluginArtifactAccessError extends Error {
  constructor(
    readonly code: "plugin_artifact_denied" | "plugin_artifact_incompatible",
    message: string,
  ) { super(message); this.name = "PluginArtifactAccessError"; }
}

/** Created by the trusted Host for one installation; authors receive only the returned client. */
export function createPluginArtifactClient(input: {
  api: ArtifactsApplicationApi;
  /** The process items store (specs/artifact-positioning A2): exchange data recorded apart from the 成果库. */
  process: ProcessItemsApplicationApi;
  actions: { registry: ActionRegistryPort; client: SyncActionClient; project_id: string };
  manifest: PluginManifest;
  context: PluginStartContext;
  board_id: string;
  actor_id: string;
}): { client: PluginArtifactClient; process: PluginProcessItemClient; dispose(): void } {
  const { api, process, context, board_id, actor_id } = input;
  const manifest = structuredClone(input.manifest);
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw new PluginArtifactAccessError("plugin_artifact_denied", "Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  function requirePermission(permission: string): void {
    if (!manifest.permissions.some(item => item.permission === permission)) {
      throw new PluginArtifactAccessError("plugin_artifact_denied", "Manifest 未声明该成果权限");
    }
    context.requireGrant(permission);
  }
  const available = (permission: string): ActionAvailability => {
    try { requirePermission(permission); return { available: true }; }
    catch (error) { return { available: false, code: "plugin_artifact_denied", reason: (error as Error).message }; }
  };
  const declares = (list: PluginManifest["artifacts"]["produces"] | undefined, value: { artifact_type_id: string; schema_version: number }) =>
    (list ?? []).some(type => type.artifact_type_id === value.artifact_type_id && type.schema_version === value.schema_version);
  // One ID names one thing: a 成果 and a process item never share it, so a reference always reads back the same record.
  const unused = (other: ArtifactsApplicationApi | ProcessItemsApplicationApi, artifactId: string, what: string) => {
    if (other.query.latestArtifactVersion(board_id, artifactId)) throw new PluginArtifactAccessError("plugin_artifact_incompatible", `这个 ID 已用于${what}`);
  };
  // Pick fields explicitly: runtime JavaScript must not override bound identity or share authority.
  const fixed = (value: PluginProcessItemInput) => ({
    board_id, actor_id, artifact_id: value.artifact_id, version: value.version,
    artifact_type_id: value.artifact_type_id, schema_version: value.schema_version,
    content: value.content, metadata: value.metadata, supersedes_version: value.supersedes_version,
    producer: { plugin_id: manifest.plugin_id, plugin_version: manifest.version,
      binding_signature: manifest.publisher.signature },
    scope: "personal" as const,
  });
  const operations: PluginArtifactClient & PluginProcessItemClient = {
    publish(value) {
      requirePermission("artifact:write");
      if (!declares(manifest.artifacts.produces, value)) {
        throw new PluginArtifactAccessError("plugin_artifact_incompatible", "Manifest 未声明生产此成果 type/schema");
      }
      unused(process, value.artifact_id, "过程项");
      return api.commands.registerVersion({ ...fixed(value), origin: value.origin, title: value.title, media_type: value.media_type,
        ...(value.trace === undefined ? {} : { trace: value.trace }) });
    },
    record(value) {
      requirePermission("artifact:write");
      if (!declares(manifest.process_items?.produces, value)) {
        throw new PluginArtifactAccessError("plugin_artifact_incompatible", "Manifest 未声明记下这种过程项");
      }
      unused(api, value.artifact_id, "成果");
      return process.commands.registerVersion(fixed(value));
    },
    read(reference) {
      requirePermission("artifact:read");
      const pinned = api.query.getArtifactVersion(board_id, reference);
      const artifact = pinned ?? process.query.getArtifactVersion(board_id, reference);
      if (!artifact) return null;
      if (artifact.scope === "personal" && artifact.owner_actor_id !== actor_id) {
        throw new PluginArtifactAccessError("plugin_artifact_denied", "不能读取其他用户的个人成果");
      }
      const compatibility = pinned ? api.query.consumptionCompatibility(board_id, reference, manifest.artifacts.consumes)
        : process.query.consumptionCompatibility(board_id, reference, manifest.process_items?.consumes ?? []);
      if (!compatibility.consumable) {
        throw new PluginArtifactAccessError("plugin_artifact_incompatible", compatibility.reason);
      }
      return artifact;
    },
  };
  const providerId = `sdk.artifacts.${context.install_id}`;
  const define = (operation: "read" | "publish" | "record", inputSchema: ActionDefinition["action"]["input_schema"], outputSchema: ActionDefinition["action"]["input_schema"]): ActionDefinition => ({
    capability_id: `${providerId}.${operation}`, version: 1, provider_id: providerId,
    operation: operation === "read" ? "query" : "command",
    action: { title: { read: "读取插件成果", publish: "发布插件成果", record: "记下插件过程项" }[operation], description: "使用当前安装实例的类型合同和生产者身份访问成果",
      kind: operation === "read" ? "query" : "operation", scope: "project", audiences: ["plugin"],
      permissions: [operation === "read" ? "artifact:read" : "artifact:write"], subject_kinds: ["artifact"],
      input_schema: inputSchema, output_schema: outputSchema },
  });
  const read = define("read", reference, nullable({ anyOf: [record, processRecord] }));
  const versionInput = object({ artifact_id: id, version, artifact_type_id: id, schema_version: version,
    content: { oneOf: [object({ kind: { const: "inline" }, payload: {} }), object({ kind: { const: "reference" }, content_ref: id,
      digest: id, size_bytes: { type: "integer", minimum: 0 }, observed_digest: nullable(text), available: { type: "boolean" } },
      ["kind", "content_ref", "digest", "size_bytes"])] }, metadata: { type: "object" }, supersedes_version: nullable(version) },
    ["artifact_id", "version", "artifact_type_id", "schema_version", "content"]);
  const result = (artifact: unknown) => object({ artifact, observed_event_cursor: { type: "integer", minimum: 0 }, replayed: { type: "boolean" } });
  const versionProperties = (versionInput as { properties: Record<string, unknown> }).properties;
  const publishInput = object({ ...versionProperties, origin, title: id, media_type: id, trace: array(reference) },
    ["artifact_id", "version", "artifact_type_id", "schema_version", "content", "origin", "title", "media_type"]);
  const publish = define("publish", publishInput, result(record));
  const recordItem = define("record", versionInput, result(processRecord));
  const caller: ActionCallContext = { actor_id, project_id: input.actions.project_id, audience: "plugin",
    plugin_install_id: context.install_id, permissions: manifest.permissions.map(item => item.permission), allowed_actions: [read, publish, recordItem] };
  const dispose = input.actions.registry.registerProvider({
    provider: { provider_id: providerId, title: `${manifest.name} · 成果 SDK`, kind: "system", project_id: input.actions.project_id },
    definitions: [read, publish, recordItem],
    availability: call => call.actor_id === actor_id && call.plugin_install_id === context.install_id
      ? { available: true } : { available: false, code: "plugin_artifact_denied", reason: "成果 SDK 属于其他安装实例或用户" },
    handlers: [
      { ...read, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.read(value as Parameters<PluginArtifactClient["read"]>[0]) },
      { ...publish, execution: "sync", availability: () => available("artifact:write"), handle: (_call, value) => operations.publish(value as PluginArtifactPublishInput) },
      { ...recordItem, execution: "sync", availability: () => available("artifact:write"), handle: (_call, value) => operations.record(value as PluginProcessItemInput) },
    ],
  });
  const invoke = (definition: ActionDefinition, value: unknown) => {
    // Also guards retained clients after a provider is replaced with the same stable identity.
    requirePermission(definition.action.permissions[0]!);
    return input.actions.client.invokeSync(caller, definition, value);
  };
  const versionOf = (value: PluginProcessItemInput) => ({ artifact_id: value.artifact_id, version: value.version,
    artifact_type_id: value.artifact_type_id, schema_version: value.schema_version, content: value.content,
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
    ...(value.supersedes_version === undefined ? {} : { supersedes_version: value.supersedes_version }) });
  return { dispose, client: {
    read: value => invoke(read, { artifact_id: value.artifact_id, version: value.version }) as ReturnType<PluginArtifactClient["read"]>,
    publish: value => invoke(publish, { ...versionOf(value), origin: value.origin, title: value.title, media_type: value.media_type,
      ...(value.trace === undefined ? {} : { trace: value.trace }) }) as ReturnType<PluginArtifactClient["publish"]>,
  }, process: {
    record: value => invoke(recordItem, versionOf(value)) as ReturnType<PluginProcessItemClient["record"]>,
  } };
}
