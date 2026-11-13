import { existsSync, lstatSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { defaultPrefs, isCompletePrefs, memoryErrors } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, assertNoPendingHomeRestore, assertStorageOwner, syncPath, finishMemoryLedgerUpgrade, hasOnlyStorageOwnerFiles, hasStorageBusinessFiles, homeSqlitePath,
  initializeMemoryForgetting, inspectMemoryForgetting, MEMORY_LEDGER_STORE, openMemoryLedger, readStorageSpace, startMemoryForgettingGeneration, type StorageOwner } from "@molis-ai/molis-work-storage";
import { agentRuntimeDirectory } from "../agent-runtime-paths.js";

/** Reject an obviously invalid Home without creating owner files; initialization still requires the locked checks below. */
export function preflightMemoryHome(home: string): void {
  assertNoPendingHomeRestore(agentRuntimeDirectory(home));
  if (existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE)) || !existsSync(home)) return;
  const runtime = agentRuntimeDirectory(home);
  if (homeBusinessEntries(home).some(entry => entry !== basename(runtime)) || hasStorageBusinessFiles(runtime)) {
    throw memoryErrors.unavailable("这个非空 Home 缺少记忆库，不会将它当作新 Home 初始化");
  }
}

/** Initialize only a fresh Home's complete product prefs; an existing ledger must already contain current prefs. */
export function prepareMemoryHome(home: string, owner?: StorageOwner): boolean {
  const hasLedger = existsSync(homeSqlitePath(home, MEMORY_LEDGER_STORE));
  const newHome = !hasLedger && freshMemoryHome(home, owner);
  if (!hasLedger && !newHome) throw memoryErrors.unavailable("这个非空 Home 缺少记忆库，不会将它当作新 Home 初始化");
  if (newHome) {
    const held = owner ?? acquireStorageOwner(agentRuntimeDirectory(home));
    try { initializeMemoryForgetting({ homeDirectory: home, storageOwner: held, assertCurrent() {} }); }
    finally { if (!owner) held.release(); }
  } else {
    const held = owner ?? acquireStorageOwner(agentRuntimeDirectory(home));
    try {
      finishMemoryLedgerUpgrade(home, () => {
        const current = () => { assertStorageOwner(agentRuntimeDirectory(home), held); };
        removeOldMemoryRecords(home, current);
        startMemoryForgettingGeneration({ homeDirectory: home, storageOwner: held, assertCurrent: current });
      });
    }
    finally { if (!owner) held.release(); }
    inspectMemoryForgetting(home);
  }
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
export function freshMemoryHome(home: string, owner: StorageOwner | undefined): boolean {
  if (!existsSync(home)) return true;
  const entries = homeBusinessEntries(home);
  if (entries.length === 0) return true;
  const runtime = agentRuntimeDirectory(home);
  return owner !== undefined && entries.length === 1 && entries[0] === basename(runtime) && hasOnlyStorageOwnerFiles(runtime, owner);
}

function homeBusinessEntries(home: string): string[] {
  return readdirSync(home).filter(entry => entry !== "storage-space.json" || readStorageSpace(home) === null);
}

/**
 * The SDK's indexed memory store refuses to mount while the file-layout folders of the same kinds exist, and nothing converts them (user
 * 2026-11-07: no migration). So the first start after the ledger's 1 → 2 upgrade deletes exactly these two folders (user 2026-11-11), before the
 * new forgetting file; a start cut short repeats it. Anything at those names that is not a plain folder is refused, not removed.
 */
const OLD_MEMORY_KINDS = ["io.molis.work~memories", "io.molis.work~memory-candidates"] as const;
function removeOldMemoryRecords(home: string, current: () => void): void {
  const records = join(agentRuntimeDirectory(home), "records");
  let removed = false;
  for (const kind of OLD_MEMORY_KINDS) {
    const folder = join(records, kind), found = lstatSync(folder, { throwIfNoEntry: false });
    if (!found) continue;
    if (!found.isDirectory()) throw memoryErrors.unavailable("旧记忆目录不是普通目录，不会删除或启用新记忆库");
    current();
    rmSync(folder, { recursive: true });
    removed = true;
  }
  if (removed) syncPath(records);
}
