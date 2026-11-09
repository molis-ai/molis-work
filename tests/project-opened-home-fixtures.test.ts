import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { captureHostLog, MolisWorkProjectCatalog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { projectDirectoryActions, type ProjectDirectories, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { HOST_WORKSPACE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { openTestHome } from "./fixtures/test-home.js";

type HostOptions = NonNullable<Parameters<typeof serveHomeRuntime>[1]>;
type Fixture = "serveHomeRuntime" | "openTestHome";

async function open(t: TestContext, fixture: Fixture, options: HostOptions = {}) {
  if (fixture === "serveHomeRuntime") {
    const f = await serveHomeRuntime(t, options);
    return { ...f, web: new LocalHostHttpClient({ origin: f.origin, controlToken: f.token }) };
  }
  const f = await openTestHome(t, { host: options });
  return { ...f, token: f.controlToken, project: f.createProject };
}

type Home = Awaited<ReturnType<typeof open>>;
const pagesPath = (projectId: string) => `/projects/${projectId}/api/plugins/io.molis.work.pages/pages`;
const get = (f: Home, path: string) => fetch(f.origin + path, { headers: { origin: f.origin, "x-molis-work-control-token": f.token } });
const post = (f: Home, path: string, raw: string) => fetch(f.origin + path, { method: "POST", body: raw,
  headers: { origin: f.origin, "content-type": "application/json", "x-molis-work-control-token": f.token, "x-molis-work-idempotency-key": randomUUID() } });

function observe(t: TestContext) {
  const opened: string[] = [], openingIds: Array<string | undefined> = [], logs: HostLogEntry[] = [];
  t.after(captureHostLog(logs));
  const original = PluginHostEvents.prototype.broadcast;
  t.mock.method(PluginHostEvents.prototype, "broadcast", function (this: PluginHostEvents, input: Parameters<typeof original>[0]) {
    const queued = original.call(this, input);
    const payload = input.payload as { cause?: string; workspace_id?: string };
    if (input.event_type_id === HOST_WORKSPACE_CHANGED_EVENT && payload.cause === "project-opened") {
      opened.push(payload.workspace_id!); openingIds.push(currentCallId());
    }
    return queued;
  });
  return { opened, openingIds, logs };
}

async function folder(t: TestContext, name: string): Promise<ProjectWorkspaceRef> {
  const canonical_path = await realpath(await mkdtemp(join(tmpdir(), "opening-workspace-")));
  t.after(() => rm(canonical_path, { recursive: true, force: true }));
  await writeFile(join(canonical_path, "note.txt"), name);
  return { workspace_id: name, canonical_path, realpath_verified: true, display_name: name };
}

/** The project's inputs and output, read over HTTP as the settings page reads them. */
const directories = (f: Home, projectId: string) => f.web.get<ProjectDirectories>(`/projects/${projectId}/api/project-settings/directories`);
/** One change of the project's folders over HTTP, from the revision read now, as the settings page makes it. */
async function changeDirectories(f: Home, projectId: string, change: string, input: Record<string, unknown>) {
  const { revision } = await directories(f, projectId);
  return f.web.post<ProjectDirectories>(`/projects/${projectId}/api/project-settings/directories`, { change, input: { ...input, expected_revision: revision } });
}
const outputOf = (folders: ProjectDirectories) => folders.directories.find(row => row.roles.includes("output"))!;

function pagesCount(f: Home, projectId: string) {
  const store = openPagesStore(f.home);
  try { return store.list(projectId).length; } finally { store.close(); }
}

for (const fixture of ["serveHomeRuntime", "openTestHome"] as const) {
  test(`RAC-463-FIXTURE-01 ${fixture}: cold invalid bodies read the real Catalog, leave no diagnostic and announce each project's own output`, async t => {
    const { opened, openingIds, logs } = observe(t), f = await open(t, fixture), outputs: string[] = [];
    // A different project for each refusal keeps both requests cold; no warm-up can hide a missing opening dependency.
    for (const [raw, status, error, code] of [
      [" ".repeat(1_000_001), 413, "请求内容过大", "actions.input_too_large"],
      ["{not json", 400, "请求不是有效 JSON", "actions.input_invalid"],
    ] as const) {
      const project = await f.project(`cold ${status}`), before = openingIds.length;
      outputs.push(outputOf(await directories(f, project.project_id)).workspace_id);
      const response = await post(f, pagesPath(project.project_id), raw);
      assert.deepEqual([response.status, await response.json()], [status, { error, code }]);
      assert.equal(response.headers.get("x-molis-work-call-id"), null);
      assert.equal(openingIds.length, before + 1);
      const id = openingIds.at(-1); assert.ok(id, "observe the request's existing operation id without creating a scope");
      assert.deepEqual(f.host.callLog.find(id), [], "this request left no call row; scheduled Feed calls have their own operation ids");
      assert.equal(pagesCount(f, project.project_id), 0, "neither refusal reached the Pages command");
    }
    // A project with no folder chosen still has its one output, the default location (specs/shared-sources-and-surfaces §3).
    assert.deepEqual(opened, outputs, "each real project with no folder chosen was successfully opened once, with its own default output");
    assert.deepEqual(logs.filter(row => row.event === "opened_announce_failed"), []);
  });

  test(`RAC-463-FIXTURE-01 ${fixture}: a folder made the output over HTTP is read and announced once`, async t => {
    const { opened, openingIds, logs } = observe(t), workspace = await folder(t, "catalog-note"), f = await open(t, fixture);
    const project = await f.project("linked Catalog");
    const added = { workspace: outputOf(await changeDirectories(f, project.project_id, "set_output", { workspace_path: workspace.canonical_path })) };
    assert.equal(added.workspace.canonical_path, workspace.canonical_path);
    assert.deepEqual(opened, [], "settings are not a plugin route opening");
    const response = await get(f, pagesPath(project.project_id));
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(opened, [added.workspace.workspace_id]);
    assert.equal(response.headers.get("x-molis-work-call-id"), null);
    const id = openingIds[0]; assert.ok(id);
    assert.deepEqual(f.host.callLog.find(id), [], "opening the output adds no fault row to this request");
    const selected = outputOf(await f.host.client(project.reference).invoke(projectDirectoryActions.get, {}) as ProjectDirectories);
    assert.equal(selected.canonical_path, workspace.canonical_path);
    const read = await f.host.actionClient(project.reference).invoke(person(["workspace:read"], project.project_id), workspaceReadActions.file,
      { workspace_id: added.workspace.workspace_id, path: ["note.txt"], kind: "text" }) as { outcome: string; text: string };
    assert.deepEqual([read.outcome, read.text], ["text", "catalog-note"]);
    assert.equal((await get(f, pagesPath(project.project_id))).status, 200);
    assert.deepEqual(opened, [added.workspace.workspace_id], "later routes retain the successful opening");
    assert.deepEqual(logs.filter(row => row.event === "opened_announce_failed"), []);
  });

  test(`RAC-463-FIXTURE-02 ${fixture}: a supplied single-folder port owns reads, including null and rejection`, async t => {
    observe(t);
    const supplied = await folder(t, "single-port"), catalog = await folder(t, "catalog-port");
    let current: ProjectWorkspaceRef | null = supplied, failed = false;
    const f = await open(t, fixture, { workspaceFor: () => {
      if (failed) return Promise.reject(new ActionError("actions.connection_required", "single folder unavailable"));
      return Promise.resolve(current);
    } });
    const project = await f.project("single folder");
    // The catalog's folders are the project's setting; which folders the Host's reads reach is the supplied port's.
    const linked = (await changeDirectories(f, project.project_id, "add_input", { workspace_path: catalog.canonical_path })).directories.find(row => row.canonical_path === catalog.canonical_path)!;
    const actions = f.host.actionClient(project.reference), caller = person(["workspace:read"], project.project_id);
    const fileOf = (workspace_id: string) => actions.invoke(caller, workspaceReadActions.file, { workspace_id, path: ["note.txt"], kind: "text" }) as Promise<{ outcome: string; text?: string }>;
    const read = await fileOf(supplied.workspace_id);
    assert.deepEqual([read.outcome, read.text], ["text", "single-port"]);
    assert.equal((await fileOf(linked.workspace_id)).outcome, "denied", "Catalog membership cannot replace the supplied authority");
    current = null;
    const denied = await fileOf(supplied.workspace_id);
    assert.equal(denied.outcome, "denied", "removing the explicit grant closes the same file read");
    failed = true;
    await assert.rejects(fileOf(supplied.workspace_id), { code: "actions.connection_required" });
  });

  test(`RAC-463-FIXTURE-02 ${fixture}: an explicit multi-folder port takes precedence over the single-folder port`, async t => {
    observe(t);
    const supplied = await folder(t, "multi-port");
    const f = await open(t, fixture, { workspacesFor: () => [supplied], workspaceFor: () => { throw new Error("the single-folder port must not replace the explicit list"); } });
    const project = await f.project("multi folder");
    const read = await f.host.actionClient(project.reference).invoke(person(["workspace:read"], project.project_id), workspaceReadActions.file,
      { workspace_id: supplied.workspace_id, path: ["note.txt"], kind: "text" }) as { outcome: string; text: string };
    assert.deepEqual([read.outcome, read.text], ["text", "multi-port"], "the explicit list answers the read; the single-folder port is never asked");
    const response = await post(f, pagesPath(project.project_id), "{not json");
    assert.deepEqual([response.status, await response.json()], [400, { error: "请求不是有效 JSON", code: "actions.input_invalid" }]);
  });

  // The opening reads the project's folders from the Home catalog (`projects.directories.get@1`): there is no folder port it can go
  // without any more, so the dependency is faulted where it is read, the catalog's own read of the project's folders.
  for (const fault of ["failing"] as const) {
    test(`RAC-463-FIXTURE-03 ${fixture}: an intentionally ${fault} opening dependency remains traceable in the actual request log`, async t => {
      const { opened } = observe(t);
      const f = await open(t, fixture);
      const project = await f.project("opening diagnostic"), base = pagesPath(project.project_id);
      const code = "actions.connection_required", original = MolisWorkProjectCatalog.prototype.projectDirectories;
      t.mock.method(MolisWorkProjectCatalog.prototype, "projectDirectories", function (this: MolisWorkProjectCatalog, projectId: string) {
        if (projectId === project.project_id) throw new ActionError(code, "directory unavailable");
        return original.call(this, projectId);
      });
      const response = await post(f, base, " ".repeat(1_000_001));
      const id = response.headers.get("x-molis-work-call-id");
      assert.ok(id, "an opening failure actually wrote a diagnostic in this request");
      assert.deepEqual([response.status, await response.json()], [413, { error: "请求内容过大", code: "actions.input_too_large", call_id: id }]);
      assert.equal(pagesCount(f, project.project_id), 0);
      const rows = f.host.callLog.find(id);
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0]!.project_id, rows[0]!.capability_id, rows[0]!.code, rows[0]!.ok],
        [project.project_id, projectDirectoryActions.get.capability_id, code, false]);
      assert.equal(rows[0]!.call_id, id);
      assert.deepEqual(opened, [], "a dependency failure cannot become an empty-directory announcement");

      const created = await post(f, base, JSON.stringify({ title: "real command" }));
      assert.equal(created.status, 200, await created.clone().text());
      const commandId = created.headers.get("x-molis-work-call-id");
      assert.ok(commandId); assert.notEqual(commandId, id);
      const operation = f.host.callLog.find(commandId);
      assert.ok(operation.some(row => row.capability_id === projectDirectoryActions.get.capability_id && row.code === code));
      assert.ok(operation.some(row => row.capability_id === pagesActions.create.capability_id && row.ok && row.call_id === commandId),
        "the actual Pages command and its preparation are traceable under this request's one id");
      assert.equal(pagesCount(f, project.project_id), 1);

      const next = await post(f, base, JSON.stringify({ title: "next request" }));
      assert.equal(next.status, 200, await next.clone().text());
      const nextId = next.headers.get("x-molis-work-call-id");
      assert.ok(nextId); assert.notEqual(nextId, commandId); assert.notEqual(nextId, id);
      assert.ok(f.host.callLog.find(nextId).some(row => row.capability_id === pagesActions.create.capability_id && row.ok && row.call_id === nextId));
      assert.equal(pagesCount(f, project.project_id), 2);
    });
  }
}
