import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

// RAC-2520 (BL-530 precondition, T-134): the connections library keeps, per connection, the signed package it was made for: the plugin id,
// the installation it ran as (the plugin id and its verified signature) and its title. The pin is written once, with the connection, and
// the person's settings show it; a connection of a built-in or platform service has none.

const declarer = { plugin_id: "io.molis.work.example.feedprobe", install_id: "install-feedprobe-a", plugin_title: "Feed probe" };
const probeToken = (n: number) => `fixture-declarer-token-${String(n).padStart(4, "0")}`;

async function home(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "connection-declarers-")); t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("RAC-2520 a connection is pinned once to the package it was made for, the view says which, and a built-in service's connection has none", async t => {
  const directory = await home(t);
  const { made, builtin } = withConnectorConnections(directory, store => ({
    made: store.createToken({ serviceId: "example-feed", displayName: "Probe account", token: probeToken(1) }),
    builtin: store.createToken({ serviceId: "github", displayName: "GitHub account", token: probeToken(2) }),
  }));
  withConnectorConnections(directory, store => {
    assert.equal(store.declarers.get(made.connection_id), null, "a connection is pinned to nothing until it is pinned");
    assert.equal("declared_by" in store.view(made), false);
    store.declarers.pin(made.connection_id, declarer);
    assert.deepEqual(store.declarers.get(made.connection_id), declarer);
    assert.deepEqual(store.view(store.require(made.connection_id)).declared_by, { plugin_id: declarer.plugin_id, title: declarer.plugin_title });
    assert.equal(JSON.stringify(store.view(made)).includes(declarer.install_id), false, "the view names the package, never the installation");
    assert.equal(store.declarers.get(builtin.connection_id), null);
    assert.equal("declared_by" in store.view(builtin), false, "a built-in service's connection shows no package");
  });
});

test("RAC-2520 a pin is written once: a second pin is refused whatever it names, and a connection that is not there or a blank pin is refused", async t => {
  const directory = await home(t);
  const made = withConnectorConnections(directory, store => store.createToken({ serviceId: "example-feed", displayName: "Probe account", token: probeToken(3) }));
  withConnectorConnections(directory, store => {
    store.declarers.pin(made.connection_id, declarer);
    const refused = { code: "connector.connection.invalid" };
    assert.throws(() => store.declarers.pin(made.connection_id, declarer), refused, "the same pin again");
    assert.throws(() => store.declarers.pin(made.connection_id, { ...declarer, install_id: "install-feedprobe-b" }), refused, "another installation");
    assert.deepEqual(store.declarers.get(made.connection_id), declarer, "the first pin stays");
    const other = store.createToken({ serviceId: "example-feed", displayName: "Second account", token: probeToken(4) });
    for (const blank of [{ ...declarer, install_id: "" }, { ...declarer, plugin_id: " " }, { ...declarer, plugin_title: "" }]) {
      assert.throws(() => store.declarers.pin(other.connection_id, blank), refused, JSON.stringify(blank));
    }
    assert.equal(store.declarers.get(other.connection_id), null, "a refused pin leaves the connection unpinned");
    assert.throws(() => store.declarers.pin(randomUUID(), declarer), { code: "connector.connection.not_found" });
  });
});

test("RAC-2520 removing a connection keeps its pin with the record, and the table is the library's own", async t => {
  const directory = await home(t);
  const made = withConnectorConnections(directory, store => {
    const connection = store.createToken({ serviceId: "example-feed", displayName: "Probe account", token: probeToken(5) });
    store.declarers.pin(connection.connection_id, declarer);
    store.remove(connection.connection_id);
    return connection;
  });
  const db = new DatabaseSync(homeSqlitePath(directory, "connectors"));
  t.after(() => { if (db.isOpen) db.close(); });
  const rows = db.prepare("SELECT connection_id, plugin_id, install_id, plugin_title FROM connector_connection_declarers").all();
  assert.deepEqual(rows.map(row => ({ ...row })), [{ connection_id: made.connection_id, ...declarer }], "the soft-deleted record keeps its pin");
});

test("RAC-2520 a connection and its pin are written in one transaction: when the pin cannot be written no connection is left behind", async t => {
  const directory = await home(t);
  withConnectorConnections(directory, () => undefined);
  const db = new DatabaseSync(homeSqlitePath(directory, "connectors"));
  t.after(() => { if (db.isOpen) db.close(); });
  // The connection row goes in first; a refusal on the pin's insert must take it back out.
  db.exec("CREATE TRIGGER refuse_pin BEFORE INSERT ON connector_connection_declarers BEGIN SELECT RAISE(ABORT, 'pin refused'); END");
  assert.throws(() => withConnectorConnections(directory, store =>
    store.createToken({ serviceId: "example-feed", displayName: "Probe account", token: probeToken(6) }, declarer)), /pin refused/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM connector_connections").get() as { n: number }).n, 0, "no connection without its pin");
  db.exec("DROP TRIGGER refuse_pin");
  const made = withConnectorConnections(directory, store => store.createToken({ serviceId: "example-feed", displayName: "Probe account", token: probeToken(7) }, declarer));
  withConnectorConnections(directory, store => assert.deepEqual(store.declarers.get(made.connection_id), declarer, "the same write works once the pin can be written"));
});
