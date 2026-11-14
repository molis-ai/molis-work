import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemoryCaller, AgentMemoryExecutionControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

// MEM-CLASS-02 / MEM-34: the real SDK's canonical check must be the final asynchronous boundary before Host commit.
for (const entrance of ["explicit", "outer"] as const) for (const revoke of ["classification", "authority", "cancel"] as const)
  test(`Memory ${entrance} control rejects ${revoke} changed in beforeEffect without a target write`, async t => {
    const f = await memoryServiceHome(t, { projects: [] }), service = await f.open();
    const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "ui" as const, person: true };
    const caller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "agent", current_scene: "common", purpose: "management" };
    let current = true, checks = 0;
    const cancelled = new AbortController();
    const control: AgentMemoryExecutionControl = {
      beforeEffect: async () => {
        checks++;
        if (revoke === "classification") service.savePrefs(person, "personal", { class_restrictions: [{
          selector: { consumer: "agent", current_scene: "common" }, read: "inherit", form: "off",
        }] });
        if (revoke === "authority") current = false;
        if (revoke === "cancel") cancelled.abort(new Error("cancelled original invocation"));
      },
      assert_current: () => { cancelled.signal.throwIfAborted(); assert.ok(current, "original authority revoked"); },
    };
    const memory = f.memory().withCaller(caller), input = { scope: "user" as const, owner: LOCAL_PERSON_ACTOR_ID,
      text: "发布前总是核验测试结果", origin: "本人已确认的工作约定", operation_id: `original-${entrance}-${revoke}`,
      signal: cancelled.signal, meta: { kind: "convention", source: "said", approved_by: { by: "person" as const },
        classification: { scenes: ["common"], lifecycle: "long-term" } } };
    let rejected: unknown;
    await assert.rejects(entrance === "explicit" ? memory.withExecution(control).write(input)
      : f.adapter().withEffect(control, () => memory.write(input)), error => { rejected = error; return true; });
    assert.ok(checks > 0, `the original asynchronous authority was actually exercised: ${String(rejected)}`);
    assert.deepEqual(await f.raw(person).list("personal", LOCAL_PERSON_ACTOR_ID), []);
    await f.close(); await f.open();
    assert.deepEqual(await f.raw(person).list("personal", LOCAL_PERSON_ACTOR_ID), [], "restart must not reveal a late committed target");
  });

// MEM-CLASS-02: a nested ordinary start without a new control keeps the original asynchronous guard.
test("an ordinary Session start inside Memory beforeEffect cannot inherit Memory's synchronous-write marker", async t => {
  const f = await memoryServiceHome(t, { projects: [] }); await f.open();
  const caller: AgentMemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, consumer: "agent", current_scene: "common", purpose: "management" };
  let checks = 0, current = true;
  const control: AgentMemoryExecutionControl = {
    beforeEffect: async () => {
      checks++;
      if (checks === 1) await f.adapter().createSession({ project_id: "scratch", plugin_id: "io.molis.work.test", install_id: "fixture",
        actor_id: LOCAL_PERSON_ACTOR_ID, workspace: "none", title: "Nested ordinary start" });
      else current = false;
    },
    assert_current: () => assert.ok(current, "nested ordinary start must recheck the original authority"),
  };
  await assert.rejects(f.memory().withCaller(caller).withExecution(control).write({ scope: "user", owner: LOCAL_PERSON_ACTOR_ID,
    text: "发布前核对结果", origin: "原确认", operation_id: "nested-ordinary-start", meta: { kind: "convention", source: "said",
      approved_by: { by: "person" }, classification: { scenes: ["common"], lifecycle: "long-term" } } }));
  assert.ok(checks >= 2, "the nested no-control start must execute the inherited asynchronous check");
  assert.deepEqual(await f.raw().list("personal", LOCAL_PERSON_ACTOR_ID), []);
});
