import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { connectorRecordActions, CONNECTOR_RECORDS_READ, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

const caller: ActionCallContext = { actor_id: "assistant:records", audience: "agent", project_id: null, permissions: [CONNECTOR_RECORDS_READ] };
const reply = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "x-oauth-scopes": "read:user, notifications" } });

test("ASC-03 ASC-04 ASC-07: the assistant reads the selected account's real provider records, with a separate content grant", async t => {
  const home = await openTestHome(t);
  const [selected, other, identityOnly] = withConnectorConnections(home.home, store => [
    store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-work-records" }),
    store.createToken({ serviceId: "github", displayName: "Personal", token: "fixture-personal-records" }),
    store.createToken({ serviceId: "adobe", displayName: "Identity only", token: "fixture-adobe-records" }),
  ]);
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); urls.push(url);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-work-records");
    if (url === "https://api.github.com/user") return reply({ id: 23, login: "work-account" });
    assert.equal(new URL(url).pathname, "/notifications");
    return reply([{ id: "42", reason: "mention", unread: true, updated_at: "2026-10-16T10:00:00Z",
      repository: { full_name: "work/project", html_url: "https://github.com/work/project" },
      subject: { title: "Release checklist", type: "Issue", url: "https://api.github.com/repos/work/project/issues/7" } }]);
  });
  const client = home.host.homeActionClient();
  const read = (id: string, context = caller) => client.invoke(context, connectorRecordActions.read, { connection_id: id });
  await assert.rejects(read(selected!.connection_id, { ...caller, permissions: ["connectors:account:read"] }), { code: "actions.forbidden" });
  await assert.rejects(client.invoke(caller, connectorRecordActions.read, { connection_id: selected!.connection_id, url: "https://example.test/arbitrary" }), { code: "actions.input_invalid" });
  assert.equal(urls.length, 0);
  const result = await read(selected!.connection_id) as { connection_id: string; result: { record_count: number; items: Array<{ title: string; url: string }> } };
  assert.equal(result.connection_id, selected!.connection_id);
  assert.equal(result.result.record_count, 1, "ASC-30: the batch count is separate from the potentially truncated record body");
  assert.equal(result.result.items[0]!.title, "work/project · Release checklist");
  assert.equal(result.result.items[0]!.url, "https://github.com/work/project/issues/7");
  assert.doesNotMatch(JSON.stringify(result), /fixture-work-records|fixture-personal-records/);
  const before = urls.length;
  await assert.rejects(read(identityOnly!.connection_id), { code: "connector.records.unsupported" });
  withConnectorConnections(home.home, store => store.setEnabled(selected!.connection_id, false));
  await assert.rejects(read(selected!.connection_id), { code: "connector.records.changed" });
  assert.equal(urls.length, before, "unsupported and disabled reads send no requests and never borrow the other account");
  assert.equal(withConnectorConnections(home.home, store => store.require(other!.connection_id).enabled), true);
});

test("ASC-16 ASC-25: stopping a connection aborts its pending record read even if it is enabled again immediately", async t => {
  const home = await openTestHome(t);
  const selected = withConnectorConnections(home.home, store => store.createToken({ serviceId: "github", displayName: "Work", token: "fixture-abort-records" }));
  const entered = Promise.withResolvers<void>();
  let aborted = false;
  t.mock.method(globalThis, "fetch", (input: string | URL | Request, init?: RequestInit) => {
    if (String(input) === "https://api.github.com/user") return Promise.resolve(reply({ id: 23, login: "work-account" }));
    assert.equal(new URL(String(input)).pathname, "/notifications");
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => { aborted = true; reject(init!.signal!.reason); }, { once: true });
      entered.resolve();
    });
  });
  const pending = home.host.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: selected.connection_id });
  const rejected = assert.rejects(pending);
  await entered.promise;
  withConnectorConnections(home.home, store => { store.setEnabled(selected.connection_id, false); store.setEnabled(selected.connection_id, true); });
  await rejected;
  assert.equal(aborted, true);
  assert.equal(withConnectorConnections(home.home, store => store.require(selected.connection_id).enabled), true);
});

// RAC-2417: a cli connection whose service id names a prototype member has no record adapter, exactly like an unregistered service.
test("RAC-2417 a cli connection whose service id names a prototype member has no record adapter", async t => {
  const home = await openTestHome(t);
  const [unknown, prototype] = withConnectorConnections(home.home, store => [
    store.saveCli({ serviceId: "no-such-service", displayName: "Unknown", externalId: "unknown-cli", accountLabel: "unknown" }),
    store.saveCli({ serviceId: "constructor", displayName: "Prototype", externalId: "prototype-cli", accountLabel: "prototype" }),
  ]);
  const read = (id: string) => home.host.homeActionClient().invoke(caller, connectorRecordActions.read, { connection_id: id });
  const refusal = async (id: string) => {
    const error = await read(id).then(() => null, (failure: unknown) => failure);
    assert.ok(error instanceof ActionError, `an error, not ${String(error)}`);
    return { code: error.code, message: error.message };
  };
  const missing = await refusal(unknown!.connection_id);
  assert.deepEqual(await refusal(prototype!.connection_id), missing);
});
