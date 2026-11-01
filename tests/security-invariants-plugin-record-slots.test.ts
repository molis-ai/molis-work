import assert from "node:assert/strict";
import test from "node:test";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { pluginBindingScope } from "@molis-ai/molis-work-service-connector-host";
import { connectionsProbe, grantConnections } from "./fixtures/connections-runtime.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// S-71 (docs/system/SECURITY-INVARIANTS.md), the page's half (T-121, FI-7b): where a plugin shows one of its records, the person reads and
// chooses that record's account through the Host's record-slot path, which calls `connectors.plugin_slot.read@2` / `bind@2` as the person
// in the project the page names. The page names the plugin, the slot and the record; the installation is the Host's to find there, a name
// more is refused, and a project with two installations of the plugin is refused rather than one picked.

const PATH = "/api/settings/connectors/plugin-slots/record";
const BEARER_VALUE = "fixture-bearer-value-for-record-slots";

test("S-71 RAC-2666 the record-slot path binds and reads a record's account as the person, the installation found by the Host, and refuses any other name", { timeout: 60_000 }, async t => {
  const records = connectionsProbe("recordslotpage", { binding: "per_record" }), whole = connectionsProbe("recordslotwhole");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [records.definition, whole.definition] } });
  const { install } = await grantConnections(f.host, records);
  const wholeInstall = (await grantConnections(f.host, whole)).install;
  const one = await f.project("Record slots one"), two = await f.project("Record slots two");
  const connection = withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: BEARER_VALUE }));
  const body = { plugin_id: records.id, slot_id: "github", service_id: "github", record_key: "src-1", connection_id: connection.connection_id };
  const query = (project: string, extra: Record<string, string> = {}) => new URLSearchParams({ project, plugin_id: records.id, slot_id: "github", record_key: "src-1", ...extra });
  const post = (project: string, value: unknown, init: { authorized?: boolean } = {}) => f.request(`${PATH}?project=${encodeURIComponent(project)}`, { method: "POST", body: value, ...init });
  const stored = (project_id: string) => withConnectorConnections(f.home, store => store.binding(pluginBindingScope({ install_id: install.install_id, project_id, record_key: "src-1" }), records.id, "github"))?.connection_id ?? null;
  const nothing = () => assert.deepEqual([stored(one.project_id), stored(two.project_id)], [null, null], "nothing was bound");

  // Refused before anything is asked: a name more in the body (an installation the page made up among them), a name missing, a query
  // name more, no such project, and a request without the page's token.
  for (const extra of [{ install_id: install.install_id }, { project_id: one.project_id }, { note: "x" }]) {
    const refused = await post(one.project_id, { ...body, ...extra });
    assert.equal(refused.status, 400, JSON.stringify(extra));
  }
  const { connection_id: _omitted, ...missing } = body;
  assert.equal((await post(one.project_id, missing)).status, 400);
  assert.equal((await f.request(`${PATH}?project=${encodeURIComponent(one.project_id)}&install_id=${install.install_id}`, { method: "POST", body })).status, 400);
  assert.equal((await f.request(`${PATH}?${query(one.project_id, { install_id: install.install_id })}`)).status, 400);
  assert.equal((await f.request(`${PATH}?${query(one.project_id)}&project=${encodeURIComponent(two.project_id)}`)).status, 400, "a name twice");
  assert.equal((await post("no-such-project", body)).status, 404);
  assert.ok([401, 403].includes((await post(one.project_id, body, { authorized: false })).status));
  // A body that is not one object is refused as a body, not taken apart.
  for (const raw of ["null", "[]", "\"text\"", "1", JSON.stringify([body])]) {
    assert.equal((await f.request(`${PATH}?project=${encodeURIComponent(one.project_id)}`, { method: "POST", raw })).status, 400, raw);
  }
  // A plugin with no installation in the project (nor in the Home) is not there to bind for: 404, and nothing is bound.
  const absent = { ...body, plugin_id: "io.molis.work.example.recordslotabsent" };
  assert.equal((await post(one.project_id, absent)).status, 404);
  assert.equal((await f.request(`${PATH}?${new URLSearchParams({ project: one.project_id, plugin_id: absent.plugin_id, slot_id: "github", record_key: "src-1" })}`)).status, 404);
  assert.equal(withConnectorConnections(f.home, store => store.binding(pluginBindingScope({ install_id: install.install_id, project_id: one.project_id, record_key: "src-1" }), absent.plugin_id, "github")), null);
  // An installation slot is not a record's: the path does not bind it (bind@2 refuses a slot not declared per_record).
  assert.equal((await post(one.project_id, { ...body, plugin_id: whole.id })).status, 400);
  assert.equal(withConnectorConnections(f.home, store => store.binding(pluginBindingScope({ install_id: wholeInstall.install_id, project_id: one.project_id, record_key: "src-1" }), whole.id, "github")), null);
  assert.equal(withConnectorConnections(f.home, store => store.binding(pluginBindingScope({ install_id: wholeInstall.install_id }), whole.id, "github")), null);
  // What the action refuses stays refused here: another service, a slot the plugin does not declare, a record key of another form.
  for (const wrong of [{ service_id: "gmail" }, { slot_id: "other" }, { record_key: "a/b" }]) {
    assert.equal((await post(one.project_id, { ...body, ...wrong })).status, 400, JSON.stringify(wrong));
  }
  nothing();

  // The person, from project one: bound there and not in project two; the answers name no credential.
  const saved = await post(one.project_id, body);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.text()).includes(BEARER_VALUE), false);
  assert.deepEqual([stored(one.project_id), stored(two.project_id)], [connection.connection_id, null]);
  const read = async (project: string) => { const response = await f.request(`${PATH}?${query(project)}`); assert.equal(response.status, 200); return await response.json() as { connection: { connection_id: string } | null }; };
  assert.equal((await read(one.project_id)).connection?.connection_id, connection.connection_id);
  assert.equal((await read(two.project_id)).connection, null);
  // A bound record is not moved to another account here: 409 and the binding as it was, until the person unbinds it.
  const other = withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: "Other GitHub", token: `${BEARER_VALUE}-other` }));
  assert.equal((await post(one.project_id, { ...body, connection_id: other.connection_id })).status, 409);
  assert.equal(stored(one.project_id), connection.connection_id);
  assert.equal((await post(one.project_id, body)).status, 200, "the same account again is no change");
  // A page that says another installation is refused, and the binding is as it was.
  assert.equal((await post(one.project_id, { ...body, install_id: "plugin-install-made-up", connection_id: null })).status, 400);
  assert.equal(stored(one.project_id), connection.connection_id);
  assert.equal((await post(one.project_id, { ...body, connection_id: null })).status, 200);
  assert.equal(stored(one.project_id), null);
});

test("S-71 RAC-2666 a project with two live installations of the plugin is refused: the Host does not pick one", { timeout: 60_000 }, async t => {
  const records = connectionsProbe("recordslottwice", { binding: "per_record" });
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [records.definition] } });
  const { install } = await grantConnections(f.host, records);
  const project = await f.project("Record slots twice");
  await f.host.withProject(project.reference, runtime => {
    const repository = new SqlitePluginRuntimeRepository(runtime.store.db);
    for (const install_id of ["record-slot-twice-a", "record-slot-twice-b"]) repository.save({ ...install, install_id });
  });
  const connection = withConnectorConnections(f.home, store => store.createToken({ serviceId: "github", displayName: "Work GitHub", token: BEARER_VALUE }));
  const body = { plugin_id: records.id, slot_id: "github", service_id: "github", record_key: "src-1", connection_id: connection.connection_id };
  const refused = await f.request(`${PATH}?project=${encodeURIComponent(project.project_id)}`, { method: "POST", body });
  assert.equal(refused.status, 409);
  const read = await f.request(`${PATH}?${new URLSearchParams({ project: project.project_id, plugin_id: records.id, slot_id: "github", record_key: "src-1" })}`);
  assert.equal(read.status, 409);
  for (const install_id of [install.install_id, "record-slot-twice-a", "record-slot-twice-b"]) {
    assert.equal(withConnectorConnections(f.home, store => store.binding(pluginBindingScope({ install_id, project_id: project.project_id, record_key: "src-1" }), records.id, "github")), null);
  }
});
