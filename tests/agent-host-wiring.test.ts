import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { callerPlugin, startPlugin } from "./fixtures/plugin-callers.js";
import {
  AgentHost,
  emptyCapabilityMatrix,
  registerAgentHostCapabilities,
} from "@molis-ai/molis-work-service-agent-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type {
  AgentManifest,
  AgentRuntimeAdapter,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/**
 * C4 的接线证明：组合根用 registerAction 把 Agent Host 的动作接进宿主，
 * 插件经动作真的够得到它。在此之前这条注册入口只有测试在调用。
 */

const AGENT: AgentManifest = {
  roles: [{ role_id: "reader", version: 1, execution: "read-only", prompts: ["read"], host_tools: [] }],
  prompts: [{ prompt_id: "read", version: 1 }],
};

test("Run review reads refresh original receipts and isolate project, session, run and producer without granting approval", async () => {
  const host = new AgentHost(), adapter = readOnlyAdapter("reviews"), session = { runtime_id: "reviews", session_id: "session-1" }, run = { session_id: "session-1", run_id: "r" };
  const original = adapter.readSession.bind(adapter);
  adapter.readSession = async () => ({ ...await original(session), runs: [run] }); host.register(adapter);
  const handlers = new Map<string, Function>(); let refreshes = 0, unavailable = false;
  host.reviews.registerRefresh(async () => { refreshes++; if (unavailable) throw new Error("original ledger unavailable"); });
  registerAgentHostCapabilities({ register: (definition, handler) => { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: (context: { project_id: string }) => context.project_id, authority: () => ({ manifest: AGENT, authorizedDirectories: [] }) });
  const read = handlers.get(agentHostCapabilities.readRunReviews.capability_id)!, context = { project_id: "project-a" };
  const base = { review_id: "owned", project_id: "project-a", plugin_id: "io.molis.work.coding", run,
    kind: "text-edit" as const, document: { kind: "text-edit" as const, target_path: "a.txt", exists: true, before_text: "before", after_text: "after" }, requested_at: "2026-09-22T00:00:00Z", expires_at: null };
  for (const request of [base, { ...base, review_id: "other-session", run: { ...run, session_id: "elsewhere" } },
    { ...base, review_id: "other-run", run: { ...run, run_id: "elsewhere" } }, { ...base, review_id: "other-plugin", plugin_id: "foreign" }, { ...base, review_id: "other-board", project_id: "foreign" }]) host.reviews.request(request);
  await assert.rejects(read({ project_id: "foreign" }, [session, run]));
  await assert.rejects(read(context, [session, { ...run, session_id: "foreign" }]));
  assert.equal(refreshes, 0);
  let rows = await read(context, [session, run]); assert.equal(rows.length, 1); assert.equal(rows[0].receipt.status, "pending");
  rows[0].request.document.after_text = "forged";
  host.reviews.decide({ review_id: "owned", actor_id: "user", decision: "approve" });
  rows = await read(context, [session, run]); assert.equal(rows[0].request.document.after_text, "after"); assert.equal(rows[0].receipt.effect_settled, false);
  host.reviews.consumeApproval("owned"); host.reviews.settle("owned", { ok: true });
  assert.equal((await read(context, [session, run]))[0].receipt.effect_settled, true);
  unavailable = true; await assert.rejects(read(context, [session, run]), /original ledger unavailable/);
});

function readOnlyAdapter(runtimeId: string): AgentRuntimeAdapter {
  const capabilities = emptyCapabilityMatrix();
  capabilities["session.create"] = "supported";
  return {
    descriptor: { runtime_id: runtimeId, display_name: runtimeId, provider_version: "1.0.0", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "session-1", runtime_id: runtimeId }; },
    async readSession(session) { return {session, owner:{project_id:"project-a",plugin_id:"io.molis.work.coding",install_id:"install-1",actor_id:"user"},title:"任务",runs:[],latest_run:null}; },
    async start() { throw new Error("未使用"); },
    async read() { throw new Error("未使用"); },
    observe() { return () => {}; },
    async control() {},
    async readCommandOutput() {
      throw Object.assign(new Error("命令未接审批"), { code: "agent.capability_unavailable" });
    },
  };
}

test("组合根把 Agent Host 接进宿主之后，插件经动作够得到它", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-wiring-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({
    databasePath: join(directory, "project.db"),
    projectId: "project-a",
  });
  const store = new LocalProjectDatabase(join(directory, "plugins.db"));
  try {
    const agentHost = new AgentHost();
    agentHost.register(readOnlyAdapter("fixture-read-only"));

    // 这一步就是原先缺的那一环：生产装配调用注册入口
    registerAgentHostCapabilities(
      { register: (definition, handler) => localHost.registerAction(definition, handler) },
      {
        agentHost: () => agentHost,
        authority: () => ({ manifest: AGENT, authorizedDirectories: [directory] }),
        projectId: (runtime) => runtime.project_id,
      },
    );

    // 插件以自己的身份调（R8 第 4 批）
    const plugin = callerPlugin("wiring", "project", {}, [agentHostCapabilities.listRuntimes, agentHostCapabilities.availableRoles, agentHostCapabilities.awaitContinuations]
      .map(definition => definition.capability_id));
    await startPlugin(localHost, reference, store, plugin);
    const client = localHost.client(reference), actions = plugin.actions(reference.project_id);
    const runtimes = await actions.invoke(agentHostCapabilities.listRuntimes, []);
    assert.deepEqual(runtimes.map((entry) => entry.runtime_id), ["fixture-read-only"]);

    const roles = await actions.invoke(agentHostCapabilities.availableRoles, ["fixture-read-only"]);
    assert.deepEqual(roles, [{ role_id: "reader", available: true }]);

    // W2-18-CODING-WAKE-02: a runtime without a task graph is unavailable, not an immediately successful long poll.
    await assert.rejects(
      () => actions.invoke(agentHostCapabilities.awaitContinuations, ["fixture-read-only", 25_000, []]),
      (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
    );

    // 命令回执只给插件（R8 第 3 批，RAC-199）：宿主自己的客户端调不到；运行时那一侧仍然如实不可用——接线不等于接通
    await assert.rejects(
      () => client.invoke(agentHostCapabilities.readCommandOutput,
        [{ session_id: "session-1", runtime_id: "fixture-read-only" }, { call_id: "c1", run_id: "r1" }]),
      (error: unknown) => (error as { code?: string }).code === "actions.forbidden",
    );
    await assert.rejects(
      () => agentHost.adapter("fixture-read-only").readCommandOutput({ session_id: "session-1", runtime_id: "fixture-read-only" }, { call_id: "c1", run_id: "r1" }),
      (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
    );

    // RAC-187: 列项目全部审批的入口已删（插件看自己一轮的审批走 readRunReviews），宿主里没有这一项
    await assert.rejects(() => client.invoke({ capability_id: "agent.reviews.list.v1", version: 1, operation: "query" } as ActionDefinition, ["project-a"]), { code: "actions.missing" });
  } finally {
    store.close();
    await localHost.closeProject(reference);
    await localHost.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('checkpoint capability enforces current project, authorized roots and declared writable roles', async () => {
  const agentHost=new AgentHost(),adapter=readOnlyAdapter('checkpoints');let prepared=0;
  const cp={checkpoint_id:'cp',session_id:'session-1',created_at:'2026-09-20T00:00:00Z',label:'a',directory:{canonical_path:'/allowed',realpath_verified:true}};
  Object.assign(adapter,{checkpoints:{list:async()=>[cp,{...cp,checkpoint_id:'foreign-root',directory:{...cp.directory,canonical_path:'/other'}}],prepareRewind:async()=>{prepared++;return {review_id:'pending'};}}});
  agentHost.register(adapter);
  const handlers=new Map<string,Function>();let allowed=['/allowed'];
  registerAgentHostCapabilities({register:(definition,handler)=>{handlers.set(definition.capability_id,handler);return ()=>{};}},{agentHost:()=>agentHost,projectId:(ctx:{project_id:string})=>ctx.project_id,authority:()=>({manifest:{...AGENT,roles:[...AGENT.roles,{role_id:'writer',version:1,execution:'text-edit',prompts:[],host_tools:[]}]},authorizedDirectories:allowed})});
  const session={runtime_id:'checkpoints',session_id:'session-1'},context={project_id:'project-a'};
  // Called as the session's own plugin, as every Agent Host action is (R8): authority is the caller's, never a plugin the session names.
  const asOwner={consumer:'plugin',plugin:{project_id:'project-a',plugin_id:'io.molis.work.coding',install_id:'install-1',actor_id:'user',assertActive(){},declaration:{}},beforeEffect:async()=>{},assertAuthorityCurrent:()=>{}};
  const listed=handlers.get(agentHostCapabilities.listCheckpoints.capability_id)!,prepared_=handlers.get(agentHostCapabilities.prepareRewind.capability_id)!;
  const list=(ctx:object,input:unknown[])=>listed(ctx,input,asOwner),prepare=(ctx:object,input:unknown[])=>prepared_(ctx,input,asOwner);
  assert.deepEqual(await list(context,[session]),[cp]);
  await assert.rejects(list({project_id:'foreign'},[session]));
  await assert.rejects(prepare(context,[session,'cp','reader']),/当前方式不能回退/);
  await assert.rejects(prepare(context,[session,'foreign-root','writer']),/授权工作区/);assert.equal(prepared,0);
  await prepare(context,[session,'cp','writer']);assert.equal(prepared,1);
  allowed=[];await assert.rejects(prepare(context,[session,'cp','writer']),/授权工作区/);assert.deepEqual(await list(context,[session]),[]);assert.equal(prepared,1);
});

test("recovery capabilities bind project and exact session/run before allowing closure", async () => {
  const agentHost = new AgentHost(), adapter = readOnlyAdapter("recovery");
  let closes = 0;
  const session = { runtime_id: "recovery", session_id: "session-1" }, run = { session_id: "session-1", run_id: "owned" };
  const readSession = adapter.readSession.bind(adapter);
  Object.assign(adapter, { readSession: async () => ({ ...await readSession(session), runs: [run] }),
    recovery: { inspect: async () => ({ session_id: session.session_id, blockers: [],
      runs: [{ run_id: "child-run", version: 1, live: false, waiting: 0, can_close: true, blockers: [], operations: [], subagent: { subagent_id: "sub-1" } }] }),
    close: async () => { closes++; return { session_id: session.session_id, runs: [], blockers: [] }; } } });
  agentHost.register(adapter);
  const handlers = new Map<string, Function>();
  registerAgentHostCapabilities({ register: (definition, handler) => { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => agentHost, projectId: (ctx: { project_id: string }) => ctx.project_id, authority: () => ({ manifest: AGENT, authorizedDirectories: [] }) });
  const inspect = handlers.get(agentHostCapabilities.inspectRecovery.capability_id)!, close = handlers.get(agentHostCapabilities.recoverRun.capability_id)!;
  await assert.rejects(inspect({ project_id: "other" }, [session]));
  await assert.rejects(close({ project_id: "other" }, [session, run, 1]));
  await assert.rejects(close({ project_id: "project-a" }, [session, { ...run, session_id: "other" }, 1]));
  await assert.rejects(close({ project_id: "project-a" }, [session, { ...run, run_id: "foreign" }, 1]));
  assert.equal(closes, 0);
  await close({ project_id: "project-a" }, [session, run, 1]); assert.equal(closes, 1);
  // A subtask's interrupted round is closed through its parent only while the parent's recovery lists it as the subtask's.
  await close({ project_id: "project-a" }, [session, { session_id: "session-1", run_id: "child-run" }, 1]); assert.equal(closes, 2);
  await assert.rejects(close({ project_id: "project-a" }, [session, { session_id: "other", run_id: "child-run" }, 1]));
  await assert.rejects(close({ project_id: "other" }, [session, { session_id: "session-1", run_id: "child-run" }, 1]));
  assert.equal(closes, 2);
});
