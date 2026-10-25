import type { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentLedger } from "./consent-ledger.js";
import { consentSubject } from "./trust-rules.js";

// 常开插件 (ac-trust T3, specs/repository-anti-corruption/slices/ac-trust-install.md §3.4): a plugin is on in every project, and stays
// installed and on, exactly while an unrevoked `always_on` agreement of the Home's consent ledger names it. An agreement exists only
// for a Manifest that declares `always_on` (a grant for anything else is refused when it is recorded), so the ledger alone answers.

/** Whether the Home holds a standing `always_on` agreement for this plugin from this publisher. */
export function alwaysOnAgreed(ledger: PluginConsentLedger | undefined, pluginId: string, publisherSignature: string): boolean {
  return ledger?.consents(pluginId).some(row => row.kind === "always_on" && row.subject === consentSubject.alwaysOn()
    && row.publisher_signature === publisherSignature && row.revoked_at === null) === true;
}

/** Why a person may not switch this installation off or uninstall it: it is a 常开 plugin and the agreement stands. Undefined when they may. */
export function leaveRefusal(ledger: PluginConsentLedger | undefined, record: PluginInstanceRecord | null | undefined, action: "停用" | "卸载"): ActionError | undefined {
  if (!record || !alwaysOnAgreed(ledger, record.plugin_id, record.publisher_signature)) return undefined;
  return pluginErrors.always_on(`${record.plugin_id} 是常开插件，不能${action}；先收回常开的同意`);
}
