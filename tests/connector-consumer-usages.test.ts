import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { connectorUsagesAction, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionClient, ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesAction, type ConnectorUsage } from "@molis-ai/molis-work-contracts/services/connector-host";
import { AGENT_MCP_DESTINATION_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { imagesActions } from "@molis-ai/molis-work-plugin-images";
import { FEED_ACTION_PERMISSIONS, feedSourceActions } from "@molis-ai/molis-work-plugin-feed";
import { functionAuthoringActions } from "@molis-ai/molis-work-module-judgment-rules";
import { openTestHome } from "./fixtures/test-home.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

const caller: ActionCallContext = { actor_id: "consumer-reader", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "images:connections:read", "images:connections:write", "images:generate", "images:files:write", "model:invoke", "feed:read", "feed:write", "functions:manage", "functions:invoke"] };
type Usage = Omit<ConnectorUsage, "actions"> & { source: ActionReference; actions: Array<ConnectorUsage["actions"][number] & { available: boolean; reason?: string }> };
const read = (client: ActionClient, connection_id: string, context = caller) => client.invoke(context, connectorUsagesAction, { connection_id }) as Promise<{ usages: Usage[]; issues: string[] }>;

test("ASC-10 ASC-21: real model and image bindings are reported without keys, and rebinding never changes another account", async t => {
  const home = await openTestHome(t), client = home.host.homeActionClient();
  const [model, first, second] = withConnectorConnections(home.home, store => [
    store.createToken({ serviceId: "model-api", displayName: "Text account", token: "fixture-model-usage-key" }),
    store.createToken({ serviceId: "image-api", displayName: "Image A", token: "fixture-image-a-usage-key" }),
    store.createToken({ serviceId: "image-api", displayName: "Image B", token: "fixture-image-b-usage-key" }),
  ]);
  withConnectorConnections(home.home, store => store.assertTarget(model!.connection_id, "model-api", "https://model.example/v1"));
  await withMolisWorkProjectCatalog({ homeDirectory: home.home }, catalog => catalog.models.upsert({ provider_id: "usage-model", display_name: "My text provider",
    base_url: "https://model.example/v1", api_format: "openai-chat-completions", credential_ref: model!.credential_ref!, models: [{ model_id: "text-1", enabled: true }] }));
  const modelUses = await read(client, model!.connection_id);
  assert.equal(modelUses.usages.length, 1); assert.equal(modelUses.usages[0]?.usage_id, "usage-model");
  assert.equal(modelUses.usages[0]?.enabled, true); assert.deepEqual(modelUses.usages[0]?.actions, [], "no claim that an arbitrary text action is bound to this model");
  const input = { name: "My image service", api_format: "openai-images" as const, base_url: "https://images.example/v1", model: "image-1", auth_connection_id: first!.connection_id };
  const { connection } = await client.invoke(caller, imagesActions.saveConnection, input);
  const result = await read(client, first!.connection_id), image = result.usages.find(usage => usage.usage_id === connection.id)!;
  assert.deepEqual(image.actions[0]?.input, { connection_id: connection.id });
  assert.equal(image.actions[0]?.action.capability_id, imagesActions.start.capability_id);
  assert.equal(image.actions[0]?.available, false, "Home has no project generation action");
  const project = await home.createProject("Image usages");
  const scoped = { ...caller, project_id: project.project_id }, projectClient = home.host.actionClient(project.reference);
  assert.equal((await read(projectClient, first!.connection_id, scoped)).usages[0]?.actions[0]?.available, true);
  const noGenerate = await read(projectClient, first!.connection_id, { ...scoped, permissions: scoped.permissions.filter(permission => permission !== "images:generate") });
  assert.equal(noGenerate.usages[0]?.actions[0]?.available, false);
  assert.match(noGenerate.usages[0]?.actions[0]?.reason ?? "", /作用域/);
  const noModel = await read(projectClient, first!.connection_id, { ...scoped, permissions: scoped.permissions.filter(permission => permission !== "model:invoke") });
  assert.equal(noModel.usages[0]?.actions[0]?.available, false, "Images v2 also requires model invocation authority");
  assert.match(noModel.usages[0]?.actions[0]?.reason ?? "", /作用域/);
  const noRead = await read(projectClient, first!.connection_id, { ...scoped, permissions: ["connectors:management:read"] });
  assert.equal(noRead.usages.length, 0); assert.deepEqual(noRead.issues, [], "a reporter outside the caller's visible directory is not disclosed as an error");
  await assert.rejects(projectClient.invoke({ ...scoped, permissions: ["connectors:management:read"] }, imagesActions.connectionUsages, { connection_id: first!.connection_id }), { code: "actions.forbidden" });
  await client.invoke(caller, imagesActions.saveConnection, { ...input, id: connection.id, auth_connection_id: second!.connection_id });
  assert.deepEqual((await read(client, first!.connection_id)).usages, []);
  assert.equal((await read(projectClient, second!.connection_id, scoped)).usages[0]?.actions[0]?.available, true);
  withConnectorConnections(home.home, store => { store.setEnabled(second!.connection_id, false); store.setEnabled(model!.connection_id, false); });
  assert.equal((await read(projectClient, second!.connection_id, scoped)).usages[0]?.actions[0]?.available, false);
  assert.equal((await read(client, model!.connection_id)).usages[0]?.enabled, false);
  assert.doesNotMatch(JSON.stringify([modelUses, result, noRead]), /fixture-.*usage-key|credential_ref/);
});

test("ASC-10 ASC-13 ASC-21: Functions reports its actual selected account and invokes the same published action", async t => {
  let calls = 0;
  const home = await openTestHome(t, { host: { functions: { env: {}, provider: { async evaluate(apiKey, record) {
    assert.equal(apiKey, "fixture-functions-usage-key"); calls++;
    return { primitive: record.primitive, choice: "yes", noul: null, score: null, legend: null, probabilities: { yes: 1 }, confidence: 1, model: record.model };
  } } } } });
  const client = home.host.homeActionClient(), account = withConnectorConnections(home.home, store => {
    const row = store.createToken({ serviceId: "typesafe", displayName: "Judgment account", token: "fixture-functions-usage-key" });
    store.bind({ scopeId: "home", pluginId: "functions", slotId: "typesafe", serviceId: "typesafe", connectionId: row.connection_id }); return row;
  });
  const { function: draft } = await client.invoke(caller, functionAuthoringActions.create, { primitive: "choice", name: "Use this account", function_key: "usage_choice" });
  const { function: updated } = await client.invoke(caller, functionAuthoringActions.update, { id: draft.id, updated_at: draft.updated_at, patch: { instructions: "Pick yes", criteria: [{ key: "yes", description: "Yes" }, { key: "no", description: "No" }], scene_id: AGENT_MCP_DESTINATION_ID } });
  const { function: previewed } = await client.invoke(caller, functionAuthoringActions.preview, { id: draft.id, updated_at: updated.updated_at, input: "Yes" });
  await client.invoke(caller, functionAuthoringActions.publish, { id: draft.id, updated_at: previewed.updated_at });
  const result = await read(client, account.connection_id), usage = result.usages.find(usage => usage.usage_id === "usage_choice")!;
  assert.equal(usage.actions[0]?.available, true); assert.equal(calls, 1, "listing does not evaluate");
  const invocation = await client.invoke(caller, usage.actions[0]!.action, { ...usage.actions[0]!.input, content: "Yes" }) as { data: { choice: string } };
  assert.equal(invocation.data.choice, "yes"); assert.equal(calls, 2);
  withConnectorConnections(home.home, store => store.setEnabled(account.connection_id, false));
  assert.equal((await read(client, account.connection_id)).usages.find(usage => usage.usage_id === "usage_choice")?.actions[0]?.available, false);
  await assert.rejects(client.invoke(caller, usage.actions[0]!.action, { content: "Must not invoke" })); assert.equal(calls, 2);
  assert.doesNotMatch(JSON.stringify(result), /fixture-functions-usage-key|credential_ref/);
});

test("ASC-10 ASC-13 ASC-21: Feed reports only this project's account sources and source control changes the next result", async t => {
  const home = await openTestHome(t), a = await home.createProject("A", ["feed"]), b = await home.createProject("B", ["feed"]);
  const account = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-feed-usage-key" }));
  for (const project of [a, b]) await home.host.withProject(project.reference, runtime => createLocalFeedApplication(runtime.store.db).sources.upsert({
    project_id: project.project_id, source_id: `usage-${project.display_name}`, kind: "github", definition_id: "github", sync_kind: "github",
    name: `${project.display_name} notifications`, description: "", status: "active", enabled: true, item_count: 0, origin: "molis_work",
    config: { connection_id: account.connection_id }, schedule: { mode: "manual", enabled: false }, cursor: {}, credential_ref: account.credential_ref,
    account_label: "Work", last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: "2026-10-16T00:00:00.000Z", updated_at: "2026-10-16T00:00:00.000Z",
  }));
  // Registering a source and the sync a usage offers ask what the Runtime Feed asks of the platform too (`sources:pull_*`, `connections:use`,
  // `evidence:read`, `artifact:write`…, feed-inbox-runtime-plugins §11–§12): the caller holds all of Feed, so an unavailable sync below is the
  // source's or the account's state, not a missing grant.
  const feedCaller = { ...caller, permissions: [...caller.permissions, ...FEED_ACTION_PERMISSIONS] };
  const context = { ...feedCaller, project_id: a.project_id }, client = home.host.actionClient(a.reference);
  await client.invoke(context, feedSourceActions.register, { kind: "custom_rss", name: "Public feed", feed_url: "https://example.com/feed.xml" });
  const result = await read(client, account.connection_id, context);
  assert.equal(result.usages.length, 1); assert.equal(result.usages[0]?.title, "A notifications");
  assert.deepEqual(result.usages[0]?.actions[0]?.input, { source_id: "usage-A" }); assert.equal(result.usages[0]?.actions[0]?.available, true);
  assert.equal((await read(home.host.homeActionClient(), account.connection_id)).usages.length, 0);
  assert.doesNotMatch(JSON.stringify(result), /B notifications|Public feed|fixture-feed-usage-key|credential_ref/);
  await client.invoke(context, feedSourceActions.enabled, { source_id: "usage-A", enabled: false });
  assert.equal((await read(client, account.connection_id, context)).usages[0]?.actions[0]?.available, false);
  const other = await read(home.host.actionClient(b.reference), account.connection_id, { ...feedCaller, project_id: b.project_id });
  assert.equal(other.usages[0]?.actions[0]?.available, true);
  withConnectorConnections(home.home, store => store.setEnabled(account.connection_id, false));
  assert.equal((await read(home.host.actionClient(b.reference), account.connection_id, { ...feedCaller, project_id: b.project_id })).usages[0]?.actions[0]?.available, false);
});

test("ASC-13 ASC-16: usage reporters are discovered by contract and a withdrawn owner cannot return a late association", async t => {
  const home = await openTestHome(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const account = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Report target", token: "fixture-report-target" }));
  const first = defineConnectorUsagesAction("fixture.first.usages", "First owner", [], "home"), second = defineConnectorUsagesAction("fixture.second.usages", "Slow owner", [], "home");
  const disposeFirst = home.host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.first", title: "First owner", kind: "system" }, definitions: [first],
    handlers: [{ ...first, handle: () => ({ usages: [{ usage_id: "one", title: "Actual saved reference", enabled: true, actions: [] }] }) }] });
  const disposeSecond = home.host.actionRegistry().registerProvider({ provider: { provider_id: "fixture.second", title: "Slow owner", kind: "system" }, definitions: [second],
    handlers: [{ ...second, handle: async () => { entered.resolve(); await release.promise; return { usages: [] }; } }] });
  t.after(disposeFirst); t.after(disposeSecond);
  const pending = read(home.host.homeActionClient(), account.connection_id);
  await entered.promise; disposeFirst(); release.resolve();
  const result = await pending;
  assert.deepEqual(result.usages, []); assert.ok(result.issues.some(issue => issue.includes("First owner")), "withdrawal is visible, not silently reported as no references");
});
