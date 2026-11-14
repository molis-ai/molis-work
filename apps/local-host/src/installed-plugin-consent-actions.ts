import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { ActionError, bindActionHandler, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { consentSubject, pluginManifestDigest, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { systemOutputSource } from "@molis-ai/molis-work-contracts/platform/project-materials";
import { builtinPluginByManifestId } from "./plugin-registry.js";
import { consentsChanged } from "./consent-revision.js";
import { assertHomePluginPermissionSettingsEntry, assertPluginConsentSettingsEntry, assertPluginPermissionSettingsEntry, assertProjectReachSettingsEntry } from "./plugin-consent-settings-entry.js";
import { pluginInstallActions } from "./plugin-install-actions.js";
import type { ProjectReachConsents, ProjectReachSelection, ProjectReachView } from "./plugin-project-reach-consent.js";
import type { CatalogCapability } from "./plugin-builder/catalog.js";
import { latestCapability } from "./plugin-builder/capabilities.js";

// Taking an agreement back (ac-trust T5, specs/archive/repository-anti-corruption/slices/ac-trust-install.md §3.3, S-77). The Home's consent ledger
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
const reachAction = (name: "list" | "grant" | "revoke", version: number, title: string): ActionDefinition => createActionDefinition("plugins.project_reach." + name, name === "list" ? "query" : "command", { ...metadata, scope: "project", title,
    description: "本人在当前项目设置里管理一个 Home 签名包读写此项目的同意。", kind: name === "list" ? "query" : "operation",
    effect: name === "list" ? "read" : "write", permissions: [name === "list" ? PLUGIN_CONSENT_READ : PLUGIN_CONSENT_WRITE],
    input_schema: name === "list" ? { type: "object", properties: {}, additionalProperties: false } : reachSelection,
    output_schema: name === "list" ? { type: "object", additionalProperties: false, required: ["plugins", "project_name", "capabilities"], properties: {
      plugins: { type: "array", items: reachView }, project_name: { type: "string" }, capabilities: { type: "array", items: reachCapability } } }
      : { type: "object", additionalProperties: false, required: ["plugin"], properties: { plugin: reachView } } }, version);
export const projectReachActions = {
  list: reachAction("list", /* @version action.plugins.project_reach.list */ 1, "查看 Home 插件对当前项目的同意") as ActionDefinition<Record<string, never>, ReachOverview>,
  grant: reachAction("grant", /* @version action.plugins.project_reach.grant */ 1, "同意 Home 插件读写当前项目") as ActionDefinition<ProjectReachSelection, { plugin: ProjectReachView }>,
  revoke: reachAction("revoke", /* @version action.plugins.project_reach.revoke */ 1, "撤回 Home 插件对当前项目的同意") as ActionDefinition<ProjectReachSelection, { plugin: ProjectReachView }>,
};

export const pluginConsentActions = {
  list: { capability_id: "plugins.consents.list", version: /* @version action.plugins.consents.list */ 1, operation: "query", action: { ...metadata,
    title: "查看插件的同意", description: "列出一个插件在本机的同意记录：常开、默认连线、默认输入组，含已撤回的；每一行说明是谁同意的（本人，或宿主为自己随带的插件代为同意）。",
    kind: "query", effect: "read", permissions: [PLUGIN_CONSENT_READ],
    input_schema: { type: "object", properties: { plugin_id: { type: "string", pattern: PLUGIN_ID, maxLength: 160 } }, required: ["plugin_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consents: { type: "array", items: consentView } }, required: ["consents"], additionalProperties: false } } } as ActionDefinition<{ plugin_id: string }, { consents: PluginConsentRecord[] }>,
  revoke: { capability_id: "plugins.consents.revoke", version: /* @version action.plugins.consents.revoke */ 1, operation: "command", action: { ...metadata,
    title: "撤回插件的同意", description: "撤回一条同意：常开的插件从此可以隐藏、移除、停用；默认连线下次评估时解开（人自己选的来源不动）。撤回后宿主不会为同一个插件再次代为同意；要恢复得由本人重新同意。",
    kind: "operation", effect: "write", permissions: [PLUGIN_CONSENT_WRITE],
    input_schema: { type: "object", properties: { consent_id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["consent_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consent: consentView }, required: ["consent"], additionalProperties: false } } } as ActionDefinition<{ consent_id: string }, { consent: PluginConsentRecord }>,
  /**
   * The person's own agreement to a default the Host does not give on its own: a plugin it ships that reads, by default, from one of the
   * platform's producers, where an upgrade moved the default there (Files retirement, BSH-06). Only a port and source that plugin's
   * Manifest declares; the agreement is recorded as the person's, never the Host's.
   */
  grantDefaultSource: { capability_id: "plugins.consents.grant_default_source", version: /* @version action.plugins.consents.grant_default_source */ 1, operation: "command", action: { ...metadata,
    title: "同意默认来源", description: "本人同意宿主随带的一个插件按它声明的默认来源，从平台的资料服务读取输入（例如 Diff 的前后快照）；只能同意 Manifest 声明的端口与来源，记为本人的同意。",
    kind: "operation", effect: "write", permissions: [PLUGIN_CONSENT_WRITE],
    input_schema: { type: "object", properties: { plugin_id: { type: "string", pattern: PLUGIN_ID, maxLength: 160 }, port: { type: "string", minLength: 1, maxLength: 100 } },
      required: ["plugin_id", "port"], additionalProperties: false },
    output_schema: { type: "object", properties: { consent: consentView }, required: ["consent"], additionalProperties: false } } } as ActionDefinition<{ plugin_id: string; port: string }, { consent: PluginConsentRecord }>,
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
    bindActionHandler(pluginConsentActions.grantDefaultSource, async (input, caller) => {
      assertPluginConsentSettingsEntry(caller);
      const manifest = builtinPluginByManifestId(input.plugin_id)?.manifest;
      const source = manifest?.ports?.inputs?.find(port => port.port === input.port)?.default_source;
      const system = source ? systemOutputSource(source.plugin_id) : undefined;
      if (!manifest || !source || !system) throw new ActionError("actions.target_invalid", "只能同意宿主随带的插件声明、从平台资料服务读取的默认来源");
      const subject = consentSubject.defaultWiring(input.port, source, system.signature);
      await caller.beforeEffect();
      assertPluginConsentSettingsEntry(caller);
      ledger.record({ plugin_id: manifest.plugin_id, publisher_signature: manifest.publisher.signature, manifest_digest: pluginManifestDigest(manifest), granted_by: "user",
        grants: [{ kind: "default_wiring", subject }], at: now() });
      const consent = ledger.consents(manifest.plugin_id).find(row => row.kind === "default_wiring" && row.subject === subject && row.revoked_at === null
        && row.publisher_signature === manifest.publisher.signature);
      if (!consent) throw pluginErrors.consent_unknown("同意没有记下");
      consentsChanged();
      return { consent };
    }),
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
