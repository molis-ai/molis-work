import assert from "node:assert/strict";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import type { TestContext } from "node:test";
import { acquireStorageOwner, assertStorageOwner, borrowStorageOwner, hasOnlyStorageOwnerFiles, hasStorageBusinessFiles } from "@molis-ai/molis-work-storage";
import { storageOwnerProcesses, storageOwnerResources } from "./fixtures/home-storage-owner.js";
import { homeStorageTree as tree } from "./fixtures/home-storage-files.js";

function scratch(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "home-storage-owner-"));
  t.after(() => rmSync(directory, { recursive: true, force: true })); return directory;
}

const identity = (file: string) => { const { ino, dev } = statSync(file); return { inode: ino, device: dev }; };

test("RAC-105-A-01: the same SQLite inode excludes another process and a second owner in this process", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t), home = scratch(t), directory = join(home, "agent-runtime");
  const owner = resources.acquire(directory);
  const lock = join(directory, ".molis-runtime-owner.db"), original = identity(lock);
  const peer = await peers.start(directory), before = tree(home);
  assert.throws(() => acquireStorageOwner(directory), { code: "storage.owner.busy" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  assert.deepEqual(tree(home), before, "a refused owner must not write business files or replace the lock");
  owner.release();
  assert.deepEqual(await peer.request("acquire"), { state: "held", ...original });
  assert.deepEqual(await peer.stop(), { code: 0, signal: null });
  const reopened = resources.acquire(directory); reopened.release(); reopened.release();
  assert.deepEqual(identity(lock), original, "ordinary release leaves the original lock inode in place");
});

test("RAC-105-A-02: an authenticated parent's sole execution borrow cannot release the parent or be copied", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t), home = scratch(t), directory = join(home, "agent-runtime"), other = join(home, "other-runtime");
  mkdirSync(other);
  const owner = resources.acquire(directory);
  const peer = await peers.start(directory), before = tree(home);
  for (const forged of [{}, { ...owner }, { directory: resolve(directory), released: false }]) {
    assert.throws(() => borrowStorageOwner(directory, forged), { code: "storage.owner.invalid" });
  }
  assert.throws(() => borrowStorageOwner(other, owner), { code: "storage.owner.invalid" });
  const first = resources.borrow(directory, owner);
  assert.throws(() => borrowStorageOwner(directory, owner), { code: "storage.owner.busy" });
  assert.throws(() => borrowStorageOwner(directory, first), { code: "storage.owner.invalid" });
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" });
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" });
  first.release();
  const next = resources.borrow(directory, owner); first.release();
  assert.throws(() => owner.release(), { code: "storage.owner.borrowed" }, "an old child's repeated release cannot return a newer borrow");
  next.release(); next.release();
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "returning a borrow never releases its parent");
  assert.deepEqual(tree(home), before);
  owner.release();
  assert.throws(() => borrowStorageOwner(directory, owner), { code: "storage.owner.closed" });
  assert.throws(() => assertStorageOwner(directory, owner), { code: "storage.owner.closed" });
  assert.equal((await peer.request("acquire")).state, "held");
  assert.deepEqual(await peer.stop(), { code: 0, signal: null });
});

test("RAC-105-A-03: actual process death releases ownership without deleting its lock inode", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t), home = scratch(t), directory = join(home, "agent-runtime");
  const peer = await peers.start(directory);
  assert.equal((await peer.request("acquire")).state, "held");
  assert.equal((await peer.request("borrow")).state, "borrowed");
  assert.deepEqual(await peer.request("release"), { code: "storage.owner.borrowed" });
  const original = identity(join(directory, ".molis-runtime-owner.db"));
  assert.throws(() => acquireStorageOwner(directory), { code: "storage.owner.busy" });
  peer.kill(); assert.deepEqual(await peer.closed, { code: null, signal: "SIGKILL" });
  const owner = resources.acquire(directory);
  assert.doesNotThrow(() => assertStorageOwner(directory, owner)); owner.release();
  assert.deepEqual(identity(join(directory, ".molis-runtime-owner.db")), original);
});

test("RAC-105-A-04: different Homes work independently and a Home alias cannot acquire a second owner", t => {
  const resources = storageOwnerResources(t), parent = scratch(t), home = join(parent, "home"), otherHome = join(parent, "other"), alias = join(parent, "alias");
  const directory = join(home, "agent-runtime"), other = join(otherHome, "agent-runtime");
  const owner = resources.acquire(directory), independent = resources.acquire(other);
  symlinkSync(home, alias);
  assert.doesNotThrow(() => assertStorageOwner(join(alias, "agent-runtime"), owner));
  assert.throws(() => acquireStorageOwner(join(alias, "agent-runtime")), { code: "storage.owner.busy" });
  assert.throws(() => borrowStorageOwner(other, owner), { code: "storage.owner.invalid" });
  const child = resources.borrow(other, independent); child.release();
});

test("RAC-105-A-05: linked or replaced lock files cannot authenticate an owner or redirect acquisition", t => {
  const resources = storageOwnerResources(t), home = scratch(t), directory = join(home, "agent-runtime"), lock = join(directory, ".molis-runtime-owner.db");
  const owner = resources.acquire(directory);
  const original = identity(lock), saved = join(directory, "original-lock");
  renameSync(lock, saved); writeFileSync(lock, "", { mode: 0o600 });
  const changed = tree(home);
  assert.throws(() => assertStorageOwner(directory, owner), { code: "storage.owner.invalid" });
  assert.throws(() => borrowStorageOwner(directory, owner), { code: "storage.owner.invalid" });
  assert.deepEqual(tree(home), changed);
  unlinkSync(lock); renameSync(saved, lock);
  const extra = join(home, "extra-link"); linkSync(lock, extra);
  assert.throws(() => assertStorageOwner(directory, owner), { code: "storage.owner.invalid" });
  assert.throws(() => acquireStorageOwner(directory), { code: "storage.owner.invalid" });
  unlinkSync(extra); owner.release();
  renameSync(lock, saved); symlinkSync(saved, lock);
  const linked = tree(home);
  assert.throws(() => acquireStorageOwner(directory), { code: "storage.owner.invalid" });
  assert.deepEqual(tree(home), linked);
  unlinkSync(lock); renameSync(saved, lock);
  assert.deepEqual(identity(lock), original);
  const reopened = resources.acquire(directory); reopened.release();
});

test("RAC-105-A-06: invalid roots and a failed acquisition do not mint a reusable proof or block a corrected retry", t => {
  const resources = storageOwnerResources(t), home = scratch(t), actual = join(home, "actual"), link = join(home, "linked-runtime"); mkdirSync(actual);
  symlinkSync(actual, link);
  const before = tree(home);
  assert.throws(() => acquireStorageOwner("relative-runtime"), { code: "storage.owner.invalid" });
  assert.throws(() => acquireStorageOwner(link), { code: "storage.owner.invalid" });
  assert.throws(() => assertStorageOwner(join(home, "missing"), {}), { code: "storage.owner.invalid" });
  assert.deepEqual(tree(home), before);
  const lock = join(actual, ".molis-runtime-owner.db"); writeFileSync(lock, "not a SQLite database", { mode: 0o600 });
  const corrupt = readFileSync(lock);
  assert.throws(() => acquireStorageOwner(actual), { code: "storage.owner.invalid" });
  assert.deepEqual(readFileSync(lock), corrupt);
  writeFileSync(lock, "");
  const owner = resources.acquire(actual); owner.release();
});

test("RAC-105-A-07: authenticated owner-only inspection never treats SDK or business data as empty or releases the lease", { timeout: 30_000 }, async t => {
  const peers = storageOwnerProcesses(t), resources = storageOwnerResources(t), home = scratch(t), root = join(home, "agent-runtime");
  const before = tree(home);
  assert.equal(hasStorageBusinessFiles(root), false);
  assert.deepEqual(tree(home), before, "a missing runtime stays absent after read-only inspection");
  assert.throws(() => hasStorageBusinessFiles("relative-runtime"), { code: "storage.owner.invalid" });
  const owner = resources.acquire(root), peer = await peers.start(root);
  assert.equal(hasOnlyStorageOwnerFiles(root, owner), true);
  assert.equal(hasStorageBusinessFiles(root), false);
  assert.throws(() => hasOnlyStorageOwnerFiles(root, { ...owner }), { code: "storage.owner.invalid" });
  for (const name of ["storage.key", "session.json", "unknown.sqlite"]) {
    writeFileSync(join(root, name), "original SDK or business bytes");
    assert.equal(hasOnlyStorageOwnerFiles(root, owner), false);
    assert.equal(hasStorageBusinessFiles(root), true);
    rmSync(join(root, name));
  }
  const sidecar = join(root, ".molis-runtime-owner.db-wal");
  symlinkSync(join(home, "missing-target"), sidecar);
  assert.throws(() => hasStorageBusinessFiles(root), { code: "storage.owner.invalid" });
  unlinkSync(sidecar);
  const alias = join(home, "linked-runtime"); symlinkSync(root, alias);
  assert.throws(() => hasStorageBusinessFiles(alias), { code: "storage.owner.invalid" });
  unlinkSync(alias);
  assert.deepEqual(await peer.request("acquire"), { code: "storage.owner.busy" }, "metadata inspection must not open and close a descriptor to the owned SQLite inode");
  owner.release();
  assert.equal(hasStorageBusinessFiles(root), false, "presence conveys no live ownership");
  assert.throws(() => hasOnlyStorageOwnerFiles(root, owner), { code: "storage.owner.closed" });
  await peer.stop();
});
