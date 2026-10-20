import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, bindActionClient, type ActionCallContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { withCallId } from "@molis-ai/molis-work-kernel";
import { readMcpToolPreference } from "@molis-ai/molis-work-app-local-host";
import { pagesActions, PAGES_ACTION_PERMISSIONS, PAGES_HOME_STORE, PAGES_PROJECT_PLUGIN_ID } from "@molis-ai/molis-work-plugin-pages";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

// QA-015 (AC-P03, Q05; context-program §21.8 B1; AGENTS, a call cancelled or revoked writes no business record): an MCP
// client's 「放进左边」 into Pages passes its first authority check, Pages starts, and inside the handler's beforeEffect the
// call checks its authority and permissions again and then waits at the Host's own check, the last asynchronous step before
// the write. While it waits the person turns the grant off in the access settings, or the client goes away; released, the
// final synchronous check refuses with that exact code, and nothing Pages keeps changes: the document, its version, the kept
// changes, any other row. The same wait with nothing withdrawn writes.

const TARGET = "pages.landing.insert", CLIENT = "runtime:pages-late-authority", TEXT = " late-landing-marker";
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
type Block = { text?: string; content?: Block[] };
const inline = (node: Block): string => node.text ?? (node.content ?? []).map(inline).join("");
type Written = { document: { id: string; version: number; body: Block }; change_id: string };

/** Every row of every table in a SQLite file, in a stable order: what "nothing changed" is checked against. */
function rows(path: string): Record<string, string[]> {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(table => table.name);
    return Object.fromEntries(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()]));
  } finally { db.close(); }
}

/** Within a few seconds, or fail with what was awaited. */
async function eventually<T>(what: string, read: () => T | undefined): Promise<T> {
  for (const deadline = Date.now() + 5_000; Date.now() < deadline; await new Promise(resolve => setTimeout(resolve, 20))) {
    const value = read();
    if (value !== undefined) return value;
  }
  throw new Error(`timed out waiting for ${what}`);
}

for (const withdrawn of ["revoked", "cancelled", null] as const) test(withdrawn === "revoked"
  ? "QA-015 AC-P03 Q05 a grant turned off while an accepted Pages landing waits before its write refuses with mcp.action_revoked and changes nothing"
  : withdrawn === "cancelled"
    ? "QA-015 AC-P03 Q05 a client gone while an accepted Pages landing waits before its write ends it as actions.cancelled and changes nothing"
    : "QA-015 AC-P03 the same wait before the write with nothing withdrawn writes once", { timeout: 60_000 }, async t => {
  const entered = Promise.withResolvers<AbortSignal | undefined>(), release = Promise.withResolvers<void>();
  // The checks the Host's availability policy sees for this client's call of the target, in order. The call's own checks carry
  // its granted actions: admission, then the Host's check inside beforeEffect, which runs only once the handler has started and
  // the second validate_authority and validate_permissions have passed. The barrier is that second one. A directory read with
  // the raw transport caller would show as "inspect"; today its views stop before the policy (the raw caller holds no
  // permissions), so a change there shows in the order asserted below.
  const seen: ("host" | "inspect")[] = [];
  let recording = false;
  const home = await openTestHome(t, { host: {
    actionAvailability: async (caller, action) => {
      if (recording && action.capability_id === TARGET && caller.actor_id === CLIENT) {
        seen.push(caller.allowed_actions ? "host" : "inspect");
        if (caller.allowed_actions && seen.filter(kind => kind === "host").length === 2) { entered.resolve(caller.signal); await release.promise; }
      }
      return { available: true };
    },
  } });
  t.signal.addEventListener("abort", () => release.resolve(), { once: true });
  const project = await home.createProject("Late Pages landing", [PAGES_PROJECT_PLUGIN_ID]);
  const owner: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: PAGES_ACTION_PERMISSIONS };
  const pages = bindActionClient(home.host.actionClient(project.reference), () => owner);
  const { document } = await pages.invoke(pagesActions.create, { title: "Notes", body: { type: "doc", content: [paragraph("Hello world")] } });
  const input = { id: document.id, expected_version: document.version, anchor: 6, head: 6, text: TEXT };
  const library = homeSqlitePath(home.home, PAGES_HOME_STORE.path);
  const callLog = () => readFileSync(join(home.home, "logs/action-calls.jsonl"), "utf8");

  const view = (await home.inspect(CLIENT, project.project_id)).find(row => row.capability_id === TARGET) as ActionView;
  assert.ok(view, "the landing is in the client's directory");
  await home.grant(CLIENT, project.project_id, [view]);
  const mcp = await home.mcp(CLIENT, project.project_id), callId = randomUUID(), leave = new AbortController();
  const before = { pages: rows(library), project: rows(project.database_path) };

  recording = true;
  const pending = withCallId(callId, async () => {
    try { return { result: await mcp.client.invoke({ ...mcp.caller, signal: leave.signal }, view, input) as Written, error: undefined }; }
    catch (error) { return { result: undefined, error }; }
  });
  // A call that settles before reaching the barrier cannot pass for the interleaving this test is about.
  const settled = pending.then(({ error }) => {
    throw new Error(`the call settled before the check before its write; checks seen ${JSON.stringify(seen)}, ${error instanceof ActionError ? error.code : String(error ?? "no error")}`);
  });
  const signal = await Promise.race([entered.promise, settled]);
  assert.deepEqual(seen, ["host", "host"], "admitted, Pages started and checked again, now at the Host's check before the write");
  assert.deepEqual({ pages: rows(library), project: rows(project.database_path) }, before, "nothing written while it waits");

  recording = false;
  if (withdrawn === "revoked") {
    await home.revoke(CLIENT, project.project_id, [view]);
    const grant = (await readMcpToolPreference(home.home)).action_grants.find(row => row.client_id === CLIENT && row.capability_id === TARGET);
    assert.equal(grant?.enabled, false, "turned off in the access settings");
  }
  if (withdrawn === "cancelled") {
    leave.abort();
    // The Host learns it when the connection closes; release only once the waiting call's own signal says so.
    assert.ok(signal, "the waiting call carries its connection's signal");
    await eventually("the Host to see the client leave", () => signal.aborted || undefined);
  }
  const waiting = { pages: rows(library), project: rows(project.database_path) };
  recording = true; release.resolve();
  const outcome = await pending;

  if (!withdrawn) {
    assert.equal(outcome.error, undefined);
    assert.ok(outcome.result);
    assert.equal(outcome.result.document.version, document.version + 1);
    assert.deepEqual((outcome.result.document.body.content ?? []).map(inline), [`Hello${TEXT} world`]);
    assert.deepEqual(seen, ["host", "host"], "nothing asynchronous after the check it waited in");
    const after = rows(library);
    assert.equal(after.page_changes.length, before.pages.page_changes.length + 1, "one kept change, the one written");
    const [row] = await eventually("the call's row", () => home.host.callLog?.find(callId).length ? home.host.callLog.find(callId) : undefined);
    assert.deepEqual([row.capability_id, row.code, row.ok, row.refused], [TARGET, undefined, true, undefined]);
    return;
  }

  const code = withdrawn === "revoked" ? "mcp.action_revoked" : "actions.cancelled";
  if (withdrawn === "revoked") {
    assert.ok(outcome.error instanceof ActionError, "the client is told the call was refused");
    assert.equal(outcome.error.code, code);
  } else assert.ok(outcome.error, "the client that left gets no result");
  assert.equal(outcome.result, undefined);
  assert.deepEqual(seen, ["host", "host"], "no check ran again after the one it waited in");
  const rowsOf = await eventually("the call's row", () => home.host.callLog?.find(callId).length ? home.host.callLog.find(callId) : undefined);
  // Pages had started (not a refusal before the handler), and the call ended with the exact code.
  assert.deepEqual(rowsOf.map(row => [row.capability_id, row.code, row.ok, row.refused]), [[TARGET, code, false, undefined]]);
  assert.ok(rowsOf.every(row => row.call_id === callId && row.actor_id === CLIENT && row.project_id === project.project_id));
  assert.ok(!callLog().includes(TEXT.trim()), "the input is never written to the call log");
  const after = { pages: rows(library), project: rows(project.database_path) };
  assert.deepEqual(after, waiting, "the released call wrote nothing: document, version, kept changes and every other row");
  assert.deepEqual(after.pages, before.pages, "and Pages is as it was before the call");
  const stored = await pages.invoke(pagesActions.get, { id: document.id });
  assert.deepEqual(stored.document, document, "the document and its version are untouched");

  // The same input, at the same version, goes through once the grant is back (or from a client still there): only the
  // withdrawal stopped it.
  if (withdrawn === "revoked") await home.grant(CLIENT, project.project_id, [view]);
  const again = await mcp.client.invoke(mcp.caller, view, input) as Written;
  assert.equal(again.document.version, document.version + 1);
  assert.deepEqual((again.document.body.content ?? []).map(inline), [`Hello${TEXT} world`]);
});
