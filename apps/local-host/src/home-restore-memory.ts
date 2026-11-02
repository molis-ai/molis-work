import { lstatSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { backupSnapshotSqlite, inspectMemoryLedger, MEMORY_LEDGER_BASELINE, readSnapshotFile } from "@molis-ai/molis-work-storage";
import type { HomeRestoreControl, HomeRestoreInputs } from "./home-restore-contract.js";
import { invalidRestore } from "./home-restore-input.js";
import { memoryRestoreFile } from "./home-restore-owner-payload.js";
import { prepareMemoryHome } from "./memory/memory-initialization.js";

/** Only actual source metadata can establish fresh eligibility; omitted payloads cannot. */
function assertFreshSource(inputs: HomeRestoreInputs): void {
  const facts = inputs.manifest.source_inventory;
  if (!facts || new Set(facts.map(node => node.path)).size !== facts.length) throw invalidRestore();
  const nodes = new Map(facts.map(node => [node.path, node]));
  const root = nodes.get(""), runtime = nodes.get("agent-runtime");
  if (root?.kind !== "directory" || root.children?.join() !== "agent-runtime" || runtime?.kind !== "directory") throw invalidRestore();
  for (const child of runtime.children ?? []) {
    if (!/^\.molis-runtime-owner\.db(?:-(?:wal|shm|journal))?$/u.test(child)) throw invalidRestore();
    const node = nodes.get("agent-runtime/" + child);
    if (node?.kind !== "file" || node.links !== 1) throw invalidRestore();
  }
  for (const path of [...inputs.registry.stores.map(store => store.path), ...inputs.registry.snapshotExclusions.map(item => item.path)])
    if (path !== "agent-runtime" && nodes.get(path)?.kind !== "absent") throw invalidRestore();
  for (const node of facts)
    if (node.path && node.path !== "agent-runtime" && !node.path.startsWith("agent-runtime/") && node.kind !== "absent") throw invalidRestore();
  if (inputs.files.size || inputs.manifest.stores.some(store => store.path === "agent-runtime"
    ? store.entries.some(entry => entry.path !== "agent-runtime" || entry.kind !== "directory") : store.state !== "absent")) throw invalidRestore();
}

function restoreMemoryTemporaryParent(protectedDirectories: readonly string[]): string {
  const parent = realpathSync(tmpdir());
  if (!lstatSync(parent).isDirectory()) throw invalidRestore();
  for (const directory of protectedDirectories) {
    const distance = relative(realpathSync(directory), parent);
    if (!distance || distance !== ".." && !distance.startsWith(".." + sep) && !isAbsolute(distance)) throw invalidRestore();
  }
  return parent;
}

export function assertCompleteRestoreMemory(home: string, protectedDirectories: readonly string[] = []): void {
  restoreMemoryTemporaryParent([home, ...protectedDirectories]);
  if (inspectMemoryLedger({ homeDirectory: home, actorId: LOCAL_PERSON_ACTOR_ID }).state !== "complete") throw invalidRestore();
}

/** Normal initialization runs only in a genuinely empty external private directory, never in the target Home. */
export async function prepareRestoreMemory(dataHome: string, inputs: HomeRestoreInputs, control: HomeRestoreControl, preflightTarget: () => Promise<void>): Promise<HomeRestoreInputs> {
  const protectedDirectories = [inputs.manifest.home_directory, dirname(dataHome), dataHome];
  restoreMemoryTemporaryParent(protectedDirectories);
  const current = inspectMemoryLedger({ homeDirectory: dataHome, actorId: LOCAL_PERSON_ACTOR_ID });
  if (current.state === "complete") return inputs;
  assertFreshSource(inputs); control.assertCurrent();
  await preflightTarget(); control.assertCurrent();
  const stage = mkdtempSync(join(restoreMemoryTemporaryParent(protectedDirectories), "molis-restore-memory-"));
  try {
    prepareMemoryHome(stage);
    assertCompleteRestoreMemory(stage, protectedDirectories); control.assertCurrent();
    const backup = join(stage, "memory-backup.db");
    const captured = await backupSnapshotSqlite(join(stage, "memory", "memory.db"), backup, { baseline: MEMORY_LEDGER_BASELINE, signal: control.signal });
    const file = { ...memoryRestoreFile("memory/memory.db", captured.mode, readSnapshotFile(backup, captured.size)), sqlite: captured.sqlite };
    const files = new Map(inputs.files), directories = new Map(inputs.directories);
    files.set(file.path, file); directories.set("memory", { path: "memory", mode: 0o700 });
    control.assertCurrent(); return { ...inputs, files, directories };
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
