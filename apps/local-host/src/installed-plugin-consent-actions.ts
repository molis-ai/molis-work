import { type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentRecord } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import type { PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { consentsChanged } from "./consent-revision.js";
import { assertHomePluginPermissionSettingsEntry, assertPluginConsentSettingsEntry, assertPluginPermissionSettingsEntry } from "./plugin-consent-settings-entry.js";
import { pluginInstallActions } from "./plugin-install-actions.js";

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
  required: ["consent_id", "plugin_id", "publisher_signature", "kind", "subject", "manifest_digest", "granted_at", "granted_by", "revoked_at"],
  properties: {
    consent_id: { type: "string" }, plugin_id: { type: "string" }, publisher_signature: { type: "string" }, kind: { enum: ["always_on", "default_wiring", "default_group", "local_directory"] },
    subject: { type: "string" }, manifest_digest: { type: "string" }, granted_at: { type: "string" }, granted_by: { enum: ["user", "host_build"] }, revoked_at: { type: ["string", "null"] },
  },
};

export const pluginConsentActions = {
  list: { capability_id: "plugins.consents.list", version: 1, operation: "query", action: { ...metadata,
    title: "查看插件的同意", description: "列出一个插件在本机的同意记录：常开、默认连线、默认输入组，含已撤回的；每一行说明是谁同意的（本人，或宿主为自己随带的插件代为同意）。",
    kind: "query", effect: "read", permissions: [PLUGIN_CONSENT_READ],
    input_schema: { type: "object", properties: { plugin_id: { type: "string", pattern: PLUGIN_ID, maxLength: 160 } }, required: ["plugin_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consents: { type: "array", items: consentView } }, required: ["consents"], additionalProperties: false } } } as ActionDefinition<{ plugin_id: string }, { consents: PluginConsentRecord[] }>,
  revoke: { capability_id: "plugins.consents.revoke", version: 1, operation: "command", action: { ...metadata,
    title: "撤回插件的同意", description: "撤回一条同意：常开的插件从此可以隐藏、移除、停用；默认连线下次评估时解开（人自己选的来源不动）。撤回后宿主不会为同一个插件再次代为同意；要恢复得由本人重新同意。",
    kind: "operation", effect: "write", permissions: [PLUGIN_CONSENT_WRITE],
    input_schema: { type: "object", properties: { consent_id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["consent_id"], additionalProperties: false },
    output_schema: { type: "object", properties: { consent: consentView }, required: ["consent"], additionalProperties: false } } } as ActionDefinition<{ consent_id: string }, { consent: PluginConsentRecord }>,
};

export function pluginConsentHandlers(ledger: PluginConsentLedger, now: () => string = () => new Date().toISOString()): ActionHandlerBinding[] {
  return [
    { capability_id: pluginConsentActions.list.capability_id, version: 1, handle: (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      return { consents: ledger.consents((input as { plugin_id: string }).plugin_id) };
    } },
    { capability_id: pluginConsentActions.revoke.capability_id, version: 1, handle: async (caller, input) => {
      assertPluginConsentSettingsEntry(caller);
      await caller.beforeEffect();
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
  // Changing what a plugin holds is the same kind of act and has its own door, the project settings page's (PG-002, S-94).
  if (named(pluginInstallActions.setPermission)) assertPluginPermissionSettingsEntry(caller);
  if (named(pluginInstallActions.setHomePermission)) assertHomePluginPermissionSettingsEntry(caller);
}

/** The Host's own provider of the person's agreements; it grants nothing to a plugin. */
export function pluginConsentProvider(ledger: PluginConsentLedger): ActionProviderRegistration {
  return { provider: { provider_id: PLUGIN_CONSENT_PROVIDER_ID, title: "插件的同意", kind: "system" },
    definitions: Object.values(pluginConsentActions) as ActionDefinition[], handlers: pluginConsentHandlers(ledger) };
}
