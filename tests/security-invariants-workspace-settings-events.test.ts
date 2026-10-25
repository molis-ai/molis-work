import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, DEMO_PROJECT_ID, ensureProjectPlugins, handleProjectPluginHttp, LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins, seedDemoBoard,
  type HostLogEntry, type ProjectPluginHttpPorts } from "@molis-ai/molis-work-app-local-host";
import { PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { deferred } from "./fixtures/home-runtime.js";

const TOKEN = "molis-work-workspace-settings-events-0123456789";
const FILES = "io.molis.work.files";

// BL-521, S-54: the project's folder settings (a folder linked, repaired or unlinked, the browsing folder chosen) are announced as
// `host.workspace.changed@1` with `cause: "workspace-settings"`, from the project platform's own `hostEvents`, so a plugin holding
// the old folder's files reads again. Observed on `PluginHostEvents.broadcast`, which every platform sends through.
interface Heard { workspace_id: string; cause: string; queued: number }

async function fixture(t: TestContext) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-workspace-events-"));
  const home = path.join(directory, ".molis-work");
  const folders = await Promise.all(["alpha", "beta", "gamma"].map(async name => { const folder = path.join(directory, name); await mkdir(folder, { recursive: true }); return folder; }));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "设置事件一", actor_id: "user" });
  const second = await catalog.createProject({ display_name: "设置事件二", actor_id: "user" });
  // Files and Git subscribe to workspace changes; a project that runs neither has nobody to tell.
  for (const project of [first, second]) for (const plugin_id of ["files", "git"] as const) catalog.addProjectPlugin({ project_id: project.project_id, plugin_id, actor_id: "user" });
  catalog.close();
  const heard: Heard[] = [];
  const original = PluginHostEvents.prototype.broadcast;
  t.mock.method(PluginHostEvents.prototype, "broadcast", function (this: PluginHostEvents, input: Parameters<typeof original>[0]) {
    const queued = original.call(this, input);
    const payload = input.payload as { workspace_id: string; cause: string };
    heard.push({ workspace_id: payload.workspace_id, cause: payload.cause, queued });
    return queued;
  });
  let server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN }), origin = "";
  const listen = async () => {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    origin = `http://127.0.0.1:${address.port}`;
  };
  await listen();
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); });
  /** The Host stops and starts again on the same Home: every project's plugin platform is a new one, and opens again on its first plugin route. */
  const restart = async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    server = createMolisWorkWebServer({ homeDirectory: home, controlToken: TOKEN });
    await listen();
  };
  let key = 0;
  const call = (project: string, pathname: string, method: string, body?: Record<string, unknown>) => fetch(`${origin}/projects/${encodeURIComponent(project)}${pathname}`, {
    method, headers: { origin, "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": `settings-events-${key++}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  /** Opening a plugin's own route starts the project's plugin platform, with the plugins the project enables. */
  const startPlatform = async (project: string) => {
    // Files answers for itself (it has no folder to browse yet), which is what shows the project's plugins are running.
    const response = await call(project, `/api/plugins/${FILES}/state`, "GET"), body = await response.text();
    assert.ok(response.status === 200 || response.status === 400 && body.includes("files.invalid"), body);
  };
  const settings = () => heard.filter(item => item.cause === "workspace-settings");
  return { folders, first: first.project_id, second: second.project_id, call, startPlatform, restart, heard, settings, origin: () => origin };
}

test("RAC-461 BL-521 S-54 linking, repairing and unlinking a folder, and choosing the browsing folder, are announced once each as a workspace-settings change", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first); await f.startPlatform(f.second);
  const added = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[0], user_confirmed: true });
  assert.equal(added.status, 201, await added.clone().text());
  const { workspace: alpha } = await added.json() as { workspace: { workspace_id: string } };
  assert.deepEqual(f.settings().map(item => item.workspace_id), [alpha.workspace_id], "the folder just linked");
  assert.ok(f.settings().every(item => item.queued > 0), "a subscriber of the project (Files, Git) was queued the event");

  const second = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[1], user_confirmed: true });
  const { workspace: beta } = await second.json() as { workspace: { workspace_id: string } };
  const repaired = await f.call(f.first, `/api/workspaces/${encodeURIComponent(beta.workspace_id)}/path`, "PATCH", { workspace_path: f.folders[2], user_confirmed: true });
  assert.equal(repaired.status, 200, await repaired.clone().text());
  const { workspace: gamma } = await repaired.json() as { workspace: { workspace_id: string } };
  assert.notEqual(gamma.workspace_id, beta.workspace_id, "a repaired folder is the one at its new path");

  const chosen = await f.call(f.first, "/api/project-settings/workspaces", "POST", { workspace_id: alpha.workspace_id });
  assert.equal(chosen.status, 200, await chosen.clone().text());
  const unlinked = await f.call(f.first, `/api/workspaces/${encodeURIComponent(gamma.workspace_id)}/unlink`, "POST", { user_confirmed: true });
  assert.deepEqual(await unlinked.json(), { changed: true });

  // One announcement per change, each naming its folder, and the other project's platform heard none of them.
  assert.deepEqual(f.settings().map(item => item.workspace_id), [alpha.workspace_id, beta.workspace_id, gamma.workspace_id, alpha.workspace_id, gamma.workspace_id]);
  assert.deepEqual(f.heard.filter(item => item.cause !== "workspace-settings" && item.cause !== "project-opened"), [], "nothing else was announced");
});

test("RAC-462 BL-521 S-54 a refused or unchanged settings change sends no workspace change", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first);
  const early = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[0], user_confirmed: true });
  assert.equal(early.status, 201, await early.clone().text());
  const { workspace } = await early.json() as { workspace: { workspace_id: string } };
  assert.deepEqual(f.settings().map(item => item.workspace_id), [workspace.workspace_id]);

  const before = f.heard.length;
  assert.equal((await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[1] })).status, 400, "an unconfirmed link is refused");
  assert.equal((await f.call(f.first, "/api/project-settings/workspaces", "POST", { workspace_id: "workspace-of-another-project" })).status, 403, "another project's folder is not chosen");
  assert.equal((await f.call(f.first, "/api/workspaces/workspace-unknown/unlink", "POST", { user_confirmed: true })).status, 404);
  assert.equal((await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/path`, "PATCH", { workspace_path: f.folders[2] })).status, 400, "an unconfirmed repair is refused");
  assert.equal(f.heard.length, before, "a refused change is not announced");

  // Unlinked once, announced once; a folder the project no longer lists, or never linked, changes nothing and is not announced.
  assert.deepEqual(await (await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/unlink`, "POST", { user_confirmed: true })).json(), { changed: true });
  assert.equal(f.settings().length, 2);
  assert.equal((await f.call(f.first, `/api/workspaces/${encodeURIComponent(workspace.workspace_id)}/unlink`, "POST", { user_confirmed: true })).status, 404);
  const other = await f.call(f.second, "/api/workspaces", "POST", { workspace_path: f.folders[1], user_confirmed: true });
  const { workspace: foreign } = await other.json() as { workspace: { workspace_id: string } };
  const settled = f.settings().length;
  const never = await f.call(f.first, `/api/workspaces/${encodeURIComponent(foreign.workspace_id)}/unlink`, "POST", { user_confirmed: true });
  assert.ok(never.status === 404 || (await never.json() as { changed?: boolean }).changed === false, "another project's folder is not unlinked by this project");
  assert.equal(f.settings().length, settled, "a folder this project never linked is not announced");
});

test("RAC-463 BL-521 S-54 a project's platform, opened through the web entry, tells its plugins once what they could not hear while none ran", async t => {
  const f = await fixture(t);
  const opened = () => f.heard.filter(item => item.cause === "project-opened");
  assert.deepEqual(opened(), [], "starting the Host announces nothing: no platform is open");

  // The first plugin route of a project opens its platform; it has no folder yet, so the event names none. Later routes announce nothing.
  await f.startPlatform(f.first);
  assert.equal(opened().length, 1);
  assert.equal(opened()[0]!.workspace_id, "");
  assert.ok(opened()[0]!.queued > 0, "a subscriber of the project (Files, Git) was queued the event");
  await f.startPlatform(f.first); await f.startPlatform(f.first);
  assert.equal(opened().length, 1, "once per platform");
  await f.startPlatform(f.second);
  assert.equal(opened().length, 2, "each project's platform announces for itself");

  // A folder is linked and chosen while the platform runs, then the Host restarts: the new platform names the folder the project browses.
  const added = await f.call(f.first, "/api/workspaces", "POST", { workspace_path: f.folders[0], user_confirmed: true });
  const { workspace } = await added.json() as { workspace: { workspace_id: string } };
  assert.equal((await f.call(f.first, "/api/project-settings/workspaces", "POST", { workspace_id: workspace.workspace_id })).status, 200);
  await f.restart();
  const before = opened().length;
  await f.startPlatform(f.first);
  assert.deepEqual(opened().slice(before).map(item => item.workspace_id), [workspace.workspace_id]);
  assert.ok(opened().at(-1)!.queued > 0);
});

test("RAC-463 BL-521 only the web route entry announces a project as opened: starting the platform to discover actions reads and sends nothing", async () => {
  const dir = path.join(process.cwd(), "apps/local-host/src");
  const callers = (await readdir(dir)).filter(file => file.endsWith(".ts")
    && /announceProjectOpened\(/.test(readFileSync(path.join(dir, file), "utf8")));
  assert.deepEqual(callers.sort(), ["project-plugin-http.ts", "workspace-settings-events.ts"]);
});

test("RAC-463 BL-521 R-47 the opening read leaves no call row: a platform's first route refused for its body answers with no call_id", async t => {
  const f = await fixture(t);
  // The first plugin route of the project opens its platform; its body is over the route's limit, so the route refuses it after the
  // opening announcement, whose read succeeded inside the Host. No other call of this request left a row, so the refusal carries no
  // call number, in the body or the header.
  const response = await fetch(`${f.origin()}/projects/${encodeURIComponent(f.first)}/api/plugins/${FILES}/open`, { method: "POST",
    headers: { origin: f.origin(), "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": "settings-events-oversized", "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(300_000) }) });
  const body = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 413, JSON.stringify(body));
  assert.equal(body.code, "actions.input_too_large");
  assert.equal("call_id" in body, false, "the refusal has no call number");
  assert.equal(response.headers.get("x-molis-work-call-id"), null, "nor a call-number header");
  assert.deepEqual(f.heard.filter(item => item.cause === "project-opened").map(item => item.workspace_id), [""], "the opening was announced on this request");
});

test("RAC-463 BL-521 R-47 a platform's first route whose own call left a row answers with that call's number, in the body and the header alike", async t => {
  const f = await fixture(t);
  // Files' open is a command: refused for a folder the project never linked, it leaves a row, and the refusal names it.
  const response = await fetch(`${f.origin()}/projects/${encodeURIComponent(f.first)}/api/plugins/${FILES}/open`, { method: "POST",
    headers: { origin: f.origin(), "x-molis-work-control-token": TOKEN, "x-molis-work-idempotency-key": "settings-events-recorded", "content-type": "application/json" },
    body: JSON.stringify({ workspace_id: "workspace-never-linked", path: ["notes.md"] }) });
  const body = await response.json() as Record<string, unknown>;
  assert.ok(response.status >= 400, JSON.stringify(body));
  assert.equal(typeof body.call_id, "string", JSON.stringify(body));
  assert.equal(response.headers.get("x-molis-work-call-id"), body.call_id, "the header and the body name the same call");
  assert.deepEqual(f.heard.filter(item => item.cause === "project-opened").map(item => item.workspace_id), [""], "the opening was announced on this request");
});

/**
 * Real project platform and public HTTP entry; the opening reads the project's linked folders through `workspacesFor`, the port a
 * test faults or counts. With one linked folder and nothing chosen, that folder is the one the project browses.
 */
async function openingRouteFixture(t: TestContext, workspacesFor: ProjectPluginHttpPorts["workspacesFor"],
  options: { arrived?(): void; heard?: Array<Heard & { host: PluginHostEvents }> } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-project-opened-"));
  const file = path.join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const ports: ProjectPluginHttpPorts = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user",
    actions: pluginActions(store, DEMO_PROJECT_ID), workspacesFor };
  const heard: Array<Heard & { host: PluginHostEvents }> = options.heard ?? [];
  if (!options.heard) {
    const original = PluginHostEvents.prototype.broadcast;
    t.mock.method(PluginHostEvents.prototype, "broadcast", function (this: PluginHostEvents, input: Parameters<typeof original>[0]) {
      const queued = original.call(this, input), payload = input.payload as { workspace_id: string; cause: string };
      heard.push({ host: this, workspace_id: payload.workspace_id, cause: payload.cause, queued });
      return queued;
    });
  }
  let finished = 0;
  const server = createServer((request, response) => {
    options.arrived?.(); response.once("finish", () => { finished++; });
    void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), ports).then(handled => {
      if (!handled) { response.writeHead(404); response.end(); }
    }).catch(error => { response.writeHead(500); response.end(String(error)); });
  });
  t.after(async () => {
    try {
      if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()));
      await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
  });
  const { platform } = await ensureProjectPlugins(ports);
  assert.ok(platform);
  assert.equal(platform.supervisor.state("io.molis.work.coding")?.status, "running");
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const request = () => fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/view-revision`);
  const opened = () => heard.filter(item => item.host === platform.hostEvents && item.cause === "project-opened")
    .map(({ workspace_id, cause, queued }) => ({ workspace_id, cause, queued }));
  return { platform, ports, request, opened, heard, finished: () => finished };
}

/** One folder linked to the project and usable. */
const linked = (workspace_id: string) => ({ workspace_id, canonical_path: "/test/" + workspace_id, realpath_verified: true, display_name: workspace_id });

for (const failure of ["throw", "reject"] as const) {
  test(`RAC-463 BL-521 S-54 a failed opening announcement is retried by the next web route (${failure})`, async t => {
    const logs: HostLogEntry[] = [];
    t.after(captureHostLog(logs));
    let reads = 0;
    const f = await openingRouteFixture(t, () => {
      if (++reads === 1) {
        const error = new Error("linked folders temporarily unavailable");
        if (failure === "throw") throw error;
        return Promise.reject(error);
      }
      return Promise.resolve([linked("workspace-recovered")]);
    });
    assert.equal(reads, 0, "headless platform startup must not read the browsing directory");
    assert.deepEqual(f.opened(), [], "headless startup must not announce an opening");
    assert.equal((await f.request()).status, 200, "a failed announcement must not fail the plugin route");
    assert.equal(reads, 1);
    assert.deepEqual(f.opened(), [], "a failed read must not announce an empty or stale directory");
    assert.equal(logs.filter(entry => entry.event === "opened_announce_failed").length, 1);

    assert.equal((await f.request()).status, 200);
    assert.equal(reads, 2, "the next route must retry the failed attempt on the same platform");
    assert.deepEqual(f.opened().map(item => item.workspace_id), ["workspace-recovered"]);
    assert.equal((await f.request()).status, 200);
    assert.equal(reads, 2, "a successful announcement is retained");
    assert.equal(f.opened().length, 1);
  });
}

test("RAC-463 BL-521 S-54 concurrent web routes share the announcement and drain, while another platform opens independently", async t => {
  const read = deferred(), reading = deferred(), arrived = deferred(), draining = deferred(), drained = deferred();
  let reads = 0, requests = 0;
  const f = await openingRouteFixture(t, () => { reads++; reading.resolve(); return read.promise.then(() => [linked("workspace-concurrent")]); },
    { arrived: () => { if (++requests === 2) arrived.resolve(); } });
  const drain = f.platform.hostEvents.drain.bind(f.platform.hostEvents);
  t.mock.method(f.platform.hostEvents, "drain", async () => { await drain(); draining.resolve(); await drained.promise; });
  const pending = [f.request(), f.request()];
  try {
    await reading.promise; await arrived.promise;
    assert.equal(reads, 1, "concurrent routes share one in-flight browsing read");
    assert.equal(f.finished(), 0);
    assert.deepEqual(f.opened(), []);

    let otherReads = 0;
    const other = await openingRouteFixture(t, () => { otherReads++; return Promise.resolve([]); }, { heard: f.heard });
    assert.equal((await other.request()).status, 200);
    assert.equal(otherReads, 1, "another platform with the same project id has its own opening");
    assert.deepEqual(other.opened().map(item => item.workspace_id), [""]);
    assert.deepEqual(f.opened(), []);

    read.resolve();
    await draining.promise;
    assert.deepEqual(f.opened().map(item => item.workspace_id), ["workspace-concurrent"]);
    assert.equal(f.finished(), 0, "neither route answers before the original drain completes");
    drained.resolve();
    assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200, 200]);
    assert.equal((await f.request()).status, 200);
    assert.equal(reads, 1);
    assert.equal(f.opened().length, 1);
  } finally { read.resolve(); drained.resolve(); await Promise.allSettled(pending); }
});
