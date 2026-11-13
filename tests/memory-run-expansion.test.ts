import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { grantMcpAction } from "@molis-ai/molis-work-test-kit/local-host-http";
import { codingProductHost, type CodingProviderRequest } from "./fixtures/coding-product-host.js";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";
import { endingReviewAnswer } from "./fixtures/ending-review.js";

type Request = CodingProviderRequest & { tools?: Array<{ name: string; description?: string }> };
const body = { A: "BODY_NEVER_IN_TOOL_A", B: "BODY_NEVER_IN_TOOL_B" };
const results = (request: Request) => request.messages.flatMap(message => Array.isArray(message.content)
  ? message.content.filter(block => block.type === "tool_result") : []);

// The actual Coding HTTP entry, ActionService output checking and SDK model loop run unchanged.
// Only provider answers are scripted; both real Runs remain live at the same barrier.
test("two live Coding Runs expand explicit reads into their own Context, with body-free receipts and isolated scopes", { timeout: 60_000 }, async t => {
  const reached = { A: Promise.withResolvers<void>(), B: Promise.withResolvers<void>() }, release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const seen: Record<"A" | "B", Request[]> = { A: [], B: [] };
  const budgets: number[] = [], forRun = MemoryService.prototype.forRun;
  t.mock.method(MemoryService.prototype, "forRun", async function(this: MemoryService, ...args: Parameters<typeof forRun>) {
    const recipe = await forRun.apply(this, args); if (recipe) budgets.push(recipe.budget_tokens); return recipe;
  });
  const f = await codingProductHost(t, async given => {
    const request = given as Request, review = endingReviewAnswer(request, () => []);
    if (review !== undefined) return cogniaScriptedResponse(undefined, review);
    const key = JSON.stringify(request.messages).includes("C1_RUN_A") ? "A" : "B", turns = seen[key]; turns.push(request);
    if (turns.length <= 2) {
      const tool = request.tools?.find(item => item.name.startsWith("molis-action-") && item.description?.includes(memoryActions.list.action.title));
      assert.ok(tool, "the actual granted Memory Action is offered to this Run");
      if (turns.length === 1) { reached[key].resolve(); await release.promise; }
      return cogniaScriptedResponse({ name: tool.name, input: { scope: "project", query: `C1_SOURCE_${key}` } });
    }
    return cogniaScriptedResponse(undefined, "核对完成。");
  }, { loopbackProvider: true });
  const projects = { A: f.project, B: f.other }, workspaces = { A: f.workspaceId, B: "" };
  const managerFor = (key: "A" | "B") => {
    const row = projects[key], reference = molisWorkHostProjectReference({ databasePath: row.database_path, projectId: row.project_id });
    return bindActionClient(f.host.actionClient(reference), () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: row.project_id,
      audience: "user" as const, permissions: [...MEMORY_PERMISSIONS] }));
  };
  const action = { capability_id: memoryActions.list.capability_id, version: memoryActions.list.version, provider_id: MEMORY_PROVIDER_ID };
  await grantMcpAction(f.web, { clientId: "agent:prologue", projectId: null, action });
  // Project B uses the same folder as its output, set the way the settings page sets it (as the fixture does for project A).
  type Directories = { directories: Array<{ workspace_id: string; roles: string[] }>; revision: string };
  const read = await f.call<Directories>(f.other.project_id, "/api/project-settings/directories");
  const set = await f.call<Directories>(f.other.project_id, "/api/project-settings/directories",
    { change: "set_output", input: { workspace_path: f.directory, expected_revision: read.body.revision } });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  workspaces.B = set.body.directories.find(item => item.roles.includes("output"))!.workspace_id;
  const saved = {} as Record<"A" | "B", string>;
  for (const key of ["A", "B"] as const) {
    const value = await managerFor(key).invoke(memoryActions.write, { scope: "project", kind: "convention", text: `C1_SOURCE_${key}：${body[key]}` });
    assert.ok(value.memory); saved[key] = value.memory.memory_id;
  }
  await managerFor("A").invoke(memoryActions.write, { scope: "personal", kind: "convention", text: "TASK_BASE_SHARED_ALLOWANCE：每次发布先完成检查" });
  const start = async (key: "A" | "B") => {
    const created = await f.call<{ session: { session_id: string } }>(projects[key].project_id, "/api/plugins/io.molis.work.coding/sessions", { title: `C1_RUN_${key}` });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const started = await f.call<{ run: AgentRunView }>(projects[key].project_id, `/api/plugins/io.molis.work.coding/sessions/${created.body.session.session_id}/runs`, {
      intent: "discuss", task: `C1_RUN_${key} 请两次调用所选能力核对项目记忆。`, workspace_id: workspaces[key],
      action_tools: [action], provider_id: "fixture", model_id: "fixture-model",
    });
    assert.equal(started.status, 200, JSON.stringify(started.body)); return started.body.run;
  };
  const startingA = start("A"); await reached.A.promise;
  const startingB = start("B"); await reached.B.promise;
  for (const key of ["A", "B"] as const) await managerFor(key).invoke(memoryActions.write, {
    scope: "project", kind: "convention", text: `C1_SOURCE_${key}：${body[key]}_FRESH`,
  });
  release.resolve();
  const [a, b] = await Promise.all([startingA, startingB]);
  assert.notEqual(a.ref.run_id, b.ref.run_id);
  const views = await Promise.all([f.ended(a.ref), f.ended(b.ref)]);
  for (const [index, key] of (["A", "B"] as const).entries()) {
    assert.equal(views[index]!.phase, "completed", views[index]!.stop_reason ?? undefined);
    assert.equal(seen[key].length, 3, "the original SDK loop executed both actual tool calls");
    for (const request of seen[key].slice(1)) {
      const toolResults = results(request); assert.ok(toolResults.length);
      assert.ok(!JSON.stringify(toolResults).includes(body.A) && !JSON.stringify(toolResults).includes(body.B), "tool results contain no memory bodies");
      assert.ok(JSON.stringify(request.messages).includes(body[key] + "_FRESH"), "the SDK delivers the authorized memory in the next real request's Context");
      assert.ok(!JSON.stringify(request.messages).includes(body[key === "A" ? "B" : "A"]), "one Run cannot borrow the other Run's selection");
    }
    assert.equal(JSON.stringify(results(seen[key][1]!)).includes(saved[key]), false, "tool receipts carry no canonical identity");
    assert.ok(JSON.stringify(seen[key][1]!.messages).includes(saved[key]), "canonical Context carries the authorized identity with its body");
  }
  assert.ok(budgets.length >= 2);
  for (const key of ["A", "B"] as const) assert.equal((await managerFor(key).invoke(memoryActions.list, { scope: "project" })).items.length, 2, "the person's original Action DTO is unchanged");
});
