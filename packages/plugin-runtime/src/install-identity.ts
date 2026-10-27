import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginDefinition, PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConsentGrant, PluginTrust } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { assertConsentsDeclared, assertPluginTrust, assertScopeFitsRuntime, assertTrustFitsDefinition, type InProcessAdmission } from "./trust-rules.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

// Who an install may say it is (ac-trust T6, specs/repository-anti-corruption/slices/ac-trust-install.md §3.6, S-75). A publisher's
// signature is a label the author writes unless a pinned key backs it, so the label alone never gives a plugin another's identity, and
// the names plugins live under (`plugin_id`, the contribution ids made from it) belong to whoever came first.

/** The form of a pinned key's fingerprint (`contracts/platform/plugin-trust`): a label in this form would pass for one. */
const FINGERPRINT_FORM = "ed25519:sha256:";

/** `a` and `b` are different ids on one dotted path (`io.a.b` and `io.a.b.c`), one under the other. */
const nested = (a: string, b: string): boolean => a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * Checks what an install is called with, and answers its trust. S-75.1: only `pinned` may carry a fingerprint, matching its trusted key
 * (`plugin.signer_mismatch`). S-75.2 and S-75.4, for an install that is not of the Host's build: its `plugin_id` may not be one the
 * Host's build ships (`hostIds`) or nest with one, and may not nest with the id of another publisher's installation that is not
 * uninstalled (`plugin.id_namespace_conflict`); only the same pinned key's ids may nest. Unsigned labels never establish identity.
 * The Host's build is not refused here: an id
 * that comes with a later release is the Host's to give, and what already holds one is then the later one's to answer.
 */
export function assertInstallIdentity(
  input: { readonly trust: unknown; readonly definition: PluginDefinition; readonly consents?: readonly PluginConsentGrant[] },
  installed: readonly PluginInstanceRecord[], hostIds: ReadonlySet<string>, runtimeScope?: "home" | "project", inProcess?: InProcessAdmission,
): PluginTrust {
  const trust = assertPluginTrust(input.trust);
  const { plugin_id: id, publisher } = input.definition.manifest;
  assertTrustFitsDefinition(input.definition, trust, inProcess);
  assertScopeFitsRuntime(input.definition.manifest, trust, runtimeScope);
  assertConsentsDeclared(input.definition.manifest, input.consents ?? []);
  if (trust.level === "pinned" ? publisher.signature !== trust.publisher_key_id : publisher.signature.trim().toLowerCase().startsWith(FINGERPRINT_FORM)) {
    throw pluginErrors.signer_mismatch("发布者签名只有验过的固定公钥才能写成指纹的形式；自己写的标签不能冒充某个发布者");
  }
  if (trust.level === "host") return trust;
  for (const reserved of hostIds) {
    if (reserved === id || nested(reserved, id)) throw pluginErrors.id_namespace_conflict(`插件 ID ${id} 与随宿主发布的 ${reserved} 冲突`);
  }
  for (const record of installed) {
    if (record.state === "uninstalled" || record.plugin_id === id || !nested(record.plugin_id, id)) continue;
    if (trust.level !== "pinned" || record.publisher_trust !== "pinned" || record.publisher_signature !== trust.publisher_key_id) {
      throw pluginErrors.id_namespace_conflict(`插件 ID ${id} 与另一个发布者已装的 ${record.plugin_id} 在同一条点分路径上，不能安装`);
    }
  }
  return trust;
}

/** Recheck normally loaded records before any activation; persisted pinned signatures are the key bound at installation. */
export function assertStartIdentity(record: PluginInstanceRecord, definition: PluginDefinition, installed: readonly PluginInstanceRecord[], hostIds: ReadonlySet<string>,
  runtimeScope?: "home" | "project", inProcess?: InProcessAdmission): void {
  const trust: PluginTrust = record.publisher_trust === "pinned"
    ? { level: "pinned", publisher_key_id: record.publisher_signature } : { level: record.publisher_trust };
  assertInstallIdentity({ trust, definition }, installed, hostIds, runtimeScope, inProcess);
}

/** An identity conflict (or code that may not run in the Host's process, S-75 ⑥) needs changed installation facts, not repeated executor recovery attempts. */
export const isIdentityFailure = (error: unknown): error is ActionError => error instanceof ActionError
  && (error.code === "plugin.signer_mismatch" || error.code === "plugin.id_namespace_conflict" || error.code === "plugin.in_process_denied");

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
