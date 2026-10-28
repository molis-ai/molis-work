import { connectorControl } from "./fixtures/connector-control.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogConnector, DEMO_PROJECT_ID, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { catalogWhoami, createCatalogProvider } from "@molis-ai/molis-work-integration-catalog";
import { withIntegrationHome } from "./fixtures/integration-home.js";

const AT = "2026-08-30T10:00:00.000Z";
const FIXTURE = "dummy-fixture-token+/=?";
const json = (value: unknown, init?: ResponseInit) => new Response(JSON.stringify(value), init);
const tokenFor = (service: string, origin: string) => service === "salesforce" ? `${origin}|${FIXTURE}` : `${origin}|person@example.com|${FIXTURE}`;

test("W2-18-CATALOG-01 + W2-18-CATALOG-02: Host-managed token connections reject non-Cloud destinations before health, whoami or sync can dispatch", async () => {
  await withIntegrationHome(async home => {
    for (const service of ["jira", "confluence", "salesforce"]) {
      const suffix = service === "salesforce" ? "my.salesforce.com" : "atlassian.net";
      for (const origin of ["http://127.0.0.1", "http://cloud." + suffix, "https://localhost", "https://10.0.0.1", "https://[::1]",
        `https://cloud.${suffix}.evil.example`, `https://cloud.${suffix}@evil.example`, `https://evil.example@cloud.${suffix}`,
        `https://cloud.${suffix}:443`, `https://cloud.${suffix}/api`, `https://cloud.${suffix}?token=${FIXTURE}`, `https://cloud.${suffix}#x`,
        `https://cloud.${suffix}\\@evil.example`, `https://cloud.${suffix}.`, `https://-cloud.${suffix}`]) {
        let dispatched = 0;
        const value = tokenFor(service, origin);
        const connection = withConnectorConnections(home.directory, store => store.createToken({ serviceId: service, displayName: "Fixture", token: value }));
        const fetchImpl = async () => { dispatched++; return json({ displayName: "Should not dispatch", preferred_username: "fixture" }); };
        const port = createCatalogConnector({ connectorId: service, connectionId: connection.connection_id, fetchImpl });
        assert.equal((await port.health(connectorControl())).ok, false, `${service}: ${origin}`);
        const sync = await port.sync({ cursor: {} }, connectorControl()); assert.equal(sync.ok, false, `${service}: ${origin}`);
        const whoami = await catalogWhoami({ connectorId: service, token: value, fetchImpl }); assert.equal(whoami.ok, false);
        assert.equal(dispatched, 0, `${service}: rejected destination must receive neither a request nor its credential`);
        for (const result of [sync, whoami]) assert.equal(JSON.stringify(result).includes(FIXTURE), false);
      }
    }
  });
});

test("W2-18-CATALOG-02: valid Cloud sites and the Host's current Atlassian OAuth base remain usable", async () => {
  for (const service of ["jira", "confluence", "salesforce"]) {
    const origin = service === "salesforce" ? "https://fixture--dev.sandbox.my.salesforce.com" : "https://fixture.atlassian.net";
    for (const supplied of [origin, origin.slice(8), origin + "/"]) {
      const urls: string[] = [];
      const result = await createCatalogProvider({ connectorId: service, token: tokenFor(service, supplied), now: () => new Date(AT), fetchImpl: async (url, init) => {
        urls.push(url); assert.equal(new URL(url).origin, origin); assert.equal(init?.redirect, "error");
        return json(url.includes("userinfo") ? { preferred_username: "fixture" } : url.includes("myself") || url.includes("user/current") ? { displayName: "Fixture" }
          : service === "jira" ? { issues: [{ id: "one", key: "F-1", fields: { summary: "Literal issue", updated: AT } }] }
            : service === "confluence" ? { results: [{ id: "one", title: "Literal page", _links: { webui: "/one" } }] }
              : { records: [{ Id: "one", Subject: "Literal task", LastModifiedDate: AT }] });
      } }).sync({ cursor: {} }, connectorControl());
      assert.equal(result.ok, true, `${service}: ${supplied}`); if (result.ok) assert.equal(result.items.length, 1);
      assert.equal(urls.length, 2);
    }
  }
  const cloudId = "11111111-2222-3333-4444-555555555555";
  for (const service of ["jira", "confluence"]) {
    const base = `https://api.atlassian.com/ex/${service}/${cloudId}`, urls: string[] = [];
    const result = await createCatalogProvider({ connectorId: service, token: FIXTURE,
      authExtras: { auth_method: "oauth", site_url: "https://fixture.atlassian.net", cloud_id: cloudId, base },
      fetchImpl: async url => { urls.push(url); return json(url.includes("myself") || url.includes("user/current") ? { displayName: "Fixture" } : { issues: [], results: [] }); },
    }).sync({ cursor: {} }, connectorControl());
    assert.equal(result.ok, true); assert.equal(urls.every(url => url.startsWith(base + "/")), true);
    for (const invalidBase of ["https://evil.example/ex/" + service + "/" + cloudId, base + "/extra", base.replace(service, service === "jira" ? "confluence" : "jira")]) {
      let dispatched = 0;
      const invalid = await createCatalogProvider({ connectorId: service, token: FIXTURE,
        authExtras: { auth_method: "oauth", site_url: "https://fixture.atlassian.net", cloud_id: cloudId, base: invalidBase },
        fetchImpl: async () => { dispatched++; return json({ displayName: "Fixture" }); },
      }).sync({ cursor: {} }, connectorControl());
      assert.equal(invalid.ok, false); assert.equal(dispatched, 0);
    }
  }
});

test("W2-18-CATALOG-ERROR-01: every business-error family produces a closed failure through Connector, Listener, Signals, Feed and journal", async () => {
  await withIntegrationHome(async home => {
    const encoded = Buffer.from(`person@example.com:${FIXTURE}`).toString("base64"), uri = encodeURIComponent(FIXTURE), quoted = JSON.stringify({ access_token: FIXTURE });
    const echo = `${FIXTURE}|${encoded}|${uri}|${quoted}`;
    const failures: Array<{ service: string; token: string; body: unknown; auth?: boolean }> = [
      { service: "slack", token: FIXTURE, body: { ok: false, error: echo } },
      { service: "slack", token: FIXTURE, auth: true, body: { ok: false, error: "invalid_auth", message: echo } },
      { service: "wechat", token: `fixture-corp:${FIXTURE}`, body: { errcode: 50000, errmsg: echo } },
      { service: "lark", token: `fixture-app:${FIXTURE}`, body: { code: 999999, msg: echo } },
      { service: "cloudflare", token: FIXTURE, body: { success: false, errors: [{ message: echo }] } },
      { service: "monday", token: FIXTURE, body: { errors: [{ message: echo }], data: null } },
    ];
    for (const [index, fixture] of failures.entries()) {
      const connection = withConnectorConnections(home.directory, store => store.createToken({ serviceId: fixture.service, displayName: "Fixture", token: fixture.token }));
      const port = createCatalogConnector({ connectorId: fixture.service, connectionId: connection.connection_id, now: () => new Date(AT), fetchImpl: async () => json(fixture.body) });
      const chain = home.chain(port), source = chain.feed.upsertSource({ ...chain.source("github"), source_id: `catalog-${index}`, kind: fixture.service,
        definition_id: fixture.service, sync_kind: "connector", name: fixture.service, credential_ref: connection.credential_ref, config: { connection_id: connection.connection_id } });
      const before = source.cursor;
      let publicFailure: unknown;
      await assert.rejects(chain.sync.sync(source.source_id, { idempotencyKey: `catalog-closed-${index}` }), error => { publicFailure = error; return true; });
      const durable = chain.feed.getSource(DEMO_PROJECT_ID, source.source_id), snapshot = chain.feed.snapshot(DEMO_PROJECT_ID);
      assert.deepEqual(durable.cursor, before); assert.equal(durable.last_error_code, fixture.auth ? "connector.needs_auth" : "connector.provider");
      assert.equal(snapshot.feed_items.some(item => item.source_id === source.source_id), false);
      assert.ok(snapshot.runs.some(run => run.source_id === source.source_id && run.outcome === "failed"));
      assert.equal(snapshot.inbox_entries.some(entry => entry.subject_type === "source_fault" && entry.subject_id === source.source_id), fixture.auth === true);
      const error = publicFailure as { message: string; details?: unknown };
      const publicViews = JSON.stringify([error.message, error.details, await port.health(connectorControl()), await catalogWhoami({ connectorId: fixture.service, token: fixture.token, fetchImpl: async () => json(fixture.body) }), snapshot, withConnectorConnections(home.directory, store => store.list())]);
      // Read every stored cell in this temporary project, including receipt/checkpoint error text, rather than assuming its table name.
      const tables = home.store().db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      const stored = tables.map(({ name }) => home.store().db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '"').all());
      for (const value of [FIXTURE, encoded, uri, quoted]) {
        assert.equal(publicViews.includes(value), false, `${fixture.service}: public failure must not echo credentials`);
        assert.equal(JSON.stringify(stored).includes(value), false, `${fixture.service}: no persisted failure may echo credentials`);
      }
    }
  });
});

test("W2-18-CATALOG-ERROR-01: known authentication codes and HTTP 429 keep actionable classification without remote error text", async () => {
  for (const body of [{ ok: false, error: "invalid_auth" }, { errcode: 40014, errmsg: FIXTURE }, { code: 99991663, msg: FIXTURE }]) {
    const result = await createCatalogProvider({ connectorId: "slack", token: FIXTURE, fetchImpl: async () => json(body) }).sync({ cursor: {} }, connectorControl());
    assert.equal(result.ok, false); if (!result.ok) assert.equal(result.failure, "needs_auth");
    assert.equal(JSON.stringify(result).includes(FIXTURE), false);
  }
  const result = await createCatalogProvider({ connectorId: "slack", token: FIXTURE, now: () => new Date(AT),
    fetchImpl: async () => json({ message: FIXTURE }, { status: 429, headers: { "retry-after": "120" } }),
  }).sync({ cursor: {} }, connectorControl());
  assert.equal(result.ok, false); if (!result.ok) { assert.equal(result.failure, "rate_limited"); assert.equal(result.retryAfterAt, "2026-08-30T10:02:00.000Z"); }
  assert.equal(JSON.stringify(result).includes(FIXTURE), false);
});
