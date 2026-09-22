import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

test("worktree creation with a missing dispatch receipt remains unknown after restart and cannot be retried as an index operation", async () => {
  const root=await mkdtemp(path.join(tmpdir(),"worktree-uncertain-"));let queue=new AgentReviewQueue(),calls=0;
  const make=()=>createPrologueNodeAdapter({app:{appId:"molis.worktree.unknown",appVersion:"1.0.0"},storageRoot:path.join(root,"sdk"),reviewQueue:queue,modelConfiguration:async()=>{throw new Error("no model for directory preparation");}});
  let adapter=await make();
  const intent={board_id:"b",workspace_id:"w",operation_id:"worktree-unknown",operation_kind:"git-worktree" as const,document:{kind:"tool-operation" as const,tool:"git-worktree-create",summary:"prepare",fields:[{label:"directory",value:root}]}};
  const execution={check:async()=>{},execute:async()=>{calls++;await writeFile(path.join(root,"created"),"created once");throw Object.assign(new Error("lost receipt"),{code:"EFFECT_RECONCILE_REQUIRED"});}};
  try {
    const request=await adapter.gitReviews!.prepare(intent,execution);
    await queue.respond({review_id:request.review_id,decision:"approve",actor_id:"test"});
    assert.equal(queue.receipt(request.review_id)?.effect_settled,false);assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await adapter.close();queue=new AgentReviewQueue();adapter=await make();await queue.refresh("b");
    assert.equal(queue.get(request.review_id)?.operation?.kind,"git-worktree");assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({...intent,operation_id:"worktree-next"},execution),/结果未知/);
    await assert.rejects(queue.respond({review_id:request.review_id,decision:"approve",actor_id:"test"}));
    assert.equal(calls,1);assert.equal(await readFile(path.join(root,"created"),"utf8"),"created once");
  } finally {await adapter.close();await rm(root,{recursive:true,force:true});}
});

test("Git uses the SDK's durable effect receipt and blocks redispatch after an uncertain result across restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "git-effect-")), target = path.join(root, "effect-count");
  let queue: AgentReviewQueue, adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, calls = 0;
  const start = async () => {
    queue = new AgentReviewQueue();
    adapter = await createPrologueNodeAdapter({ app: { appId: "molis.git.test", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue,
      modelConfiguration: async () => { throw new Error("manual Git operations must not request a model"); } });
  };
  const intent = { board_id: "board", workspace_id: "workspace", operation_id: "operation-uncertain",
    document: { kind: "git-index" as const, action: "stage" as const, workspace_name: "fixture",
      files: [{ path: "note", before_text: "before", after_text: "after", before_mode: "100644" as const, after_mode: "100644" as const }] } };
  try {
    await start();
    const request = await adapter.gitReviews!.prepare(intent, { check: async () => {}, execute: async () => {
      calls++; await writeFile(target, String(calls)); throw Object.assign(new Error("receipt unavailable after dispatch"), { code: "EFFECT_RECONCILE_REQUIRED" });
    } });
    const duplicate = await adapter.gitReviews!.prepare(intent, { check: async () => {}, execute: async () => { calls++; } });
    assert.equal(duplicate.review_id, request.review_id); assert.equal(calls, 0);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, document: { ...intent.document, action: "unstage" } }, { check: async () => {}, execute: async () => {} }), /另一份/);
    const result = await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
    assert.equal(result.effect_settled, false); assert.ok(result.effect_uncertain); assert.equal(await readFile(target, "utf8"), "1");
    await adapter.close(); await start(); await queue.refresh("board");
    assert.ok(queue.receipt(request.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: "second-operation" }, { check: async () => {}, execute: async () => { calls++; } }), /结果未知/);
    await assert.rejects(queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" }));
    assert.equal(calls, 1); assert.equal(await readFile(target, "utf8"), "1");
  } finally { await adapter!?.close(); await rm(root, { recursive: true, force: true }); }
});

for (const applied of [false, true]) test(`Git recovery ${applied ? 'retains uncertainty after an applied write without a receipt' : 'requires fresh facts and explicit evidence before confirming no write'} across restart`, async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { realpath } = await import('node:fs/promises');
  const { readWorkspaceGit } = await import('../apps/local-host/src/workspace-git.js');
  const { prepareGitIndex, inspectGitIndex } = await import('../apps/local-host/src/workspace-git-index.js');
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'git-recovery-')));
  const git = (...args: string[]) => promisify(execFile)('git', args, { cwd: root });
  let grants = [{ workspace_id: 'workspace', canonical_path: root, realpath_verified: true }] as any[];
  let queue: AgentReviewQueue, adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>>, calls = 0;
  const start = async () => {
    queue = new AgentReviewQueue();
    adapter = await createPrologueNodeAdapter({ app: { appId: 'molis.git.recovery.test', appVersion: '1.0.0' }, storageRoot: path.join(root, 'sdk'), reviewQueue: queue,
      modelConfiguration: async () => { throw new Error('manual Git recovery does not request a model'); } });
  };
  const observe = async (request: any) => inspectGitIndex(request.operation.workspace_id, request.document, async () => grants);
  try {
    await git('init', '-b', 'main'); await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
    await writeFile(path.join(root, 'note'), 'base\n'); await git('add', 'note'); await git('commit', '-m', 'base');
    await writeFile(path.join(root, 'note'), '\uFEFFafter🙂\r\n');
    const diff = await readWorkspaceGit({ kind: 'diff', workspace_id: 'workspace', path: ['note'], side: 'worktree' }, grants);
    assert.equal(diff.outcome, 'diff'); if (diff.outcome !== 'diff') throw new Error('missing diff');
    const prepared = await prepareGitIndex({ workspace_id: 'workspace', path: ['note'], action: 'stage', revision: diff.revision }, async () => grants);
    const intent = { board_id: 'board', workspace_id: 'workspace', operation_id: 'unknown-operation', document: { kind: 'git-index' as const, action: 'stage' as const, workspace_name: 'fixture', files: prepared.files } };
    await start();
    const request = await adapter.gitReviews!.prepare(intent, { check: prepared.check, execute: async () => {
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
      await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: 'next-operation' }, prepared), /结果未知/);
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
      assert.equal((await adapter.gitReviews!.prepare(intent, prepared)).review_id, id);
      const next = await adapter.gitReviews!.prepare({ ...intent, operation_id: 'new-operation' }, { check: async () => {}, execute: async () => { calls++; } });
      await queue.respond({ review_id: next.review_id, decision: 'reject', actor_id: 'tester' });
      assert.equal(calls, 1); assert.equal((await git('show', ':note')).stdout, 'base\n');
    }
  } finally { await adapter!?.close(); await rm(root, { recursive: true, force: true }); }
});


test("integration with an uncertain write retains its original review and blocks replay after restart", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "integration-uncertain-"));
  let queue = new AgentReviewQueue(), calls = 0;
  const make = () => createPrologueNodeAdapter({ app: { appId: "molis.integration.unknown", appVersion: "1.0.0" }, storageRoot: path.join(root, "sdk"), reviewQueue: queue, modelConfiguration: async () => { throw new Error("manual operation"); } });
  let adapter = await make();
  const intent = { board_id: "b", workspace_id: "w", operation_id: "integration-original", operation_kind: "git-integration" as const,
    document: { kind: "git-integration" as const, target_directory: root, source: { session_id: "s", run_id: "r", subagent_id: "child", branch: "branch", base_commit: "base", directory: root + "/child" },
      files: [{ path: "created", before_text: null, after_text: "once", before_mode: null, after_mode: "100644" as const }] } };
  const execution = { check: async () => {}, execute: async () => { calls++; await writeFile(path.join(root, "created"), "once"); throw Object.assign(new Error("write result uncertain"), { code: "EFFECT_RECONCILE_REQUIRED" }); } };
  try {
    const original = await adapter.gitReviews!.prepare(intent, execution);
    await queue.respond({ review_id: original.review_id, decision: "approve", actor_id: "user" });
    assert.ok(queue.receipt(original.review_id)?.effect_uncertain);
    await adapter.close(); queue = new AgentReviewQueue(); adapter = await make(); await queue.refresh("b");
    assert.deepEqual(queue.get(original.review_id)?.document, intent.document);
    assert.ok(queue.receipt(original.review_id)?.effect_uncertain);
    await assert.rejects(adapter.gitReviews!.prepare({ ...intent, operation_id: "integration-retry" }, execution), /结果未知/);
    assert.equal(calls, 1); assert.equal(await readFile(path.join(root, "created"), "utf8"), "once");
  } finally { await adapter.close(); await rm(root, { recursive: true, force: true }); }
});
