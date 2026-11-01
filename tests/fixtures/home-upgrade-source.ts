import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SANDBOX_INTEGRATION_CONTRACT, SANDBOX_INTEGRATION_OPERATIONS, type SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { newPublisher, payloadOf } from "./sandbox-package.js";

const PLUGIN_ID = "io.molis.work.example.feedprobe";
const ORIGINS = ["https://api.example-feed.com"];
const CODE = `globalThis.__feedprobeLoaded = true;
export const operations = {
  'integration.health': async () => ({ ok: true, status: 'connected', message: 'ok' }),
  'integration.poll': async input => ({ ok: true, items: [{ externalId: 'e-' + input.source_id, title: 'T', summary: 'pulled' }], cursor: 'c1' }),
};
`;

export function integrationPackage(publisher = newPublisher(), options: { pluginId?: string; serviceId?: string; integrationId?: string; version?: string; origins?: string[]; title?: string; code?: string } = {}): PluginPackageBundle {
  const pluginId = options.pluginId ?? PLUGIN_ID, serviceId = options.serviceId ?? "example-feed";
  const manifest: PluginManifest = {
    schema_version: 2, host_api_version: 2, plugin_id: pluginId, version: options.version ?? "1.0.0", name: "Feed probe", ...(options.version ? { upgrade_compatibility: { compatible_from_versions: ["1.0.0"] } } : {}), kind: "integration",
    publisher: { publisher_id: "example", signature: publisher.identity },
    entrypoints: [{ deployment: "local", entrypoint: "./plugin.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "保存这个插件自己的数据" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, runtime: { scope: "home" },
    // A service of the platform's request table takes the table's origins; any other declares its own.
    connection_services: [{ service_id: serviceId, title: options.title ?? "Example feed", group_id: "work", summary: "Example feed fixture", auth_kind: "token",
      auth: { methods: [{ kind: "token", label: "Example token" }] }, capabilities: [{ label: "Feed 拉取", fulfillment: "live" }], ...serviceId === "github" ? {} : { origins: options.origins ?? ORIGINS } }],
    integrations: [{ integration_id: options.integrationId ?? serviceId, kind: "source", service_id: serviceId }],
  };
  const operations = (["health", "poll"] as const).map(name => ({ id: SANDBOX_INTEGRATION_OPERATIONS[name], ...structuredClone(SANDBOX_INTEGRATION_CONTRACT[name]), errors: [],
    examples: [{ input: { source_id: "s", config_json: "{}", has_connection: false, ...(name === "poll" ? { rebuild: false } : {}) }, outputIncludes: {} }] }));
  const contract: SandboxPluginContract = { version: 1, pluginId, revision: "one", entities: [], pages: [], acceptance: [], operations };
  const payload = payloadOf(manifest, { [SANDBOX_PACKAGE_FILES.contract]: JSON.stringify(contract), [SANDBOX_PACKAGE_FILES.entrypoint]: options.code ?? CODE });
  return signPluginPackage({ payload, signature: null, publisher_key: null }, publisher.signer);
}
