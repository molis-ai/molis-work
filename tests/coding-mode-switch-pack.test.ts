import assert from "node:assert/strict";
import test from "node:test";
import { workExecutorRoleOf, type ActionCallContext, type ActionDefinition, type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

// horizontal/agent-host README「开发要求」: a round's action pack is registered once per id in the SDK's process-wide catalog,
// so its id covers everything the pack declares. Coding's 执行 (builder) role may suggest, 修改 (writer) may not: with the same
// action tools, the two packs used to share an id, and the second round was refused (SCENARIO_PACK_INVALID).

const roles = Object.fromEntries(codingManifest.actions!.flatMap(row => {
  const role = workExecutorRoleOf(row.action);
  return role ? [[role, row]] : [];
})) as Record<WorkExecutorRole, ActionDefinition>;
type Session = { session_id: string; mode: string | null; runs: AgentRunView[] };

test("a session that ran 执行 runs 修改 next in the same Home: the two rounds' action packs do not collide", { timeout: 90_000 }, async t => {
  const f = await codingProductHost(t, async () => cogniaModelResponse("好的。"));
  const project = f.project.project_id;
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: project }));
  const invoke = <Output>(role: WorkExecutorRole, input: unknown) => client.invoke(owner, roles[role], input) as Promise<Output>;
  const round = async (session_id: string, task: string) => {
    const { run_id } = await invoke<{ run_id: string }>("run.start", { session_id, task });
    let read = await invoke<Session>("session.read", { session_id });
    const current = () => read.runs.find(run => run.ref.run_id === run_id);
    const settled = ["completed", "failed", "cancelled", "stopped", "reconcile-required", "awaiting-review", "awaiting-input"];
    for (const end = Date.now() + 20_000; !settled.includes(current()?.phase ?? ""); read = await invoke<Session>("session.read", { session_id })) {
      assert.ok(Date.now() < end, `the round ends: ${current()?.phase}`); await new Promise(resolve => setTimeout(resolve, 50));
    }
    return current()!;
  };

  const { session_id } = await invoke<{ session_id: string }>("session.open", { title: "先执行再修改" });
  const executed = await round(session_id, "把登录改到新接口");
  assert.equal(executed.phase, "completed", JSON.stringify({ phase: executed.phase, stop_reason: executed.stop_reason }));
  assert.equal((await invoke<Session>("session.read", { session_id })).mode, "execute");

  await invoke("session.update", { session_id, mode: "edit" });
  const edited = await round(session_id, "再改一下登录的提示");
  assert.equal(edited.phase, "completed", JSON.stringify({ phase: edited.phase, stop_reason: edited.stop_reason }));

  // The case itself: both rounds froze the same action tools as their own pack (not the gateway), and only 执行 may suggest.
  assert.ok(executed.frozen.action_tools?.length, "the 执行 round froze action tools");
  assert.deepEqual(edited.frozen.action_tools, executed.frozen.action_tools);
  assert.equal(executed.frozen.action_gateway ?? false, false);
  assert.equal(edited.frozen.action_gateway ?? false, false);
  assert.ok(executed.frozen.host_tools.includes("suggest-action"), "执行 may suggest");
  assert.ok(!edited.frozen.host_tools.includes("suggest-action"), "修改 may not");
});
