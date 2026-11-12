import type { PluginRetainedItem, PluginUninstallResult } from "@molis-ai/molis-work-contracts/platform/plugin-trust";

/**
 * What an uninstall's owners kept that they would otherwise have taken off, and why (BL-915), carried in memory from the owner that kept it to
 * the door that answers the person: no table, no file. Only an uninstall under way collects (`collectRetained`); an owner's note outside one
 * goes nowhere. Keyed by the place the installation comes off (a project, or the Home: null) and its id, which every place shares.
 * A replay of a finished uninstall collects nothing: what it kept was answered the first time.
 */
const open = new Map<string, PluginRetainedItem[]>();
const keyOf = (projectId: string | null, installId: string) => `${projectId ?? ""}\u0000${installId}`;

export async function collectRetained(projectId: string | null, installId: string, run: () => Promise<void>): Promise<PluginRetainedItem[]> {
  const key = keyOf(projectId, installId), kept: PluginRetainedItem[] = [];
  open.set(key, kept);
  try { await run(); return kept; } finally { if (open.get(key) === kept) open.delete(key); }
}

/** One kind of thing kept, once per kind, reason and label. */
export function noteRetained(projectId: string | null, installId: string, item: PluginRetainedItem): void {
  const kept = open.get(keyOf(projectId, installId));
  if (kept && !kept.some(other => other.kind === item.kind && other.reason === item.reason && other.label === item.label)) kept.push(item);
}

/** What a settings door answers for a switch or an uninstall: the state afterwards, and what stayed behind only when something did. */
export type PackageControlOutcome = Omit<PluginUninstallResult, "plugin_id">;
export const controlOutcome = (state: string, retained: readonly PluginRetainedItem[] = []): PackageControlOutcome => retained.length ? { state, retained } : { state };
