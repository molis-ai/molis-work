import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentGrant, PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { assertConsentsDeclared, assertPluginTrust, assertTrustFitsExecution } from "./trust-rules.js";

// Who an install may say it is (ac-trust T6, specs/repository-anti-corruption/slices/ac-trust-install.md §3.6, S-75). A publisher's
// signature is a label the author writes unless a pinned key backs it, so the label alone never gives a plugin another's identity, and
// the names plugins live under (`plugin_id`, the contribution ids made from it) belong to whoever came first.

/** The form of a pinned key's fingerprint (`contracts/platform/plugin-trust`): a label in this form would pass for one. */
const FINGERPRINT_FORM = "ed25519:sha256:";

/** What a Runtime composed without a Host list reserves: nothing. Only fixtures are composed so (`apps/` always passes the list). */
export const NO_HOST_IDS: ReadonlySet<string> = new Set();

/** `a` and `b` are different ids on one dotted path (`io.a.b` and `io.a.b.c`), one under the other. */
const nested = (a: string, b: string): boolean => a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * The names an installation may live under (S-75.2 and S-75.4), for an install that is not of the Host's build: its `plugin_id` may not be
 * one the Host's build ships (`hostIds`) or nest with one, and may not nest with the id of any other installation that is not uninstalled,
 * unless both are of the same pinned key. Only a key gives a publisher an identity: an unsigned install's signature is a label anyone can
 * copy, so unsigned installs never nest with another install, whatever their labels say (`plugin.id_namespace_conflict`).
 */
function assertNamespace(level: string, signature: string, id: string, others: readonly PluginInstanceRecord[], hostIds: ReadonlySet<string>): void {
  if (level === "host") return;
  for (const reserved of hostIds) {
    if (reserved === id || nested(reserved, id)) throw pluginErrors.id_namespace_conflict(`插件 ID ${id} 与随宿主发布的 ${reserved} 冲突`);
  }
  for (const record of others) {
    if (record.state === "uninstalled" || record.plugin_id === id || !nested(record.plugin_id, id)) continue;
    const sameKey = level === "pinned" && record.publisher_trust === "pinned" && record.publisher_signature === signature;
    if (!sameKey) throw pluginErrors.id_namespace_conflict(`插件 ID ${id} 与已装的 ${record.plugin_id} 在同一条点分路径上，不能安装`);
  }
}

/**
 * Checks what an install is called with, and answers its trust. S-75.1: no level but `pinned` may carry a signature in the fingerprint
 * form (`plugin.signer_mismatch`). S-75.2 and S-75.4: the names rule above; the Host's build is not refused here, an id that comes with
 * a later release is the Host's to give, and what already holds one is then the later one's to answer (`assertInstalledNamespace`).
 * `hostIds` is a Host's list of the ids its build ships; a Runtime composed without one reserves none, which only fixtures do.
 */
export function assertInstallIdentity(
  input: { readonly trust: unknown; readonly definition: PluginDefinition; readonly consents?: readonly PluginConsentGrant[] },
  installed: readonly PluginInstanceRecord[], hostIds: ReadonlySet<string>,
): PluginTrust {
  const trust = assertPluginTrust(input.trust);
  const { plugin_id: id, publisher } = input.definition.manifest;
  assertTrustFitsExecution(trust, input.definition.execution ?? "host");
  assertConsentsDeclared(input.definition.manifest, input.consents ?? []);
  if (trust.level !== "pinned" && publisher.signature.startsWith(FINGERPRINT_FORM)) {
    throw pluginErrors.signer_mismatch("发布者签名只有验过的固定公钥才能写成指纹的形式；自己写的标签不能冒充某个发布者");
  }
  assertNamespace(trust.level, publisher.signature, id, installed, hostIds);
  return trust;
}

/**
 * The same names rule for an installation already on record, asked again when it starts: what came to be held before the rule, or by
 * a Host build that now ships the id, is not let run (the caller records it `crashed` with this error) and never becomes a provider.
 */
export function assertInstalledNamespace(record: PluginInstanceRecord, installed: readonly PluginInstanceRecord[], hostIds: ReadonlySet<string>): void {
  assertNamespace(record.publisher_trust, record.publisher_signature, record.plugin_id, installed.filter(other => other.install_id !== record.install_id), hostIds);
}

/**
 * The id an installation's actions are registered under (S-75.3): its installation id, or its `plugin_id` only if it is of the Host's
 * build. The Host says which (`providerId`); what it says is held to this, so no other installation can be the provider a `plugin_id` names.
 */
export function actionProviderId(
  actions: { providerId?(record: PluginInstanceRecord, definition: PluginDefinition): string } | undefined,
  record: PluginInstanceRecord, definition: PluginDefinition,
): string {
  const id = actions?.providerId?.(record, definition) ?? record.install_id;
  if (id !== record.install_id && !(id === record.plugin_id && record.publisher_trust === "host")) {
    throw pluginErrors.id_namespace_conflict(`${record.plugin_id} 不是随宿主发布的插件，不能以插件 ID 作动作提供方`);
  }
  return id;
}
