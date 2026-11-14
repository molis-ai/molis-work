import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter, reviewProposalVersion } from "@molis-ai/molis-work-service-agent-host";
import { createGitWorktreePort, createHomeSnapshot, restoreHomeSnapshot, MolisWorkLocalHost, type HomeSnapshotManifest } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";

test("APR-07/12: Home backup and restore retain the exact encrypted decision source with the original SDK key", async t => {
  const area = await mkdtemp(join(tmpdir(), "review-source-backup-")), home = join(area, "home"), storageRoot = join(home, "agent-runtime"), snapshot = join(area, "snapshot");
  await mkdir(home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await host.close();
  const app = { appId: "molis.review.backup", appVersion: "1.0.0" };
  let queue = new AgentReviewQueue(), adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: queue });
  t.after(async () => { await adapter.close(); queue.close(); await rm(area, { recursive: true, force: true }); });
  const review = await adapter.gitReviews!.prepare({ project_id: "project", workspace_id: "workspace", operation_id: "backup-decision",
    proposal_fingerprint: reviewProposalVersion({ target: "note", content: "reviewed" }), document: { kind: "git-index", action: "stage", workspace_name: "Original repo", files: [] },
  }, { authority: { plugin_id: "plugin", install_id: "original", holds: () => true }, check: async () => {}, execute: async () => { assert.fail("rejected operation must never execute"); } });
  await queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "reject", actor_id: "original-person", note: "Keep the original" });
  await adapter.close(); queue.close();
  const originalKey = await readFile(join(storageRoot, "storage.key"));
  assert.equal((await createHomeSnapshot({ homeDirectory: home, destination: snapshot })).status, "created");
  const manifest = JSON.parse(await readFile(join(snapshot, "manifest.json"), "utf8")) as HomeSnapshotManifest;
  const record = manifest.stores.flatMap(store => store.entries).find(entry => entry.path.startsWith("agent-runtime/records/molis-review-decision-") && entry.path.endsWith(".json"));
  assert.ok(record, "the normal SDK record inventory includes the new source kind");
  assert.deepEqual(await readFile(join(home, record.path)), await readFile(join(snapshot, "data", record.path)));
  assert.equal(manifest.stores.flatMap(store => store.entries).some(entry => entry.path === "agent-runtime/storage.key"), false, "the snapshot keeps ciphertext and an original-key dependency, never a copy of the key");
  assert.ok(manifest.stores.flatMap(store => store.dependencies).some(dependency => dependency.location === "home:agent-runtime/storage.key"));
  await rm(join(home, record.path));
  assert.equal((await restoreHomeSnapshot({ homeDirectory: home, source: snapshot, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot })).status, "restored");
  assert.deepEqual(await readFile(join(storageRoot, "storage.key")), originalKey);
  queue = new AgentReviewQueue(); adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: queue });
  await queue.refresh("project");
  const receipt = queue.receipt(review.review_id)!;
  assert.equal(receipt.status, "rejected"); assert.equal(receipt.note, "Keep the original"); assert.deepEqual(receipt.source, { kind: "person", actor_id: "original-person" });
  assert.deepEqual(queue.get(review.review_id)?.reference, review.reference); assert.equal((await queue.decisions(review.review_id)).approve.available, false);
  await assert.rejects(queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "another-person" }), { code: "agent.review_already_decided" });
});

test("APR-08/12: a created worktree whose original authority ends before provenance registration stays uncertain across restart", async t => {
  const root = await mkdtemp(join(tmpdir(), "review-partial-worktree-")), repo = join(root, "repo"); await mkdir(repo);
  const run = promisify(execFile), git = (args: string[]) => run("git", args, { cwd: repo });
  await git(["init", "-q"]); await git(["config", "user.name", "Test"]); await git(["config", "user.email", "test@example.invalid"]);
  await writeFile(join(repo, "note"), "original"); await git(["add", "note"]); await git(["commit", "-qm", "original"]);
  const worktrees = createGitWorktreePort(repo), proposed = await worktrees.preview("reviewed"), directory = join(repo, proposed.directory);
  const app = { appId: "molis.review.partial-worktree", appVersion: "1.0.0" };
  let queue = new AgentReviewQueue(), adapter = await createPrologueNodeAdapter({ app, storageRoot: join(root, "sdk"), reviewQueue: queue });
  t.after(async () => { await adapter.close(); queue.close(); await rm(root, { recursive: true, force: true }); });
  let executions = 0;
  const review = await adapter.gitReviews!.prepare({ project_id: "project", workspace_id: "workspace", operation_id: "partial-worktree", operation_kind: "git-worktree",
    proposal_fingerprint: reviewProposalVersion({ repo, proposed }), document: { kind: "tool-operation", tool: "git-worktree-create", summary: "Create the reviewed worktree", fields: [{ label: "directory", value: directory }] },
  }, { authority: { plugin_id: "plugin", install_id: "original", holds: () => !existsSync(join(directory, ".git")) }, check: async () => {},
    execute: async assertCurrent => { executions++; await worktrees.create("reviewed", proposed.base_commit, assertCurrent); } });
  const receipt = await queue.respond({ review_id: review.review_id, version: review.reference.version, actor_id: "person", decision: "approve" });
  assert.ok(receipt.effect_uncertain); assert.equal(receipt.effect_settled, false); assert.equal(receipt.effect_error, null);
  assert.match(receipt.effect_uncertain, /工作树已建立.*来源登记未完成/);
  assert.ok(receipt.effect_uncertain.includes(directory)); assert.ok(receipt.effect_uncertain.includes(proposed.branch));
  assert.equal(await readFile(join(directory, "note"), "utf8"), "original");
  assert.equal((await git(["rev-parse", proposed.branch])).stdout.trim(), proposed.base_commit);
  const inspected = await worktrees.inspect(); assert.deepEqual(inspected.owned, []); assert.equal(inspected.unavailable.length, 1);
  await adapter.close(); queue.close(); queue = new AgentReviewQueue();
  adapter = await createPrologueNodeAdapter({ app, storageRoot: join(root, "sdk"), reviewQueue: queue });
  await queue.refresh("project");
  assert.ok(queue.receipt(review.review_id)?.effect_uncertain); assert.equal(queue.receipt(review.review_id)?.effect_error, null);
  assert.match(queue.receipt(review.review_id)!.effect_uncertain!, /目录、分支和来源登记/);
  assert.equal((await queue.decisions(review.review_id)).approve.available, false); assert.equal(executions, 1);
  assert.equal(await readFile(join(directory, "note"), "utf8"), "original");
});

test("APR-08: the real SDK Git dispatch carries original authority through the owner's asynchronous preparation", async t => {
  const root = await mkdtemp(join(tmpdir(), "review-git-authority-")), target = join(root, "note"); await writeFile(target, "original");
  const queue = new AgentReviewQueue(), adapter = await createPrologueNodeAdapter({ app: { appId: "molis.review.git-tail", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue });
  t.after(async () => { await adapter.close(); queue.close(); await rm(root, { recursive: true, force: true }); });
  let current = true, writes = 0;
  const request = await adapter.gitReviews!.prepare({ project_id: "project", workspace_id: "workspace", operation_id: "original-operation",
    proposal_fingerprint: reviewProposalVersion({ root, text: "reviewed" }), document: { kind: "git-index", action: "stage", workspace_name: "repo", files: [] },
  }, { authority: { plugin_id: "plugin", install_id: "original-install", holds: () => current }, check: async () => {},
    execute: async assertCurrent => { await Promise.resolve(); current = false; assertCurrent(); writes++; await writeFile(target, "reviewed"); } });
  const receipt = await queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "person" });
  assert.equal(writes, 0); assert.equal(await readFile(target, "utf8"), "original");
  assert.deepEqual(receipt.source, { kind: "person", actor_id: "person" }); assert.ok(receipt.effect_error); assert.equal(receipt.effect_settled, false);
});

for (const refuseProjection of [false, true]) test(`APR-07/12: real Node Git decision survives restart ${refuseProjection ? "before its recovery projection" : "after dispatch"} without replay`, async t => {
  const root = await mkdtemp(join(tmpdir(), "review-source-node-")), target = join(root, "note");
  await writeFile(target, "before");
  const app = { appId: "molis.review.source-node", appVersion: "1.0.0" }, queue = new AgentReviewQueue();
  let adapter = await createPrologueNodeAdapter({ app, storageRoot: join(root, "sdk"), reviewQueue: queue });
  const history = new AgentReviewQueue();
  t.after(async () => { await adapter.close(); queue.close(); history.close(); await rm(root, { recursive: true, force: true }); });
  let executions = 0, refused = false;
  const request = await adapter.gitReviews!.prepare({ project_id: "project", workspace_id: "workspace", operation_id: "original-operation",
    proposal_fingerprint: reviewProposalVersion({ root, path: "note", before: "before", after: "after" }),
    document: { kind: "git-index", action: "stage", workspace_name: "Original repo", files: [{ path: "note", before_text: "before", after_text: "after", before_mode: "100644", after_mode: "100644" }] },
  }, { authority: { plugin_id: "plugin", install_id: "original-install", holds: () => true }, check: async () => {}, execute: async () => { executions++; await writeFile(target, "after"); } });
  const deciding = queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "person" }, {
    async beforeEffect() { if (refuseProjection && queue.receipt(request.review_id)?.source) { refused = true; throw new Error("entry revoked before projection"); } },
    assertCurrent() { if (refused) throw new Error("entry revoked"); },
  });
  if (refuseProjection) await assert.rejects(deciding, /entry revoked/); else assert.equal((await deciding).effect_settled, true);
  assert.equal(executions, refuseProjection ? 0 : 1);
  assert.equal(await readFile(target, "utf8"), refuseProjection ? "before" : "after");
  await adapter.close(); queue.close();
  adapter = await createPrologueNodeAdapter({ app, storageRoot: join(root, "sdk"), reviewQueue: history });
  await history.refresh("project");
  const receipt = history.receipt(request.review_id);
  assert.equal(receipt?.status, "approved"); assert.deepEqual(receipt?.source, { kind: "person", actor_id: "person" });
  assert.deepEqual(history.get(request.review_id)?.reference, request.reference);
  assert.equal(receipt?.effect_settled, !refuseProjection); if (refuseProjection) assert.ok(receipt?.effect_error);
  assert.equal((await history.decisions(request.review_id)).approve.available, false);
  await assert.rejects(history.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "another-person" }));
  assert.equal(executions, refuseProjection ? 0 : 1);
});

test("APR-08/13: Git recovery revocation at the evidence commit leaves the original receipt uncertain", async t => {
  const root = await mkdtemp(join(tmpdir(), "review-git-evidence-"));
  const app = { appId: "molis.review.git-evidence", appVersion: "1.0.0" };
  const storageRoot = join(root, "sdk");
  let queue = new AgentReviewQueue(), adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: queue });
  t.after(async () => { await adapter.close(); queue.close(); await rm(root, { recursive: true, force: true }); });
  let executions = 0;
  const request = await adapter.gitReviews!.prepare({ project_id: "project", workspace_id: "workspace", operation_id: "manual-recovery-operation",
    proposal_fingerprint: reviewProposalVersion({ target: "note", change: "reviewed" }),
    document: { kind: "git-index", action: "stage", workspace_name: "repo", files: [] },
  }, { authority: { plugin_id: "plugin", install_id: "original", holds: () => true }, check: async () => {}, execute: async () => {
    executions++;
    throw Object.assign(new Error("no final receipt"), { code: "EFFECT_RECONCILE_REQUIRED" });
  } });
  const approved = await queue.respond({ review_id: request.review_id, version: request.reference.version, decision: "approve", actor_id: "person" });
  assert.ok(approved.effect_uncertain);
  const records = join(storageRoot, "records");
  const [kind, otherKind] = (await readdir(records)).filter(name => name.startsWith("molis-git-review-"));
  assert.ok(kind); assert.equal(otherKind, undefined);
  const [entry, otherEntry] = (await readdir(join(records, kind))).filter(name => name.endsWith(".json"));
  assert.ok(entry); assert.equal(otherEntry, undefined);
  const evidenceRecord = join(records, kind, entry), initialRecord = await readFile(evidenceRecord);

  const observe = async () => ({ revision: "original-index", observed_at: new Date().toISOString(), files: [], matches_before: true, matches_after: false });
  const input = { review_id: request.review_id, action: "not-happened" as const, actor_id: "person", revision: "original-index", reason: "Checked the original index." };
  const controller = new AbortController();
  await assert.rejects(queue.recover(input, observe, {
    async beforeEffect() { await Promise.resolve(); controller.abort(new Error("the recovery request ended before commit")); },
    assertCurrent: () => controller.signal.throwIfAborted(),
  }), /ended before commit/);
  assert.ok((await readFile(evidenceRecord)).equals(initialRecord), "the original durable recovery record was not replaced");
  assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
  assert.equal(queue.receipt(request.review_id)?.reconciliation, undefined);

  await adapter.close(); queue.close();
  queue = new AgentReviewQueue(); adapter = await createPrologueNodeAdapter({ app, storageRoot, reviewQueue: queue });
  await queue.refresh("project");
  assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
  assert.equal(queue.receipt(request.review_id)?.reconciliation, undefined);
  const recovered = await queue.recover(input, observe, { beforeEffect() {}, assertCurrent() {} });
  assert.ok(!(await readFile(evidenceRecord)).equals(initialRecord), "a current caller saves the original evidence");
  assert.equal(recovered.receipt.reconciliation?.reason, input.reason);
  assert.equal(recovered.receipt.effect_uncertain, undefined);
  assert.equal(executions, 1);
});
