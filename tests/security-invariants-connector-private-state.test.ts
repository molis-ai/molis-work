import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { captureConnectorPrivateState, preflightConnectorPrivateStateRestore, type ConnectorPrivateStateSnapshot, type ConnectorPrivateStateRestorePlan } from "@molis-ai/molis-work-app-local-host";
import { createFileSecretStore, openExistingHomePayload, readExistingSecret, resetSecretStoreCache, runWithMolisWorkHome, sealExistingHomePayload } from "@molis-ai/molis-work-storage";
import { connectedPrivateCli, fileTree, privateStateChildren } from "./fixtures/connector-private-state.js";

function scratch(t: TestContext) {
  const path = mkdtempSync(join(tmpdir(), "connector-private-payload-"));
  t.after(() => rmSync(path, { recursive: true, force: true })); return path;
}

const unchanged = (home: string, before: ReturnType<typeof fileTree>) =>
  assert.equal(JSON.stringify(fileTree(home)) === JSON.stringify(before), true, "the Home's bytes, modes, mtimes and file set must remain unchanged");

function originalPlan(tree: ReturnType<typeof fileTree>) {
  return Object.fromEntries(Object.entries(tree).map(([path, entry]) => [path, { mode: entry.mode, ...(entry.bytes === undefined ? {} : { bytes: entry.bytes }) }]));
}

function plannedTree(plan: ConnectorPrivateStateRestorePlan) {
  return Object.fromEntries([...plan.directories.map(entry => [entry.relative_path, { mode: entry.mode }]),
    ...plan.files.map(entry => [entry.relative_path, { mode: entry.mode, bytes: Buffer.from(entry.bytes).toString("base64") }])]);
}

function snapshotBinding(snapshot: ConnectorPrivateStateSnapshot) {
  const entry = snapshot.installations[0]!;
  return JSON.stringify({ owner: snapshot.owner, installation_id: entry.installation_id, source_sha256: entry.source_sha256 });
}

test("S-12 RAC-104-B2b-01: a real finished CLI keeps its original empty-vault backend after a restart with a different preference", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), ciphertext = readFileSync(f.vaultPath);
  const kind = execFileSync(process.execPath, ["--input-type=module", "-e",
    "import{createFileSecretStore,runWithMolisWorkHome}from'@molis-ai/molis-work-storage';process.stdout.write(runWithMolisWorkHome(process.argv[1],()=>createFileSecretStore().backend().kind));", f.home],
    { encoding: "utf8", env: { ...process.env, MOLIS_WORK_SECRET_BACKEND: "env", MOLIS_WORK_ENCRYPTION_KEY: randomBytes(32).toString("hex") } });
  assert.equal(kind, "aes-gcm-file", "persisted backend ownership survives an empty entries map");
  assert.deepEqual(readFileSync(f.vaultPath), ciphertext); assert.equal(readFileSync(f.keyPath).equals(f.key), true);
  execFileSync(process.execPath, ["--input-type=module", "-e",
    "import{createFileSecretStore,runWithMolisWorkHome}from'@molis-ai/molis-work-storage';runWithMolisWorkHome(process.argv[1],()=>createFileSecretStore().put('post-finish','later-owner-value'));", f.home],
    { env: { ...process.env, MOLIS_WORK_SECRET_BACKEND: "env", MOLIS_WORK_ENCRYPTION_KEY: randomBytes(32).toString("hex") } });
  assert.equal(readExistingSecret(f.home, "post-finish"), "later-owner-value", "later writes are still readable with the original file key");
  assert.equal(JSON.parse(readFileSync(f.vaultPath, "utf8")).backend, "aes-gcm-file");
  assert.equal(readFileSync(f.keyPath).equals(f.key), true);
});

test("S-12 RAC-104-B2b-01: a real finished CLI refuses a missing original key instead of silently replacing it", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), ciphertext = readFileSync(f.vaultPath);
  unlinkSync(f.keyPath);
  for (const fault of ["missing", "invalid"]) {
    if (fault === "invalid") writeFileSync(f.keyPath, "not-an-original-master-key", { mode: 0o600 });
    const before = fileTree(f.home);
    const result = execFileSync(process.execPath, ["--input-type=module", "-e",
      "import{createFileSecretStore,runWithMolisWorkHome}from'@molis-ai/molis-work-storage';let refused=false;try{runWithMolisWorkHome(process.argv[1],()=>createFileSecretStore().backend());}catch{refused=true;}process.stdout.write(JSON.stringify({refused}));", f.home],
      { encoding: "utf8", env: { ...process.env, MOLIS_WORK_SECRET_BACKEND: "file", MOLIS_WORK_ENCRYPTION_KEY: "" } });
    assert.equal(JSON.parse(result).refused, true, "the original dependency is required even after finish removes every entry");
    if (fault === "missing") assert.equal(existsSync(f.keyPath), false, "no replacement key may be made");
    else assert.equal(readFileSync(f.keyPath, "utf8"), "not-an-original-master-key");
    assert.deepEqual(readFileSync(f.vaultPath), ciphertext); unchanged(f.home, before);
  }
});

test("S-12 RAC-104-B2b-02 RAC-108-B2b-04: the real CLI's complete opaque state is sealed read-only and survives loss of its private directory", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), secret = randomBytes(32).toString("hex"), filename = ".private-" + secret;
  mkdirSync(join(f.privateHome, "settings", "empty-directory"), { recursive: true, mode: 0o750 });
  mkdirSync(join(f.privateHome, ".cache"), { mode: 0o700 });
  writeFileSync(join(f.privateHome, filename), "\ufeff" + secret + "\r\n原配置", { mode: 0o640 });
  writeFileSync(join(f.privateHome, "settings", "empty"), "", { mode: 0o600 });
  const binary = randomBytes(128);
  writeFileSync(join(f.privateHome, ".cache", "unique-config.bin"), binary, { mode: 0o640 });
  const original = fileTree(f.privateHome), before = fileTree(f.home), snapshot = captureConnectorPrivateState(f.home);
  unchanged(f.home, before);
  assert.equal(snapshot.installations.length, 1); assert.equal(snapshot.installations[0]!.installation_id, f.installationId);
  const serialized = JSON.stringify(snapshot);
  for (const value of [secret, filename, binary.toString("base64"), f.key.toString("utf8").trim()]) assert.equal(serialized.includes(value), false);
  assert.equal(snapshot.installations[0]!.payload.backend, "aes-gcm-file");
  assert.equal(snapshot.installations[0]!.payload.key_reference.location, "home:feed/secrets.key");
  const archive = join(scratch(t), "sealed.json"); writeFileSync(archive, serialized, { mode: 0o600 });
  rmSync(f.privateHome, { recursive: true });
  writeFileSync(f.vaultPath, "damaged live vault", { mode: 0o600 });
  const missing = fileTree(f.home);
  const output = execFileSync(process.execPath, ["--input-type=module", "-e",
    "import{readFileSync}from'node:fs';import{preflightConnectorPrivateStateRestore}from'@molis-ai/molis-work-app-local-host';const plans=preflightConnectorPrivateStateRestore(process.argv[1],JSON.parse(readFileSync(process.argv[2],'utf8')));process.stdout.write(JSON.stringify(plans.map(p=>({...p,files:p.files.map(f=>({...f,bytes:Buffer.from(f.bytes).toString('base64')}))}))));", f.home, archive],
    { encoding: "utf8", env: { ...process.env, MOLIS_WORK_SECRET_BACKEND: "env", MOLIS_WORK_ENCRYPTION_KEY: randomBytes(32).toString("hex") } });
  const reopened = JSON.parse(output) as Array<Omit<ConnectorPrivateStateRestorePlan, "files"> & { files: Array<{ relative_path: string; mode: number; bytes: string }> }>;
  assert.equal(reopened.length, 1); const plan = reopened[0]!;
  assert.equal(plan.root_path, f.privateHome); assert.equal(plan.installation_id, f.installationId); assert.equal(plan.root_present, true);
  assert.deepEqual(plannedTree({ ...plan, files: plan.files.map(file => ({ ...file, bytes: Buffer.from(file.bytes, "base64") })) }), originalPlan(original));
  unchanged(f.home, missing); assert.equal(existsSync(f.privateHome), false, "preflight returns a plan and never publishes it");
  assert.equal(readFileSync(f.keyPath).equals(f.key), true);
});

test("S-12 RAC-107-B2b-03: authenticated but unsafe file plans and altered owner identities are rejected without changing the Home", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t);
  mkdirSync(join(f.privateHome, "settings"), { mode: 0o700 });
  const snapshot = captureConnectorPrivateState(f.home), before = fileTree(f.home);
  type Body = { schema_version: number; root_present: boolean; directories: Array<{ relative_path: string; mode: number }>; files: Array<{ relative_path: string; mode: number; contents_base64: string }> };
  const cases: Array<[string, (changed: ConnectorPrivateStateSnapshot) => void, string]> = [
    ["version", value => { Reflect.set(value, "schema_version", 2); }, "connector.private_state.invalid"],
    ["owner", value => { Reflect.set(value, "owner", "different-owner"); }, "connector.private_state.invalid"],
    ["missing installation", value => { value.installations.length = 0; }, "connector.private_state.invalid"],
    ["installation", value => { value.installations[0]!.installation_id = "../outside"; }, "connector.private_state.invalid"],
    ["source", value => { value.installations[0]!.source_sha256 = "0".repeat(64); }, "connector.private_state.invalid"],
    ["duplicate installation", value => { value.installations.push(value.installations[0]!); }, "connector.private_state.invalid"],
    ["key identity", value => { value.installations[0]!.payload.key_reference.sha256 = "0".repeat(64); }, "storage.secrets_snapshot.integrity_failed"],
    ["ciphertext", value => { const p = value.installations[0]!.payload; p.ciphertext = (p.ciphertext[0] === "A" ? "B" : "A") + p.ciphertext.slice(1); }, "storage.secrets_snapshot.integrity_failed"],
  ];
  const malformed: Array<[string, (body: Body) => void]> = [
    ["traversal", body => { body.files[0]!.relative_path = "../outside"; }],
    ["absolute", body => { body.files[0]!.relative_path = "/outside"; }],
    ["duplicate file", body => { body.files.push(body.files[0]!); }],
    ["file directory collision", body => { body.files[0]!.relative_path = "settings"; }],
    ["missing parent", body => { body.files[0]!.relative_path = "unknown/child"; }],
    ["permissions", body => { body.files[0]!.mode = 0o7777; }],
    ["encoding", body => { body.files[0]!.contents_base64 = "**"; }],
    ["absent root with files", body => { body.root_present = false; }],
  ];
  for (const [name, change] of malformed) cases.push([name, value => {
    const entry = value.installations[0]!, binding = snapshotBinding(value);
    const body = JSON.parse(openExistingHomePayload(f.home, binding, entry.payload)) as Body;
    change(body); entry.payload = sealExistingHomePayload(f.home, binding, JSON.stringify(body));
  }, "connector.private_state.invalid"]);
  for (const [name, change, code] of cases) {
    const changed = structuredClone(snapshot); change(changed);
    assert.throws(() => preflightConnectorPrivateStateRestore(f.home, changed), { code }, name);
    unchanged(f.home, before);
  }
});

test("S-12 RAC-107-B2b-03: FIFO private state is refused by the real public owner before the unchanged ready deadline", { timeout: 60_000 }, async t => {
  const children = privateStateChildren(t);
  const f = await connectedPrivateCli(t), snapshot = captureConnectorPrivateState(f.home), archived = join(scratch(t), "sealed.json");
  writeFileSync(archived, JSON.stringify(snapshot), { mode: 0o600 });
  const fifo = join(f.privateHome, "identity"); unlinkSync(fifo); execFileSync("mkfifo", [fifo]);
  const before = fileTree(f.home);
  for (const operation of ["capture", "preflight"] as const) {
    const result = await children.run(operation, f.home, archived);
    assert.equal(result.ready, true); assert.equal(result.entered, true); assert.equal(result.timedOut, false);
    assert.equal(result.cancelled, false); assert.equal(result.error, false);
    assert.equal(result.refused, "connector.private_state.invalid"); assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null);
  }
  const blocked = await children.run("block", f.home, fifo);
  assert.equal(blocked.ready, true); assert.equal(blocked.entered, true); assert.equal(blocked.timedOut, true);
  assert.equal(blocked.refused, null); assert.equal(blocked.status, null); assert.equal(blocked.signal, "SIGKILL");
  unchanged(f.home, before);
});

test("S-12 RAC-107-B2b-03: lost, wrong and linked dependencies refuse the original sealed CLI state without replacing a key", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), snapshot = captureConnectorPrivateState(f.home), directory = scratch(t), saved = join(directory, "key.original");
  copyFileSync(f.keyPath, saved); const keyMode = statSync(f.keyPath).mode & 0o777;
  for (const fault of ["missing", "wrong", "symlink", "hardlink"] as const) {
    unlinkSync(f.keyPath);
    if (fault === "wrong") writeFileSync(f.keyPath, randomBytes(32).toString("base64"), { mode: keyMode });
    if (fault === "symlink") symlinkSync(saved, f.keyPath);
    if (fault === "hardlink") linkSync(saved, f.keyPath);
    const before = fileTree(f.home);
    assert.throws(() => preflightConnectorPrivateStateRestore(f.home, snapshot), { code: fault === "wrong" ? "storage.secrets_snapshot.integrity_failed" : "storage.secrets_snapshot.key_unavailable" });
    unchanged(f.home, before);
    if (existsSync(f.keyPath)) unlinkSync(f.keyPath);
    copyFileSync(saved, f.keyPath); chmodSync(f.keyPath, keyMode);
  }
  assert.equal(preflightConnectorPrivateStateRestore(f.home, snapshot).length, 1);
  assert.equal(readFileSync(f.keyPath).equals(f.key), true);
});

test("S-12 RAC-107-B2b-03: linked private files and directories cannot redirect capture or restore preflight", { timeout: 60_000 }, async t => {
  const f = await connectedPrivateCli(t), snapshot = captureConnectorPrivateState(f.home), outside = join(scratch(t), "outside");
  writeFileSync(outside, randomBytes(32));
  const original = join(f.privateHome, "identity"), saved = join(f.privateHome, "identity.original");
  for (const fault of ["symlink", "hardlink", "directory"] as const) {
    if (fault === "directory") { renameSync(f.privateHome, f.privateHome + ".original"); symlinkSync(f.privateHome + ".original", f.privateHome); }
    else { renameSync(original, saved); if (fault === "symlink") symlinkSync(outside, original); else linkSync(outside, original); }
    const before = fileTree(f.home);
    assert.throws(() => captureConnectorPrivateState(f.home), { code: "connector.private_state.invalid" }, fault);
    assert.throws(() => preflightConnectorPrivateStateRestore(f.home, snapshot), { code: "connector.private_state.invalid" }, fault);
    unchanged(f.home, before);
    if (fault === "directory") { unlinkSync(f.privateHome); renameSync(f.privateHome + ".original", f.privateHome); }
    else { unlinkSync(original); renameSync(saved, original); }
  }
});

test("S-12 RAC-104-B2b-02 RAC-107-B2b-03: opaque payloads bind the Home and owner under an existing empty env vault without writes", t => {
  const home = scratch(t), other = scratch(t), original = { backend: process.env.MOLIS_WORK_SECRET_BACKEND, key: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  const encryptionKey = randomBytes(32).toString("hex");
  process.env.MOLIS_WORK_SECRET_BACKEND = "env"; process.env.MOLIS_WORK_ENCRYPTION_KEY = encryptionKey;
  t.after(() => {
    for (const [name, value] of [["MOLIS_WORK_SECRET_BACKEND", original.backend], ["MOLIS_WORK_ENCRYPTION_KEY", original.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    resetSecretStoreCache();
  });
  for (const directory of [home, other]) runWithMolisWorkHome(directory, () => { const store = createFileSecretStore(); store.put("temporary", "temporary"); store.delete("temporary"); });
  const before = fileTree(home), elsewhere = fileTree(other), contents = randomBytes(32).toString("hex");
  const sealed = sealExistingHomePayload(home, "owned-installation", contents);
  assert.equal(sealed.backend, "env-key+aes-gcm"); assert.equal(JSON.stringify(sealed).includes(contents), false);
  assert.equal(openExistingHomePayload(home, "owned-installation", sealed), contents);
  assert.throws(() => openExistingHomePayload(home, "other-installation", sealed), { code: "storage.secrets_snapshot.integrity_failed" });
  assert.throws(() => openExistingHomePayload(other, "owned-installation", sealed), { code: "storage.secrets_snapshot.integrity_failed" });
  process.env.MOLIS_WORK_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  assert.throws(() => openExistingHomePayload(home, "owned-installation", sealed), { code: "storage.secrets_snapshot.integrity_failed" });
  delete process.env.MOLIS_WORK_ENCRYPTION_KEY;
  assert.throws(() => openExistingHomePayload(home, "owned-installation", sealed), { code: "storage.secrets_snapshot.key_unavailable" });
  unchanged(home, before); unchanged(other, elsewhere);
  assert.equal(existsSync(join(home, "feed", "secrets.key")), false);
});

test("S-12 RAC-104-B2b-02: a Home with no managed CLI needs no credential initialization for the empty owner", t => {
  const home = scratch(t), before = fileTree(home), snapshot = captureConnectorPrivateState(home);
  assert.deepEqual(snapshot.installations, []); assert.deepEqual(preflightConnectorPrivateStateRestore(home, snapshot), []);
  assert.throws(() => sealExistingHomePayload(home, "uninitialized-owner", "contents"), { code: "storage.secrets_snapshot.invalid" });
  unchanged(home, before); assert.equal(existsSync(join(home, "feed")), false);
});
