import { join } from "node:path";
import type { MemoryRestoreRetention } from "@molis-ai/molis-work-contracts/services/memory";
import { applyMemoryRestoreRetention, prepareMemoryRestoreRetention } from "@molis-ai/molis-work-service-memory";
import { openPrologueMemoryRestore } from "@molis-ai/molis-work-service-agent-host";
import { inspectMemoryForgetting, inspectSnapshotSqlite, MEMORY_FORGETTING_HOME_STORE, mergeMemoryForgetting, parseMemoryForgetting,
  readMemoryLedgerRestoreFacts, readSnapshotFile, retainMemoryLedgerAfterRestore, serializeMemoryForgetting, snapshotFileDigest, type StorageOwner } from "@molis-ai/molis-work-storage";
import type { HomeRestoreControl, HomeRestoreInputs } from "./home-restore-contract.js";
import { flushRestoreFile, inspectRestoreNode } from "./home-restore-files.js";
import type { HomeRestoreJournal, RestoreJournalFile } from "./home-restore-journal-input.js";
import { assertRestoreJournalPaths } from "./home-restore-journal-policy.js";
import type { HomeSnapshotStoreRegistry } from "./home-store-snapshot.js";
import { invalidRestore } from "./home-restore-input.js";
import { snapshotDatabaseOptions } from "./home-snapshot-inventory.js";
import { memoryRuntimePolicy } from "./memory/memory-runtime-policy.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { freshMemoryHome } from "./memory/memory-initialization.js";
import { memoryRestoreFile } from "./home-restore-owner-payload.js";

/** Only the ledger and SDK record payloads can change. Keys, owner locks and other SDK stores stay protected. */
export const memoryRestoreWritable = (path: string) => path === "memory/memory.db"
  || path === "agent-runtime/records.sqlite"
  || /^agent-runtime\/records\/io\.molis\.work~(?:memories|memory-candidates)\/[^/]+\.json$/u.test(path);

export function prepareHomeRestoreRetention(home: string, storageOwner: StorageOwner, control: HomeRestoreControl, inputs: HomeRestoreInputs):
  { readonly inputs: HomeRestoreInputs; readonly retention: MemoryRestoreRetention } {
  control.assertCurrent();
  const current = freshMemoryHome(home, storageOwner) ? { format_version: 1 as const, decisions: [] } : inspectMemoryForgetting(home);
  const path = MEMORY_FORGETTING_HOME_STORE.path, incoming = inputs.files.get(path);
  if (!incoming) throw invalidRestore();
  const bytes = incoming.source.kind === "archive" ? readSnapshotFile(incoming.source.path, incoming.size) : Buffer.from(incoming.source.bytes);
  const merged = mergeMemoryForgetting(current, parseMemoryForgetting(bytes.toString("utf8")));
  // The existing owner-material input carries the final merged bytes. The archive and its manifest remain untouched.
  const files = new Map(inputs.files);
  files.set(path, memoryRestoreFile(path, incoming.mode, Buffer.from(serializeMemoryForgetting(merged))));
  control.assertCurrent();
  return { inputs: { ...inputs, files }, retention: prepareMemoryRestoreRetention(merged) };
}

/** Capture the actual closed-owner output, never rewrite the archive or reinterpret its original manifest. */
function finalMemoryMaterial(journal: HomeRestoreJournal, registry: HomeSnapshotStoreRegistry, changed: readonly string[], control: HomeRestoreControl): HomeRestoreJournal {
  const home = journal.home_directory, files = new Map(journal.files.map(file => [file.path, file]));
  for (const path of new Set(["memory/memory.db", ...changed.map(path => "agent-runtime/" + path)])) {
    control.assertCurrent(); const absolute = join(home, path), node = inspectRestoreNode(absolute);
      const original = files.get(path);
      if (!node || node.kind !== "file" || !original || node.mode !== original.mode
        || !memoryRestoreWritable(path) || journal.preserved.some(item => item.path === path)) throw invalidRestore();
      const store = registry.stores.find(item => path.startsWith(item.path + "/"));
      if (!store) throw invalidRestore();
      const options = snapshotDatabaseOptions(store, path.slice(store.path.length + 1));
      const sqlite = options ? inspectSnapshotSqlite(absolute, { ...options, signal: control.signal }) : undefined;
      const digest = snapshotFileDigest(absolute);
      const file: RestoreJournalFile = { path, mode: node.mode, ...digest, ...(sqlite ? { sqlite } : {}) };
      files.set(path, file); flushRestoreFile(absolute, node);
  }
  const final = { ...journal, files: [...files.values()] };
  assertRestoreJournalPaths(final, registry); control.assertCurrent(); return final;
}

/** Called only after original inodes are safe and the ordinary publication has validated its incoming bytes. */
export async function retainHomeRestoreMemory(input: {
  readonly journal: HomeRestoreJournal; readonly registry: HomeSnapshotStoreRegistry; readonly retention: MemoryRestoreRetention;
  readonly storageOwner: StorageOwner; readonly control: HomeRestoreControl;
}): Promise<HomeRestoreJournal> {
  const { journal, registry, retention, storageOwner, control } = input;
  if (!retention.memories.length && !retention.candidates.length && !retention.sources.length) return journal;
  const home = journal.home_directory, assertCurrent = () => control.assertCurrent();
  const incoming = readMemoryLedgerRestoreFacts({ homeDirectory: home, storageOwner, assertCurrent, candidatesFor: retention });
  const scopes = [...new Map([...retention.memories, ...retention.candidates, ...retention.sources].map(item => [JSON.stringify([item.scope, item.owner]), { scope: item.scope, owner: item.owner }])).values()];
  const policy = memoryRuntimePolicy(() => undefined).policy;
  const sdk = journal.files.some(file => file.path === "agent-runtime/records.sqlite" || file.path.startsWith("agent-runtime/records/"))
    ? await openPrologueMemoryRestore({ storageRoot: join(home, "agent-runtime"), appVersion: PRODUCT_VERSION, operationId: journal.operation_id,
      scopes, policy: { ...policy, matrix: { default: { actions: ["manage-read", "delete"], formation: [] } } },
      assertCurrent, signal: control.signal }) : undefined;
  let changed: readonly string[];
  try {
    changed = await applyMemoryRestoreRetention({ retention, incoming, sdk, assertCurrent,
      retainLedger: candidateIds => retainMemoryLedgerAfterRestore({ homeDirectory: home, storageOwner, assertCurrent, retention, candidateIds }) });
  } finally { await sdk?.close(); }
  assertCurrent(); return finalMemoryMaterial(journal, registry, changed, control);
}
