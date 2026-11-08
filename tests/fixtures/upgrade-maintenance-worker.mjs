// A maintenance thread with the test's own store, which is slow on purpose: time for the listener to be asked things while the upgrade is under way.
import { DatabaseSync } from "node:sqlite";
import { parentPort, workerData } from "node:worker_threads";
import { registerHomeUpgradeDescriptors, upgradeHomesForMaintenance } from "@molis-ai/molis-work-app-local-host";

const V2 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '');";
const milliseconds = Number(process.env.MOLIS_TEST_UPGRADE_STEP_MS ?? 0);
registerHomeUpgradeDescriptors(() => [{
  owner: "tests/notes", pattern: "notes/notes.db", open: file => new DatabaseSync(file),
  baseline: { version: 2, schema: V2, upgrades: [{ from: 1, run: db => {
    if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
    db.exec("ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
  } }] },
}]);
upgradeHomesForMaintenance(workerData.homes, message => parentPort.postMessage(message));
