import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
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
 * C4 的接线证明：组合根用 registerCapability 把 Agent Host 接进宿主，
 * 插件经 Capability 真的够得到它。在此之前这条注册入口只有测试在调用。
 */

const AGENT: AgentManifest = {
  roles: [{ role_id: "reader", version: 1, execution: "read-only", prompts: ["read"], host_tools: [] }],
  prompts: [{ prompt_id: "read", version: 1 }],
};

function readOnlyAdapter(runtimeId: string): AgentRuntimeAdapter {
  const capabilities = emptyCapabilityMatrix();
  capabilities["session.create"] = "supported";
  return {
    descriptor: { runtime_id: runtimeId, display_name: runtimeId, provider_version: "1.0.0", capabilities },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "session-1", runtime_id: runtimeId }; },
    async readSession(session) { return {session, owner:{board_id:"board-a",plugin_id:"io.molis.work.coding",install_id:"install-1"},title:"任务",runs:[],latest_run:null}; },
    async start() { throw new Error("未使用"); },
    async read() { throw new Error("未使用"); },
    observe() { return () => {}; },
    async control() {},
    async readCommandOutput() {
      throw Object.assign(new Error("命令未接审批"), { code: "agent.capability_unavailable" });
    },
  };
}

test("组合根把 Agent Host 接进宿主之后，插件经 Capability 够得到它", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-wiring-"));
  const localHost = new MolisWorkLocalHost();
  const reference = molisWorkHostProjectReference({
    databasePath: join(directory, "project.db"),
    boardId: "board-a",
    projectId: "project-a",
  });
  try {
    const agentHost = new AgentHost();
    agentHost.register(readOnlyAdapter("cli-readonly"));

    // 这一步就是原先缺的那一环：生产装配调用注册入口
    registerAgentHostCapabilities(
      { register: (definition, handler) => localHost.registerCapability(definition, handler) },
      {
        agentHost: () => agentHost,
        authority: () => ({ manifest: AGENT, authorizedDirectories: [directory] }),
        boardId: (runtime) => runtime.board_id,
      },
    );

    const client = localHost.client(reference);
    const runtimes = await client.invoke(agentHostCapabilities.listRuntimes, []);
    assert.deepEqual(runtimes.map((entry) => entry.runtime_id), ["cli-readonly"]);

    const roles = await client.invoke(agentHostCapabilities.availableRoles,
      ["cli-readonly", "io.molis.work.coding"]);
    assert.deepEqual(roles, [{ role_id: "reader", available: true }]);

    // 命令回执仍然如实不可用——接线不等于接通
    await assert.rejects(
      () => client.invoke(agentHostCapabilities.readCommandOutput,
        [{ session_id: "session-1", runtime_id: "cli-readonly" }, { call_id: "c1" }]),
      (error: unknown) => (error as { code?: string }).code === "agent.capability_unavailable",
    );

    // 审查队列按 runtime 所在的 board 作用域，插件问别的 board 也只拿到自己的
    assert.deepEqual(await client.invoke(agentHostCapabilities.listReviews, ["board-somewhere-else"]), []);
  } finally {
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
  registerAgentHostCapabilities({register:(definition,handler)=>{handlers.set(definition.capability_id,handler);return ()=>{};}},{agentHost:()=>agentHost,boardId:(ctx:{board_id:string})=>ctx.board_id,authority:()=>({manifest:{...AGENT,roles:[...AGENT.roles,{role_id:'writer',version:1,execution:'text-edit',prompts:[],host_tools:[]}]},authorizedDirectories:allowed})});
  const session={runtime_id:'checkpoints',session_id:'session-1'},context={board_id:'board-a'};
  const list=handlers.get(agentHostCapabilities.listCheckpoints.capability_id)!,prepare=handlers.get(agentHostCapabilities.prepareRewind.capability_id)!;
  assert.deepEqual(await list(context,[session]),[cp]);
  await assert.rejects(list({board_id:'foreign'},[session]));
  await assert.rejects(prepare(context,[session,'cp','reader']),/当前方式不能回退/);
  await assert.rejects(prepare(context,[session,'foreign-root','writer']),/授权工作区/);assert.equal(prepared,0);
  await prepare(context,[session,'cp','writer']);assert.equal(prepared,1);
  allowed=[];await assert.rejects(prepare(context,[session,'cp','writer']),/授权工作区/);assert.deepEqual(await list(context,[session]),[]);assert.equal(prepared,1);
});
