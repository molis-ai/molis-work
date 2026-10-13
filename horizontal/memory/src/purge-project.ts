import type { MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { projectPrefsKey } from "./prefs.js";
import type { MemoryBackendPort } from "./service.js";

/**
 * The project is deleted: its memories and those of its Characters go from the store, every candidate waiting in their
 * boxes with them, and the ledger forgets them with their history (earlier texts, uses, changes, held candidates, pairs,
 * the project's switches and interface counts). No confirmation step: deleting the project was the person's confirmation.
 * Safe to run again; a scope written to between listing and clearing makes the store refuse, and the call fails so the
 * deletion's receipt retries it.
 *
 * A Character's scope is found from the owners the ledger noted for the project and from the notes on candidates held in
 * it (a suggestion made before its owner was noted still names its scope). `backend` is null where the Home has no Agent
 * runtime, so no store: only the ledger has anything to forget.
 */
export async function purgeProjectMemories(ports: { backend: MemoryBackendPort | null; ledger: MemoryLedgerPort }, projectId: string): Promise<{ removed: number }> {
  const { backend, ledger } = ports;
  const scopes: Array<{ scope: MemoryScope; owner: string }> = [{ scope: "project", owner: projectId }];
  for (const found of [...ledger.owners(projectId), ...ledger.candidateOwners(projectId)]) {
    if (found.scope === "character" && !scopes.some(target => target.scope === "character" && target.owner === found.owner)) scopes.push({ scope: "character", owner: found.owner });
  }
  const forgotten = new Set<string>();
  if (backend) for (const target of scopes) await purgeScope(backend, target, forgotten);
  ledger.transaction(() => {
    for (const id of forgotten) ledger.forget(id);
    ledger.forgetScopes({ scopes, project_id: projectId, prefs_keys: [projectPrefsKey(projectId)],
      signal_prefixes: scopes.map(target => `${target.scope}|${target.owner}|`), marker_keys: scopes.map(target => `tidy:${target.scope}:${target.owner}`) });
  });
  return { removed: forgotten.size };
}

/** Empties one scope of the store: its candidates, then its memories (the ids go into `forgotten` for the ledger). */
async function purgeScope(backend: MemoryBackendPort, target: { scope: MemoryScope; owner: string }, forgotten: Set<string>): Promise<void> {
  for (const entry of await backend.list(target.scope, target.owner)) forgotten.add(entry.memory_id);
  for (const candidate of await backend.candidates.list(target.scope, target.owner)) await backend.candidates.purge({ ...target, candidate_id: candidate.candidate_id });
  if (backend.previewScope && backend.clearScope) {
    const preview = await backend.previewScope(target.scope, target.owner);
    if (preview.count) for (const id of await backend.clearScope({ ...target, fingerprint: preview.fingerprint })) forgotten.add(id);
  } else {
    for (const entry of await backend.list(target.scope, target.owner)) await backend.remove({ ...target, memory_id: entry.memory_id });
  }
}
