import { existsSync, readdirSync } from "node:fs";
import { basename } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultPrefs, isCompletePrefs, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { hasOnlyStorageOwnerFiles, homeSqlitePath, MEMORY_LEDGER_STORE, openMemoryLedger, type StorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";

/** Initialize only a fresh Home's complete product prefs; an existing ledger must already contain current prefs. */
export function prepareMemoryHome(home: string, owner?: StorageOwner): boolean {
  const hasLedger = existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  const newHome = !hasLedger && freshMemoryHome(home, owner);
  if (!hasLedger && !newHome) throw memoryErrors.unavailable("这个非空 Home 缺少记忆库，不会将它当作新 Home 初始化");
  const ledger = openMemoryLedger({ homeDirectory: home });
  let initialized = false;
  try {
    if (newHome) ledger.transaction(() => {
      // A concurrent supported entry may have initialized the same fresh Home first; never overwrite its choice.
      if (ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal") || ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project-default")) return;
      ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "personal", defaultPrefs("personal", "reviewed"));
      ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, "project-default", defaultPrefs("project", "reviewed"));
      initialized = true;
    });
    if (!isCompletePrefs(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "personal"))
      || !isCompletePrefs(ledger.prefs(LOCAL_PERSON_ACTOR_ID, "project-default"))) {
      throw memoryErrors.unavailable("这个 Home 缺少完整的现行记忆设置，不会补造或转换设置");
    }
    return initialized;
  } finally { ledger.close(); }
}

/** Early ownership adds only technical files; an SDK entry, unknown file or existing ledger never becomes fresh. */
function freshMemoryHome(home: string, owner: StorageOwner | undefined): boolean {
  if (!existsSync(home)) return true;
  const entries = readdirSync(home);
  if (entries.length === 0) return true;
  const runtime = agentRuntimeDirectory(home);
  return owner !== undefined && entries.length === 1 && entries[0] === basename(runtime) && hasOnlyStorageOwnerFiles(runtime, owner);
}
