import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { consentsChanged } from "./consent-revision.js";
import { assertHomePluginPermissionSettingsEntry, assertPluginConsentSettingsEntry, assertPluginPermissionSettingsEntry, assertProjectReachSettingsEntry } from "./plugin-consent-settings-entry.js";
import { pluginInstallActions } from "./plugin-install-actions.js";
import type { ProjectReachConsents, ProjectReachSelection, ProjectReachView } from "./plugin-project-reach-consent.js";
import type { CatalogCapability } from "./plugin-builder/catalog.js";
import { latestCapability } from "./plugin-builder/capabilities.js";

// Taking an agreement back (ac-trust T5, specs/repository-anti-corruption/slices/ac-trust-install.md §3.3, S-77). The Home's consent ledger
// holds one row for each declaration of a plugin that changes what it does elsewhere (常开, a default wiring, a default input group). Only
// the person lists and takes them back: the audience is `user` and the handler requires the Host's settings entry credential, so neither an
// Agent, MCP, a workflow nor a plugin can withdraw (or by withdrawing, keep) an agreement. Revoking writes `revoked_at` on the row and
// nothing else is rewritten. The always-on list reads it on its next query; default wirings reconcile on the project's next request.

export const PLUGIN_CONSENT_PROVIDER_ID = "plugin-consents";
export const PLUGIN_CONSENT_READ = "plugin-consents:read";
export const PLUGIN_CONSENT_WRITE = "plugin-consents:write";
export const PLUGIN_CONSENT_PERMISSIONS = [PLUGIN_CONSENT_READ, PLUGIN_CONSENT_WRITE];

const metadata = { scope: "home", audiences: ["user"], subject_kinds: [] } as const;
const PLUGIN_ID = "^io\\.molis\\.work\\.[a-z0-9][a-z0-9.-]*$";
const consentView = {
  type: "object", additionalProperties: false,
  oneOf: [
    { properties: { kind: { const: "project_reach" }, approved_capability_ids: { type: "array" }, granted_by: { const: "user" } } },
    { properties: { kind: { enum: ["always_on", "default_wiring", "default_group", "local_directory"] }, approved_capability_ids: { type: "null" } } },
  ],
  required: ["consent_id", "plugin_id", "publisher_signature", "kind", "subject", "manifest_digest", "granted_at", "granted_by", "revoked_at", "approved_capability_ids"],
  properties: {
    consent_id: { type: "string" }, plugin_id: { type: "string" }, publisher_signature: { type: "string" }, kind: { enum: ["always_on", "default_wiring", "default_group", "local_directory", "project_reach"] },
    subject: { type: "string" }, manifest_digest: { type: "string" }, granted_at: { type: "string" }, granted_by: { enum: ["user", "host_build"] }, revoked_at: { type: ["string", "null"] }, approved_capability_ids: { type: ["array", "null"], items: { type: "string" } },
  },
};

const strings = { type: "array", items: { type: "string" } };
interface ReachCapability { capability_id: string; title: string; description: string; available: boolean }
interface ReachOverview { plugins: ProjectReachView[]; project_name: string; capabilities: ReachCapability[] }
type ReachDetails = (projectId: string) => Promise<{ project_name: string; capabilities: readonly CatalogCapability[] }>;
const reachCapability = { type: "object", additionalProperties: false, required: ["capability_id", "title", "description", "available"],
  properties: { capability_id: { type: "string" }, title: { type: "string" }, description: { type: "string" }, available: { type: "boolean" } } };
const reachView = { type: "object", additionalProperties: false,
  required: ["plugin_id", "name", "publisher_signature", "version", "snapshot", "state", "capability_ids", "added_capability_ids", "consent", "error"],
  properties: { plugin_id: { type: "string" }, name: { type: "string" }, publisher_signature: { type: "string" }, version: { type: "string" }, snapshot: { type: "string" },
    state: { enum: ["unapproved", "approved", "expanded", "unavailable"] }, capability_ids: strings, added_capability_ids: strings,
    consent: { anyOf: [consentView, { type: "null" }] }, error: { type: ["string", "null"] } } };
const reachSelection = { type: "object", additionalProperties: false, required: ["plugin_id", "snapshot"],
  properties: { plugin_id: { type: "string", pattern: PLUGIN_ID, maxLength: 160 }, snapshot: { type: "string", minLength: 1, maxLength: 1000 } } };
const reachAction = (name: "list" | "grant" | "revoke", title: string): ActionDefinition => ({
  capability_id: "plugins.project_reach." + name, version: name === "list" ? 2 : 1, operation: name === "list" ? "query" : "command", action: { ...metadata, scope: "project", title,
    description: "本人在当前项目设置里管理一个 Home 签名包读写此项目的同意。", kind: name === "list" ? "query" : "operation",
    effect: name === "list" ? "read" : "write", permissions: [name === "list" ? PLUGIN_CONSENT_READ : PLUGIN_CONSENT_WRITE],
    input_schema: name === "list" ? { type: "object", properties: {}, additionalProperties: false } : reachSelection,
    output_schema: name === "list" ? { type: "object", additionalProperties: false, required: ["plugins", "project_name", "capabilities"], properties: {
      plugins: { type: "array", items: reachView }, project_name: { type: "string" }, capabilities: { type: "array", items: reachCapability } } }
      : { type: "object", additionalProperties: false, required: ["plugin"], properties: { plugin: reachView } } } });
export const projectReachActions = {
  list: reachAction("list", "查看 Home 插件对当前项目的同意") as ActionDefinition<Record<string, never>, ReachOverview>,
  grant: reachAction("grant", "同意 Home 插件读写当前项目") as ActionDefinition<ProjectReachSelection, { plugin: ProjectReachView }>,
  revoke: reachAction("revoke", "撤回 Home 插件对当前项目的同意") as ActionDefinition<ProjectReachSelection, { plugin: ProjectReachView }>,
};

export const pluginConsentActions = {
  list: { capability_id: "plugins.consents.list", version: 2, operation: "query", action: { ...metadata,
    title: "查看插件的同意", description: "列出一个插件在本机的同意记录：常开、默认连线、默认输入组，含已撤回的；每一行说明是谁同意的（本人，或宿主为自己随带的插件代为同意）。",
    kind: "query", effect: "read", permissions: [PLUGIN_CONSENT_READ],
    input_schema: { type: "object", properties: { plugin_id: { type: "string", pattern: PLUGIN_ID, maxLength: 160 } }, required: ["plugin_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consents: { type: "array", items: consentView } }, required: ["consents"], additionalProperties: false } } } as ActionDefinition<{ plugin_id: string }, { consents: PluginConsentRecord[] }>,
  revoke: { capability_id: "plugins.consents.revoke", version: 2, operation: "command", action: { ...metadata,
    title: "撤回插件的同意", description: "撤回一条同意：常开的插件从此可以隐藏、移除、停用；默认连线下次评估时解开（人自己选的来源不动）。撤回后宿主不会为同一个插件再次代为同意；要恢复得由本人重新同意。",
    kind: "operation", effect: "write", permissions: [PLUGIN_CONSENT_WRITE],
    input_schema: { type: "object", properties: { consent_id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["consent_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consent: consentView }, required: ["consent"], additionalProperties: false } } } as ActionDefinition<{ consent_id: string }, { consent: PluginConsentRecord }>,
};

export function pluginConsentHandlers(ledger: PluginConsentLedger, now: () => string = () => new Date().toISOString()): ActionHandlerBinding[] {
  return [
    { capability_id: pluginConsentActions.list.capability_id, version: pluginConsentActions.list.version, handle: (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      return { consents: ledger.consents((input as { plugin_id: string }).plugin_id) };
    } },
    { capability_id: pluginConsentActions.revoke.capability_id, version: pluginConsentActions.revoke.version, handle: async (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      await caller.beforeEffect();
      if (ledger.consent((input as { consent_id: string }).consent_id)?.kind === "project_reach") throw new ActionError("actions.forbidden", "请在对应项目设置里撤回项目同意");
      const consent = ledger.revoke((input as { consent_id: string }).consent_id, now());
      if (!consent) throw pluginErrors.consent_unknown("没有这条同意记录");
      consentsChanged();
      return { consent };
    } },
  ];
}

/** Refuse plugin resolution before directory filtering can turn this entry restriction into a missing-dependency error. */
export function assertPluginConsentActionEntry(caller: ActionCallContext, reference: ActionReference): void {
  // Taking a publisher back is a withdrawal like taking an agreement back: the same entry, the same refusal (S-77, S-87).
  const named = (action: { capability_id: string; version: number }) => action.capability_id === reference.capability_id && action.version === reference.version;
  if ([...Object.values(pluginConsentActions), pluginInstallActions.revokePublisher].some(named)) assertPluginConsentSettingsEntry(caller);
  if (Object.values(projectReachActions).some(named)) assertProjectReachSettingsEntry(caller);
  // Changing what a plugin holds is the same kind of act and has its own door, the project settings page's (PG-002, S-94).
  if (named(pluginInstallActions.setPermission)) assertPluginPermissionSettingsEntry(caller);
  if (named(pluginInstallActions.setHomePermission)) assertHomePluginPermissionSettingsEntry(caller);
}

/** The Host's own provider of the person's agreements; it grants nothing to a plugin. */
export function pluginConsentProvider(ledger: PluginConsentLedger, projectReach?: () => Promise<ProjectReachConsents>, details?: ReachDetails): ActionProviderRegistration {
  const reachHandlers: ActionHandlerBinding[] = Object.entries(projectReachActions).map(([name, action]) => ({ capability_id: action.capability_id, version: action.version,
    handle: async (caller, input) => {
      assertProjectReachSettingsEntry(caller);
      if (!projectReach) throw new ActionError("actions.unavailable", "Home 插件的项目同意服务不可用");
      const owner = await projectReach();
      const check = async () => { await caller.beforeEffect(); assertProjectReachSettingsEntry(caller); };
      await check();
      if (name === "list") {
        if (!details) throw new ActionError("actions.unavailable", "项目与动作说明尚未就绪");
        const info = await details(caller.project_id!);
        await check();
        const plugins = owner.list(caller.project_id!), ids = [...new Set(plugins.flatMap(plugin => plugin.capability_ids))].sort();
        const capabilities = ids.map(capability_id => {
          const entry = latestCapability(info.capabilities, capability_id) ?? info.capabilities.filter(item => item.id === capability_id).sort((a, b) => b.version - a.version)[0];
          return { capability_id, title: entry?.title ?? capability_id, description: entry?.consent ?? "", available: Boolean(entry?.offered && entry.installed) };
        });
        return { plugins, project_name: info.project_name, capabilities };
      }
      return { plugin: await owner[name === "grant" ? "grant" : "revoke"](caller.project_id!, input as ProjectReachSelection, check) };
    } }));
  return { provider: { provider_id: PLUGIN_CONSENT_PROVIDER_ID, title: "插件的同意", kind: "system" },
    definitions: [...Object.values(pluginConsentActions), ...Object.values(projectReachActions)] as ActionDefinition[], handlers: [...pluginConsentHandlers(ledger), ...reachHandlers] };
}
