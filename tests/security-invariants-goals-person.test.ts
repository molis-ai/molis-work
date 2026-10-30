import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { ActionCallContext, ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { WORKFLOWS_PLUGIN_ID, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { goalApplicationOf, seedBoard } from "./fixtures/goal-application.js";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * S-99 (provisional number: the table's next free one is taken when this merges, and the text, the test names and the spec follow it).
 * Goals reads who asked only from the trusted caller: the person's own call, or the call of the plugin that owns the source (Feed, for
 * `source_kind: "feed"` and a `feed_item` input) made through its action directory for the person's own direct call. Any other plugin
 * handing in for the person — Workflows running a step after the person pressed continue, a third party holding `actions:delegate` — proposes:
 * it cannot name the creation channel, an unnamed one is the Runtime's, and an input it confirms waits for the person.
 */

const PROJECT = "project-goals-person";
const THIRD_PARTY = "com.example.delegating";

test("S-99 Goals takes the person only from the source owner's delegation: another plugin handing in for the person proposes and names no channel", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-goals-person-"));
  const databasePath = join(home, "project.db");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    seedBoard(databasePath, PROJECT);
    const seed = new LocalProjectDatabase(databasePath);
    const source = createLocalFeedSourceService(seed.db, PROJECT).register({ kind: "web_query", query: "Who asked" }).source;
    const item = createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "person", title: "Who asked", summary: "A claim",
      body: "Source material.", priority: "high", occurredAt: "2026-10-27T00:00:00.000Z", attention: false }).item;
    seed.close();
    const reference = molisWorkHostProjectReference({ databasePath, projectId: PROJECT });
    const client = host.actionClient(reference);
    const permissions = [...new Set([...feedManifest.permissions.map(entry => entry.permission), "goals:read", "goals:write", "context-ledger:write"])];
    const person: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions };
    // What the Host sets on the nested caller of a plugin's action directory for the person's own direct call to that plugin (S-43).
    const handedInBy = (plugin: string): ActionCallContext => ({ ...person, audience: "workflow", delegated_by: plugin, delegated_audience: "user" });
    const intent = (key: string, source_kind?: string) => ({ title: "Who asked", idempotency_key: key, ...(source_kind ? { source_kind } : {}) });
    const confirm = (goal_id: string) => ({ goal_id, source: { kind: "feed_item" as const, id: item.item_id }, name: "Feed Item 输入",
      snapshot_digest: `sha256:${"0".repeat(64)}`, reason: "who asked" });
    const channel = async (goal_id: string) => (await client.invoke(person, goalsActions.state, { goal_id }) as { intent: { source_kind: string } }).intent.source_kind;
    const create = (caller: ActionCallContext, key: string, kind?: string) => client.invoke(caller, goalsActions.create, intent(key, kind))
      .then(async created => channel((created as { goal: { goal_id: string } }).goal.goal_id), (error: ActionError) => `${error.code} ${error.message}`);
    const REFUSED = "actions.input_invalid 只有本人可以指定 Goal 的创建渠道";
    const outcomes: unknown[] = [];
    for (const [name, plugin] of [["feed", FEED_PLUGIN_ID], ["workflows", WORKFLOWS_PLUGIN_ID], ["third party", THIRD_PARTY]] as const) {
      const caller = handedInBy(plugin);
      const named = await create(caller, `named-${name}`, "feed");
      const other = await create(caller, `other-${name}`, "onboarding");
      const plain = await create(caller, `plain-${name}`);
      const { goal } = await client.invoke(person, goalsActions.create, intent(`target-${name}`)) as { goal: { goal_id: string } };
      await client.invoke(caller, goalsActions.inputsConfirm, confirm(goal.goal_id));
      const state = await host.withProject(reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).find(receipt => receipt.goal_id === goal.goal_id)?.state);
      outcomes.push([name, named, other, plain, state]);
    }
    assert.deepEqual(outcomes, [
      // Feed owns the `feed` channel and the `feed_item` input; a delegation that names no channel, or another one, is not the person.
      ["feed", "feed", REFUSED, "runtime", "confirmed"],
      ["workflows", REFUSED, REFUSED, "runtime", "proposed"],
      ["third party", REFUSED, REFUSED, "runtime", "proposed"],
    ]);
    // The person's own call still names any channel, and an unnamed one is theirs.
    assert.equal(await create(person, "person-onboarding", "onboarding"), "onboarding");
    assert.equal(await create(person, "person-plain"), "web");
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

/** A project with a Feed item, and the Workflows plugin's own page routes: the production path of the person's press of continue. */
async function workflowsHome(t: TestContext) {
  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Goals person", ["feed"]);
  const seed = new LocalProjectDatabase(project.database_path);
  try {
    const source = createLocalFeedSourceService(seed.db, project.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "goal", title: "导出失败", summary: "客户反馈", body: "客户的周报导出一直失败。",
      url: "https://example.com/goal", occurredAt: new Date().toISOString(), attention: false });
  } finally { seed.close(); }
  const root = `${served.origin}/projects/${project.project_id}/api/plugins/${WORKFLOWS_PLUGIN_ID}`;
  const call = async (method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(root + pathname, { method, headers: { origin: served.origin, "content-type": "application/json",
      "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  /** A run waiting at the Feed item whose next station is `goals.create`, filled with the item's title and the fixed values given. */
  const runTo = async (key: string, fixed: Record<string, string>) => {
    const mapping = { title: { from: "title" }, idempotency_key: { value: key }, ...Object.fromEntries(Object.entries(fixed).map(([name, value]) => [name, { value }])) };
    const step = { plugin: "action", action: { ref: { capability_id: goalsActions.create.capability_id, version: goalsActions.create.version, provider_id: GOALS_PLUGIN_ID },
      title: goalsActions.create.action.title, group: "Goals", mapping } };
    const created = await call("POST", "/workflows", { title: `到 Goals ${key}`, chain: { stations: [{ plugin: "feed" }, step],
      links: [{ kind: "function", title_template: "{标题}", body_template: "{正文}", instructions: "" }] } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const workflowId = (created.body.workflow as { workflow_id: string }).workflow_id;
    const items = (await call("GET", "/workflows/stations/feed/items")).body.items as Array<{ item_id: string }>;
    const started = await call("POST", `/workflows/${workflowId}/instances`, { item_id: items[0]!.item_id });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    return (started.body.instance as WorkflowInstance).instance_id;
  };
  const person: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["goals:read"] };
  const goals = async () => ((await served.host.actionClient(project.reference).invoke(person, goalsActions.list, { limit: 100 })) as { goals: Array<{ goal_id: string; title: string }> }).goals;
  const log = (capabilityId: string) => served.host.callLog!.list(project.project_id).filter(row => row.capability_id === capabilityId);
  return { served, project, call, runTo, goals, log, person };
}

test("S-99 a Workflows step that runs goals.create after the person pressed continue is not the person: a named channel is refused, none is the Runtime's", async t => {
  const s = await workflowsHome(t);
  // The person pressed continue (`user`); Workflows hands the step in through its action directory, so Goals sees `delegated_by` Workflows.
  const named = await s.runTo("wf-named", { source_kind: "feed" });
  const refused = await s.call("POST", `/workflows/instances/${named}/continue`, {});
  assert.notEqual(refused.status, 200, JSON.stringify(refused.body));
  assert.equal(refused.body.code, "actions.input_invalid", JSON.stringify(refused.body));
  assert.match(String(refused.body.error), /只有本人可以指定 Goal 的创建渠道/, JSON.stringify(refused.body));
  assert.deepEqual((await s.goals()).filter(goal => goal.title === "导出失败"), [], "nothing was created for the refused step");

  const plain = await s.runTo("wf-plain", {});
  const continued = await s.call("POST", `/workflows/instances/${plain}/continue`, {});
  assert.equal(continued.status, 200, JSON.stringify(continued.body));
  assert.equal((continued.body.instance as WorkflowInstance).status, "done");
  const [made] = (await s.goals()).filter(goal => goal.title === "导出失败");
  assert.ok(made, "the step made the Goal");
  const state = await s.served.host.actionClient(s.project.reference).invoke(s.person, goalsActions.state, { goal_id: made.goal_id }) as { intent: { source_kind: string } };
  assert.equal(state.intent.source_kind, "runtime");
  const [own] = s.log("workflows.instances.continue").filter(row => row.ok);
  const [step] = s.log(goalsActions.create.capability_id).filter(row => row.ok);
  assert.deepEqual([own!.audience, own!.delegated_by], ["user", undefined]);
  assert.deepEqual([step!.audience, step!.delegated_by, step!.actor_id], ["workflow", WORKFLOWS_PLUGIN_ID, own!.actor_id]);
});
