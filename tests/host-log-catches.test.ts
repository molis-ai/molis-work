import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { captureHostLog, homeAggregatePorts, homeBackgroundTasks, createProjectArrivalHttp, handleBrowserHttp, logPreviewFailure, projectOrNull, repeatingFailure, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { backgroundPlugin, backgroundRig } from "./fixtures/home-background-plugin.js";

/**
 * W5-13 second slice: a catch in the Host that answered every failure as "absent" now tells the answer it means (the project
 * is not there, you may not read it, Coding never ran here) from a failure, and writes the failure to the Host log.
 */

function captured<T>(run: () => T): { value: T; entries: HostLogEntry[] } {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { return { value: run(), entries }; } finally { restore(); }
}

async function capturedAsync<T>(run: () => Promise<T>): Promise<{ value: T; entries: HostLogEntry[] }> {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { return { value: await run(), entries }; } finally { restore(); }
}

test("W5-13-04 a project looked up by id is null only when the catalog says it is not there; a catalog that fails says so", () => {
  const found = { project_id: "p1", display_name: "One" };
  const catalog = (failure?: unknown) => ({ getProject: (id: string) => { if (failure) throw failure; return { ...found, project_id: id }; } });
  assert.deepEqual(projectOrNull(catalog(), "p1"), found);
  assert.equal(projectOrNull(catalog(projectCatalogErrors.project_not_found("找不到")), "p1"), null);
  const broken = Object.assign(new Error("database disk image is malformed"), { code: "ERR_SQLITE_ERROR" });
  assert.throws(() => projectOrNull(catalog(broken), "p1"), error => error === broken, "a catalog that cannot be read is not a deleted project");
  const other = projectCatalogErrors.project_storage_invalid("坏了");
  assert.throws(() => projectOrNull(catalog(other), "p1"), error => error === other);
});

test("W5-13-05 an owner's failed preview is written by its type; \"you may not read it\" and \"it is not there\" are answers, not failures", () => {
  const { entries } = captured(() => {
    logPreviewFailure(new ActionError("actions.forbidden", "不能读"), "pages.document.v1");
    logPreviewFailure(new ActionError("files.missing", "没有了", { kind: "not_found" }), "pages.document.v1");
    logPreviewFailure(new ActionError("pages.timeout", "超时", { kind: "timeout" }), "pages.document.v1");
    logPreviewFailure(new Error("/Users/someone/notes.md 读不了"), "files.snapshot.v1");
  });
  assert.deepEqual(entries.map(({ at: _at, ...rest }) => rest), [
    { level: "warn", area: "artifacts", event: "preview_failed", error: { name: "ActionError", code: "pages.timeout" }, fields: { artifact_type_id: "pages.document.v1" } },
    { level: "warn", area: "artifacts", event: "preview_failed", error: { name: "Error" }, fields: { artifact_type_id: "files.snapshot.v1" } },
  ]);
});

test("RAC-2494 an owner's preview refused to an MCP client is an answer, told by its kind; the same code without a kind is written", () => {
  const { entries } = captured(() => {
    logPreviewFailure(new ActionError("mcp.action_revoked", "没有授权", { kind: "forbidden" }), "pages.document.v1");
    logPreviewFailure(new ActionError("mcp.action_revoked", "没有授权"), "pages.document.v1");
  });
  assert.deepEqual(entries.map(({ at: _at, ...rest }) => rest), [
    { level: "warn", area: "artifacts", event: "preview_failed", error: { name: "ActionError", code: "mcp.action_revoked" }, fields: { artifact_type_id: "pages.document.v1" } },
  ]);
});

test("W5-13-06 W5-01-CODING-49 the Home's background list: a project where the plugin is off lists nothing quietly; one whose answer cannot be read is written once until it reads again", async t => {
  const empty = { source: { surface: "example" }, tasks: [] };
  const plugin = backgroundPlugin(() => empty);
  const rig = await backgroundRig(t, plugin, ["Fine", "Off", "Broken"], { off: ["Off"] });
  const broken = rig.project("Broken").project_id;
  const ask = () => capturedAsync(() => homeBackgroundTasks(homeAggregatePorts(rig.host), rig.catalog));
  plugin.state.answer = project => { if (project === broken) throw new Error("读不了"); return empty; };
  const first = await ask();
  assert.deepEqual(first.value, []);
  assert.deepEqual(first.entries.map(entry => [entry.area, entry.event, entry.fields]), [["home", "background_tasks_unreadable", { project_id: broken }]]);
  // Read on every attention poll: the same failure is not written again ...
  assert.deepEqual((await ask()).entries, []);
  // ... until the project has been read since.
  plugin.state.answer = () => empty;
  assert.deepEqual((await ask()).entries, []);
  plugin.state.answer = project => { if (project === broken) throw new Error("读不了"); return empty; };
  assert.equal((await ask()).entries.length, 1);
  // An answer the page cannot draw is a failure of the same kind, written the same way.
  plugin.state.answer = project => project === broken ? { source: { surface: "../x" }, tasks: [] } : empty;
  assert.deepEqual((await ask()).entries, [], "the project is still unread, so it is not written again");
});

test("W5-13-08 a failure that repeats every round (the schedules' 30-second round, an attention poll) is written when it starts, and again only after it worked", () => {
  const { entries } = captured(() => {
    const rounds = repeatingFailure("schedule", "round_failed");
    const failure = Object.assign(new Error("database is locked"), { code: "storage_busy" });
    rounds.failed("feed:a", failure, { schedule: "feed" });
    rounds.failed("feed:a", failure, { schedule: "feed" });
    rounds.failed("tasks:a", failure, { schedule: "tasks" });
    rounds.worked("feed:a");
    rounds.failed("feed:a", failure, { schedule: "feed" });
    // Another round's book is its own.
    repeatingFailure("schedule", "round_failed").failed("feed:a", failure, { schedule: "feed" });
  });
  assert.deepEqual(entries.map(entry => entry.fields?.schedule), ["feed", "tasks", "feed", "feed"]);
  assert.ok(entries.every(entry => entry.event === "round_failed" && entry.error?.code === "storage_busy"));
});

/** A catalog whose every lookup answers with `failure` (or finds nothing). */
const failingCatalog = (failure: unknown) => ({ getProject: () => { throw failure; } });
const unreadable = () => Object.assign(new Error("database disk image is malformed"), { code: "ERR_SQLITE_CORRUPT" });

/** Serves one handler on a loopback port; a handler that throws is answered as the Web server's own last catch does (500). */
async function serve(handle: (request: http.IncomingMessage, response: http.ServerResponse, url: URL) => Promise<boolean>) {
  const server = http.createServer(async (request, response) => {
    try { if (!await handle(request, response, new URL(request.url ?? "/", "http://localhost"))) { response.writeHead(404); response.end(); } }
    catch (error) { response.writeHead(500, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) })); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return { origin, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test("W5-13-11 the project brief: a project the catalog does not have is still a 404; a catalog that cannot be read is a 500 and one record, and the next request is served", async () => {
  let catalog: { getProject(id: string): never } = failingCatalog(projectCatalogErrors.project_not_found("找不到"));
  const handle = createProjectArrivalHttp({ localHost: {} as never, renderBrief: () => "", withCatalog: (async (_options: unknown, operation: (c: never) => unknown) => operation(catalog as never)) as never });
  const site = await serve((request, response, url) => handle(request, response, url, undefined));
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    assert.equal((await fetch(`${site.origin}/api/projects/p-gone/brief`)).status, 404);
    assert.deepEqual(entries, [], "absent is an answer, not a failure");
    catalog = failingCatalog(unreadable());
    assert.equal((await fetch(`${site.origin}/api/projects/p-broken/brief`)).status, 500);
    assert.deepEqual(entries.map(entry => [entry.level, entry.area, entry.event, entry.error]), [["error", "projects", "catalog_lookup_failed", { name: "Error", code: "ERR_SQLITE_CORRUPT" }]]);
    catalog = failingCatalog(projectCatalogErrors.project_not_found("找不到"));
    assert.equal((await fetch(`${site.origin}/api/projects/p-other/brief`)).status, 404, "the service still answers");
  } finally { restore(); await site.close(); }
});

test("W5-13-11 the side panel browser's project check: absent is a 404; a catalog that cannot be read reaches the server's 500 with one record, not a 404", async () => {
  let catalog: { getProject(id: string): never } = failingCatalog(projectCatalogErrors.project_not_found("找不到"));
  // As the Web server wires it (web-server.ts `projectExists`).
  const projectExists = async (projectId: string) => projectOrNull(catalog, projectId) !== null;
  const site = await serve((request, response, url) => handleBrowserHttp(request, response, url, { browsers: () => { throw new Error("not reached"); }, projectExists }));
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try {
    assert.equal((await fetch(`${site.origin}/projects/p-gone/api/browser/capture`, { method: "POST" })).status, 404);
    catalog = failingCatalog(unreadable());
    assert.equal((await fetch(`${site.origin}/projects/p-broken/api/browser/capture`, { method: "POST" })).status, 500);
    assert.deepEqual(entries.map(entry => entry.event), ["catalog_lookup_failed"]);
  } finally { restore(); await site.close(); }
});
