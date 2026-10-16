import { artifactsErrors } from "./errors.js";
import type { ArtifactsApplicationApi, ProcessItemsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginArtifactClient, PluginManifest, PluginStartContext, PluginArtifactPublishInput, PluginProcessItemClient, PluginProcessItemInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { ActionDefinition, ActionRegistryPort, SyncActionClient, ActionCallContext, ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { artifactLineHeadOf } from "@molis-ai/molis-work-contracts/platform/actions";
import { id, version, text, object, nullable, record, processRecord, reference, origin, array } from "./action-schemas.js";

/** Created by the trusted Host for one installation; authors receive only the returned client. */
/** What the person is told when a version cannot be used here, by the owner's reason. */
const UNCONSUMABLE_MESSAGE: Readonly<Record<string, string>> = {
  artifact_unavailable: "这一版成果已失效，不能再使用；请换一个可用的版本",
  artifact_archived: "这一版成果已归档，不能再使用；请换一个可用的版本",
  consumer_missing: "这个插件没有声明能使用这种成果",
};

export function createPluginArtifactClient(input: {
  api: ArtifactsApplicationApi;
  /** The process items store (specs/artifact-positioning A2): exchange data recorded apart from the 成果库. */
  process: ProcessItemsApplicationApi;
  actions: { registry: ActionRegistryPort; client: SyncActionClient; project_id: string };
  manifest: PluginManifest;
  context: PluginStartContext;
  project_id: string;
  actor_id: string;
  /** Who is running the call that pins, as the Runtime knows it (never the Plugin): kept as the version's `created_by`; the installation's actor outside every action. */
  author?: () => string | undefined;
}): { client: PluginArtifactClient; process: PluginProcessItemClient; dispose(): void } {
  const { api, process, context, project_id, actor_id } = input;
  const manifest = structuredClone(input.manifest);
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw artifactsErrors.plugin_denied("Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  function requirePermission(permission: string): void {
    if (!manifest.permissions.some(item => item.permission === permission)) {
      throw artifactsErrors.plugin_denied("Manifest 未声明该成果权限");
    }
    context.requireGrant(permission);
  }
  const denied = (reason: string): ActionAvailability => {
    const error = artifactsErrors.plugin_denied(reason);
    return { available: false, code: error.code, kind: error.kind, reason: error.message };
  };
  const available = (permission: string): ActionAvailability => {
    try { requirePermission(permission); return { available: true }; }
    catch (error) { return denied((error as Error).message); }
  };
  const declares = (list: PluginManifest["artifacts"]["produces"] | undefined, value: { artifact_type_id: string; schema_version: number }) =>
    (list ?? []).some(type => type.artifact_type_id === value.artifact_type_id && type.schema_version === value.schema_version);
  // One ID names one thing: a 成果 and a process item never share it, so a reference always reads back the same record.
  const unused = (other: ArtifactsApplicationApi | ProcessItemsApplicationApi, artifactId: string, what: string) => {
    if (other.query.latestArtifactVersion(project_id, artifactId)) throw artifactsErrors.plugin_incompatible(`这个 ID 已用于${what}`);
  };
  // Pick fields explicitly: runtime JavaScript must not override bound identity or share authority.
  const fixed = (value: PluginProcessItemInput) => ({
    project_id, actor_id: input.author?.() ?? actor_id, artifact_id: value.artifact_id, version: value.version,
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
        throw artifactsErrors.plugin_incompatible("Manifest 未声明生产此成果 type/schema");
      }
      unused(process, value.artifact_id, "过程项");
      return api.commands.registerVersion({ ...fixed(value), origin: value.origin, title: value.title, media_type: value.media_type,
        ...(value.trace === undefined ? {} : { trace: value.trace }) });
    },
    record(value) {
      requirePermission("artifact:write");
      if (!declares(manifest.process_items?.produces, value)) {
        throw artifactsErrors.plugin_incompatible("Manifest 未声明记下这种过程项");
      }
      unused(api, value.artifact_id, "成果");
      return process.commands.registerVersion(fixed(value));
    },
    read(reference) {
      requirePermission("artifact:read");
      const pinned = api.query.getArtifactVersion(project_id, reference);
      const artifact = pinned ?? process.query.getArtifactVersion(project_id, reference);
      if (!artifact) return null;
      // A personal 成果 belongs to the Home's person whoever produced it, so any installation reads it by type. A process item
      // belongs to the actor whose installation recorded it (2026-10-07 decided personal 成果 only): no one else's installation reads it.
      if (!pinned && artifact.scope === "personal" && artifact.owner_actor_id !== actor_id) {
        throw artifactsErrors.plugin_denied("不能读取其他用户的个人过程项");
      }
      const compatibility = pinned ? api.query.consumptionCompatibility(project_id, reference, manifest.artifacts.consumes)
        : process.query.consumptionCompatibility(project_id, reference, manifest.process_items?.consumes ?? []);
      if (!compatibility.consumable) {
        // The person reads this message wherever the consumer shows the owner's failure; the reason stays in the details.
        throw artifactsErrors.plugin_incompatible(UNCONSUMABLE_MESSAGE[compatibility.reason] ?? "这一版成果不能在这里使用", { reason: compatibility.reason });
      }
      return artifact;
    },
    head(artifactId) {
      requirePermission("artifact:read");
      const latest = api.query.latestArtifactVersion(project_id, artifactId);
      if (!latest) return null;
      if (latest.producer_plugin_id !== manifest.plugin_id) throw artifactsErrors.plugin_denied("这条成果线不是这个插件的");
      return artifactLineHeadOf(latest);
    },
    readOwn(reference) {
      requirePermission("artifact:read");
      const pinned = api.query.getArtifactVersion(project_id, reference);
      if (!pinned) return null;
      if (pinned.producer_plugin_id !== manifest.plugin_id) throw artifactsErrors.plugin_denied("这条成果线不是这个插件的");
      return pinned;
    },
  };
  const { providerId, read, head, own, publish, recordItem } = sdkArtifactActions(context.install_id);
  const caller: ActionCallContext = { actor_id, project_id: input.actions.project_id, audience: "plugin",
    plugin_install_id: context.install_id, permissions: manifest.permissions.map(item => item.permission), allowed_actions: [read, head, own, publish, recordItem] };
  const dispose = input.actions.registry.registerProvider({
    provider: { provider_id: providerId, title: `${manifest.name} · 成果 SDK`, kind: "system", project_id: input.actions.project_id },
    definitions: [read, head, own, publish, recordItem],
    availability: call => call.actor_id === actor_id && call.plugin_install_id === context.install_id
      ? { available: true } : denied("成果 SDK 属于其他安装实例或用户"),
    handlers: [
      { ...read, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.read(value as Parameters<PluginArtifactClient["read"]>[0]) },
      { ...head, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.head((value as { artifact_id: string }).artifact_id) },
      { ...own, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.readOwn(value as Parameters<PluginArtifactClient["readOwn"]>[0]) },
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
    head: artifactId => invoke(head, { artifact_id: artifactId }) as ReturnType<PluginArtifactClient["head"]>,
    readOwn: value => invoke(own, { artifact_id: value.artifact_id, version: value.version }) as ReturnType<PluginArtifactClient["readOwn"]>,
    publish: value => invoke(publish, { ...versionOf(value), origin: value.origin, title: value.title, media_type: value.media_type,
      ...(value.trace === undefined ? {} : { trace: value.trace }) }) as ReturnType<PluginArtifactClient["publish"]>,
  }, process: {
    record: value => invoke(recordItem, versionOf(value)) as ReturnType<PluginProcessItemClient["record"]>,
  } };
}

/** The SDK actions one installation reaches its 成果 through (sandboxed code calls them; the client above wraps them). */
function sdkArtifactActions(installId: string) {
  const providerId = `sdk.artifacts.${installId}`;
  const reads = (operation: string) => operation === "read" || operation === "head" || operation === "own";
  const define = (operation: "read" | "head" | "own" | "publish" | "record", inputSchema: ActionDefinition["action"]["input_schema"], outputSchema: ActionDefinition["action"]["input_schema"]): ActionDefinition => ({
    capability_id: `${providerId}.${operation}`, version: 1, provider_id: providerId,
    operation: reads(operation) ? "query" : "command",
    action: { title: { read: "读取插件成果", head: "读取插件成果线的最新版本", own: "读取插件自己固定的版本", publish: "发布插件成果", record: "记下插件过程项" }[operation], description: "使用当前安装实例的类型合同和生产者身份访问成果",
      kind: reads(operation) ? "query" : "operation", scope: "project", audiences: ["plugin"],
      permissions: [reads(operation) ? "artifact:read" : "artifact:write"], subject_kinds: ["artifact"],
      input_schema: inputSchema, output_schema: outputSchema },
  });
  const read = define("read", reference, nullable({ anyOf: [record, processRecord] }));
  const head = define("head", object({ artifact_id: id }), nullable(object({ version, source_revision: nullable({ type: "integer", minimum: 0 }) })));
  const own = define("own", reference, nullable(record));
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
  return { providerId, read, head, own, publish, recordItem };
}
