import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, DEMO_PROJECT_ID, ensureProjectPlugins, handleProjectPluginHttp, LocalProjectDatabase, openProjectVersionStores, releaseProjectPlugins, seedDemoBoard,
  type HostLogEntry, type ProjectPluginHttpPorts } from "@molis-ai/molis-work-app-local-host";
import { PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";
import type { ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, readdir, rename, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";
import { fakeProjectSettings, pluginActions } from "./fixtures/plugin-actions.js";
import { deferred } from "./fixtures/home-runtime.js";

const TOKEN = "molis-work-workspace-settings-events-0123456789";
const FILES = "io.molis.work.files";

// BL-521, S-54: the project's folder settings (a folder added as an input, repaired or removed, the output set: `projects.directories.*`,
// specs/shared-sources-and-surfaces §3) are announced as
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
  /** The project's inputs and output, read over HTTP as the settings page reads them. */
  const directories = async (project: string) => {
    const response = await call(project, "/api/project-settings/directories", "GET");
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as ProjectDirectories;
  };
  /** One change of the project's folders over HTTP, from the revision read now unless one is given, as the settings page makes it. */
  const change = async (project: string, kind: string, input: Record<string, unknown>, revision?: string) =>
    call(project, "/api/project-settings/directories", "POST", { change: kind, input: { ...input, expected_revision: revision ?? (await directories(project)).revision } });
  return { folders, first: first.project_id, second: second.project_id, call, startPlatform, restart, heard, settings, directories, change, origin: () => origin };
}

const outputOf = (folders: ProjectDirectories) => folders.directories.find(item => item.roles.includes("output"))!.workspace_id;
/** The folders a change concerns: what was added or went, and every folder whose roles or path changed. */
function concerned(before: ProjectDirectories, after: ProjectDirectories): string[] {
  const shape = (folders: ProjectDirectories) => new Map(folders.directories.map(item => [item.workspace_id, `${item.roles.join(",")}:${item.canonical_path}`]));
  const old = shape(before), now = shape(after);
  return [...[...now].filter(([id, value]) => old.get(id) !== value).map(([id]) => id), ...[...old.keys()].filter(id => !now.has(id))].sort();
}

test("RAC-461 BL-521 S-54 linking, repairing and unlinking a folder, and setting the output, are announced once each as a workspace-settings change, naming each folder it concerns", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first); await f.startPlatform(f.second);
  const expected: string[] = [];
  /** One change, and the folders it is announced for: exactly those whose roles or path it changed, each once. */
  const step = async (kind: string, input: Record<string, unknown>) => {
    const before = await f.directories(f.first), heard = f.settings().length;
    const response = await f.change(f.first, kind, input);
    assert.equal(response.status, 200, await response.clone().text());
    const after = await response.json() as ProjectDirectories, named = concerned(before, after);
    assert.ok(named.length > 0, `${kind} changed a folder`);
    assert.deepEqual(f.settings().slice(heard).map(item => item.workspace_id).sort(), named, `${kind} is announced once for each folder it concerns`);
    expected.push(...f.settings().slice(heard).map(item => item.workspace_id));
    return after;
  };
  // Linked: the folder added as an input.
  const alpha = (await step("add_input", { workspace_path: f.folders[0] })).directories.find(item => item.roles.includes("input"))!;
  assert.deepEqual(f.settings().map(item => item.workspace_id), [alpha.workspace_id], "the folder just linked");
  assert.ok(f.settings().every(item => item.queued > 0), "a subscriber of the project (Files, Git) was queued the event");

  const beta = (await step("add_input", { workspace_path: f.folders[1] })).directories.find(item => item.workspace_id !== alpha.workspace_id && item.roles.includes("input"))!;
  // Repaired: the folder moved on disk, and it is found again at its new path. The folder keeps its identity (§3), so the event names it.
  await rm(f.folders[2]!, { recursive: true, force: true }); await rename(f.folders[1]!, f.folders[2]!);
  const repaired = (await step("repair", { workspace_id: beta.workspace_id, workspace_path: f.folders[2] })).directories.find(item => item.workspace_id === beta.workspace_id)!;
  assert.equal(repaired.state, "ok", "a repaired folder is the one at its new path");

  // The output set to a linked folder: that folder and the one that stops being the output.
  const outputBefore = outputOf(await f.directories(f.first));
  const output = await step("set_output", { workspace_id: alpha.workspace_id });
  assert.equal(outputOf(output), alpha.workspace_id);
  assert.ok(f.settings().slice(-2).some(item => item.workspace_id === outputBefore), "the folder that stops being the output is told too");
  // Unlinked: the input removed.
  await step("remove_input", { workspace_id: beta.workspace_id });
  assert.equal(f.settings().at(-1)!.workspace_id, beta.workspace_id);

  // One announcement per folder of each change, and the other project's platform heard none of them.
  assert.deepEqual(f.settings().map(item => item.workspace_id), expected);
  assert.deepEqual(f.heard.filter(item => item.cause !== "workspace-settings" && item.cause !== "project-opened"), [], "nothing else was announced");
});

test("RAC-462 BL-521 S-54 a refused or unchanged settings change sends no workspace change", async t => {
  const f = await fixture(t);
  await f.startPlatform(f.first);
  const early = await f.change(f.first, "add_input", { workspace_path: f.folders[0] });
  assert.equal(early.status, 200, await early.clone().text());
  const workspace = (await early.json() as ProjectDirectories).directories.find(item => item.roles.includes("input"))!;
  assert.deepEqual(f.settings().map(item => item.workspace_id), [workspace.workspace_id]);

  const before = f.heard.length;
  const stale = (await f.directories(f.first)).revision === "stale" ? "older" : "stale";
  const MEMBER = "catalog.context.workspace_membership_not_found";
  const refusals: Array<[string, Response, number, string | undefined]> = [
    ["a change made from a revision that is not the current one is refused", await f.change(f.first, "add_input", { workspace_path: f.folders[1] }, stale), 409, "actions.conflict"],
    ["another project's folder is not made the output", await f.change(f.first, "set_output", { workspace_id: "workspace-of-another-project" }), 400, MEMBER],
    ["a folder the project never linked is not removed", await f.change(f.first, "remove_input", { workspace_id: "workspace-unknown" }), 400, MEMBER],
    ["a folder that is still where it was is not repaired", await f.change(f.first, "repair", { workspace_id: workspace.workspace_id, workspace_path: f.folders[2] }), 400, "actions.input_invalid"],
    ["a change the settings page does not know is refused", await f.call(f.first, "/api/project-settings/directories", "POST", { change: "link", input: {} }), 400, undefined],
  ];
  for (const [why, response, status, code] of refusals) {
    const body = await response.json() as { code?: string };
    assert.deepEqual([response.status, body.code], [status, code], why);
  }
  assert.equal(f.heard.length, before, "a refused change is not announced");

  // Unlinked once, announced once; a folder the project no longer lists, or never linked, changes nothing and is not announced.
  assert.equal((await f.change(f.first, "remove_input", { workspace_id: workspace.workspace_id })).status, 200);
  assert.equal(f.settings().length, 2);
  const again = await f.change(f.first, "remove_input", { workspace_id: workspace.workspace_id });
  assert.deepEqual([again.status, (await again.json() as { code?: string }).code], [400, MEMBER], "removed once, it is not removed again");
  const other = await f.change(f.second, "add_input", { workspace_path: f.folders[1] });
  const foreign = (await other.json() as ProjectDirectories).directories.find(item => item.roles.includes("input"))!;
  const settled = f.settings().length;
  const never = await f.change(f.first, "remove_input", { workspace_id: foreign.workspace_id });
  assert.deepEqual([never.status, (await never.json() as { code?: string }).code], [400, MEMBER], "another project's folder is not unlinked by this project");
  assert.equal((await f.directories(f.second)).directories.some(item => item.workspace_id === foreign.workspace_id), true, "and stays the other project's");
  assert.equal(f.settings().length, settled, "a folder this project never linked is not announced");
});

test("RAC-463 BL-521 S-54 a project's platform, opened through the web entry, tells its plugins once what they could not hear while none ran", async t => {
  const f = await fixture(t);
  const opened = () => f.heard.filter(item => item.cause === "project-opened");
  assert.deepEqual(opened(), [], "starting the Host announces nothing: no platform is open");

  // The first plugin route of a project opens its platform; no folder is chosen yet, so the event names its default output. Later routes announce nothing.
  await f.startPlatform(f.first);
  assert.equal(opened().length, 1);
  assert.equal(opened()[0]!.workspace_id, outputOf(await f.directories(f.first)));
  assert.ok(opened()[0]!.queued > 0, "a subscriber of the project (Files, Git) was queued the event");
  await f.startPlatform(f.first); await f.startPlatform(f.first);
  assert.equal(opened().length, 1, "once per platform");
  await f.startPlatform(f.second);
  assert.equal(opened().length, 2, "each project's platform announces for itself");

  // A folder is made the output while the platform runs, then the Host restarts: the new platform names the project's output.
  const set = await f.change(f.first, "set_output", { workspace_path: f.folders[0] });
  assert.equal(set.status, 200, await set.clone().text());
  const workspace = { workspace_id: outputOf(await set.json() as ProjectDirectories) };
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
  assert.deepEqual(f.heard.filter(item => item.cause === "project-opened").map(item => item.workspace_id), [outputOf(await f.directories(f.first))], "the opening was announced on this request");
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
  assert.deepEqual(f.heard.filter(item => item.cause === "project-opened").map(item => item.workspace_id), [outputOf(await f.directories(f.first))], "the opening was announced on this request");
});

/**
 * Real project platform and public HTTP entry; the opening asks the project's folders through the Host's action client, as the Host
 * itself (`local-host`), and `output` answers that ask (`projects.directories.get@1`) with the project's output, or none, for the test
 * to fault or count. Files, which reads the folders again once the opening is announced, is told there are none.
 */
async function openingRouteFixture(t: TestContext, output: () => unknown,
  options: { arrived?(): void; heard?: Array<Heard & { host: PluginHostEvents }> } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "molis-work-project-opened-"));
  const file = path.join(directory, "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  fakeProjectSettings(actions, async (_definition, caller) => {
    if (caller.actor_id !== "local-host") return [];
    const folder = await output();
    return folder ? [folder] : [];
  });
  const ports: ProjectPluginHttpPorts = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actorId: "web-user", actions };
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

/** One folder of the project, usable and its output. */
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
      return Promise.resolve(linked("workspace-recovered"));
    });
    assert.equal(reads, 0, "headless platform startup must not read the project's folders");
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
  const f = await openingRouteFixture(t, () => { reads++; reading.resolve(); return read.promise.then(() => linked("workspace-concurrent")); },
    { arrived: () => { if (++requests === 2) arrived.resolve(); } });
  const drain = f.platform.hostEvents.drain.bind(f.platform.hostEvents);
  t.mock.method(f.platform.hostEvents, "drain", async () => { await drain(); draining.resolve(); await drained.promise; });
  const pending = [f.request(), f.request()];
  try {
    await reading.promise; await arrived.promise;
    assert.equal(reads, 1, "concurrent routes share one in-flight read of the project's folders");
    assert.equal(f.finished(), 0);
    assert.deepEqual(f.opened(), []);

    let otherReads = 0;
    const other = await openingRouteFixture(t, () => { otherReads++; return Promise.resolve(null); }, { heard: f.heard });
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
