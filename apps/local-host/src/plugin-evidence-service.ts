import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_EVIDENCE_BATCH, PLUGIN_EVIDENCE_COLLECT_PERMISSION, type PluginEvidenceClient, type PluginEvidenceRelease } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import { openEvidenceLedger, type EvidenceHolder, type EvidenceLedger } from "@molis-ai/molis-work-service-evidence";
import { createEvidenceContentStore, runWithMolisWorkHome, type EvidenceContentStore } from "@molis-ai/molis-work-storage";

const refsOf = (value: readonly string[], what: string): string[] => {
  if (!Array.isArray(value) || value.length > PLUGIN_EVIDENCE_BATCH || !value.every(ref => typeof ref === "string")) {
    throw new ActionError("actions.input_invalid", `${what}一次最多 ${PLUGIN_EVIDENCE_BATCH} 份正文的引用`);
  }
  return value;
};

/**
 * `services.evidence` (specs/unified-partition-plugins §5, S-98, batch 109): the platform's evidence ledger (`horizontal/evidence`) for one
 * instance of a plugin the Host runs itself, in one partition, given when its Manifest declares `evidence:collect`. The holder is the
 * partition and installation the Host started the instance for, plus the key the plugin names; the plugin never names the partition or
 * the installation, so it reaches only its own holds.
 *
 * A hold may come from any of the instance's own work (an action, a kept job). Giving holds back deletes bodies, so a release or a reclaim
 * runs only inside the plugin's own running action that declares `evidence:collect`, never read-only, never another instance's, and the
 * instance must hold the permission on every call. Collection itself is the ledger's decision: a body any partition or installation still
 * holds is kept.
 */
export function pluginEvidenceFor(manifest: PluginManifest, context: PluginStartContext, partitionId: string, home: string | undefined,
  assertActive: () => void, store?: EvidenceContentStore): PluginEvidenceClient | undefined {
  if (home === undefined || !partitionId || !manifest.permissions.some(item => item.permission === PLUGIN_EVIDENCE_COLLECT_PERMISSION)) return undefined;
  const holder = (holderKey: string): EvidenceHolder => {
    if (typeof holderKey !== "string" || holderKey.length < 1 || holderKey.length > 200) throw new ActionError("actions.input_invalid", "持有键是 1 到 200 个字的文本");
    return { partition_id: partitionId, owner_install: context.install_id, holder_key: holderKey };
  };
  // Opened on each call, in this Home: the ledger and the store's folder and keys are the Home's, whichever Home the process is in.
  const withLedger = <T>(run: (ledger: EvidenceLedger) => T): T => {
    const ledger = openEvidenceLedger(home);
    try { return run(ledger); } finally { ledger.close(); }
  };
  const content = () => store ?? runWithMolisWorkHome(home, () => createEvidenceContentStore());
  /** The checks a call that may delete bodies passes, and the permissions the ledger sees on it. */
  const collecting = (): { readonly permissions: readonly string[] } => {
    assertActive();
    context.requireGrant(PLUGIN_EVIDENCE_COLLECT_PERMISSION);
    const scope = currentPluginInvocation();
    if (scope) assertCapturedPluginActionCurrent(scope, context);
    if (!scope || !("definition" in scope)) throw new ActionError("actions.forbidden", "回收证据正文只能在本插件自己的动作里使用");
    if (!scope.definition.action.permissions.includes(PLUGIN_EVIDENCE_COLLECT_PERMISSION)) throw new ActionError("actions.forbidden", "这个动作没有声明 evidence:collect");
    if (pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读调用里不能回收证据正文");
    scope.caller.signal?.throwIfAborted();
    return { permissions: [PLUGIN_EVIDENCE_COLLECT_PERMISSION] };
  };
  const giveBack = (holderKey: string, refs: readonly string[] | "all", candidates: readonly string[]): PluginEvidenceRelease => {
    const who = holder(holderKey), caller = collecting();
    const outcome = runWithMolisWorkHome(home, () => withLedger(ledger => ledger.releaseAndCollect(caller, content(), who, refs, candidates)));
    return { holds_released: outcome.released, bodies_deleted: outcome.deleted.length, bodies_kept: outcome.kept.length };
  };
  // Answered as promises: the ledger is this process's SQLite today, but a holder may not assume it always will be.
  return Object.freeze<PluginEvidenceClient>({
    async hold(holderKey, contentRefs) {
      const who = holder(holderKey), refs = refsOf(contentRefs, "登记");
      assertActive();
      context.requireGrant(PLUGIN_EVIDENCE_COLLECT_PERMISSION);
      const scope = currentPluginInvocation();
      if (scope) {
        assertCapturedPluginActionCurrent(scope, context);
        scope.caller.signal?.throwIfAborted();
      }
      return { held: withLedger(ledger => ledger.hold(who, refs)) };
    },
    reclaim: async (holderKey, contentRefs) => giveBack(holderKey, refsOf(contentRefs, "收回"), contentRefs),
    release: async (holderKey, candidates) => giveBack(holderKey, "all", refsOf(candidates, "释放")),
  });
}
