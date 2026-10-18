import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
import { pagesActions, pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";
import { backgroundProbe } from "./fixtures/plugin-background.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { queryProbe } from "./fixtures/action-query.js";

const request = (s: { origin: string; controlToken: string }, path: string, body: unknown, signal?: AbortSignal) => fetch(s.origin + path, {
  method: "POST", signal, headers: { origin: s.origin, "content-type": "application/json", "x-molis-work-control-token": s.controlToken,
    "x-molis-work-idempotency-key": randomUUID() }, body: JSON.stringify(body),
});

test("AQD-04 real catalog project HTTP retains caller for Pages; copied controls, direct routes and forged body never acquire delegation", async t => {
  const probe = queryProbe("queryhttp", "project"), s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Query HTTP", ["pages"]), client = s.host.actionClient(project.reference);
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, project_id: project.project_id, permissions: ["pages:write", "pages:read"] };
  const page = await client.invoke(caller, pagesActions.create, { title: "HTTP material", markdown: "Trusted HTTP query" }) as { document: { id: string } };
  const prefix = `/projects/${project.project_id}/api/plugins/${probe.id}`;
  const response = await request(s, `${prefix}/read`, { item_id: page.document.id });
  assert.equal(response.status, 200, await response.clone().text()); assert.match(await response.text(), /Trusted HTTP query/);
  assert.equal(probe.seen.at(-1)!.actor_id, LOCAL_PERSON_ACTOR_ID); assert.equal(probe.seen.at(-1)!.audience, "user");
  assert.equal(probe.action.action.required_actions, undefined);
  for (const reference of [pagesContentActions.read, pagesActions.get]) assert.ok(probe.seen.at(-1)!.allowed_actions?.some(item => item.capability_id === reference.capability_id && item.version === reference.version), "the real Host caller supplies both Pages references");
  for (const route of ["clone", "direct"]) {
    const rejected = await request(s, `${prefix}/${route}`, { item_id: page.document.id });
    assert.notEqual(rejected.status, 200, await rejected.clone().text());
  }
  const forged = await request(s, `${prefix}/read`, { item_id: page.document.id, project_id: "other", caller: { permissions: ["pages:read"] } });
  assert.notEqual(forged.status, 200);
});

test("AQD-04 standalone database root does not manufacture a catalog Runtime plugin entry", async t => {
  const home = await mkdtemp(join(tmpdir(), "query-root-http-")), databasePath = join(home, "project.db");
  seedDemoBoard(databasePath);
  const probe = queryProbe("queryroot", "project"), controlToken = randomUUID();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { project: [probe.definition] } });
  const root = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, databasePath,
    projectId: DEMO_PROJECT_ID, localHost: host, controlToken });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => { root.close(error => error ? reject(error) : resolve()); root.closeAllConnections(); });
    await host.close(); await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => root.listen(0, "127.0.0.1", resolve));
  const address = root.address(); assert.ok(address && typeof address === "object");
  const client = host.actionClient(molisWorkHostProjectReference({ projectId: DEMO_PROJECT_ID, databasePath }));
  const page = await client.invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: DEMO_PROJECT_ID, permissions: ["pages:write"] }, pagesActions.create,
    { title: "Root material", markdown: "Root Pages delegation" }) as { document: { id: string } };
  const response = await request({ origin: `http://127.0.0.1:${address.port}`, controlToken }, `/api/plugins/${probe.id}/read`, { item_id: page.document.id });
  // Single-database mode has no catalog project; the existing route policy refuses before any plugin action.
  assert.equal(response.status, 403); assert.equal((await response.json()).code, "actions.plugin_disabled");
  assert.equal(probe.seen.length, 0); assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});

test("AQD-04 real Home root HTTP has no project fallback and text-only input needs no Pages grant", async t => {
  const probe = queryProbe("queryhomehttp"), s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { home: [probe.definition] } } });
  await s.host.homePlugins!.ready();
  probe.target.current = pagesContentActions.list;
  const response = await request(s, `/api/plugins/${probe.id}/read`, {});
  assert.notEqual(response.status, 200);
  const text = await request(s, `/api/plugins/${probe.id}/read`, { text: "Only direct text" });
  assert.equal(text.status, 200, await text.clone().text()); assert.equal(await text.json(), "Only direct text");
});

test("AQD-04 disconnected project HTTP prevents a held delegated query result from being delivered", async t => {
  const probe = queryProbe("querydisconnect", "project"), s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Disconnect query", ["pages"]), client = s.host.actionClient(project.reference);
  await client.discover({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["pages:read"] });
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), over = Promise.withResolvers<void>(), cancelled = Promise.withResolvers<void>();
  probe.behavior.handle = async (context, caller) => {
    try { assert.ok(caller.signal); caller.signal.addEventListener("abort", () => cancelled.resolve(), { once: true }); entered.resolve(); await release.promise; const result = await context.services!.actions!.invokeQuery(pagesContentActions.list, {}); await caller.beforeEffect(); context.services!.storage!.set("delivered", JSON.stringify(result)); return result; }
    finally { over.resolve(); }
  };
  const abort = new AbortController(), pending = request(s, `/projects/${project.project_id}/api/plugins/${probe.id}/read`, {}, abort.signal), rejected = assert.rejects(pending);
  try { await Promise.race([entered.promise, pending.then(() => { throw new Error("Missed HTTP wait"); })]); abort.abort(); await cancelled.promise; await rejected; }
  finally { release.resolve(); }
  await over.promise; assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});


test("AQD-04 forged own metadata cannot drop source grants required by the actual nested target", async t => {
  const probe = queryProbe("queryforged", "project", false), s = await openTestHome(t, { catalogPolicy: false, host: { pluginFixtures: { project: [probe.definition] } } });
  const project = await s.createProject("Source grant intersection", ["pages"]), client = s.host.actionClient(project.reference);
  await client.discover({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: ["pages:read"] });
  probe.behavior.handle = async (context, caller) => {
    // The public dispatcher supplies the real child's permissions even when this query omits beforeEffect.
    const result = await client.invoke(caller, pagesContentActions.list, {});
    context.services!.storage!.set("delivered", JSON.stringify(result)); return result;
  };
  const response = await request(s, `/projects/${project.project_id}/api/plugins/${probe.id}/forged`, {});
  assert.notEqual(response.status, 200, await response.clone().text());
  assert.equal(probe.contexts.at(-1)!.services!.storage!.get("delivered"), null);
});


for (const scope of ["home", "project"] as const) test(`AQD-07 ${scope} HTTP disconnect before background acceptance creates no execution or business record`, async t => {
  const probe = backgroundProbe(`query-early-${scope}`, scope), entered = Promise.withResolvers<void>(), cancelled = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>(), over = Promise.withResolvers<void>();
  probe.behavior.beforeStart = async caller => {
    assert.ok(caller.signal); caller.signal.addEventListener("abort", () => cancelled.resolve(), { once: true });
    entered.resolve(); await release.promise;
  };
  const original = probe.definition.start;
  probe.definition.start = async context => {
    const contribution = await original(context); assert.equal(contribution.kind, "app");
    return { ...contribution, actions: contribution.actions!.map(binding => binding.capability_id !== probe.start.capability_id ? binding : { ...binding,
      handle: async (caller, input) => { try { return await binding.handle(caller, input); } finally { over.resolve(); } },
    }) };
  };
  const f = await serveHomeRuntime(t, { pluginFixtures: { [scope]: [probe.definition] } });
  const project = scope === "project" ? await f.project("Before acceptance") : undefined;
  const abort = new AbortController();
  const pending = f.request(`${project ? `/projects/${project.project_id}` : ""}/api/plugins/${probe.id}/background`, { method: "POST", body: { id: "early" }, signal: abort.signal });
  const rejected = assert.rejects(pending);
  try { await Promise.race([entered.promise, pending.then(() => { throw new Error("Missed acceptance wait"); })]); abort.abort(); await cancelled.promise; await rejected; }
  finally { release.resolve(); }
  await over.promise; assert.equal(probe.handles.length, 0); assert.equal(probe.controls.length, 0);
  assert.equal(probe.stored("result.early"), null); assert.equal(probe.stored("failure.early"), null);
});
