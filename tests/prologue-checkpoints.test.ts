import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { createPrologueCheckpoints } from "../horizontal/agent-host/src/adapters/prologue-checkpoints.js";
const requireSdk = createRequire(new URL('../horizontal/agent-host/package.json', import.meta.url));
const { createRuntime } = await import(requireSdk.resolve('@prologue/sdk'));
const { createNodeHost } = await import(requireSdk.resolve('@prologue/sdk/node'));

async function waitUntil(check: () => boolean) {
  for (let tries = 0; tries < 100; tries++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  assert.fail('operation did not settle');
}
async function fixture() {
  const faults = { decision: false, review: false, dispatchUnknown: false };
  const root = await mkdtemp(join(tmpdir(), 'molis-checkpoints-')), project = join(root, 'project');
  await mkdir(project);await writeFile(join(project, 'a.ts'), 'original\n');
  let runtime: any, queue: AgentReviewQueue, checkpoints: ReturnType<typeof createPrologueCheckpoints>;
  const indexes = new Map<string, any>();
  const boot = async () => {
    runtime = await createRuntime({ app: { appId: 'molis.checkpoint.test', appVersion: '1.0.0' }, host: createNodeHost({ storageRoot: join(root, 'sdk') }),
      preset: 'local-agent', posture: { sandbox: 'workspace-write' }, rules: [{ source: 'user', effect: 'allow', kinds: ['mutate-local'] }] });
    queue = new AgentReviewQueue();
    checkpoints = createPrologueCheckpoints({ runtime: { ...runtime, effects: { ...runtime.effects,
      inspectDispatch: async (ref:any) => faults.dispatchUnknown ? { state:'unknown', fingerprint:'unknown', receiptId:undefined, ok:undefined } : runtime.effects.inspectDispatch(ref),
    } }, queue, readIndex: async id => structuredClone(indexes.get(id)),
      remember: async (id, intent) => { (indexes.get(id).rewinds ??= []).push(structuredClone(intent)); },
      decision: async (id, pending, receipt) => { if(faults.decision) throw new Error("decision storage unavailable"); (indexes.get(id).review_decisions ??= {})[pending] = { status: receipt.status, decided_at: receipt.decided_at, decided_by: receipt.decided_by, note: receipt.note }; },
      readResource: async ref => { if(faults.review) throw new Error("review content unavailable"); const handle = runtime.resources.inspect(ref);const chunk = await runtime.resources.readChunk(ref, 0, handle.byteLength);return JSON.parse(new TextDecoder().decode(chunk.bytes)); },
    });
  };
  await boot();
  const sdkSession = await runtime.sessions.create(), session = { runtime_id: 'prologue', session_id: sdkSession.ref.id };
  indexes.set(session.session_id, { owner: { board_id: 'board', plugin_id: 'coding' }, attempts: [{ frozen: { directory: { canonical_path: project, realpath_verified: true } } }] });
  return { project, session, indexes, faults, get runtime() {return runtime;}, get queue() {return queue;}, get checkpoints() {return checkpoints;},
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

test('packed SDK: checkpoint review is a manual operation, reject does not write; approval restores exact bytes once', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');
    const listed=await f.checkpoints.list(f.session);assert.equal(listed.length,1);assert.equal(listed[0].origin_run_id,'actual-model-run');
    const review=await f.checkpoints.prepareRewind(f.session,id);
    assert.equal(review.run,null);assert.equal(review.operation?.session_id,f.session.session_id);
    assert.deepEqual(review.document,{kind:'rewind',checkpoint_id:id,files:[{path:'a.ts',change:'restore',before_text:'new\n',after_text:'original\n'}]});
    assert.equal(f.checkpoints.busy!(f.session),true);
    await assert.rejects(f.checkpoints.prepareRewind(f.session,id),/已有回退/);
    await f.queue.respond({review_id:review.review_id,decision:'reject',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'new\n');
    const second=await f.checkpoints.prepareRewind(f.session,id);assert.notEqual(second.review_id,review.review_id);
    await f.queue.respond({review_id:second.review_id,decision:'approve',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);
    assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'original\n');
    const context=await f.checkpoints.context(f.session.session_id);assert.match(context,/回退已实际写入/);assert.match(context,/重新读取当前文件/);assert.match(context,/a.ts/);assert.doesNotMatch(context,/actual-model-run.*completed/);
    await assert.rejects(f.queue.respond({review_id:second.review_id,decision:'approve',actor_id:'user'}));
    await f.queue.refresh('board');assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);
    await writeFile(join(f.project,'a.ts'),'after review\n');await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(second.review_id)?.effect_settled,true);assert.equal(f.queue.receipt(review.review_id)?.status,'rejected');
    assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'after review\n','restoring history must not dispatch another rewind');
  } finally {await f.close();}
});

test('packed SDK: changed files invalidate approval, empty files differ from absent files, restart withdraws pending', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');const review=await f.checkpoints.prepareRewind(f.session,id);
    await writeFile(join(f.project,'a.ts'),'external\n');
    await f.queue.respond({review_id:review.review_id,decision:'approve',actor_id:'user'});
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.ok(f.queue.receipt(review.review_id)?.effect_error);
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,false);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'external\n');
    const empty=await f.edit('new.txt','');const remove=await f.checkpoints.prepareRewind(f.session,empty);
    assert.deepEqual((remove.document as any).files,[{path:'new.txt',change:'delete',before_text:'',after_text:null}]);
    await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(remove.review_id)?.status,'cancelled');assert.equal(f.checkpoints.busy!(f.session),false);
    assert.equal(await readFile(join(f.project,'new.txt'),'utf8'),'');await assert.rejects(f.queue.respond({review_id:remove.review_id,decision:'approve',actor_id:'user'}));
    const again=await f.checkpoints.prepareRewind(f.session,empty);await f.queue.respond({review_id:again.review_id,decision:'approve',actor_id:'user'});
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
    await assert.rejects(f.queue.respond({review_id:review.review_id,decision:'approve',actor_id:'user'}),/decision storage unavailable/);
    await waitUntil(()=>!f.checkpoints.busy!(f.session));assert.ok(f.queue.receipt(review.review_id)?.effect_error);
    assert.equal((await f.runtime.listOpenWork()).items.length,0);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'new\n');
  }finally{await f.close();}
});

test('unreadable dispatch outcome stays unknown and blocks repeat until authoritative recovery', async () => {
  const f=await fixture();try {
    const id=await f.edit('a.ts','new\n');const review=await f.checkpoints.prepareRewind(f.session,id);f.faults.dispatchUnknown=true;
    await f.queue.respond({review_id:review.review_id,decision:'approve',actor_id:'user'});
    await waitUntil(()=>Boolean(f.queue.receipt(review.review_id)?.effect_uncertain));
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,false);assert.equal(f.checkpoints.busy!(f.session),true);
    await assert.rejects(f.checkpoints.prepareRewind(f.session,id),/已有回退/);assert.equal(await readFile(join(f.project,'a.ts'),'utf8'),'original\n');
    f.faults.dispatchUnknown=false;await f.restart();await f.checkpoints.restore(f.session.session_id);
    assert.equal(f.queue.receipt(review.review_id)?.effect_settled,true);assert.equal(f.checkpoints.busy!(f.session),false);
  }finally{await f.close();}
});
