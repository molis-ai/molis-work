import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext, ActionReference, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type PluginActionDirectory, type PluginDatabase, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { WORKFLOWS_ACTION_PERMISSIONS, WORKFLOWS_PLUGIN_ID, createWorkflowsPlugin, workflowsActions, workflowsManifest, type WorkflowInstance } from "@molis-ai/molis-work-plugin-workflows";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

/**
 * Workflows on the Plugin Runtime reaches every station, action step and judgment rule through the action directory (`actions:delegate`) as the
 * person, MCP client or Agent that started the call. These tests state what the plugin holds, what a caller reaches through it, and what it does
 * not widen: the person reaches what the person holds and the plugin does not; an MCP client or an Agent reaches only what its own grants and
 * action list name, and a step it cannot reach neither runs nor leaves an attempt on the run.
 */

/** A step target of the fixture provider: `permissions` are what a caller needs to see it, and the audiences let a workflow, an MCP client and an Agent reach it. */
function desk(name: string, permissions: string[]): ActionDefinition {
  return { capability_id: `fixture.desk.${name}`, version: 1, operation: "command", action: { title: `台面 ${name}`, description: "A workflow step target", kind: "operation",
    scope: "project", audiences: ["user", "agent", "mcp", "workflow"], permissions, subject_kinds: [],
    input_schema: { type: "object", properties: { title: { type: "string", minLength: 1 } }, required: ["title"], additionalProperties: false },
    output_schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } };
}
/** What Workflows' own `continue` grants its caller, so the call reaches this target on the same permission the run already needed. */
const NOTE = desk("note", ["workflows:write"]);
/** A permission the person holds over the project and the Workflows plugin does not (the Manifest below proves the second half). */
const SETTINGS = desk("settings", ["projects:settings"]);
/** A permission nobody on the page holds. */
const ADMIN = desk("admin", ["delegate:admin"]);
/**
 * The Host's own provider (`HOST_PROVIDER_ID`), where the person holds what each action asks (PG-007 stage 4): a made-up host provider
 * would give the person nothing, so the page could not reach NOTE or SETTINGS for a reason this file does not test.
 */
const PROVIDER = "platform";
const ref = (definition: ActionDefinition): ActionReference => ({ capability_id: definition.capability_id, version: definition.version });
const stepRef = (definition: ActionDefinition) => ({ ...ref(definition), provider_id: PROVIDER });
const FEED_PERMISSIONS = feedManifest.actions!.flatMap(definition => definition.action.permissions);
const AGENT_PERMISSIONS = [...new Set([...WORKFLOWS_ACTION_PERMISSIONS, "model:invoke", ...FEED_PERMISSIONS])];

interface Reached { readonly capability_id: string; readonly actor_id: string; readonly audience: string; readonly delegated_by: string | undefined; readonly title: string | undefined }
const titleOf = (input: unknown): string | undefined => (typeof input === "object" && input !== null && "title" in input && typeof input.title === "string" ? input.title : undefined);

/** A project with a Feed item, the three fixture targets, and the page's own routes of the Workflows plugin: the production path of a request. */
async function setup(t: TestContext) {
  const served = await openTestHome(t, { catalogPolicy: false });
  const project = await served.createProject("Workflows delegation", ["feed"]);
  const projectId = project.project_id;
  const seed = new LocalProjectDatabase(project.database_path);
  try {
    const source = createLocalFeedSourceService(seed.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "twitter-ai-observation" }).source;
    createLocalFeedApplication(seed.db).ingestItem({ source, externalId: "note", title: "导出失败", summary: "客户反馈", body: "客户的周报导出一直失败。",
      url: "https://example.com/note", occurredAt: new Date().toISOString(), attention: false });
  } finally { seed.close(); }
  const reached: Reached[] = [];
  const targets = [NOTE, SETTINGS, ADMIN];
  t.after(served.host.actionRegistry(project.reference).registerProvider({ provider: { provider_id: PROVIDER, title: "台面", kind: "system" }, definitions: targets,
    handlers: targets.map(definition => ({ ...definition, handle: async (caller: ActionExecutionContext, input: unknown) => {
      reached.push({ capability_id: definition.capability_id, actor_id: caller.actor_id, audience: caller.audience, delegated_by: caller.delegated_by, title: titleOf(input) });
      return { ok: true };
    } })) }));
  const root = `${served.origin}/projects/${projectId}/api/plugins/${WORKFLOWS_PLUGIN_ID}`;
  const call = async (method: "GET" | "POST", pathname: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(root + pathname, { method, headers: { origin: served.origin, "content-type": "application/json",
      "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  };
  const client = served.host.actionClient(project.reference);
  const log = (capabilityId: string) => served.host.callLog!.list(projectId).filter(row => row.capability_id === capabilityId);
  /** Feed, then the target as an action step: the shape a person builds in the editor. */
  const station = (target: ActionDefinition) => ({ plugin: "action", action: { ref: stepRef(target), title: target.action.title, group: "台面", mapping: { title: { from: "title" } } } });
  const chain = (target: ActionDefinition) => ({ stations: [{ plugin: "feed" }, station(target)],
    links: [{ kind: "function", title_template: "{标题}", body_template: "{正文}", instructions: "" }] });
  /** A run waiting at the Feed item, made as the person on the page. */
  const run = async (target: ActionDefinition) => {
    const created = await call("POST", "/workflows", { title: `到 ${target.capability_id}`, chain: chain(target) });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const workflowId = (created.body.workflow as { workflow_id: string }).workflow_id;
    const items = (await call("GET", "/workflows/stations/feed/items")).body.items as Array<{ item_id: string }>;
    const started = await call("POST", `/workflows/${workflowId}/instances`, { item_id: items[0]!.item_id });
    assert.equal(started.status, 200, JSON.stringify(started.body));
    return (started.body.instance as WorkflowInstance).instance_id;
  };
  const instance = async (id: string) => (await call("GET", `/workflows/instances/${id}`)).body.instance as WorkflowInstance;
  /** A caller shaped like an Agent run: the audience, the permissions it was given, and the list of actions it may use. */
  const agent = (allowed?: readonly ActionReference[]): ActionCallContext => ({ actor_id: "agent:wf-test", audience: "agent", project_id: projectId,
    permissions: AGENT_PERMISSIONS, ...(allowed ? { allowed_actions: allowed.map(item => ({ ...item })) } : {}) });
  /** Without an action list the Agent sees every action its audience and permissions reach. */
  const feedContent = async (): Promise<ActionView[]> => (await client.discover(agent())).filter(view => view.action.workflow_content?.id === "feed");
  return { ...served, project, projectId, reached, call, client, log, chain, run, instance, agent, feedContent };
}

const attempted = (instance: WorkflowInstance) => instance.steps[0]!.pending?.attempted_at;

test("W5-01-WORKFLOWS-01 the Manifest asks for the permissions the plugin needs, and start refuses when one of them was not granted", async () => {
  const required = workflowsManifest.permissions.filter(item => item.required).map(item => item.permission).sort();
  assert.deepEqual(required, ["actions:delegate", "storage:private", "workflows:read", "workflows:write"]);
  assert.deepEqual(workflowsManifest.permissions.filter(item => !item.required).map(item => item.permission), ["model:invoke"]);
  // The plugin holds nothing of what a station or a step needs (the one Feed shares with it, model:invoke, is its own optional grant): those belong to the caller (W5-01-WORKFLOWS-03).
  for (const permission of [...FEED_PERMISSIONS.filter(item => item !== "model:invoke"), "projects:settings", "delegate:admin"]) assert.equal(workflowsManifest.permissions.some(item => item.permission === permission), false, permission);

  const database: PluginDatabase = { get: () => undefined, all: () => [], transaction: () => { throw new Error("no write is made while starting"); } };
  const directory: PluginActionDirectory = { discover: async () => [], invoke: async () => { throw new Error("nothing is reached while starting"); }, check: async () => {} };
  const contextWith = (grants: readonly string[], services: PluginStartContext["services"]): PluginStartContext => ({ install_id: "workflows-test", installation_generation: "1", plugin_id: WORKFLOWS_PLUGIN_ID,
    version: workflowsManifest.version, deployment: "local", grants: [...grants], project_id: "p", services,
    requireGrant: permission => { if (!grants.includes(permission)) throw pluginErrors.grant_denied(`Plugin 没有 ${permission} grant`); } });
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  const services: NonNullable<PluginStartContext["services"]> = { database, actions: { directory, discover: async () => [], invoke: unused, invokeQuery: unused },
    ui: { register: () => {}, unregister: () => {} } };
  const { database: omittedDatabase, ...noDatabase } = services;
  const { actions: omittedActions, ...noActions } = services;
  const started = await createWorkflowsPlugin().start(contextWith(required, services));
  assert.equal(started.kind, "app");
  assert.deepEqual((started.routes ?? []).map(route => route.route_id).sort(), (workflowsManifest.routes ?? []).map(route => route.route_id).sort());
  for (const missing of required) {
    await assert.rejects(createWorkflowsPlugin().start(contextWith(required.filter(permission => permission !== missing), services)), { code: "plugin.grant_denied" }, `start without ${missing}`);
  }
  await assert.rejects(createWorkflowsPlugin().start(contextWith(required, noDatabase)), { code: "actions.unredeemed" });
  await assert.rejects(createWorkflowsPlugin().start(contextWith(required, noActions)), { code: "actions.unredeemed" });
});

test("W5-01-WORKFLOWS-01 a project runs the plugin, and every Workflows action is still registered under its plugin id", async t => {
  const s = await setup(t);
  const views = (await s.client.discover(s.agent())).filter(view => view.capability_id.startsWith("workflows."));
  assert.deepEqual(views.map(view => view.capability_id).sort(), Object.values(workflowsActions).map(definition => definition.capability_id).sort());
  assert.ok(views.every(view => view.provider.provider_id === WORKFLOWS_PLUGIN_ID), "the provider identity did not change with the move");
  assert.equal((await s.call("GET", "/workflows")).status, 200);
});

test("W5-01-WORKFLOWS-03 from the page, a station and a step are reached as the person: what the person holds and the plugin does not, not what the person lacks", async t => {
  const s = await setup(t);
  // The directory the editor offers is the person's: the step needing `projects:settings` is there, the one needing `delegate:admin` is not.
  const offered = (await s.call("GET", "/workflows/steps/actions")).body.actions as Array<{ ref: ActionReference }>;
  assert.ok(offered.some(row => row.ref.capability_id === SETTINGS.capability_id));
  assert.ok(offered.some(row => row.ref.capability_id === NOTE.capability_id));
  assert.equal(offered.some(row => row.ref.capability_id === ADMIN.capability_id), false);
  const refused = await s.call("POST", "/workflows", { title: "没有权限的一步", chain: s.chain(ADMIN) });
  assert.notEqual(refused.status, 200);
  assert.equal(refused.body.code, "workflows.unavailable");
  assert.deepEqual(s.reached, []);

  const id = await s.run(SETTINGS);
  const continued = await s.call("POST", `/workflows/instances/${id}/continue`, {});
  assert.equal(continued.status, 200, JSON.stringify(continued.body));
  assert.equal((continued.body.instance as WorkflowInstance).status, "done");
  // The target ran once, as workflow, for the person who pressed the button, and the call log says the plugin carried it.
  assert.equal(s.reached.length, 1);
  const [own] = s.log("workflows.instances.continue");
  assert.equal(own!.audience, "user"); assert.equal(own!.delegated_by, undefined);
  assert.deepEqual([s.reached[0]!.capability_id, s.reached[0]!.audience, s.reached[0]!.delegated_by, s.reached[0]!.actor_id], [SETTINGS.capability_id, "workflow", WORKFLOWS_PLUGIN_ID, own!.actor_id]);
  const [step] = s.log(SETTINGS.capability_id);
  assert.deepEqual([step!.actor_id, step!.audience, step!.delegated_by, step!.ok], [own!.actor_id, "workflow", WORKFLOWS_PLUGIN_ID, true]);
  // The Feed station was read through the same door (a query, so it leaves no row in the call log of commands): the step was handed the item the station read.
  assert.equal(s.reached[0]!.title, "导出失败");
});

test("W5-01-WORKFLOWS-04 an MCP client that holds continue and the Feed station but not the step is refused, the step never runs and no attempt is left; granted, it runs as workflow", async t => {
  const s = await setup(t);
  const id = await s.run(NOTE);
  const feed = await s.feedContent();
  assert.ok(feed.length >= 2, "the Feed station has list and read actions to grant");
  await s.grant("client-wf", s.projectId, [ref(workflowsActions.continue), ref(workflowsActions.instance), ...feed]);
  const mcp = await s.mcp("client-wf", s.projectId);

  // The client holds the permission the step needs (it is the one `continue` needs), so only the grant table separates them.
  await assert.rejects(mcp.client.invoke(mcp.caller, ref(workflowsActions.continue), { id }), { code: "workflows.unavailable" });
  assert.deepEqual(s.reached, [], "the step never ran");
  assert.equal(attempted(await s.instance(id)), undefined, "and the run holds no attempt for a retry to be told about");
  assert.equal(s.log(NOTE.capability_id).length, 0, "no call to the step reached the log");

  // The same client with the step granted: it runs, as workflow, still the client's own identity.
  const [noteView] = (await s.inspect("client-wf", s.projectId)).filter(view => view.capability_id === NOTE.capability_id);
  await s.grant("client-wf", s.projectId, [noteView!]);
  const done = await mcp.client.invoke(mcp.caller, ref(workflowsActions.continue), { id }) as { instance: WorkflowInstance };
  assert.equal(done.instance.status, "done");
  assert.deepEqual(s.reached.map(row => [row.capability_id, row.actor_id, row.audience, row.delegated_by]), [[NOTE.capability_id, "client-wf", "workflow", WORKFLOWS_PLUGIN_ID]]);
  const [outer] = s.log(workflowsActions.continue.capability_id);
  assert.deepEqual([outer!.actor_id, outer!.audience, outer!.delegated_by], ["client-wf", "mcp", undefined]);
});

test("W5-01-WORKFLOWS-05 an Agent whose action list leaves the step out is refused, and the step never runs; with it listed, it runs as workflow", async t => {
  const s = await setup(t);
  const id = await s.run(NOTE);
  const feed = (await s.feedContent()).map(view => ({ ...ref(view), provider_id: view.provider.provider_id }));
  assert.ok(feed.length >= 2);
  const without = s.agent([{ ...ref(workflowsActions.continue), provider_id: WORKFLOWS_PLUGIN_ID }, ...feed]);
  await assert.rejects(s.client.invoke(without, workflowsActions.continue, { id }), { code: "workflows.unavailable" });
  assert.deepEqual(s.reached, []);
  assert.equal(attempted(await s.instance(id)), undefined);
  const listed = s.agent([{ ...ref(workflowsActions.continue), provider_id: WORKFLOWS_PLUGIN_ID }, ...feed, stepRef(NOTE)]);
  const done = await s.client.invoke(listed, workflowsActions.continue, { id });
  assert.equal(done.instance.status, "done");
  assert.deepEqual(s.reached.map(row => [row.capability_id, row.actor_id, row.audience, row.delegated_by]), [[NOTE.capability_id, "agent:wf-test", "workflow", WORKFLOWS_PLUGIN_ID]]);
});
