import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { projectPrefsKey } from "./prefs.js";
import type { MemoryBackendPort } from "./service.js";

/**
 * The project is deleted: its memories and those of its Characters go from the store, every candidate waiting in their
 * boxes with them, and the ledger forgets them with their history (earlier texts, uses, changes, held candidates, pairs,
 * the project's switches and interface counts). No confirmation step: deleting the project was the person's confirmation.
 * Safe to run again; a scope written to between listing and clearing makes the store refuse, and the call fails so the
 * deletion's receipt retries it.
 */
export async function purgeProjectMemories(ports: { backend: MemoryBackendPort; ledger: MemoryLedgerPort }, projectId: string): Promise<{ removed: number }> {
  const { backend, ledger } = ports;
  const scopes: Array<{ scope: MemoryScope; owner: string }> = [{ scope: "project", owner: projectId },
    ...ledger.owners(projectId).filter(owner => owner.scope === "character").map(owner => ({ scope: "character" as const, owner: owner.owner }))];
  const forgotten = new Set<string>();
  for (const target of scopes) {
    for (const entry of await backend.list(target.scope, target.owner)) forgotten.add(entry.memory_id);
    for (const candidate of await backend.candidates.list(target.scope, target.owner)) await backend.candidates.purge({ ...target, candidate_id: candidate.candidate_id });
    if (backend.previewScope && backend.clearScope) {
      const preview = await backend.previewScope(target.scope, target.owner);
      if (preview.count) for (const id of await backend.clearScope({ ...target, fingerprint: preview.fingerprint })) forgotten.add(id);
    } else {
      for (const entry of await backend.list(target.scope, target.owner)) await backend.remove({ ...target, memory_id: entry.memory_id });
    }
  }
  ledger.transaction(() => {
    for (const id of forgotten) ledger.forget(id);
    ledger.forgetScopes({ scopes, project_id: projectId, prefs_keys: [projectPrefsKey(projectId)],
      signal_prefixes: scopes.map(target => `${target.scope}|${target.owner}|`), marker_keys: scopes.map(target => `tidy:${target.scope}:${target.owner}`) });
  });
  return { removed: forgotten.size };
}
