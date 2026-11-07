import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { activateConnectorConnection, connectorManagementActions, pluginSlotScope, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { connectionsProbe, grantConnections } from "./fixtures/connections-runtime.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-143 (docs/system/SECURITY-INVARIANTS.md), the Host's half of the in-place connection card (specs/assistant-service-connections/spec.md
// §13.5 C2, C3; ASC-68): the trusted shell writes through `POST /api/host/plugin-page-connection` with the outer document's page header.
// The body names one target of the page's own installation and the person's choice; the installation, plugin, project, person and
// service come from the page's authority and the Manifest. Every refusal below asserts that the bindings, the connections (with their
// address pins) and the authorization records are exactly as they were. The browser half (forged frame messages, click-jacking, the
// card's height) is the next slice's, in `tests/security-invariants-connection-card.e2e.test.ts`.

const PATH = "/api/host/plugin-page-connection";
const BEARER_VALUE = "fixture-bearer-value-for-connection-card";
const IMAGE_KEY = "fixture-image-key-for-connection-card";
const MANAGEMENT = ["connectors:management:read", "connectors:management:write"];

/** A Home plugin with image generation (`image_generation`), and one action that binds its `cover` target at an address it names. */
function imageProbe(name: string) {
  const id = `io.molis.work.example.${name}`, declaration = { store_name: name, read_permission: `${name}:read`, write_permission: `${name}:write`, generate_permission: `${name}:generate` };
  const permissions = ["storage:private", "model:invoke", declaration.read_permission, declaration.write_permission, declaration.generate_permission];
  const contexts: PluginStartContext[] = [];
  const rebind: ActionDefinition<{ base_url: string; connection_id: string }, { bound: true }> = { capability_id: `${name}.rebind`, version: 1, operation: "command", action: {
    title: "rebind", description: "以给定地址绑定封面的图片连接", scope: "home", kind: "operation", subject_kinds: [], audiences: ["user"], permissions: [declaration.write_permission],
    input_schema: { type: "object", properties: { base_url: { type: "string" }, connection_id: { type: "string" } }, required: ["base_url", "connection_id"], additionalProperties: false } } };
  const definition: PluginDefinition = { manifest: {
    schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `connection-card-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "连接卡测试声明" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [rebind], image_generation: declaration,
    // The image namespace is a store the Home registers as this plugin's own; a fixture's library is how a test gets one.
    databases: { home: { store_name: name, version: 1, read_permission: declaration.read_permission, write_permission: declaration.write_permission,
      schema: "CREATE TABLE covers (id INTEGER PRIMARY KEY);" } },
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [{ ...rebind, handle: async (_caller, input) => {
      const { base_url, connection_id } = input as { base_url: string; connection_id: string };
      await context.services!.imageGeneration!.bind({ slot_id: "cover", base_url }, connection_id); return { bound: true };
    } }] };
  } };
  return { id, definition, permissions, contexts, rebind, declaration };
}

/** Every record a card could write: bindings, connections (state and revision), address pins and authorization records. */
function records(home: string): string {
  const path = homeSqlitePath(home, "connectors");
  // No store yet is the same as an empty one: opening the store to read creates its tables, which is no record.
  if (!existsSync(path)) return JSON.stringify([[], [], [], []]);
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return JSON.stringify(["SELECT scope_id, plugin_id, slot_id, connection_id FROM connector_bindings ORDER BY 1, 2, 3",
      "SELECT connection_id, service_id, enabled, disconnected_at, updated_at FROM connector_connections ORDER BY 1",
      "SELECT connection_id, origin FROM connector_connection_targets ORDER BY 1", "SELECT id, status FROM connector_authorization_results ORDER BY 1"]
      .map(sql => db.prepare(sql).all()));
  } finally { db.close(); }
}

/** Grants an installed Home fixture these permissions, as the person would, and restarts it so its pages carry them. */
async function grant(host: Awaited<ReturnType<typeof serveHomeRuntime>>["host"], plugin_id: string, permissions: readonly string[]) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(plugin_id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, [...permissions]);
  await platform.supervisor.restart(plugin_id);
  return platform.runtime.get(install.install_id)!;
}

async function cardHome(t: TestContext) {
  const recordsProbe = connectionsProbe("cardrecords", { binding: "per_record" }), whole = connectionsProbe("cardwhole"), second = connectionsProbe("cardsecond");
  const ungranted = connectionsProbe("cardungranted"), ungrantedRecords = connectionsProbe("cardungrantedrecords", { binding: "per_record" });
  const images = imageProbe("cardimages"), imagesUngranted = imageProbe("cardimagesungranted");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [recordsProbe.definition, whole.definition, second.definition, ungranted.definition,
    ungrantedRecords.definition, images.definition, imagesUngranted.definition] } });
  const installs = { records: (await grantConnections(f.host, recordsProbe)).install, whole: (await grantConnections(f.host, whole)).install,
    second: (await grantConnections(f.host, second)).install, images: await grant(f.host, images.id, images.permissions) };
  const project = await f.project("Connection card"), other = await f.project("Connection card elsewhere");
  const prefix = `/projects/${project.project_id}`;
  const open = async (plugin_id: string) => {
    const opened = await f.request(prefix + "/api/host/plugin-pages", { method: "POST", body: { plugin_id } });
    assert.equal(opened.status, 200, await opened.clone().text());
    return (await opened.json() as { page_id: string }).page_id;
  };
  const card = (page_id: string, body: unknown, headers: Record<string, string> = { "x-molis-context-page": page_id }, path = prefix + PATH) =>
    f.request(path, { method: "POST", headers, body });
  const token = (displayName: string, serviceId = "github") => withConnectorConnections(f.home, store => store.createToken({ serviceId, displayName, token: `${BEARER_VALUE}-${displayName}` }));
  const recordScope = (record_key: string) => pluginBindingScope({ install_id: installs.records.install_id, project_id: project.project_id, record_key });
  const bound = (scope: string, plugin_id: string, slot = "github") => withConnectorConnections(f.home, store => store.binding(scope, plugin_id, slot)?.connection_id ?? null);
  return { f, project, other, prefix, open, card, token, recordScope, bound, installs, probes: { records: recordsProbe, whole, second, ungranted, ungrantedRecords, images, imagesUngranted } };
}

async function refusedWith(response: Response, status: number, code: string) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  assert.equal((JSON.parse(text) as { code?: string }).code, code, text);
}

test("S-143 ASC-68 C3-1 a target the installation does not declare, or holds no grant for, draws no card and writes nothing", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), account = c.token("Work GitHub");
  const pages = { records: await c.open(c.probes.records.id), whole: await c.open(c.probes.whole.id), ungranted: await c.open(c.probes.ungranted.id),
    ungrantedRecords: await c.open(c.probes.ungrantedRecords.id), imagesUngranted: await c.open(c.probes.imagesUngranted.id) };
  const before = records(c.f.home);
  const slot = (record_key?: string, slot_id = "github") => ({ kind: "slot", slot_id, ...(record_key === undefined ? {} : { record_key }) });
  const image = { kind: "image", slot_id: "cover", base_url: "https://images.example.test/v1" };
  for (const [page, target, code] of [
    [pages.records, slot("source-1", "other"), "host.connection_need.target_undeclared"],
    // A per_record slot names its record; an installation slot names none (S-71). Another installation's slot is unreachable: the
    // installation is the page's, so the installation page asking the record plugin's per_record shape is simply not declared.
    [pages.records, slot(), "host.connection_need.target_undeclared"],
    [pages.whole, slot("source-1"), "host.connection_need.target_undeclared"],
    [pages.records, image, "host.connection_need.target_undeclared"],
    [pages.ungranted, slot(), "host.connection_need.not_granted"],
    [pages.imagesUngranted, image, "host.connection_need.not_granted"],
  ] as const) {
    for (const body of [{ operation: "read", target }, { operation: "bind", target, connection_id: account.connection_id }, { operation: "prepare", target }]) {
      await refusedWith(await c.card(page, body), 403, code);
    }
  }
  // A record key of another form is not a target at all (S-71).
  await refusedWith(await c.card(pages.records, { operation: "bind", target: slot("a/b"), connection_id: account.connection_id }), 400, "actions.input_invalid");
  await refusedWith(await c.card(pages.ungrantedRecords, { operation: "bind", target: slot("source-1"), connection_id: account.connection_id }), 403, "host.connection_need.not_granted");
  // The record picker (`connectionSlot`) asks the grant too now, not only the declaration: an ungranted installation has no account to choose.
  for (const body of [{ mode: "read", slot_id: "github", record_key: "source-1" }, { mode: "bind", slot_id: "github", record_key: "source-1", connection_id: account.connection_id }]) {
    await refusedWith(await c.card(pages.ungrantedRecords, body, undefined, `${c.prefix}/api/host/plugin-page-slot`), 403, "actions.forbidden");
  }
  assert.equal(records(c.f.home), before, "no binding, connection, pin or authorization was written");
});

test("S-143 ASC-68 C3-3 only the outer document's page header reaches the card route, and its input names only the target and the person's choice", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), account = c.token("Work GitHub"), page = await c.open(c.probes.records.id);
  const target = { kind: "slot", slot_id: "github", record_key: "source-1" }, bind = { operation: "bind", target, connection_id: account.connection_id };
  const before = records(c.f.home);
  // The child's fetch bridge carries `x-molis-plugin-page` and drops the outer header; neither it, nor both, nor none reach the route.
  for (const headers of [{}, { "x-molis-plugin-page": page }, { "x-molis-context-page": page, "x-molis-plugin-page": page }]) {
    assert.equal((await c.card(page, bind, headers)).status, 403, JSON.stringify(headers));
  }
  // The page's project only: the same page from another project's path is refused.
  assert.equal((await c.card(page, bind, undefined, `/projects/${c.other.project_id}${PATH}`)).status, 403);
  // Who and what come from the page and the Manifest: a name more in the body or in the target is refused, not dropped.
  for (const extra of [{ install_id: c.installs.records.install_id }, { plugin_id: c.probes.records.id }, { service_id: "gmail" }, { project_id: c.other.project_id },
    { base_url: "https://evil.example.test" }, { endpoint: "https://evil.example.test" }, { actor_id: "someone" }]) {
    await refusedWith(await c.card(page, { ...bind, ...extra }), 400, "actions.input_invalid");
    await refusedWith(await c.card(page, { ...bind, target: { ...target, ...extra } }), 400, "actions.input_invalid");
  }
  for (const body of [null, [], "bind", { ...bind, operation: "unbind" }, { operation: "bind", target }, { operation: "read", target, connection_id: account.connection_id },
    { ...bind, connection_id: "Not An Id" }, { operation: "save_key", target }, { ...bind, target: { kind: "account", slot_id: "github" } }]) {
    await refusedWith(await c.card(page, body), 400, "actions.input_invalid");
  }
  assert.equal(records(c.f.home), before, "nothing was written by any refused request");
});

test("S-143 ASC-68 C3-6 a key saved on the card goes only to the origin the card showed", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), page = await c.open(c.probes.images.id);
  const target = { kind: "image", slot_id: "cover", base_url: "https://images.example.test/v1" };
  const before = records(c.f.home);
  // An address the image service would not send to is refused before anything is stored.
  for (const base_url of ["http://images.example.test/v1", "https://user:pass@images.example.test/v1", "https://images.example.test/v1?key=x", "not a url"]) {
    await refusedWith(await c.card(page, { operation: "save_key", target: { ...target, base_url }, api_key: IMAGE_KEY }), 400, "host.image_target_invalid");
  }
  assert.equal(records(c.f.home), before);
  const saved = await c.card(page, { operation: "save_key", target, api_key: IMAGE_KEY });
  const text = await saved.text(); assert.equal(saved.status, 200, text);
  assert.equal(text.includes(IMAGE_KEY), false, "the key never comes back");
  const answer = JSON.parse(text) as { origin: string; connection: { connection_id: string; state: string } };
  assert.equal(answer.origin, "https://images.example.test");
  assert.equal(answer.connection.state, "connected");
  const id = answer.connection.connection_id;
  assert.equal(withConnectorConnections(c.f.home, store => store.targetOrigin(id)), "https://images.example.test", "the key is pinned to the origin the card showed");
  assert.equal(c.bound("home", c.probes.images.declaration.store_name, "cover"), id);
  // The plugin then binds the same connection at another address: refused by the pin, and the target there stays unbound.
  const pinned = records(c.f.home), caller = person(c.probes.images.permissions);
  await assert.rejects(c.f.host.homeActionClient().invoke(caller, c.probes.images.rebind, { base_url: "https://elsewhere.example.test/v1", connection_id: id }),
    { code: "connector.connection.service_mismatch" });
  // The card refuses the same: a connection pinned to another origin is not put on this target.
  const elsewhere = { ...target, base_url: "https://elsewhere.example.test/v1" };
  await refusedWith(await c.card(page, { operation: "bind", target: elsewhere, connection_id: id }), 400, "connector.connection.service_mismatch");
  assert.equal(records(c.f.home), pinned, "the key did not go anywhere else");
  // A key that still works is not replaced from the card, and an image target is not logged in to or switched.
  await refusedWith(await c.card(page, { operation: "save_key", target, api_key: `${IMAGE_KEY}-2` }), 409, "host.connection_need.account_bound");
  await refusedWith(await c.card(page, { operation: "prepare", target }), 400, "host.connection_need.operation_unsupported");
  await refusedWith(await c.card(page, { operation: "switch", target, connection_id: id }), 400, "host.connection_need.operation_unsupported");
  assert.equal(records(c.f.home), pinned);
});

test("S-143 ASC-68 C3-7 S-108 switching moves only this place to the other account; the page cannot ask for it", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), first = c.token("First"), second = c.token("Second"), mail = c.token("Mail", "gmail");
  const wholePage = await c.open(c.probes.whole.id), recordsPage = await c.open(c.probes.records.id);
  const whole = { kind: "slot", slot_id: "github" }, record = (record_key: string) => ({ kind: "slot", slot_id: "github", record_key });
  assert.equal((await c.card(wholePage, { operation: "bind", target: whole, connection_id: first.connection_id })).status, 200);
  for (const key of ["source-1", "source-2"]) assert.equal((await c.card(recordsPage, { operation: "bind", target: record(key), connection_id: first.connection_id })).status, 200);
  // Another installation uses the first account too: a use the card at this place must not move.
  withConnectorConnections(c.f.home, store => store.bind({ scopeId: pluginSlotScope(c.installs.second.install_id), pluginId: c.probes.second.id, slotId: "github", serviceId: "github", connectionId: first.connection_id }));
  // The first account stops working; the person logs in and comes back as the second.
  withConnectorConnections(c.f.home, store => store.disconnect(first.connection_id));
  const wholeScope = pluginSlotScope(c.installs.whole.install_id), secondScope = pluginSlotScope(c.installs.second.install_id);
  const uses = () => [c.bound(wholeScope, c.probes.whole.id), c.bound(secondScope, c.probes.second.id), c.bound(c.recordScope("source-1"), c.probes.records.id), c.bound(c.recordScope("source-2"), c.probes.records.id)];
  assert.deepEqual(uses(), Array(4).fill(first.connection_id));
  const before = records(c.f.home);
  // The plugin's own page cannot ask for a switch; nor can the card move to another service's account, or bind over a bound place.
  assert.equal((await c.card(wholePage, { operation: "switch", target: whole, connection_id: second.connection_id }, { "x-molis-plugin-page": wholePage })).status, 403);
  await refusedWith(await c.card(wholePage, { operation: "switch", target: whole, connection_id: mail.connection_id }), 409, "host.connection_need.account_unusable");
  await refusedWith(await c.card(wholePage, { operation: "bind", target: whole, connection_id: second.connection_id }), 409, "host.connection_need.account_bound");
  assert.equal(records(c.f.home), before);
  // Switched through `connectors.plugin_slot.switch@1` with the usage the Host derives: only this installation's slot moves.
  const switched = await c.card(wholePage, { operation: "switch", target: whole, connection_id: second.connection_id });
  assert.equal(switched.status, 200, await switched.clone().text());
  assert.deepEqual(uses(), [second.connection_id, first.connection_id, first.connection_id, first.connection_id]);
  // A record is one record: the other record of the same slot keeps its account.
  assert.equal((await c.card(recordsPage, { operation: "switch", target: record("source-1"), connection_id: second.connection_id })).status, 200);
  assert.deepEqual(uses(), [second.connection_id, first.connection_id, second.connection_id, first.connection_id]);
});

test("S-143 ASC-68 C3-8 after the page is closed or its plugin restarted, the person's click binds nothing; a late login only leaves the connection", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), account = c.token("Work GitHub");
  const target = { kind: "slot", slot_id: "github", record_key: "source-1" }, bind = { operation: "bind", target, connection_id: account.connection_id };
  const closed = await c.open(c.probes.records.id);
  assert.equal((await c.f.request(`${c.prefix}/api/host/plugin-pages/${closed}`, { method: "DELETE", body: {} })).status, 200);
  const restarted = await c.open(c.probes.records.id);
  await grantConnections(c.f.host, c.probes.records);
  const before = records(c.f.home);
  for (const page of [closed, restarted]) {
    for (const body of [bind, { operation: "read", target }, { operation: "prepare", target }]) assert.equal((await c.card(page, body)).status, 403);
  }
  assert.equal(records(c.f.home), before, "no binding and no authorization from a page that is gone");
  // The login the person started from the card finishes after it is gone: the connection is saved, and is put on no place.
  const late = activateConnectorConnection(c.f.home, { kind: "token", input: { serviceId: "github", displayName: "Late GitHub", token: `${BEARER_VALUE}-late`, accountLabel: null } });
  assert.ok(late.connection_id);
  assert.equal(c.bound(c.recordScope("source-1"), c.probes.records.id), null);
  assert.deepEqual(withConnectorConnections(c.f.home, store => store.pluginBindings(late.connection_id)), []);
});

test("S-143 ASC-68 C3-9 asking for a card writes nothing, and a cancelled login leaves no binding", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), page = await c.open(c.probes.records.id);
  const target = { kind: "slot", slot_id: "github", record_key: "source-1" };
  const before = records(c.f.home);
  // Reading the target is all a card asks before the person presses anything.
  const read = await c.card(page, { operation: "read", target });
  assert.equal(read.status, 200, await read.clone().text());
  assert.deepEqual(await read.json(), { service_id: "github", connection: null });
  assert.equal(records(c.f.home), before, "asking writes no record");
  // The person presses 连接, then 取消: the authorization prepared as the person in this project is cancelled, and nothing is bound.
  const prepared = await c.card(page, { operation: "prepare", target });
  assert.equal(prepared.status, 200, await prepared.clone().text());
  const { authorization } = await prepared.json() as { authorization: { authorization_id: string; status: string } };
  assert.equal(authorization.status, "prepared");
  const cancelled = await c.f.host.actionClient(c.project.reference).invoke(person(MANAGEMENT, c.project.project_id), connectorManagementActions.cancel, { authorization_id: authorization.authorization_id }) as { status: string };
  assert.equal(cancelled.status, "cancelled");
  assert.equal(c.bound(c.recordScope("source-1"), c.probes.records.id), null);
  assert.deepEqual(withConnectorConnections(c.f.home, store => store.pluginBindings()), [], "no binding anywhere");
});

test("S-143 ASC-68 C3-10 connecting, choosing, logging in again and enabling each write once", { timeout: 120_000 }, async t => {
  const c = await cardHome(t), first = c.token("First"), second = c.token("Second");
  const recordsPage = await c.open(c.probes.records.id), imagesPage = await c.open(c.probes.images.id);
  const target = { kind: "slot", slot_id: "github", record_key: "source-1" };
  const count = (sql: string) => { const db = new DatabaseSync(homeSqlitePath(c.f.home, "connectors"), { readOnly: true }); try { return (db.prepare(sql).get() as { n: number }).n; } finally { db.close(); } };
  // Choosing an account: bound once; the same again is no write; another one over it is refused (a change is a switch).
  const chosen = await c.card(recordsPage, { operation: "bind", target, connection_id: first.connection_id });
  const text = await chosen.text(); assert.equal(chosen.status, 200, text);
  assert.equal(text.includes(BEARER_VALUE), false);
  assert.deepEqual(Object.keys((JSON.parse(text) as { connection: object }).connection).sort(), ["auth_method", "connection_id", "label", "state"]);
  assert.equal(c.bound(c.recordScope("source-1"), c.probes.records.id), first.connection_id);
  const once = records(c.f.home);
  assert.equal((await c.card(recordsPage, { operation: "bind", target, connection_id: first.connection_id })).status, 200);
  assert.equal(records(c.f.home), once, "the same choice again writes nothing");
  await refusedWith(await c.card(recordsPage, { operation: "bind", target, connection_id: second.connection_id }), 409, "host.connection_need.account_bound");
  // Logging in again: only the account this place uses, one authorization record each time.
  const authorizations = count("SELECT COUNT(*) AS n FROM connector_authorization_results");
  await refusedWith(await c.card(recordsPage, { operation: "prepare", target, connection_id: second.connection_id }), 409, "host.connection_need.account_bound");
  const again = await c.card(recordsPage, { operation: "prepare", target, connection_id: first.connection_id });
  assert.equal(again.status, 200, await again.clone().text());
  assert.equal(count("SELECT COUNT(*) AS n FROM connector_authorization_results"), authorizations + 1);
  // Connecting in place, at a place with no account yet: one authorization record.
  assert.equal((await c.card(recordsPage, { operation: "prepare", target: { ...target, record_key: "source-2" } })).status, 200);
  assert.equal(count("SELECT COUNT(*) AS n FROM connector_authorization_results"), authorizations + 2);
  // Enabling the account the person disabled: once; a second press writes nothing.
  withConnectorConnections(c.f.home, store => store.setEnabled(first.connection_id, false));
  const enabled = await c.card(recordsPage, { operation: "enable", target });
  assert.equal(enabled.status, 200, await enabled.clone().text());
  assert.equal(withConnectorConnections(c.f.home, store => store.get(first.connection_id)?.enabled), true);
  const afterEnable = records(c.f.home);
  assert.equal((await c.card(recordsPage, { operation: "enable", target })).status, 200);
  assert.equal(records(c.f.home), afterEnable);
  // A key typed on an image card: one connection, one pin, one binding.
  const imageConnections = count("SELECT COUNT(*) AS n FROM connector_connections WHERE service_id = 'image-api'");
  const image = { kind: "image", slot_id: "cover", base_url: "https://images.example.test/v1" };
  assert.equal((await c.card(imagesPage, { operation: "save_key", target: image, api_key: IMAGE_KEY })).status, 200);
  assert.equal(count("SELECT COUNT(*) AS n FROM connector_connections WHERE service_id = 'image-api'"), imageConnections + 1);
  assert.equal(count("SELECT COUNT(*) AS n FROM connector_connection_targets"), 1);
  assert.notEqual(c.bound("home", c.probes.images.declaration.store_name, "cover"), null);
});
