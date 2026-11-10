import { AGENT_RUNTIME, AGENT_TOOLS } from "@molis-ai/molis-work-service-agent-host";
import { gatherKit } from "@molis-ai/molis-work-service-kit";
import { bindActionHandler, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineKitReportAction, type KitReport, type KitReportedEntry } from "@molis-ai/molis-work-contracts/platform/kit-report";
import { KIT_AGENT_TOOLS_PROVIDER_ID, KIT_PROVIDER_ID, KIT_READ_PERMISSION, kitCatalogActions } from "@molis-ai/molis-work-contracts/services/kit";
import { HomeConsentLedger } from "./home-plugin-store.js";
import { localPublisherKeyId } from "./plugin-builder/publisher-identity.js";
import { PLUGIN_INSTALL_READ } from "./plugin-install-actions.js";
import { PRODUCT_VERSION } from "./product-version.js";
import type { ProjectPluginHost } from "./project-plugin-ports.js";
import { keptUninstalled, kitPluginSource, scopeInstallations } from "./scope-installations.js";

// The AI kit in the Host (specs/capability-pack/contract-design.md §4.6–§4.8): the one query, gathered by `horizontal/kit` through the
// caller's own client, and the Host's own reporters that are not another owner's — the Agent tools and the plugin pack headers.

/** `kit.catalog.list@1`, registered once at Home as `system.kit`: the person's own, gathered on every call through their own client. */
export function kitProvider(clientFor: (caller: ActionCallContext) => ActionClient): ActionProviderRegistration {
  return { provider: { provider_id: KIT_PROVIDER_ID, title: "能力包", kind: "system" }, definitions: [kitCatalogActions.list],
    handlers: [bindActionHandler(kitCatalogActions.list, (_input, caller) => gatherKit(caller, clientFor(caller)))] };
}

export const agentToolsKitReport = defineKitReportAction("agent.tools.kit.report", /* @version action.agent.tools.kit.report */ 1, "Agent 工具的能力包条目", [KIT_READ_PERMISSION]);

/**
 * Every Agent tool as a kit entry, from the Agent Host's one set (§5.1): in Molis Work's own pack, never switched, with no cheap last use.
 * A runtime tool's source is the runtime package; the others are the platform's.
 */
export function agentToolsKitEntries(caller: ActionCallContext): KitReport {
  const english = caller.locale === "en";
  return { entries: AGENT_TOOLS.map((tool): KitReportedEntry => ({ kind: "tool", entry_id: tool.name, name: tool.name, description: tool.description,
    version: { label: tool.runtime_name ? `${AGENT_RUNTIME.package} ${AGENT_RUNTIME.version}` : PRODUCT_VERSION },
    declares: { tools: [], permissions: [], connector_categories: [] }, scope: "home", where: [], availability: { available: true }, usage: { kind: "not_counted" },
    export: "reference", ref: { tool: tool.name }, tool: { origin: tool.origin, writes: tool.writes },
    source: tool.runtime_name ? { kind: "runtime", package: AGENT_RUNTIME.package, version: AGENT_RUNTIME.version } : { kind: "system", module: "agent-host", title: english ? "Agent Host" : "Agent 运行" },
    pack: "system:builtin" })) };
}

export function agentToolsKitProvider(): ActionProviderRegistration {
  return { provider: { provider_id: KIT_AGENT_TOOLS_PROVIDER_ID, title: "Agent 工具", kind: "system" }, definitions: [agentToolsKitReport],
    handlers: [bindActionHandler(agentToolsKitReport, (_input, caller) => agentToolsKitEntries(caller))] };
}

/** The plugin install service's pack headers: only it says which installations there are and what state each is in (§4.6). */
export const pluginsKitReport = defineKitReportAction("plugins.kit.report", /* @version action.plugins.kit.report */ 1, "插件包头", [PLUGIN_INSTALL_READ]);

/**
 * One header per installation the call reaches, from its install record: enabled or disabled, and those taken off with their data
 * kept. Its content package can be exported when it is one the Host keeps as installed (a signed package with only declarations).
 */
export async function pluginKitHeaders(home: string, source: ProjectPluginHost, caller: ActionCallContext): Promise<KitReport> {
  const { reference, installations } = await scopeInstallations(source, caller);
  const context = { localKey: localPublisherKeyId(home), pins: new Map(new HomeConsentLedger(home).publishers().map(pin => [pin.key_id, pin])), locale: caller.locale };
  const words = (manifest: (typeof installations)[number]["manifest"], text: string | undefined) => (caller.locale === "en" ? manifest?.ui?.translations?.[text ?? ""] : undefined) ?? text ?? "";
  const live = installations.map(({ record, manifest }) => ({ source: kitPluginSource(record, manifest, context), description: words(manifest, manifest?.summary).slice(0, 2000),
    status: record.state === "running" ? "enabled" as const : "disabled" as const,
    ...(record.execution === "sandbox" && manifest?.kind === "content" && record.publisher_trust !== "host" ? { exportable: true as const } : {}) }));
  const gone = (await keptUninstalled(source, reference)).filter(record => !live.some(pack => pack.source.install_id === record.install_id))
    .map(record => ({ source: kitPluginSource(record, undefined, context), description: "", status: "uninstalled" as const }));
  return { entries: [], packs: [...live, ...gone] };
}
