import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { memoryForAgentRun, memoryHostFor } from "../apps/local-host/src/memory/memory-host.js";

const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };

test("an Agent run is given exactly the memories the Host recalled for it, frozen into its role; none when there are none", async () => {
  const host = new AgentHost();
  const captured: unknown[] = [];
  const capabilities = Object.fromEntries(["session.create", "session.read", "run.start", "run.observe", "run.control"].map(key => [key, "supported"]));
  host.register({
    descriptor: { runtime_id: "probe", display_name: "probe", provider_version: "1.0.0", capabilities: { ...emptyCapabilityMatrix(), ...capabilities } },
    async health() { return { ok: true, status: "ready", message: "就绪" }; },
    async createSession() { return { session_id: "session-1", runtime_id: "probe" }; },
    async readSession(session: unknown) {
      return { session, owner: { board_id: "board-1", plugin_id: "io.molis.work.coding", install_id: "install-1", actor_id: "tester" }, title: "probe", runs: [], latest_run: null };
    },
    async start(request: any) {
      captured.push(request.role.memory ?? null);
      return { ref: { runtime_id: "probe", session_id: "session-1", run_id: `run-${captured.length}` },
        frozen: { role_id: request.role.role_id, role_version: request.role.version, execution: request.role.execution, model_id: "m",
          prompts: request.role.prompts.map((prompt: any) => ({ prompt_id: prompt.prompt_id, version: prompt.version, layer: prompt.layer ?? "role" })),
          skills: [], mcp_tools: [], host_tools: [...request.role.host_tools], text_materials: [], budget: null, directory: { canonical_path: "/tmp/ws", realpath_verified: true } } };
    },
  } as never);
  const pinned = { pinned: [{ scope: "user" as const, owner: "web-user", memory_id: "m-1" }], budget_chars: 3000, receipt_id: "recall-1" };
  const asked: string[] = [];
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: ["/tmp/ws"],
    memory: async (task: string) => { asked.push(task); return task.includes("没有") ? null : pinned; } };
  const start = (task: string) => host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, board_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task, role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, authority as never);
  await start("看看这个仓库");
  await start("这次没有相关记忆");
  assert.deepEqual(asked, ["看看这个仓库", "这次没有相关记忆"], "the Host is asked with the run's own task");
  assert.deepEqual(captured, [pinned, null]);
  // A failing recall never stops the run: it runs without memory.
  const failing = { ...authority, memory: async () => { throw new Error("记忆服务暂时不可用"); } };
  await host.start("probe", { session: { session_id: "session-1", runtime_id: "probe" }, board_id: "board-1", plugin_id: "io.molis.work.coding",
    install_id: "install-1", actor_id: "tester", task: "再看看", role_id: "reader", directory: { canonical_path: "/tmp/ws", realpath_verified: true } } as never, failing as never);
  assert.equal(captured.at(-1), null);
});

test("the Assistant and Agent work recall the same memory under their own switches; the Agent switch off gives Agent runs nothing", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-agent-runs-"));
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await local.close(); await rm(home, { recursive: true, force: true }); });
  const asPerson = bindActionClient(local.homeActionClient(), () => person);
  const kept = await asPerson.invoke(memoryActions.write, { scope: "personal", text: "代码评审意见先写结论，再列问题", kind: "preference" });
  const service = memoryHostFor(local)!.service;
  const forAgent = await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" });
  assert.deepEqual(forAgent?.pinned, [{ scope: "user", owner: "web-user", memory_id: kept.memory!.memory_id }]);
  const forAssistant = await service.forRun({ actor_id: "web-user", project_id: null, consumer: "assistant", work: { work_id: "w-1", title: "评审" } }, { query: "帮我评审这次改动" });
  assert.deepEqual(forAssistant?.pinned.map(pin => pin.memory_id), [kept.memory!.memory_id], "the same memory, the same store");
  assert.equal((await asPerson.invoke(memoryActions.list, {})).items[0]!.last_used?.title, "工作「评审」");

  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { agent: false } } });
  assert.equal(await memoryForAgentRun(local, { project_id: null, task: "帮我评审这次改动", used_for: "Coding · 评审" }), null, "Agent work switched off: nothing");
  assert.ok(await service.forRun({ actor_id: "web-user", project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" }), "the Assistant still has it");
  await asPerson.invoke(memoryActions.change, { memory_id: kept.memory!.memory_id, action: "disable" });
  assert.equal(await service.forRun({ actor_id: "web-user", project_id: null, consumer: "assistant" }, { query: "帮我评审这次改动" }), null, "switched off for everyone");
});
