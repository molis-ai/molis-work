import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkActionToolName } from "@molis-ai/molis-work-app-mcp";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, subjectContext,
  type ActionDefinition, type SearchEntry } from "@molis-ai/molis-work-contracts/platform/actions";
import { searchActions, type SearchQueryResponse } from "@molis-ai/molis-work-contracts/services/search";
import { serveTestHost } from "./fixtures/test-home.js";

const marker = "ACA005ORIGINALAUTHORITYBODY";
const providerId = "fixture.search-authority";

async function fixture(t: TestContext, defaultOpen = false) {
  const directory = await mkdtemp(join(tmpdir(), "aca005-search-home-"));
  const host = new MolisWorkLocalHost({ homeDirectory: directory, completeText: null });
  const home = { ...await serveTestHost(null, { home: directory, host }), host };
  const project = await home.createProject("Original search authority");
  const permissions = defaultOpen ? [] : ["form:read"];
  const entries = defineSearchEntriesAction("fixture.search.entries", [{ kind: "authority_note", title: "Note", surface: "fixture" },
    { kind: "unrelated_note", title: "Other kind", surface: "fixture" }], "HTTP notes", permissions);
  const reader = defineSubjectContextAction("fixture.search.reader", "authority_note", "Read note", permissions);
  const unrelatedReader = defineSubjectContextAction("fixture.search.other-reader", "unrelated_note", "Read another kind", permissions);
  const peer: ActionDefinition = { capability_id: "fixture.search.peer", version: 1, operation: "query", action: {
    title: "Independent grant", description: "Shares permissions without authority over this note", kind: "query", scope: "project",
    audiences: ["user", "mcp"], permissions: ["form:read"], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "boolean" },
  } };
  const entered = Promise.withResolvers<void>();
  let release = () => {};
  let hold = false;
  const unblock = () => { hold = false; const answer = release; release = () => {}; answer(); };
  const data: SearchEntry[] = [{ subject: { kind: "authority_note", id: "one" }, revision: "1", title: "An owner's note",
    summary: "Listing metadata contains no body marker", updated_at: null, content: "context", open: { surface: "fixture", id: "one" } }];
  const owner = createServer((_request, response) => {
    const answer = () => { response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(data)); };
    if (!hold) { answer(); return; }
    hold = false;
    release = answer;
    entered.resolve();
  });
  await new Promise<void>(resolve => owner.listen(0, "127.0.0.1", resolve));
  const address = owner.address(); assert.ok(address && typeof address === "object");
  const ownerUrl = `http://127.0.0.1:${address.port}/entries`;
  const dispose = home.host.actionRegistry(project.reference).registerProvider({ provider: {
    provider_id: providerId, plugin_id: providerId, title: "HTTP owner", kind: defaultOpen ? "system" : "plugin", project_id: project.project_id,
  }, definitions: [entries, reader, unrelatedReader, peer], handlers: [
    bindSearchEntriesHandler(entries, async () => {
      const response = await fetch(ownerUrl);
      assert.equal(response.status, 200);
      return await response.json() as SearchEntry[];
    }),
    { ...reader, handle: (_caller, input) => subjectContext({ subject: { kind: "authority_note", id: String(input.subject_id) },
      revision: "1", title: "An owner's note", content: marker, goal_ids: [], open: { surface: "fixture", id: "one" } }) },
    { ...unrelatedReader, handle: (_caller, input) => subjectContext({ subject: { kind: "unrelated_note", id: String(input.subject_id) },
      revision: "1", title: "Another kind", content: "unrelated", goal_ids: [] }) },
    { ...peer, handle: () => true },
  ] });
  const disposers = [dispose];
  await withMolisWorkProjectCatalog({ homeDirectory: home.home }, catalog => catalog.bindRuntimeContext({
    context: { runtime_id: "search-authority", stable_work_context_id: "search-authority-session", host_declares_stable: true },
    project_id: project.project_id, actor_id: "user", user_confirmed: true,
  }));
  const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx",
    fileURLToPath(new URL("../apps/desktop/launchers/mcp/server.ts", import.meta.url))], env: {
      ...Object.fromEntries(Object.entries(process.env).filter((pair): pair is [string, string] => pair[1] !== undefined)),
      MOLIS_WORK_HOME: home.home, MOLIS_WORK_RUNTIME_ID: "search-authority", MOLIS_WORK_WEB_URL: home.origin,
      MOLIS_WORK_WORK_CONTEXT_ID: "search-authority-session", MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    }, stderr: "pipe" });
  const sdk = new Client({ name: "search-authority-test", version: "1" });
  t.signal.addEventListener("abort", unblock, { once: true });
  t.after(async () => {
    unblock();
    try { await sdk.close(); }
    finally {
      for (const withdraw of disposers) withdraw();
      await home.close(); await host.close(); owner.closeAllConnections();
      await new Promise<void>((resolve, reject) => owner.close(error => error ? reject(error) : resolve()));
      await rm(directory, { recursive: true, force: true });
    }
  });
  await sdk.connect(transport);
  const clientId = "runtime:search-authority";
  const views = await home.inspect(clientId, project.project_id);
  const view = (definition: ActionDefinition) => {
    const found = views.find(item => item.capability_id === definition.capability_id && item.version === definition.version);
    assert.ok(found); return found;
  };
  await home.grant(clientId, null, [view(searchActions.query)]);
  await home.grant(clientId, project.project_id, [view(peer), ...(defaultOpen ? [] : [view(entries), view(reader), view(unrelatedReader)])]);
  const input = { query: marker, plugins: [providerId], kinds: ["authority_note"], scope: "project" as const };
  const tool = molisWorkActionToolName({ ...searchActions.query, provider_id: view(searchActions.query).provider.provider_id });
  const ask = () => sdk.callTool({ name: tool, arguments: input });
  const positive = await ask();
  assert.equal(hits(positive).length, 1, "ACA005-01: the same real MCP path is authorized before revocation");
  assert.ok(JSON.stringify(positive).includes(marker));
  const addReader = async () => {
    const next = defineSubjectContextAction("fixture.search.new-reader", "authority_note", "Another original reader", permissions);
    disposers.push(home.host.actionRegistry(project.reference).registerProvider({ provider: {
      provider_id: providerId, plugin_id: providerId, title: "HTTP owner", kind: defaultOpen ? "system" : "plugin",
    }, definitions: [next], handlers: [{ ...next, handle: (_caller, value) => subjectContext({
      subject: { kind: "authority_note", id: String(value.subject_id) }, revision: "1", title: "An owner's note", content: marker, goal_ids: [],
    }) }] }));
    const accepted = (await home.inspect(clientId, project.project_id)).find(item => item.capability_id === next.capability_id);
    assert.ok(accepted); await home.grant(clientId, project.project_id, [accepted]);
  };
  return { home, project, entries, reader, unrelatedReader, peer, clientId, entered: entered.promise, release: unblock, addReader,
    ask, refresh: async () => { await delay(3_100); hold = true; },
    ownerQuery: () => home.web.post<SearchQueryResponse>(`/projects/${project.project_id}/api/search/query`, input),
    grant: (actions: ActionDefinition[]) => home.grant(clientId, project.project_id, actions.map(view)),
    revoke: (actions: ActionDefinition[]) => home.revoke(clientId, project.project_id, actions.map(view)),
  };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function duringOwnerWait(f: Fixture, change: () => Promise<unknown>) {
  await f.refresh();
  let finished = false;
  const pending = f.ask().finally(() => { finished = true; });
  try {
    await Promise.race([f.entered, pending.then(() => { throw new Error("Query answered without entering its owner's HTTP wait"); })]);
    assert.equal(finished, false, "the real owner's HTTP fetch is still pending");
    await change();
    assert.equal(finished, false, "the product settings request completed before the same query answered");
    f.release();
    return await pending;
  } finally { f.release(); }
}

function hits(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.equal(result.isError, false, JSON.stringify(result));
  return (result.structuredContent as SearchQueryResponse).hits;
}

function noDisclosure(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.equal(JSON.stringify(result).includes(marker), false, "no body marker escapes through text or structured MCP content");
  if (result.isError) assert.match(JSON.stringify(result), /mcp\.action_revoked/);
  else assert.deepEqual(hits(result), [], "no revoked hit or locator is disclosed");
}

for (const target of ["entries", "reader"] as const) for (const regrant of [false, true]) {
  test(`ACA005-02/03/07 real stdio MCP ${target} ${regrant ? "same-value regrant cannot revive the old query" : "revocation stops the pending query"}`,
    { timeout: 30_000 }, async t => {
      const f = await fixture(t);
      const result = await duringOwnerWait(f, async () => {
        await f.revoke([f[target]]);
        if (regrant) await f.grant([f[target]]);
      });
      assert.equal((await f.ownerQuery()).hits.length, 1, "ACA005-01: the owner's indexed note was not deleted");
      assert.equal(hits(await f.ask()).length, regrant ? 1 : 0, "a fresh request uses only its new current authorization");
      const grants = await f.home.web.get<{ grants: { capability_id: string; enabled: boolean }[] }>(`/api/settings/mcp/actions?client_id=${f.clientId}&project_id=${f.project.project_id}`);
      assert.ok(grants.grants.some(grant => grant.capability_id === f.peer.capability_id && grant.enabled), "the peer keeps the same permissions");
      noDisclosure(result);
    });
}

for (const change of ["none", "unrelated", "unrelated-reader", "idempotent"] as const) {
  test(`ACA005-01/04 real stdio MCP legal pending query survives ${change} grant edit`, { timeout: 30_000 }, async t => {
    const f = await fixture(t);
    const result = await duringOwnerWait(f, () => change === "unrelated" ? f.revoke([f.peer])
      : change === "unrelated-reader" ? f.revoke([f.unrelatedReader])
      : change === "idempotent" ? f.grant([f.entries, f.reader]) : Promise.resolve());
    assert.equal(hits(result).length, 1);
    assert.ok(JSON.stringify(result).includes(marker));
    assert.equal((await f.ownerQuery()).hits.length, 1);
  });
}

test("ACA005-03 a newly registered and granted reader cannot replace this query's revoked reader", { timeout: 30_000 }, async t => {
  const f = await fixture(t);
  const result = await duringOwnerWait(f, async () => { await f.revoke([f.reader]); await f.addReader(); });
  noDisclosure(result);
  assert.equal(hits(await f.ask()).length, 1, "the new invocation may use its new reader grant");
  assert.equal((await f.ownerQuery()).hits.length, 1);
});

test("ACA005-03/04 another reader granted before acceptance keeps the pending query legitimate", { timeout: 30_000 }, async t => {
  const f = await fixture(t); await f.addReader();
  const result = await duringOwnerWait(f, () => f.revoke([f.reader]));
  assert.equal(hits(result).length, 1);
  assert.ok(JSON.stringify(result).includes(marker));
  assert.equal((await f.ownerQuery()).hits.length, 1);
});

for (const target of ["entries", "reader"] as const) {
  test(`ACA005-05 default-open ${target} revoke and explicit regrant keeps the old absence revoked`, { timeout: 30_000 }, async t => {
    const f = await fixture(t, true);
    const result = await duringOwnerWait(f, async () => { await f.revoke([f[target]]); await f.grant([f[target]]); });
    assert.equal(hits(await f.ask()).length, 1);
    noDisclosure(result);
  });
}
