import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureConnectorPrivateState, preflightConnectorPrivateStateRestore } from "@molis-ai/molis-work-app-local-host";
import { connectedPrivateCli, fileTree } from "./fixtures/connector-private-state.js";

test("RAC-2915: archived CLI ownership replaces a lost receipt only while the actual original installation remains", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), archive = mkdtempSync(join(tmpdir(), "molis-cli-restore-owner-"));
  t.after(() => rmSync(archive, { recursive: true, force: true }));
  const data = join(archive, "data"), archivedDirectory = join(data, "runtime", "connectors", "installs", f.installationId);
  mkdirSync(archivedDirectory, { recursive: true, mode: 0o700 });
  const receipt = join(f.directory, "installation.json"), archivedReceipt = join(archivedDirectory, "installation.json");
  copyFileSync(receipt, archivedReceipt);
  const installation = JSON.parse(readFileSync(archivedReceipt, "utf8")) as { id: string; executable: string };
  const identity = readFileSync(join(f.privateHome, "identity")), snapshot = captureConnectorPrivateState(f.home);
  rmSync(receipt); rmSync(f.privateHome, { recursive: true }); writeFileSync(f.vaultPath, "damaged live vault");
  const before = fileTree(f.home), options = { archiveDataDirectory: data };
  assert.throws(() => preflightConnectorPrivateStateRestore(f.home, snapshot), { code: "connector.private_state.invalid" });
  const plan = preflightConnectorPrivateStateRestore(f.home, snapshot, options);
  assert.equal(plan.length, 1); assert.equal(plan[0]!.installation_id, f.installationId);
  assert.equal(plan[0]!.root_path, f.privateHome);
  assert.deepEqual(Buffer.from(plan[0]!.files.find(file => file.relative_path === "identity")!.bytes), identity);
  assert.equal(JSON.stringify(fileTree(f.home)) === JSON.stringify(before), true, "archive preflight leaves the actual Home unchanged");
  const metadata = readFileSync(archivedReceipt);
  writeFileSync(archivedReceipt, JSON.stringify({ ...installation, id: "different-installation" }));
  assert.throws(() => preflightConnectorPrivateStateRestore(f.home, snapshot, options), { code: "connector.private_state.invalid" });
  assert.equal(JSON.stringify(fileTree(f.home)) === JSON.stringify(before), true, "a foreign archived receipt leaves the actual Home unchanged");
  writeFileSync(archivedReceipt, metadata);
  const moved = installation.executable + ".test-missing"; renameSync(installation.executable, moved);
  try {
    const missing = fileTree(f.home);
    assert.throws(() => preflightConnectorPrivateStateRestore(f.home, snapshot, options), { code: "connector.private_state.invalid" });
    assert.equal(JSON.stringify(fileTree(f.home)) === JSON.stringify(missing), true, "a missing original program leaves the actual Home unchanged");
  } finally { renameSync(moved, installation.executable); }
  const recovered = fileTree(f.home);
  assert.equal(preflightConnectorPrivateStateRestore(f.home, snapshot, options).length, 1);
  assert.equal(JSON.stringify(fileTree(f.home)) === JSON.stringify(recovered), true, "retry after restoring the original program is still read-only");
  assert.deepEqual(readFileSync(f.keyPath), f.key);
});
