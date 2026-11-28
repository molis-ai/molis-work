import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { reviewDecisionStorage } from "./fixtures/review-decision-storage.js";
import { createPrologueCheckpoints } from "../horizontal/agent-host/dist/adapters/prologue-checkpoints.js";
const requireSdk = createRequire(new URL('../horizontal/agent-host/package.json', import.meta.url));
const { createRuntime } = await import(requireSdk.resolve('@prologue/sdk'));
const { createNodeHost } = await import(requireSdk.resolve('@prologue/sdk/node'));

async function waitUntil(check: () => boolean) {
  for (let tries = 0; tries < 100; tries++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('operation did not settle');
}
async function fixture(beforeCancel?: () => Promise<void>) {
  const sources = reviewDecisionStorage();
  const faults: { decision: boolean; review: boolean; dispatchUnknown: boolean; beforeInspect?: () => Promise<void> } = { decision: false, review: false, dispatchUnknown: false };
  const root = await mkdtemp(join(tmpdir(), 'molis-checkpoints-')), project = join(root, 'project');
  await mkdir(project);await writeFile(join(project, 'a.ts'), 'original\n');
  let runtime: any, queue: AgentReviewQueue, checkpoints: ReturnType<typeof createPrologueCheckpoints>;
  const indexes = new Map<string, any>();
  const boot = async () => {
    runtime = await createRuntime({ app: { appId: 'molis.checkpoint.test', appVersion: '1.0.0' }, host: createNodeHost({ storageRoot: join(root, 'sdk') }),
      preset: 'local-agent', posture: { sandbox: 'workspace-write' }, rules: [{ source: 'user', effect: 'allow', kinds: ['mutate-local'] }] });
    queue = new AgentReviewQueue({ decisions: sources.store });
    checkpoints = createPrologueCheckpoints({ runtime: { ...runtime, effects: { ...runtime.effects,
      cancel: async (ref: Parameters<Parameters<typeof createPrologueCheckpoints>[0]["runtime"]["effects"]["cancel"]>[0]) => { await beforeCancel?.(); return runtime.effects.cancel(ref); },
      inspectDispatch: async (ref: Parameters<Parameters<typeof createPrologueCheckpoints>[0]["runtime"]["effects"]["inspectDispatch"]>[0]) => {
        await faults.beforeInspect?.();
        return faults.dispatchUnknown ? { state:'unknown', fingerprint:'unknown', receiptId:undefined, ok:undefined } : runtime.effects.inspectDispatch(ref);
      },
    } }, queue, decisionStore: sources.store, readIndex: async id => structuredClone(indexes.get(id)),
      remember: async (id, intent) => { (indexes.get(id).rewinds ??= []).push(structuredClone(intent)); },
      decision: async (id, pending, receipt) => { if(faults.decision) throw new Error("decision storage unavailable"); (indexes.get(id).review_decisions ??= {})[pending] = { status: receipt.status, decided_at: receipt.decided_at, decided_by: receipt.decided_by, note: receipt.note }; },
      readResource: async ref => { if(faults.review) throw new Error("review content unavailable"); const handle = runtime.resources.inspect(ref);const chunk = await runtime.resources.readChunk(ref, 0, handle.byteLength);return JSON.parse(new TextDecoder().decode(chunk.bytes)); },
    });
  };
  await boot();
  const sdkSession = await runtime.sessions.create(), session = { runtime_id: 'prologue', session_id: sdkSession.ref.id };
  indexes.set(session.session_id, { owner: { project_id: 'board', plugin_id: 'coding', install_id: 'checkpoint-install' }, attempts: [{ frozen: { directory: { canonical_path: project, realpath_verified: true } } }] });
  return { project, session, indexes, faults, sources, get runtime() {return runtime;}, get queue() {return queue;}, get checkpoints() {return checkpoints;},
    async edit(path: string, text: string) {
      const root = await runtime.workspace.authorize({path: project});
      const mutator = runtime.createMutator({rootRef: root.ref,mode:'build',sessionId:session.session_id,runId:()=> 'actual-model-run'});
      const plan = await mutator.preparePatch({path,nextText:text});await mutator.applyPatch(plan,await runtime.readClock());
      return (await mutator.checkpoints()).at(-1).checkpointId as string;
    },
    async restart() {await checkpoints.close();await runtime.shutdown();await boot();},
    async close() {await checkpoints.close();await runtime.shutdown();await rm(root,{recursive:true,force:true});},
  };
}

test("APR-07/12: an unknown saved rewind decision closes the live SDK wait after read-back without writing files", async () => {
  const f = await fixture();
  try {
    const id = await f.edit("a.ts", "new\n"), review = await f.checkpoints.prepareRewind(f.session, id);
    f.sources.faults.afterCommit = () => { throw new Error("lost source commit return"); };
    f.sources.faults.beforeRead = () => { throw new Error("source read unavailable"); };
    await assert.rejects(f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }), { code: "agent.review_decision_pending" });
    assert.equal(f.checkpoints.busy!(f.session), true);
    assert.equal((await f.queue.decisions(review.review_id)).reject.available, false);
    f.sources.faults.beforeRead = undefined;
    await f.queue.refresh("board");
    await waitUntil(() => !f.checkpoints.busy!(f.session));
    const receipt = f.queue.receipt(review.review_id);
    assert.deepEqual(receipt?.source, { kind: "person", actor_id: "person" });
    assert.equal(receipt?.status, "approved"); assert.ok(receipt?.effect_error); assert.equal(receipt?.delivery_error, undefined);
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "new\n");
    assert.throws(() => f.queue.consumeApproval(review.review_id), { code: "agent.review_not_approved" });
  } finally { await f.close(); }
});

test("APR-07/12: unreadable rewind history stays busy until its original decision and receipt can be read without replay", async () => {
  const f = await fixture();
  try {
    const id = await f.edit("a.ts", "new\n"), review = await f.checkpoints.prepareRewind(f.session, id);
    await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "original-person" });
    await waitUntil(() => !f.checkpoints.busy!(f.session));
    await writeFile(join(f.project, "a.ts"), "later edit\n");
    f.sources.records.clear(); // Original four-field history, written before separate provenance records.
    f.sources.faults.beforeRead = () => { throw new Error("source unavailable"); };
    await f.restart(); await f.checkpoints.restore(f.session.session_id);
    assert.ok(f.queue.receipt(review.review_id)?.decision_save_error);
    assert.equal(f.checkpoints.busy!(f.session), true);
    await assert.rejects(f.checkpoints.prepareRewind(f.session, id), /已有回退/);
    f.sources.faults.beforeRead = undefined;
    await f.queue.refresh("board");
    const receipt = f.queue.receipt(review.review_id)!;
    assert.equal(receipt.status, "approved"); assert.equal(receipt.decided_by, "original-person"); assert.equal(receipt.source, undefined);
    assert.equal(receipt.effect_settled, true); assert.equal(receipt.decision_save_error, undefined); assert.equal(f.checkpoints.busy!(f.session), false);
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "later edit\n");
  } finally { await f.close(); }
});

test("APR-07/12: rewind receipt recovery survives repeated unknown reads and close waits for its in-flight check", async () => {
  const f = await fixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let closing: Promise<void> | undefined, refreshing: Promise<void> | undefined;
  try {
    const id = await f.edit("a.ts", "new\n"), review = await f.checkpoints.prepareRewind(f.session, id);
    f.faults.dispatchUnknown = true;
    await f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" });
    await waitUntil(() => Boolean(f.queue.receipt(review.review_id)?.effect_uncertain));
    await f.queue.refresh("board");
    assert.equal(f.checkpoints.busy!(f.session), true);
    await writeFile(join(f.project, "a.ts"), "after rewind\n");
    f.faults.dispatchUnknown = false;
    f.faults.beforeInspect = async () => { entered.resolve(); await release.promise; };
    refreshing = f.queue.refresh("board"); await entered.promise;
    let closed = false; closing = f.checkpoints.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(closed, false, "owner must retain storage while its accepted refresh reads dispatch evidence");
    release.resolve(); await refreshing; await closing;
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled, true);
    assert.equal(f.queue.receipt(review.review_id)?.effect_uncertain, undefined); assert.equal(f.checkpoints.busy!(f.session), false);
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "after rewind\n");
  } finally { release.resolve(); await refreshing; await closing; await f.close(); }
});

for (const decision of ["approve", "reject"] as const) test(`APR-07/12: rewind close waits for a saved ${decision} delivery after its SDK waiter was cancelled`, async () => {
  const f = await fixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let closing: Promise<void> | undefined, answering: Promise<void> | undefined;
  try {
    const id = await f.edit("a.ts", "new\n"), review = await f.checkpoints.prepareRewind(f.session, id);
    answering = assert.rejects(f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision, actor_id: "person" }, {
      beforeEffect: async () => { if (f.queue.receipt(review.review_id)?.source) { entered.resolve(); await release.promise; } },
    }), /原回退等待已结束/);
    await entered.promise;
    let closed = false; closing = f.checkpoints.close().then(() => { closed = true; });
    await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(closed, false);
    await assert.rejects(f.checkpoints.restore(f.session.session_id), /正在关闭/);
    release.resolve(); await answering; await closing;
    assert.equal(f.indexes.get(f.session.session_id).review_decisions, undefined);
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "new\n");
    assert.deepEqual(f.queue.receipt(review.review_id)?.source, { kind: "person", actor_id: "person" });
    assert.equal(f.queue.receipt(review.review_id)?.delivery_error, undefined); assert.equal(f.queue.receipt(review.review_id)?.effect_uncertain, undefined);
  } finally { release.resolve(); await answering; await closing; await f.close(); }
});

test('packed SDK: checkpoint review is a manual operation, reject does not write; approval restores exact bytes once', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');
    const listed=await f.checkpoints.list(f.session);assert.equal(listed.length,1);assert.equal(listed[0].origin_run_id,'actual-model-run');
    const review=await f.checkpoints.prepareRewind(f.session,id);
    assert.equal(review.run,null);assert.equal(review.operation?.session_id,f.session.session_id);
    assert.deepEqual(review.document,{kind:'rewind',checkpoint_id:id,files:[{path:'a.ts',change:'restore',before_text:'new\n',after_text:'original\n'}]});
    assert.equal(f.checkpoints.busy!(f.session),true);
    await assert.rejects(f.checkpoints.prepareRewind(f.session,id),/已有回退/);
    await f.queue.respond({review_id:review.review_id, version: review.reference.version,decision:'reject',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'new\n');
    assert.equal((await f.checkpoints.list(f.session))[0].rewound_at,undefined,'a rejected rewind does not mark the checkpoint');
    const second=await f.checkpoints.prepareRewind(f.session,id);assert.notEqual(second.review_id,review.review_id);
    await f.queue.respond({review_id:second.review_id, version: second.reference.version,decision:'approve',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);
    assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'original\n');
    assert.equal((await f.checkpoints.list(f.session))[0].rewound_at,f.queue.receipt(second.review_id)?.decided_at,'a rewind that took effect marks its checkpoint');
    const context=await f.checkpoints.context(f.session.session_id);assert.match(context,/回退已实际写入/);assert.match(context,/重新读取当前文件/);assert.match(context,/a.ts/);assert.doesNotMatch(context,/actual-model-run.*completed/);
    await assert.rejects(f.queue.respond({review_id:second.review_id, version: second.reference.version,decision:'approve',actor_id:'user'}));
    await f.queue.refresh('board');assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);
    await writeFile(join(f.project,'a.ts'),'after review\n');await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);assert.equal(f.queue.receipt(review.review_id)?.status,'rejected');
    assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'after review\n','restoring history must not dispatch another rewind');
    assert.ok((await f.checkpoints.list(f.session))[0].rewound_at,'the mark survives a restart');
  } finally {await f.close();}
});

test('packed SDK: changed files invalidate approval, empty files differ from absent files, restart withdraws pending', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');const review=await f.checkpoints.prepareRewind(f.session,id);
    await writeFile(join(f.project,'a.ts'),'external\n');
    await f.queue.respond({review_id:review.review_id, version: review.reference.version,decision:'approve',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.ok(f.queue.receipt(review.review_id)?.effect_error);
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,false);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'external\n');
    const empty=await f.edit('new.txt','');const remove=await f.checkpoints.prepareRewind(f.session,empty);
    assert.deepEqual((remove.document as any).files,[{path:'new.txt',change:'delete',before_text:'',after_text:null}]);
    await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(remove.review_id)?.status,'cancelled');assert.equal(f.checkpoints.busy!(f.session),false);
    assert.equal(await readFile(join(f.project,'new.txt'),'utf8'),'');await assert.rejects(f.queue.respond({review_id:remove.review_id, version: remove.reference.version,decision:'approve',actor_id:'user'}));
    const again=await f.checkpoints.prepareRewind(f.session,empty);await f.queue.respond({review_id:again.review_id, version: again.reference.version,decision:'approve',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));await assert.rejects(readFile(join(f.project,'new.txt')),{code:'ENOENT'});
    const other=await f.runtime.sessions.create();f.indexes.set(other.ref.id,{...f.indexes.get(f.session.session_id),rewinds:[]});
    const foreign={...f.session,session_id:other.ref.id};assert.deepEqual(await f.checkpoints.list(foreign),[]);await assert.rejects(f.checkpoints.prepareRewind(foreign,id),/没有这个检查点/);
  } finally {await f.close();}
});

test('checkpoint preparation and decision persistence failures leave no writable orphan', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');f.faults.review=true;
    await assert.rejects(f.checkpoints.prepareRewind(f.session,id),/review content unavailable/);
    assert.equal(f.checkpoints.busy!(f.session),false);assert.equal((await f.runtime.listOpenWork()).items.length,0);
    assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'new\n');f.faults.review=false;
    const review=await f.checkpoints.prepareRewind(f.session,id);f.faults.decision=true;
    await assert.rejects(f.queue.respond({review_id:review.review_id, version: review.reference.version,decision:'approve',actor_id:'user'}),/decision storage unavailable/);
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.ok(f.queue.receipt(review.review_id)?.effect_error);
    assert.equal((await f.runtime.listOpenWork()).items.length,0);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'new\n');
  }finally{await f.close();}
});

test('unreadable dispatch outcome stays unknown and blocks repeat until authoritative recovery', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');const review=await f.checkpoints.prepareRewind(f.session,id);f.faults.dispatchUnknown=true;
    await f.queue.respond({review_id:review.review_id, version: review.reference.version,decision:'approve',actor_id:'user'});
    await waitUntil(()=>Boolean(f.queue.receipt(review.review_id)?.effect_uncertain));
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,false);assert.equal(f.checkpoints.busy!(f.session),true);
    await assert.rejects(f.checkpoints.prepareRewind(f.session,id),/已有回退/);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'original\n');
    f.faults.dispatchUnknown=false;await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,true);assert.equal(f.checkpoints.busy!(f.session),false);
  }finally{await f.close();}
});

test("BL-360: closing a real rewind while its entry waits rejects before SDK cancellation finishes", async () => {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const cancelling = Promise.withResolvers<void>(), finishCancel = Promise.withResolvers<void>();
  const f = await fixture(async () => { cancelling.resolve(); await finishCancel.promise; });
  let closing: Promise<void> | undefined;
  try {
    const checkpoint = await f.edit("a.ts", "changed\n"), review = await f.checkpoints.prepareRewind(f.session, checkpoint);
    const result = f.queue.respond({ review_id: review.review_id, version: review.reference.version, decision: "approve", actor_id: "person" }, {
      beforeEffect: async () => { entered.resolve(); await release.promise; },
    });
    const rejected = assert.rejects(result, /原执行者不在/);
    await entered.promise; closing = f.checkpoints.close(); await cancelling.promise;
    release.resolve(); await rejected;
    assert.equal(f.queue.receipt(review.review_id)?.status, "pending");
    assert.equal(f.queue.receipt(review.review_id)?.decided_by, null);
    assert.equal(f.indexes.get(f.session.session_id).review_decisions, undefined, "no late decision is persisted");
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "changed\n");
    finishCancel.resolve(); await closing;
    assert.equal(f.queue.receipt(review.review_id)?.status, "cancelled");
    assert.equal(await readFile(join(f.project, "a.ts"), "utf8"), "changed\n");
  } finally { release.resolve(); finishCancel.resolve(); await closing; await f.close(); }
});

test("F-TEST-08 F-cf-08: real ActionService validates agent.checkpoints.prepare-rewind output_schema including reference and install_id", async () => {
  const f = await fixture();
  try {
    const checkpointId = await f.edit("a.ts", "rewind-target\n");
    const service = new ActionService();
    service.registerProvider({
      provider: { provider_id: "system.agent-host", title: "Agent Host", kind: "system", project_id: "board" },
      definitions: [agentHostCapabilities.prepareRewind],
      handlers: [{
        ...agentHostCapabilities.prepareRewind,
        handle: async (_context, [session, id]) => f.checkpoints.prepareRewind(session, id),
      }],
    });
    const caller = {
      actor_id: "person",
      project_id: "board",
      audience: "plugin" as const,
      permissions: [] as string[],
    };
    const review = await service.invoke(caller, agentHostCapabilities.prepareRewind, [f.session, checkpointId, "editor"]) as {
      review_id: string;
      kind: string;
      project_id: string;
      plugin_id: string;
      install_id: string;
      reference: {
        owner: { kind: string; project_id: string; plugin_id: string; install_id: string };
        id: string;
        version: string;
      };
      document: { kind: string; checkpoint_id: string };
    };
    assert.equal(typeof review.review_id, "string");
    assert.ok(review.review_id.length > 0);
    assert.equal(review.kind, "rewind");
    assert.equal(review.project_id, "board");
    assert.equal(review.plugin_id, "coding");
    assert.equal(review.install_id, "checkpoint-install");
    assert.deepEqual(review.reference.owner, {
      kind: "agent-review",
      project_id: "board",
      plugin_id: "coding",
      install_id: "checkpoint-install",
    });
    assert.equal(review.reference.id, review.review_id);
    assert.equal(typeof review.reference.version, "string");
    assert.ok(review.reference.version.length > 0);
    assert.equal(review.document.kind, "rewind");
    assert.equal(review.document.checkpoint_id, checkpointId);
  } finally {
    await f.close();
  }
});
