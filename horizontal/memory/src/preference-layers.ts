import { memoryPreferenceMarkerPrefix, type MemoryLedgerPort, type MemoryPrefs } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";
import { projectPrefsKey } from "./prefs.js";

interface PreferenceLayer {
  revision: number;
  explicit: boolean;
}

export function preferenceLayer(ledger: MemoryLedgerPort, actor: string, profile: string, exists?: boolean): PreferenceLayer {
  const marker = ledger.marker(actor, memoryPreferenceMarkerPrefix(profile) + "layer");
  if (!marker) return { revision: 0, explicit: exists ?? (ledger.prefs(actor, profile) !== null) };
  const layer = marker.body as PreferenceLayer | null;
  if (!layer || !Number.isSafeInteger(layer.revision) || layer.revision < 1 || typeof layer.explicit !== "boolean") {
    throw memoryErrors.unavailable("无法读取记忆偏好的修订");
  }
  return layer;
}

/** Keep the owner's normal preference rows and their revision in one commit, including a return to inheritance. */
export function savePreferenceLayer(ledger: MemoryLedgerPort, actor: string, profile: string, prefs: MemoryPrefs | null, explicit: boolean, projectId?: string): void {
  ledger.transaction(() => {
    const revision = preferenceLayer(ledger, actor, profile).revision + 1;
    if (prefs) ledger.savePrefs(actor, profile, prefs);
    else if (projectId && profile === projectPrefsKey(projectId)) ledger.deleteProjectPrefs(actor, projectId);
    else throw memoryErrors.invalid("只有当前项目的覆盖可以删除");
    ledger.setMarker(actor, memoryPreferenceMarkerPrefix(profile) + "layer", { revision, explicit }, new Date().toISOString());
  });
}
