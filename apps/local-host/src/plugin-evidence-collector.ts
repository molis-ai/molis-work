import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PLUGIN_EVIDENCE_COLLECT_PERMISSION, type PluginEvidenceCollectorClient } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import { createEvidenceContentStore, runWithMolisWorkHome, type EvidenceContentStore } from "@molis-ai/molis-work-storage";

/** More than a release or a reclaim names in one batch (`FEED_CONTENT_LEDGER_BATCH`), so a larger list is a mistake and not a workload. */
const MAX_CANDIDATES = 10_000;

/**
 * `services.evidenceCollector` (S-98 provisional): the Home's evidence store, for the Home instance of a plugin that keeps the reference
 * ledger of bodies its projects hold. It deletes only what the plugin's own ledger says nothing refers to, and only from the plugin's own
 * running action: outside every call, in a scene, in a kept job, in a read-only call, and from another instance (the other half of a
 * dual-instance plugin included) it refuses. The action must declare the permission itself, and the instance must hold it, on every call.
 * A project instance is given none: the store is the Home's, and the ledger it answers for is the Home half's.
 */
export function pluginEvidenceCollectorFor(manifest: PluginManifest, context: PluginStartContext, projectId: string | null, home: string,
  assertActive: () => void, store?: EvidenceContentStore): PluginEvidenceCollectorClient | undefined {
  if (projectId !== null || !manifest.permissions.some(item => item.permission === PLUGIN_EVIDENCE_COLLECT_PERMISSION)) return undefined;
  // Opened when the first body is collected, in this Home: the store's folder and its keys are the Home's, whichever Home the process is in.
  const content = () => store ?? runWithMolisWorkHome(home, () => createEvidenceContentStore());
  return Object.freeze({
    collect(input: { readonly candidates: Iterable<string>; isReferenced(contentRef: string): boolean }) {
      if (!input || typeof input.isReferenced !== "function" || typeof input.candidates?.[Symbol.iterator] !== "function") throw new ActionError("actions.input_invalid", "回收证据正文要给候选引用和一个「是否还有人引用」的判断");
      const candidates = [...input.candidates];
      if (candidates.length > MAX_CANDIDATES || !candidates.every(ref => typeof ref === "string")) throw new ActionError("actions.input_invalid", "候选引用必须是不超过一万条的文本");
      assertActive(); context.requireGrant(PLUGIN_EVIDENCE_COLLECT_PERMISSION);
      const scope = currentPluginInvocation();
      // The other half's action is refused here by name (it is not this instance's), the same way every service of an instance refuses it.
      if (scope) assertCapturedPluginActionCurrent(scope, context);
      if (!scope || !("definition" in scope)) throw new ActionError("actions.forbidden", "回收证据正文只能在本插件自己的动作里使用");
      if (!scope.definition.action.permissions.includes(PLUGIN_EVIDENCE_COLLECT_PERMISSION)) throw new ActionError("actions.forbidden", "这个动作没有声明 evidence:collect");
      if (pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "只读调用里不能回收证据正文");
      scope.caller.signal?.throwIfAborted();
      return runWithMolisWorkHome(home, () => content().collect({ candidates, isReferenced: input.isReferenced }));
    },
  });
}
