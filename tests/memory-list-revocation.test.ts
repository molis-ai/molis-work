import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, memoryActions, type MemoryRunReadResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantSendResult } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentMemoryCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { openTestHome } from "./fixtures/test-home.js";
import { connectorAssistantModel, untilSetup } from "./fixtures/connector-assistant-model.js";

// MEM-20/31: Hold the real second scope read after the first scope's body has been accumulated.
// The model reply, public preference change, SDK storage and Service result remain real.
for (const change of ["none", "revoke", "form-off", "class-read-off", "class-filtered-off", "class-form-off"] as const) {
  test(`list-memories retains current read authority across scopes: ${change}`, { timeout: 60_000 }, async t => {
    const gate = Promise.withResolvers<void>(), reached = Promise.withResolvers<void>();
    t.after(() => gate.resolve());
    const home = await openTestHome(t), project = await home.createProject("Memory read authority");
    const system = ensureSystemAgentService(home.host, home.home); await system.ready;
    const capability = system.agentHost.adapter("prologue").memory!;
    const person = bindActionClient(home.host.homeActionClient(), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null,
      audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
    const text = "个人交付默认使用简洁要点";
    const saved = await person.invoke(memoryActions.write, { scope: "personal", text, kind: "preference" });
    assert.equal(saved.outcome, "written");
    const owner = capability.withCaller({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui", person: true,
      current_scene: "common", purpose: "management" });
    const before = await owner.list("user", LOCAL_PERSON_ACTOR_ID);
    await home.web.post("/api/memory/prefs", { scope: "personal", prefs: { task_recall: false } });
    let listing = false, held = false;
    const personalRead = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<{ receipt?: MemoryRunReadResult; error?: string }>();
    const expand = MemoryService.prototype.expand;
    t.mock.method(MemoryService.prototype, "expand", async function (this: MemoryService, ...args: Parameters<MemoryService["expand"]>) {
      if (args[0].consumer !== "assistant" || !("list" in args[1])) return expand.apply(this, args);
      listing = true;
      if (change === "class-filtered-off") args[1] = { list: { ...args[1].list, kinds: ["experience"] } };
      try { const receipt = await expand.apply(this, args); completed.resolve({ receipt }); return receipt; }
      catch (error) { completed.resolve({ error: String(error) }); throw error; }
      finally { listing = false; }
    });
    const withCaller = capability.withCaller.bind(capability);
    const observe = (bound: AgentMemoryCapability): AgentMemoryCapability => {
      const read = bound.list.bind(bound), controlled = bound.withExecution!.bind(bound);
      bound.list = async (scope, ownerId) => {
        if (listing && !held && scope === "project" && ownerId === project.project_id) {
          held = true; await personalRead.promise; reached.resolve(); await gate.promise;
        }
        const entries = await read(scope, ownerId);
        if (listing && scope === "user" && ownerId === LOCAL_PERSON_ACTOR_ID) {
          assert.ok(entries.some(entry => entry.text === text), "the real personal scope finished reading the protected body");
          personalRead.resolve();
        }
        return entries;
      };
      bound.withExecution = control => observe(controlled(control));
      return bound;
    };
    t.mock.method(capability, "withCaller", (who: Parameters<typeof withCaller>[0]) => observe(withCaller(who)));
    const model = await connectorAssistantModel(t, home.home, (_body, turn) => turn === 1
      ? { name: "list-memories", input: {} } : "已查看当前允许读取的记忆。");
    const sent = await home.web.post<AssistantSendResult>(`/projects/${project.project_id}/api/assistant/send`, {
      text: "列出你目前记住的内容", request_id: randomUUID(),
    });
    await untilSetup(async () => held ? true : undefined, "list has accumulated personal and reached the real project read");
    await reached.promise;
    assert.doesNotMatch(JSON.stringify(model.requests[0]), new RegExp(text), "manual recall did not already send the body before this expansion");
    if (change !== "none") await home.web.post("/api/memory/prefs", {
      scope: "personal", prefs: change === "revoke" ? { consumers: { assistant: false } } : change === "form-off" ? { form: false }
        : { class_restrictions: [{ selector: { consumer: "assistant", current_scene: "assistant", kind: "preference" },
          read: change === "class-form-off" ? "inherit" : "off", form: change === "class-form-off" ? "off" : "inherit" }] },
    });
    gate.resolve();
    const result = await completed.promise;
    await untilSetup(async () => {
      const run = await system.agentHost.adapter("prologue").read({ session_id: sent.work.session_id!, run_id: sent.run_id! });
      return ["completed", "failed", "stopped", "cancelled"].includes(run.phase) ? run : undefined;
    }, "the actual list tool Run settles");
    assert.deepEqual(await owner.list("user", LOCAL_PERSON_ACTOR_ID), before, "reading or revocation never rewrites formal memory");
    t.diagnostic(JSON.stringify({ change, ...result }));
    assert.ok(model.requests.length >= 2, "the original tool result reaches a subsequent real model request");
    const later = JSON.stringify(model.requests.slice(1));
    if (["revoke", "class-read-off", "class-filtered-off"].includes(change)) {
      assert.match(result.error ?? "", /记忆读取权限已变化/, "revocation explicitly rejects the whole expansion, including targets before item filters");
      assert.equal(result.receipt, undefined, "refusal cannot masquerade as an empty successful receipt");
      assert.doesNotMatch(later, new RegExp(text), "the protected body cannot enter later model context after revocation");
    } else {
      assert.equal(result.error, undefined);
      assert.ok(result.receipt);
      assert.equal(result.receipt.outcome, "queued");
      assert.ok(result.receipt.queued.some(ref => ref.memory_id === saved.memory?.memory_id));
      assert.match(later, new RegExp(text), "forming and reading remain independent permissions");
    }
  });
}
