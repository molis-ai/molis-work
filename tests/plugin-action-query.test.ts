import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions, pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { openTestHome } from "./fixtures/test-home.js";
import { queryProbe } from "./fixtures/action-query.js";

async function setup(t: TestContext, probe = queryProbe(), grant = true) {
  const served = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [probe.definition] } } });
  const project = await served.createProject("Query material", ["pages"]);
  const platform = await served.host.homePlugins!.ready(), install = served.host.homePlugins!.installation(probe.id)!;
  if (grant) { await platform.runtime.stop(install.install_id); platform.runtime.grant(install.install_id, probe.definition.manifest.permissions.map(row => row.permission)); await platform.supervisor.restart(probe.id); }
  const client = served.host.actionClient(project.reference);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["storage:private", "pages:read", "pages:write"] };
  const page = await client.invoke(caller, pagesActions.create, { title: "Original material", markdown: "Actual Pages body" }) as { document: { id: string } };
  return { ...served, project, platform, install, client, caller, page: page.document, probe,
    read: (current: ActionCallContext = caller) => client.invoke(current, probe.action, { item_id: page.document.id }) };
}

test("AQD-01/AQD-06 real Runtime delegation reads Pages content and nested get/list with the original actor, project and audience", async t => {
  const s = await setup(t);
  const refs = [s.probe.action, pagesContentActions.read, pagesActions.get, pagesContentActions.list, pagesActions.list];
  const result = await s.read({ ...s.caller, actor_id: "runtime:query", audience: "agent", allowed_actions: refs }) as { body: string };
  assert.match(result.body, /Actual Pages body/);
  assert.equal(s.probe.seen.at(-1)!.actor_id, "runtime:query"); assert.equal(s.probe.seen.at(-1)!.project_id, s.project.project_id); assert.equal(s.probe.seen.at(-1)!.audience, "agent");
  s.probe.target.current = pagesContentActions.list;
  const listed = await s.client.invoke({ ...s.caller, allowed_actions: refs }, s.probe.action, {}) as Array<{ item_id: string }>;
  assert.ok(listed.some(row => row.item_id === s.page.id));
  const noPages = { ...s.caller, permissions: ["storage:private"], allowed_actions: [s.probe.action] };
  assert.equal(await s.client.invoke(noPages, s.probe.action, { text: "Direct input" }), "Direct input");
});

for (const missing of ["caller-permission", "direct-ref", "nested-ref", "source-grant", "source-declaration", "consumes"] as const) {
  test(`AQD-01 ${missing} refuses query delegation without delivering or storing content`, async t => {
    const probe = queryProbe(`query-${missing}`, "home", missing !== "source-declaration", missing !== "consumes");
    const s = await setup(t, probe, missing !== "source-grant");
    const caller = { ...s.caller, permissions: missing === "caller-permission" ? ["storage:private"] : s.caller.permissions,
      allowed_actions: [probe.action, ...(missing === "direct-ref" ? [] : [pagesContentActions.read]), ...(missing === "nested-ref" ? [] : [pagesActions.get])] };
    await assert.rejects(s.read(caller));
    assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
  });
}

test("AQD-02/AQD-07 no action scope, a finished inherited scope, and a different installation cannot delegate", async t => {
  const probe = queryProbe(), other = queryProbe("otherquery");
  const served = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [probe.definition, other.definition] } } });
  await served.host.homePlugins!.ready();
  await assert.rejects(probe.contexts.at(-1)!.services!.actions!.invokeQuery(pagesContentActions.list, {}), { code: "actions.forbidden" });
  const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: null, permissions: ["storage:private"] };
  probe.behavior.handle = async () => other.contexts.at(-1)!.services!.actions!.invokeQuery(pagesContentActions.list, {});
  await assert.rejects(served.host.homeActionClient().invoke(caller, probe.action, {}), { code: "actions.forbidden" });
  const release = Promise.withResolvers<void>(); let late: Promise<unknown> | undefined;
  probe.behavior.handle = async context => { late = release.promise.then(() => context.services!.actions!.invokeQuery(pagesContentActions.list, {})); return "done"; };
  assert.equal(await served.host.homeActionClient().invoke(caller, probe.action, {}), "done");
  release.resolve(); await assert.rejects(late!, { code: "actions.expired" });
});

for (const mutation of ["source-stop", "source-grant", "target-replace", "parent-revoke", "cancel"] as const) {
  test(`AQD-02 ${mutation} while query waits prevents result delivery`, async t => {
    const s = await setup(t), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const target: ActionDefinition = { capability_id: "query.target", version: 1, operation: "query", action: { title: "Held query", description: "Read while authority changes", kind: "query", scope: "project", audiences: ["user", "agent", "mcp"], permissions: ["pages:read"], subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "string" } } };
    s.probe.target.current = target;
    const registration = { provider: { provider_id: "query-provider", title: "Query provider", kind: "system" as const }, definitions: [target], handlers: [{ ...target, handle: async () => { entered.resolve(); await release.promise; return "late content"; } }] };
    let remove = s.host.actionRegistry(s.project.reference).registerProvider(registration), active = true;
    const abort = new AbortController();
    const pending = s.read({ ...s.caller, signal: abort.signal, assert_authority_current: () => { if (!active) throw new ActionError("actions.forbidden", "Origin revoked"); } });
    const rejected = assert.rejects(pending);
    try {
      await Promise.race([entered.promise, pending.then(() => { throw new Error("Missed query wait"); })]);
      if (mutation === "source-stop") await s.platform.runtime.stop(s.install.install_id);
      if (mutation === "source-grant") { await s.platform.runtime.stop(s.install.install_id); s.platform.runtime.grant(s.install.install_id, ["storage:private"]); }
      if (mutation === "target-replace") { remove(); remove = s.host.actionRegistry(s.project.reference).registerProvider(registration); }
      if (mutation === "parent-revoke") active = false;
      if (mutation === "cancel") abort.abort();
    } finally { release.resolve(); }
    await rejected; remove();
    if (mutation === "source-stop" || mutation === "source-grant") await s.platform.supervisor.restart(s.probe.id);
    assert.equal(s.probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
  });
}

for (const target of ["query.command", "query.missing", "version", "provider", "schema"] as const) test(`AQD-03 ${target} cannot redirect or alter the registered query contract`, async t => {
  const s = await setup(t); let commands = 0;
  const command: ActionDefinition = { capability_id: "query.command", version: 1, operation: "command", action: { title: "Command", description: "Must never execute via delegation", kind: "operation", scope: "project", audiences: ["user", "agent", "mcp"], permissions: ["pages:read"], subject_kinds: [], input_schema: { type: "object" } } };
  s.host.actionRegistry(s.project.reference).registerProvider({ provider: { provider_id: "command", title: "Command", kind: "system" }, definitions: [command], handlers: [{ ...command, handle: () => ++commands }] });
  if (target === "version") s.probe.target.current = { ...pagesContentActions.read, version: 999 };
  else if (target === "provider") s.probe.target.current = { ...pagesContentActions.read, provider_id: "wrong" };
  else if (target === "schema") s.probe.target.current = { ...pagesContentActions.read, action: { ...pagesContentActions.read.action, input_schema: {} } } as typeof pagesContentActions.read;
  else s.probe.target.current = { ...command, capability_id: target, operation: "query" };
  if (target === "schema") await assert.rejects(s.client.invoke(s.caller, s.probe.action, {})); else await assert.rejects(s.read());
  assert.equal(commands, 0); assert.equal(s.probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});


test("AQD-07 Home start may await action discovery without re-entering its own ready operation", { timeout: 15_000 }, async t => {
  const probe = queryProbe("querystart"), original = probe.definition.start; let discovered = false;
  probe.definition.start = async context => { await context.services!.actions!.discover(); discovered = true; return original(context); };
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [probe.definition] } } });
  await s.host.homePlugins!.ready(); assert.equal(discovered, true);
  assert.equal(s.host.homePlugins!.installation(probe.id)!.state, "running");
});


test("AQD-01/AQD-06 autonomous own invocation cannot manufacture user query authority from consumes and grants", async t => {
  const probe = queryProbe("queryautonomous", "project");
  const s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Autonomous query", ["pages"]);
  const page = await s.host.actionClient(project.reference).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: project.project_id, permissions: ["pages:write"] },
    pagesActions.create, { title: "Available material", markdown: "Must not borrow the owner" }) as { document: { id: string } };
  const context = probe.contexts.at(-1)!;
  assert.ok(context.grants.includes("pages:read")); assert.equal(probe.action.action.required_actions, undefined);
  await assert.rejects(context.services!.actions!.invoke(probe.action, { item_id: page.document.id }), { code: "actions.dependency_missing" });
  assert.equal(probe.seen.at(-1)!.project_id, project.project_id);
  assert.ok(probe.seen.at(-1)!.allowed_actions?.every(item => item.capability_id === probe.action.capability_id));
  assert.equal(context.services!.storage!.get("delivered"), null);
  assert.equal(await context.services!.actions!.invoke(probe.action, { text: "Autonomous direct text" }), "Autonomous direct text");
});
