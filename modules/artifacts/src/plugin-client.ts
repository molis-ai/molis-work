import { pluginArtifactErrors } from "./plugin-errors.js";
import type {
  PluginArtifactClient, PluginStartContext, PluginArtifactPublishInput, PluginProcessItemClient, PluginProcessItemInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ActionDefinition, ActionRegistryPort, SyncActionClient, ActionCallContext, ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createPluginArtifactOperations, type PluginArtifactOperationsInput } from "./plugin-operations.js";
import { pluginArtifactContracts, referenceInput, processInput, artifactInput } from "./plugin-action-contracts.js";

/**
 * Created by the trusted Host for one installation; authors receive only the returned clients. Its calls run under the caller
 * the Host issued that same session (`plugin_caller`), so they stop with the session.
 */
export function createPluginArtifactClient(input: Omit<PluginArtifactOperationsInput, "authorize"> & {
  actions: { registry: ActionRegistryPort; client: SyncActionClient; project_id: string };
  context: PluginStartContext;
  plugin_caller: HostPluginCaller;
}): { client: PluginArtifactClient; process: PluginProcessItemClient; dispose(): void } {
  const { context, actor_id } = input;
  const manifest = structuredClone(input.manifest);
  if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version) {
    throw pluginArtifactErrors.plugin_denied("Host 的 Plugin Manifest 与安装上下文不匹配");
  }
  function requirePermission(permission: string): void {
    if (!manifest.permissions.some(item => item.permission === permission)) {
      throw pluginArtifactErrors.plugin_denied("Manifest 未声明该成果权限");
    }
    context.requireGrant(permission);
  }
  const denied = (reason: string): ActionAvailability => {
    const error = pluginArtifactErrors.plugin_denied(reason);
    return { available: false, code: error.code, kind: error.kind, reason: error.message };
  };
  const available = (permission: string): ActionAvailability => {
    try { requirePermission(permission); return { available: true }; }
    catch (error) { return denied((error as Error).message); }
  };
  const operations = createPluginArtifactOperations({ api: input.api, process: input.process, manifest,
    project_id: input.project_id, actor_id, author: input.author, assertInput: input.assertInput, assertCallerCurrent: input.assertCallerCurrent,
    authorize: permission => context.requireGrant(permission) });
  const { providerId, read, head, own, publish, recordItem, processHead, processOwn, list } = sdkArtifactActions(context.install_id);
  const definitions = [read, head, own, publish, recordItem, processHead, processOwn, list];
  const caller: ActionCallContext = { actor_id, project_id: input.actions.project_id, audience: "plugin", host_plugin: input.plugin_caller,
    plugin_install_id: context.install_id, permissions: manifest.permissions.map(item => item.permission), allowed_actions: definitions };
  const dispose = input.actions.registry.registerProvider({
    provider: { provider_id: providerId, title: `${manifest.name} · 成果 SDK`, kind: "system", project_id: input.actions.project_id },
    definitions,
    availability: call => call.actor_id === actor_id && call.plugin_install_id === context.install_id
      ? { available: true } : denied("成果 SDK 属于其他安装实例或用户"),
    handlers: [
      { ...read, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.client.read(value as Parameters<PluginArtifactClient["read"]>[0]) },
      { ...head, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.client.head((value as { artifact_id: string }).artifact_id) },
      { ...own, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.client.readOwn(value as Parameters<PluginArtifactClient["readOwn"]>[0]) },
      { ...publish, execution: "sync", availability: () => available("artifact:write"), handle: (_call, value) => operations.client.publish(value as PluginArtifactPublishInput) },
      { ...recordItem, execution: "sync", availability: () => available("artifact:write"), handle: (_call, value) => operations.process.record(value as PluginProcessItemInput) },
      { ...processHead, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.process.head((value as { artifact_id: string }).artifact_id) },
      { ...processOwn, execution: "sync", availability: () => available("artifact:read"), handle: (_call, value) => operations.process.readOwn(value as Parameters<PluginProcessItemClient["readOwn"]>[0]) },
      { ...list, execution: "sync", availability: () => available("artifact:read"), handle: () => operations.client.listConsumable() },
    ],
  });
  const invoke = (definition: ActionDefinition, value: unknown) => {
    // Also guards retained clients after a provider is replaced with the same stable identity.
    requirePermission(definition.action.permissions[0]!);
    return input.actions.client.invokeSync(caller, definition, value);
  };
  return { dispose, client: {
    read: value => invoke(read, referenceInput(value)) as ReturnType<PluginArtifactClient["read"]>,
    head: artifactId => invoke(head, { artifact_id: artifactId }) as ReturnType<PluginArtifactClient["head"]>,
    readOwn: value => invoke(own, referenceInput(value)) as ReturnType<PluginArtifactClient["readOwn"]>,
    publish: value => invoke(publish, artifactInput(value)) as ReturnType<PluginArtifactClient["publish"]>,
    listConsumable: () => invoke(list, {}) as ReturnType<PluginArtifactClient["listConsumable"]>,
  }, process: {
    record: value => invoke(recordItem, processInput(value)) as ReturnType<PluginProcessItemClient["record"]>,
    head: artifactId => invoke(processHead, { artifact_id: artifactId }) as ReturnType<PluginProcessItemClient["head"]>,
    readOwn: value => invoke(processOwn, referenceInput(value)) as ReturnType<PluginProcessItemClient["readOwn"]>,
  } };
}

/** The SDK actions one installation reaches its 成果 through (sandboxed code calls them; the client above wraps them). */
function sdkArtifactActions(installId: string) {
  const providerId = `sdk.artifacts.${installId}`;
  const titles = { read: "读取插件成果", head: "读取插件成果线的最新版本", own: "读取插件自己固定的版本", publish: "发布插件成果", record: "记下插件过程项",
    "process-head": "读取插件过程项的最新版本", "process-own": "读取插件自己的过程项", list: "列出插件可消费的固定版本" };
  const define = (operation: keyof typeof pluginArtifactContracts): ActionDefinition => {
    const read = operation !== "publish" && operation !== "record";
    const contract = pluginArtifactContracts[operation];
    return { capability_id: `${providerId}.${operation}`, version: 1, provider_id: providerId, operation: read ? "query" : "command",
      action: { title: titles[operation], description: "使用当前安装实例的类型合同和生产者身份访问成果", kind: read ? "query" : "operation",
        scope: "project", audiences: ["plugin"], permissions: [read ? "artifact:read" : "artifact:write"], subject_kinds: ["artifact"],
        input_schema: contract.input, output_schema: contract.output } };
  };
  return { providerId, read: define("read"), head: define("head"), own: define("own"), publish: define("publish"), recordItem: define("record"),
    processHead: define("process-head"), processOwn: define("process-own"), list: define("list") };
}
