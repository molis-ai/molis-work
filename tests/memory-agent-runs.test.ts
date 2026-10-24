import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { memoryForAgentRun, memoryHostFor } from "../apps/local-host/dist/memory/memory-host.js";

const person: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };

test("an Agent run receives the Host memory recipe frozen into its role; no recipe when the Host declines", async () => {
  const host = new AgentHost();
  const captured: unknown[] = [];
  const capabilities = Object.fromEntries(["session.create", "session.read", "run.start", "run.observe", "run.control"].map(key => [key, "supported"]));
  host.register({
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities: { ...emptyCapabilityMatrix(), ...capabilities } },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "session-1", runtime_id: "probe" }; },
    async readSession(session: unknown) {
      return { session, owner: { project_id: "board-1", plugin_id: "io.molis.work.coding", install_id: "install-1", actor_id: "tester" }, title: "probe", runs: [], latest_run: null };
    },
    async start(request: any) {
      captured.push(request.role.memory ?? null);
      return { ref: { runtime_id: "probe", session_id: "session-1", run_id: `run-${captured.length}` },
        frozen: { role_id: request.role.role_id, role_version: request.role.version, execution: request.role.execution, model_id: "m",
          prompts: request.role.prompts.map((prompt: any) => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })),
          skills: [], mcp_tools: [], host_tools: [...request.role.host_tools], text_materials: [], budget: null, directory: { canonical_path: "/tmp/ws", realpath_verified: true } } };
    },
  } as never);
  const pinned = { pinned: [], consumer: "agent", current_scene: "coding", scopes: [{ scope: "user" as const, owner: LOCAL_PERSON_ACTOR_ID }],
    task: true, skip: false, budget_tokens: 800, budget_chars: 3000, receipt_id: "recall-1", omitted: [] };
  const asked: string[] = [];
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: ["/tmp/ws"],
    memory: async (task: string) => { asked.push(task); return task.includes("没有") ? null : pinned; } };
  const start = (task: string) => host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, project_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task, role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, authority as never);
  await start("看看这个仓库");
  await start("这次没有相关记忆");
  assert.deepEqual(asked, ["看看这个仓库", "这次没有相关记忆"], "the Host is asked with the run's own task");
  assert.deepEqual(captured, [pinned, null]);
  // A failing recall never stops the run: it runs without memory.
  const failing = { ...authority, memory: async () => { throw new Error("记忆服务暂时不可用"); } };
  await host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, project_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task: "再看看", role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, failing as never);
  assert.equal(captured.at(-1), null);
});

test("Assistant and Agent recipes retain their own switches without claiming use before a real recall", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-agent-runs-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await local.close(); await rm(home, { recursive: true, force: true }); });
  const asPerson = bindActionClient(local.homeActionClient(), () => person);
  const kept = await asPerson.invoke(memoryActions.write, { scope: "personal", text: "代码评审意见先写结论，再列问题", kind: "preference" });
  const service = memoryHostFor(local)!.service;
  const forAgent = await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" });
  assert.deepEqual(forAgent?.pinned, []); assert.equal(forAgent?.task, true); assert.equal(forAgent?.skip, false);
  assert.deepEqual(forAgent?.scopes, [{ scope: "user", owner: LOCAL_PERSON_ACTOR_ID }]);
  assert.equal((await asPerson.invoke(memoryActions.list, {})).items[0]!.last_used, null, "preparing a recipe is not memory use");
  const agentCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "agent" as const };
  assert.deepEqual((await service.recall(agentCaller, { query: "帮我评审这次改动" })).items.map(item => item.memory_id), [kept.memory!.memory_id]);
  const forAssistant = await service.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant", work: { work_id: "w-1", title: "评审" } }, { query: "帮我评审这次改动" });
  assert.deepEqual(forAssistant?.pinned, []); assert.equal(forAssistant?.task, true);
  assert.deepEqual(forAssistant?.scopes, forAgent?.scopes, "both recipes use the same user store");
  assert.deepEqual((await service.recall({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant", work: { work_id: "w-1", title: "评审" } },
    { query: "帮我评审这次改动" })).items.map(item => item.memory_id), [kept.memory!.memory_id]);
  assert.equal((await asPerson.invoke(memoryActions.list, {})).items[0]!.last_used, null, "MEM-30 an explicit recall is returned data, not a confirmed model dispatch");
  assert.deepEqual(service.uses({ work_id: "w-1" }).map(use => ({ memory_id: use.memory_id, title: use.title, source: use.source, state: use.state })),
    [{ memory_id: kept.memory!.memory_id, title: "工作「评审」", source: "recall", state: "returned" }]);

  const prefs = service.prefs({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true }, "personal").prefs;
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { ...prefs.consumers, agent: false } } });
  assert.equal((await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" }))?.skip, true, "Agent work switched off: no automatic read");
  assert.equal((await service.recall(agentCaller, { query: "帮我评审这次改动" })).state, "off");
  assert.ok(await service.forRun({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" }), "the Assistant still has it");
  const current = (await asPerson.invoke(memoryActions.list, {})).items.find(item => item.memory_id === kept.memory!.memory_id)!;
  await asPerson.invoke(memoryActions.change, { memory_id: current.memory_id, expected_version: current.version, action: "disable" });
  assert.deepEqual((await service.recall({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" })).items, [], "a disabled entry is unavailable to every consumer");
});
