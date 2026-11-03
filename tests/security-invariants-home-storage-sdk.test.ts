import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createPrologueNodeAdapter, PrologueAgentAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { hasStorageBusinessFiles } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses, storageOwnerResources } from "./fixtures/home-storage-owner.js";

const noModel = async () => { throw new Error("Ownership tests must not call a model"); };
const app = { appId: "io.molis.work", appVersion: "0.0.0" };

test("RAC-105-A-07: the real SDK borrows its parent's lock, and initialization failure returns only that borrow", { timeout: 60_000 }, async t => {
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  t.after(async () => { await adapter?.close(); });
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t);
  const home = mkdtempSync(join(tmpdir(), "home-owner-sdk-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, "agent-runtime"), owner = resources.acquire(root), peer = await peers.start(root);
  const original = statSync(join(root, ".molis-runtime-owner.db")).ino;
  const forgedRoot = join(home, "uncreated-runtime");
  for (const proof of [null, false, {}, { ...owner }]) {
    await assert.rejects(Reflect.apply(createPrologueNodeAdapter, undefined, [{ app, storageRoot: forgedRoot, storageOwner: proof, modelConfiguration: noModel }]), { code: "storage.owner.invalid" });
  }
  assert.deepEqual(readdirSync(home), ["agent-runtime"], "a supplied fake parent cannot be treated as permission to create another root");
  const failure = new Error("App identity initialization failed after the Node host was constructed");
  const options = { storageRoot: root, storageOwner: owner, modelConfiguration: noModel,
    get app(): typeof app { throw failure; } };
  await assert.rejects(createPrologueNodeAdapter(options), error => error === failure);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  let afterRuntime = false;
  await assert.rejects(createPrologueNodeAdapter({ app, storageRoot: root, storageOwner: owner, modelConfiguration: noModel,
    reviewQueue: new AgentReviewQueue(), surfaces: { driverFor: () => null, siteDecisions: () => { afterRuntime = true; throw failure; } },
  }), error => error === failure);
  assert.equal(afterRuntime, true, "the second failure is after the real Runtime and its check subscriptions exist");
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  adapter = await createPrologueNodeAdapter({ app, storageRoot: root, storageOwner: owner, modelConfiguration: noModel });
  assert.equal(hasStorageBusinessFiles(root), true, "the real SDK's storage is not merely owner bookkeeping");
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  await assert.rejects(createPrologueNodeAdapter({ app, storageRoot: root, storageOwner: owner, modelConfiguration: noModel }), { code: "agent.storage_busy" });
  await adapter.close(); await adapter.close();
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "closing the SDK leaves its parent live");
  owner.release();
  assert.equal((await peer.request("acquire")).state, "held");
  await peer.stop();
  assert.equal(statSync(join(root, ".molis-runtime-owner.db")).ino, original);
});

test("RAC-105-A-08: a real SDK close failure retains its borrow until an explicit successful retry", { timeout: 60_000 }, async t => {
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  t.after(async () => { await adapter?.close(); });
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t);
  const home = mkdtempSync(join(tmpdir(), "home-owner-sdk-close-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const root = join(home, "agent-runtime"), owner = resources.acquire(root), peer = await peers.start(root);
  const close = PrologueAgentAdapter.prototype.close, failure = new Error("one deliberate SDK close failure");
  let failed = false;
  PrologueAgentAdapter.prototype.close = async function () { if (!failed) { failed = true; throw failure; } await close.call(this); };
  t.after(() => { PrologueAgentAdapter.prototype.close = close; });
  adapter = await createPrologueNodeAdapter({ app, storageRoot: root, storageOwner: owner, modelConfiguration: noModel });
  await assert.rejects(adapter.close(), error => error === failure);
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  await adapter.close();
  owner.release();
  assert.equal((await peer.request("acquire")).state, "held"); await peer.stop();
});

test("RAC-105-A-07: absent, empty and relative SDK roots are refused before app access or disk initialization", { timeout: 30_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "home-owner-no-default-"));
  const child = spawn(process.execPath, ["--import", import.meta.resolve("tsx"), fileURLToPath(new URL("./fixtures/home-storage-invalid-root.ts", import.meta.url))], {
    cwd: directory, env: { ...process.env, HOME: directory, MOLIS_WORK_HOME: directory }, stdio: ["ignore", "ignore", "pipe", "ipc"],
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; rmSync(directory, { recursive: true, force: true }); });
  let diagnostic = ""; child.stderr?.setEncoding("utf8").on("data", (chunk: string) => { diagnostic += chunk; });
  const answer = await Promise.race([new Promise<unknown>(resolve => child.once("message", resolve)), closed.then(result => { throw new Error(JSON.stringify(result) + diagnostic); })]);
  assert.deepEqual(answer, { codes: Array(5).fill("agent.storage_root_invalid"), appReads: 0 });
  assert.deepEqual(await closed, { code: 0, signal: null });
  assert.deepEqual(readdirSync(directory), [], "neither cwd nor the isolated HOME gets a fallback .prologue directory or SDK files");
});
