import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { readWorkspaceGit } from "../apps/local-host/src/workspace-git.js";
import { prepareGitIndex, inspectGitIndex } from "../apps/local-host/src/workspace-git-index.js";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
const held = { plugin_id: "io.molis.work.git", install_id: "fixture", holds: () => true };
const exec = promisify(execFile);
test("Git index preparation writes nothing, stages exact bytes/modes and refuses changed facts or another writer's lock", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-index-"))), index = path.join(root, ".git/index");
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  let grants = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const prepare = async (name: string, action: "stage" | "unstage") => {
    const diff = await readWorkspaceGit({ workspace_id: "w", path: [name], kind: "diff", side: action === "stage" ? "worktree" : "index" }, grants);
    assert.equal(diff.outcome, "diff"); if (diff.outcome !== "diff") throw new Error(JSON.stringify(diff));
    return prepareGitIndex({ workspace_id: "w", path: [name], action, revision: diff.revision }, async () => grants);
  };
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid"); await git("config", "core.filemode", "true");
    await writeFile(path.join(root, "note"), "base\n"); await git("add", "."); await git("commit", "-m", "base");
    const body = "\uFEFFfixed🙂\r\n"; await writeFile(path.join(root, "note"), body); await chmod(path.join(root, "note"), 0o755);
    const before = await readFile(index), staged = await prepare("note", "stage");
    assert.deepEqual(await readFile(index), before); assert.equal((await git("show", ":note")).stdout, "base\n");
    assert.equal(staged.files[0]!.after_text, body); assert.equal(staged.files[0]!.after_mode, "100755");
    await staged.execute(); assert.equal((await git("show", ":note")).stdout, body); assert.match((await git("ls-files", "--stage", "note")).stdout, /^100755/);
    const unstaged = await prepare("note", "unstage"); await unstaged.execute(); assert.equal((await git("show", ":note")).stdout, "base\n"); assert.equal(await readFile(path.join(root, "note"), "utf8"), body);
    const stale = await prepare("note", "stage"); await writeFile(path.join(root, "note"), "later\n");
    await assert.rejects(stale.execute(), /改变/); assert.equal((await git("show", ":note")).stdout, "base\n");
    const locked = await prepare("note", "stage"); await writeFile(index + ".lock", "other writer");
    await assert.rejects(locked.execute(), /其他操作/); assert.equal(await readFile(index + ".lock", "utf8"), "other writer"); await rm(index + ".lock");
    const revoked = await prepare("note", "stage"); grants = []; await assert.rejects(revoked.execute(), /授权/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Git unstage restores both names of a rename; unborn files can be removed from index without deleting disk files", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "git-unstage-")));
  const git = (...args: string[]) => exec("git", args, { cwd: root });
  const grants = [{ workspace_id: "w", canonical_path: root, realpath_verified: true }] as ProjectWorkspaceRef[];
  const unstage = async (name: string) => {
    const diff = await readWorkspaceGit({ workspace_id: "w", path: [name], kind: "diff", side: "index" }, grants);
    assert.equal(diff.outcome, "diff"); if (diff.outcome !== "diff") throw new Error("no diff");
    return prepareGitIndex({ workspace_id: "w", path: [name], action: "unstage", revision: diff.revision }, async () => grants);
  };
  try {
    await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
    await writeFile(path.join(root, "old"), "unchanged\n"); await git("add", ".");
    await (await unstage("old")).execute(); assert.equal((await git("ls-files")).stdout, ""); assert.equal(await readFile(path.join(root, "old"), "utf8"), "unchanged\n");
    await git("add", "."); await git("commit", "-m", "base"); await git("mv", "old", "new");
    const prepared = await unstage("new"); assert.deepEqual(prepared.files.map(file => [file.path, file.after_text]), [["new", null], ["old", "unchanged\n"]]);
    await prepared.execute(); assert.equal((await git("ls-files")).stdout, "old\n"); assert.equal(await readFile(path.join(root, "new"), "utf8"), "unchanged\n");
  } finally { await rm(root, { recursive: true, force: true }); }
});

// The real index recovery cases keep their original assertions beside the index owner tests.
for (const applied of [false, true]) test(`Git recovery ${applied ? 'retains uncertainty after an applied write without a receipt' : 'requires fresh facts and explicit evidence before confirming no write'} across restart`, async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'git-recovery-')));
  const git = (...args: string[]) => promisify(execFile)('git', args, { cwd: root });
  let grants: ProjectWorkspaceRef[] = [{ workspace_id: 'workspace', canonical_path: root, realpath_verified: true }];
  let queue: AgentReviewQueue, adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, calls = 0;
  const start = async () => {
    queue = new AgentReviewQueue();
    adapter = await createPrologueNodeAdapter({ app: { appId: 'molis.git.recovery.test', appVersion: '1.0.0' }, storageRoot: path.join(root, 'sdk'), reviewQueue: queue,
      modelConfiguration: async () => { throw new Error('manual Git recovery does not request a model'); } });
  };
  const observe = async (request: AgentReviewRequest) => {
    assert.ok(request.operation);
    if (request.document.kind !== 'git-index') throw new Error('expected an index review');
    return inspectGitIndex(request.operation.workspace_id, request.document, async () => grants);
  };
  try {
    await git('init', '-b', 'main'); await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
    await writeFile(path.join(root, 'note'), 'base\n'); await git('add', 'note'); await git('commit', '-m', 'base');
    await writeFile(path.join(root, 'note'), '\uFEFFafter🙂\r\n');
    const diff = await readWorkspaceGit({ kind: 'diff', workspace_id: 'workspace', path: ['note'], side: 'worktree' }, grants);
    assert.equal(diff.outcome, 'diff'); if (diff.outcome !== 'diff') throw new Error('missing diff');
    const prepared = await prepareGitIndex({ workspace_id: 'workspace', path: ['note'], action: 'stage', revision: diff.revision }, async () => grants);
    const intent = { project_id: 'board', workspace_id: 'workspace', operation_id: 'unknown-operation', document: { kind: 'git-index' as const, action: 'stage' as const, workspace_name: 'fixture', files: prepared.files } };
    await start();
    const request = await adapter.gitReviews!.prepare(intent, { authority: held, check: prepared.check, execute: async () => {
      calls++; if (applied) await prepared.execute();
      throw Object.assign(new Error('lost original dispatch receipt'), { code: 'EFFECT_RECONCILE_REQUIRED' });
    } });
    const id = request.review_id;
    await queue.respond({ review_id: id, decision: 'approve', actor_id: 'tester' });
    await adapter.close(); await start(); await queue.refresh('board');
    const initial = await queue.inspectRecovery(id, observe);
    assert.equal(initial.observation?.matches_before, !applied);
    assert.equal(initial.observation?.matches_after, applied);
    assert.equal(initial.can_confirm_not_happened, !applied);
    const refresh = await queue.recover({ review_id: id, action: 'refresh', actor_id: 'tester' }, observe);
    assert.ok(refresh.receipt.effect_uncertain); assert.equal(refresh.receipt.effect_settled, false); assert.equal(calls, 1);
    const input = { review_id: id, action: 'not-happened' as const, actor_id: 'tester', revision: initial.observation!.revision, reason: 'The fixture interrupted the execution before the index writer was called.' };
    if (applied) {
      await assert.rejects(queue.recover(input, observe), /不支持确认/);
      await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: 'next-operation' }, { ...prepared, authority: held }), /结果未知/);
      assert.equal((await git('show', ':note')).stdout, '\uFEFFafter🙂\r\n');
      assert.ok(queue.receipt(id)?.effect_uncertain); assert.equal(queue.receipt(id)?.reconciliation, undefined);
    } else {
      await assert.rejects(queue.recover({ ...input, reason: ' ' }, observe), /具体依据/);
      await assert.rejects(queue.recover({ ...input, revision: 'outdated' }, observe), /核对内容已改变/);
      await writeFile(path.join(root, '.git/index.lock'), 'other writer');
      assert.equal((await queue.inspectRecovery(id, observe)).can_confirm_not_happened, false);
      await assert.rejects(queue.recover(input, observe), /不支持确认/);
      assert.equal(await readFile(path.join(root, '.git/index.lock'), 'utf8'), 'other writer'); await rm(path.join(root, '.git/index.lock'));
      const originalGrants = grants; grants = [];
      assert.equal((await queue.inspectRecovery(id, observe)).observation, null);
      await assert.rejects(queue.recover(input, observe), /不支持确认/); grants = originalGrants;
      let observations = 0;
      await assert.rejects(queue.recover(input, async request => {
        if (++observations === 2) { await writeFile(path.join(root, 'other'), 'concurrent'); await git('add', 'other'); }
        return observe(request);
      }), /保存核对依据期间暂存区已改变/);
      assert.ok(queue.receipt(id)?.effect_uncertain);
      await adapter.close(); await start(); await queue.refresh('board');
      assert.ok(queue.receipt(id)?.effect_uncertain); assert.equal(queue.receipt(id)?.reconciliation, undefined, 'saving provenance alone must not resolve the SDK effect');
      const current = await queue.inspectRecovery(id, observe), before = await readFile(path.join(root, '.git/index'));
      const resolved = await queue.recover({ ...input, revision: current.observation!.revision }, observe);
      assert.equal(resolved.receipt.effect_uncertain, undefined); assert.equal(resolved.receipt.effect_settled, false);
      assert.equal(resolved.receipt.reconciliation?.reason, input.reason); assert.match(resolved.receipt.effect_error!, /未发生/);
      assert.deepEqual(await readFile(path.join(root, '.git/index')), before);
      await assert.rejects(queue.recover(input, observe), /已经收口|已收口/);
      await assert.rejects(queue.respond({ review_id: id, decision: 'approve', actor_id: 'tester' }));
      await adapter.close(); await start(); await queue.refresh('board');
      assert.deepEqual(queue.receipt(id), resolved.receipt, 'SDK outcome and Host provenance survive restart');
      assert.equal((await adapter.gitReviews!.prepare(intent, { ...prepared, authority: held })).review_id, id);
      const next = await adapter.gitReviews!.prepare({ ...intent, operation_id: 'new-operation' }, { authority: held, check: async () => {}, execute: async () => { calls++; } });
      await queue.respond({ review_id: next.review_id, decision: 'reject', actor_id: 'tester' });
      assert.equal(calls, 1); assert.equal((await git('show', ':note')).stdout, 'base\n');
    }
  } finally { await adapter!?.close(); await rm(root, { recursive: true, force: true }); }
});
