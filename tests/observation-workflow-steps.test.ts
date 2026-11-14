import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { WORKFLOWS_PLUGIN_ID, workflowsManifest, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { readRecords } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

// OCL-01, OCL-03, OCL-08 (specs/observation-collection/spec.md; design §4「工作流」; eval-cases EC-06): each handoff of a run is a work record
// Workflows reports as itself, in the call that made it, named by the run; a failed attempt and the retry that went through are two records
// of the same run, told apart, and the action the station ran is the exit's record under the same call. The handoff's text is named, not copied.

const STEP: ActionDefinition = { capability_id: "fixture.desk.ticket", version: 1, operation: "command", action: { title: "建工单", description: "A workflow step target",
  kind: "operation", scope: "project", audiences: ["user", "workflow"], permissions: ["workflows:write"], subject_kinds: [],
  input_schema: { type: "object", properties: { title: { type: "string", minLength: 1 } }, required: ["title"], additionalProperties: false },
  output_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } };

test("OCL-03 OCL-08 EC-06: a failed step and its retry are two records of one run, each in the call that made it and joined to the action it ran", { timeout: 120_000 }, async t => {
  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Workflow records", ["feed"]);
  const seed = new LocalProjectDatabase(project.database_path);
  try {
    const source = createLocalFeedSourceService(seed.db, project.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "note", title: "导出失败", summary: "客户反馈", body: "客户的周报导出一直失败。", occurredAt: new Date().toISOString(), attention: false });
  } finally { seed.close(); }
  let failNext = true;
  t.after(served.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: "platform", title: "台面", kind: "system" }, definitions: [STEP],
    handlers: [{ ...STEP, handle: async (_caller: ActionExecutionContext, _input: unknown) => {
      if (failNext) { failNext = false; throw new Error("工单系统超时"); }
      return { ok: true };
    } }] }));
  const root = `${served.origin}/projects/${project.project_id}/api/plugins/${WORKFLOWS_PLUGIN_ID}`;
  const call = async (method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(root + pathname, { method, headers: { origin: served.origin, "content-type": "application/json",
      "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const created = await call("POST", "/workflows", { title: "反馈建单", chain: { stations: [{ plugin: "feed" },
    { plugin: "action", action: { ref: { capability_id: STEP.capability_id, version: 1, provider_id: "platform" }, title: "建工单", group: "台面", mapping: { title: { from: "title" } } } }],
  links: [{ kind: "function", title_template: "工单：{标题}", body_template: "{正文}", instructions: "" }] } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const items = (await call("GET", "/workflows/stations/feed/items")).body.items as Array<{ item_id: string }>;
  const started = await call("POST", `/workflows/${(created.body.workflow as { workflow_id: string }).workflow_id}/instances`, { item_id: items[0]!.item_id });
  const run = (started.body.instance as WorkflowInstance).instance_id;

  const failed = await call("POST", `/workflows/instances/${run}/continue`, {});
  assert.notEqual(failed.status, 200);
  const unconfirmed = await call("POST", `/workflows/instances/${run}/continue`, {});
  assert.match(JSON.stringify(unconfirmed.body), /workflows\.uncertain/u, "an unconfirmed attempt is not resent without the person's say");
  const retried = await call("POST", `/workflows/instances/${run}/continue`, { retry_action: true });
  assert.equal(retried.status, 200, JSON.stringify(retried.body));

  const layer = served.host.observation!.layer; layer.flush();
  const all = readRecords(layer.writer.database()!.db, { limit: 5000 });
  const steps = all.filter(record => record.fact === "io.molis.work.native.workflows.step");
  assert.deepEqual(steps.map(record => [record.outcome, record.stage, record.detail.retry ?? false]), [["failed", "function", false], ["succeeded", "function", true]],
    "the attempt that failed and the retry that went through, told apart; the refusal to resend changed nothing and is not a step");
  const continues = all.filter(record => record.fact === "action.call" && record.detail.action === "workflows.instances.continue@1");
  for (const step of steps) {
    assert.deepEqual([step.owner, step.entry, step.project_id, step.work.work_ref, step.subjects[0]], [{ kind: "plugin", id: WORKFLOWS_PLUGIN_ID }, "plugin", project.project_id, run,
      { kind: "workflow_run", id: run }], step.outcome);
    assert.ok(step.install_id, "reported as the installation");
    assert.deepEqual(step.conditions.plugin, { id: WORKFLOWS_PLUGIN_ID, version: workflowsManifest.version });
    assert.deepEqual([step.detail.action, step.detail.action_provider, step.detail.actor], [`${STEP.capability_id}@1`, "platform", "function"]);
    assert.ok(step.work.call_id && continues.some(record => record.work.call_id === step.work.call_id), "in the call of the person's continue");
    assert.ok(all.some(record => record.fact === "action.call" && record.detail.action === `${STEP.capability_id}@1` && record.work.call_id === step.work.call_id),
      "the action the station ran is the exit's record in the same call");
  }
  assert.notEqual(steps[0]!.work.call_id, steps[1]!.work.call_id);
  assert.equal(steps[0]!.detail.error, "工单系统超时");
  assert.deepEqual(steps[0]!.evidence, [], "a failed attempt delivered nothing to name");
  assert.deepEqual(steps[1]!.evidence.map(item => item.ref), [{ kind: "owner", owner: WORKFLOWS_PLUGIN_ID, id: `${run}:0`, version: (retried.body.instance as WorkflowInstance).updated_at }],
    "the handoff text is the run's, named and not copied");
  assert.ok(!JSON.stringify(steps).includes("客户的周报导出一直失败"));
});
