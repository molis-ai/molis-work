import assert from "node:assert/strict";
import fs, { appendFileSync, chmodSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { captureConnectorPrivateState, connectorCliActions, CONNECTOR_RECORDS_READ, MolisWorkLocalHost, preflightConnectorPrivateStateRestore, type ConnectorPrivateStateSnapshot } from "@molis-ai/molis-work-app-local-host";
import { openExistingHomePayload, sealExistingHomePayload } from "@molis-ai/molis-work-storage";
import { connectedPrivateCli } from "./fixtures/connector-private-state.js";
import { createCliPackageFixture } from "./fixtures/connector-cli-package.js";

// The approved contract, independently stated here rather than imported from implementation constants.
const BYTES = 32 * 1024 * 1024, NODES = 10_000, SEALED = 128 * 1024 * 1024;
type Cli = Awaited<ReturnType<typeof connectedPrivateCli>>;
const binding = (snapshot: ConnectorPrivateStateSnapshot, index: number) => JSON.stringify({ owner: snapshot.owner,
  installation_id: snapshot.installations[index]!.installation_id, source_sha256: snapshot.installations[index]!.source_sha256 });

function emptyPrivateHome(home: string): void {
  rmSync(home, { recursive: true, force: true }); mkdirSync(home, { mode: 0o700 });
}

function sparse(file: string, bytes: number): void {
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, "", { mode: 0o600 }); truncateSync(file, bytes);
}

function refused(f: Cli, operation: () => unknown, code = "connector.private_state.limit_exceeded"): void {
  const vault = readFileSync(f.vaultPath), key = readFileSync(f.keyPath);
  let result: unknown;
  assert.throws(() => { result = operation(); }, { code });
  assert.equal(result, undefined, "no partial snapshot or restore plan is returned");
  assert.deepEqual(readFileSync(f.vaultPath), vault); assert.deepEqual(readFileSync(f.keyPath), key);
}

async function secondPrivateCli(t: TestContext, f: Cli): Promise<string> {
  const sourceHome = mkdtempSync(join(tmpdir(), "private-state-package-"));
  t.after(() => rmSync(sourceHome, { recursive: true, force: true }));
  const source = await createCliPackageFixture(t, sourceHome), host = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  t.after(() => host.close());
  const caller: ActionCallContext = { actor_id: "private-state-limits", runtime_session_id: "limits", audience: "agent", project_id: null,
    permissions: ["connectors:management:read", "connectors:management:write", CONNECTOR_RECORDS_READ] };
  const actions = host.homeActionClient();
  const prepared = await actions.invoke(caller, connectorCliActions.prepare, source.input) as { authorization_id: string };
  const installed = await actions.invoke(caller, connectorCliActions.install, { authorization_id: prepared.authorization_id }) as { status: string };
  assert.equal(installed.status, "needs_person"); await host.close();
  const ids = readdirSync(dirname(f.directory));
  assert.equal(ids.length, 2, "both installations were created by the public prepare/install path");
  const second = ids.find(id => id !== f.installationId)!;
  return join(dirname(f.directory), second, ".home");
}

test("S-12 RAC-107-B2b-06: exactly 32 MiB of unknown-cache bytes restores completely; one more byte is refused before reading", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t); emptyPrivateHome(f.privateHome);
  const file = join(f.privateHome, ".cache", "opaque.bin"); sparse(file, BYTES);
  const before = lstatSync(file), snapshot = captureConnectorPrivateState(f.home), plans = preflightConnectorPrivateStateRestore(f.home, snapshot);
  assert.equal(plans.length, 1); assert.equal(plans[0]!.files.length, 1);
  assert.equal(plans[0]!.files[0]!.relative_path, ".cache/opaque.bin");
  assert.deepEqual(plans[0]!.files[0]!.bytes, readFileSync(file), "unknown cache bytes are kept, without truncation");
  assert.equal(lstatSync(file).mtimeMs, before.mtimeMs);
  appendFileSync(file, "x"); chmodSync(file, 0);
  const changed = lstatSync(file);
  // Mode 000 also makes an attempted whole-file read fail; the size-specific code must win before opening it.
  refused(f, () => captureConnectorPrivateState(f.home));
  assert.equal(lstatSync(file).size, BYTES + 1); assert.equal(lstatSync(file).mtimeMs, changed.mtimeMs);
  chmodSync(file, 0o600);
});

test("S-12 RAC-107-B2b-06: source and destination each accept 10000 nodes and reject exactly one extra node", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t); emptyPrivateHome(f.privateHome);
  const names = Array.from({ length: NODES - 2 }, (_, i) => "entry-" + i); // installation + private root consume two nodes.
  for (const name of names) writeFileSync(join(f.privateHome, name), "", { mode: 0o600 });
  const snapshot = captureConnectorPrivateState(f.home), plans = preflightConnectorPrivateStateRestore(f.home, snapshot);
  assert.equal(plans.length, 1); assert.deepEqual(plans[0]!.files.map(file => file.relative_path).sort(), names.sort());
  assert.ok(plans[0]!.files.every(file => file.bytes.length === 0));
  writeFileSync(join(f.privateHome, "one-more"), "", { mode: 0o600 });
  refused(f, () => captureConnectorPrivateState(f.home));
  refused(f, () => preflightConnectorPrivateStateRestore(f.home, snapshot));
});

test("S-12 RAC-107-B2b-06: byte and ciphertext budgets are shared by all real installations, with no partial plan", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), other = await secondPrivateCli(t, f);
  for (const home of [f.privateHome, other]) { emptyPrivateHome(home); sparse(join(home, "opaque.bin"), BYTES / 2); }
  const snapshot = captureConnectorPrivateState(f.home);
  assert.equal(snapshot.installations.length, 2);
  const plans = preflightConnectorPrivateStateRestore(f.home, snapshot);
  assert.equal(plans.length, 2); assert.equal(plans.reduce((sum, plan) => sum + plan.files[0]!.bytes.length, 0), BYTES);
  appendFileSync(join(other, "opaque.bin"), "x");
  refused(f, () => captureConnectorPrivateState(f.home));
  // Both individual payloads are below the cipher cap; the whole set is exactly one byte over it.
  const oversized = { ...snapshot, installations: snapshot.installations.map((entry, i) => ({ ...entry,
    payload: { ...entry.payload, ciphertext: "A".repeat(SEALED / 2 + i) } })) };
  refused(f, () => preflightConnectorPrivateStateRestore(f.home, oversized));
  const changed = { ...snapshot, installations: snapshot.installations.map(entry => ({ ...entry })) };
  const index = changed.installations.findIndex(entry => entry.installation_id !== f.installationId);
  const body = JSON.parse(openExistingHomePayload(f.home, binding(snapshot, index), snapshot.installations[index]!.payload)) as {
    files: Array<{ contents_base64: string }> };
  body.files[0]!.contents_base64 = Buffer.alloc(BYTES / 2 + 1).toString("base64");
  changed.installations[index]!.payload = sealExistingHomePayload(f.home, binding(snapshot, index), JSON.stringify(body));
  refused(f, () => preflightConnectorPrivateStateRestore(f.home, changed));
});

test("S-12 RAC-107-B2b-06: growth during a real descriptor read is rejected without returning a snapshot", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t); emptyPrivateHome(f.privateHome);
  const file = join(f.privateHome, "growing.bin"); sparse(file, 64 * 1024);
  const inode = lstatSync(file).ino, originalRead = fs.readSync; let grew = false;
  // A controlled filesystem change between the real read and final fstat; no production hook or timing sleep.
  fs.readSync = ((fd: number, buffer: NodeJS.ArrayBufferView, offset: number, length: number, position: number | null) => {
    const bytes = originalRead(fd, buffer, offset, length, position);
    if (!grew && fstatSync(fd).ino === inode) { grew = true; appendFileSync(file, "x"); }
    return bytes;
  }) as typeof fs.readSync;
  syncBuiltinESMExports();
  try { refused(f, () => captureConnectorPrivateState(f.home), "connector.private_state.invalid"); }
  finally { fs.readSync = originalRead; syncBuiltinESMExports(); }
  assert.equal(grew, true, "the file actually grew during its content read");
  assert.equal(lstatSync(file).size, 64 * 1024 + 1);
});
