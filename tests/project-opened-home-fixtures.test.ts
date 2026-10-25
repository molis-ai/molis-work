import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { projectSettingsCapabilities, projectsCapabilities, type ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { HOST_WORKSPACE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentCallId } from "@molis-ai/molis-work-kernel";
import { openPagesStore, pagesActions } from "@molis-ai/molis-work-plugin-pages";
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

function pagesCount(f: Home, projectId: string) {
  const store = openPagesStore(f.home);
  try { return store.list(projectId).length; } finally { store.close(); }
}

for (const fixture of ["serveHomeRuntime", "openTestHome"] as const) {
  test(`RAC-463-FIXTURE-01 ${fixture}: cold invalid bodies read the real empty Catalog, leave no diagnostic and show no invented id`, async t => {
    const { opened, openingIds, logs } = observe(t), f = await open(t, fixture);
    // A different project for each refusal keeps both requests cold; no warm-up can hide a missing opening dependency.
    for (const [raw, status, error, code] of [
      [" ".repeat(1_000_001), 413, "请求内容过大", "actions.input_too_large"],
      ["{not json", 400, "请求不是有效 JSON", "actions.input_invalid"],
    ] as const) {
      const project = await f.project(`cold ${status}`), before = openingIds.length;
      const response = await post(f, pagesPath(project.project_id), raw);
      assert.deepEqual([response.status, await response.json()], [status, { error, code }]);
      assert.equal(response.headers.get("x-molis-work-call-id"), null);
      assert.equal(openingIds.length, before + 1);
      const id = openingIds.at(-1); assert.ok(id, "observe the request's existing operation id without creating a scope");
      assert.deepEqual(f.host.callLog.find(id), [], "this request left no call row; scheduled Feed calls have their own operation ids");
      assert.equal(pagesCount(f, project.project_id), 0, "neither refusal reached the Pages command");
    }
    assert.deepEqual(opened, ["", ""], "each real empty project was successfully opened once");
    assert.deepEqual(logs.filter(row => row.event === "opened_announce_failed"), []);
  });

  test(`RAC-463-FIXTURE-01 ${fixture}: a folder linked and selected over HTTP is read and announced once`, async t => {
    const { opened, openingIds, logs } = observe(t), workspace = await folder(t, "catalog-note"), f = await open(t, fixture);
    const project = await f.project("linked Catalog"), base = `/projects/${project.project_id}`;
    const added = await f.web.post<{ workspace: ProjectWorkspaceRef }>(base + "/api/workspaces", { workspace_path: workspace.canonical_path, user_confirmed: true });
    await f.web.post(base + "/api/project-settings/workspaces", { workspace_id: added.workspace.workspace_id });
    assert.deepEqual(opened, [], "settings are not a plugin route opening");
    const response = await get(f, pagesPath(project.project_id));
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(opened, [added.workspace.workspace_id]);
    assert.equal(response.headers.get("x-molis-work-call-id"), null);
    const id = openingIds[0]; assert.ok(id);
    assert.deepEqual(f.host.callLog.find(id), [], "opening the selected folder adds no fault row to this request");
    const selected = await f.host.client(project.reference).invoke(projectSettingsCapabilities.browsingWorkspace, []);
    assert.equal(selected?.canonical_path, workspace.canonical_path);
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
    const project = await f.project("single folder"), client = f.host.client(project.reference);
    await f.web.post(`/projects/${project.project_id}/api/workspaces`, { workspace_path: catalog.canonical_path, user_confirmed: true });
    assert.deepEqual(await client.invoke(projectsCapabilities.listWorkspaces, []), [supplied], "Catalog membership cannot replace the supplied authority");
    assert.deepEqual(await client.invoke(projectSettingsCapabilities.browsingWorkspace, []), supplied);
    const actions = f.host.actionClient(project.reference), caller = person(["workspace:read"], project.project_id);
    const read = await actions.invoke(caller, workspaceReadActions.file, { workspace_id: supplied.workspace_id, path: ["note.txt"], kind: "text" }) as { outcome: string; text: string };
    assert.deepEqual([read.outcome, read.text], ["text", "single-port"]);
    current = null;
    assert.deepEqual(await client.invoke(projectsCapabilities.listWorkspaces, []), []);
    assert.equal(await client.invoke(projectSettingsCapabilities.browsingWorkspace, []), null);
    const denied = await actions.invoke(caller, workspaceReadActions.file, { workspace_id: supplied.workspace_id, path: ["note.txt"], kind: "text" }) as { outcome: string };
    assert.equal(denied.outcome, "denied", "removing the explicit grant closes the same file read");
    failed = true;
    await assert.rejects(client.invoke(projectSettingsCapabilities.browsingWorkspace, []), { code: "actions.connection_required" });
  });

  test(`RAC-463-FIXTURE-02 ${fixture}: an explicit multi-folder port takes precedence over the single-folder port`, async t => {
    observe(t);
    const supplied = await folder(t, "multi-port");
    const f = await open(t, fixture, { workspacesFor: () => [supplied], workspaceFor: () => { throw new Error("the single-folder port must not replace the explicit list"); } });
    const project = await f.project("multi folder");
    assert.deepEqual(await f.host.client(project.reference).invoke(projectsCapabilities.listWorkspaces, []), [supplied]);
    assert.deepEqual(await f.host.client(project.reference).invoke(projectSettingsCapabilities.browsingWorkspace, []), supplied);
    const response = await post(f, pagesPath(project.project_id), "{not json");
    assert.deepEqual([response.status, await response.json()], [400, { error: "请求不是有效 JSON", code: "actions.input_invalid" }]);
  });

  for (const fault of ["unavailable", "failing"] as const) {
    test(`RAC-463-FIXTURE-03 ${fixture}: ${fault} Catalog opening logs the request, retries and never invents an action receipt`, async t => {
      const { opened, logs } = observe(t), f = await open(t, fixture);
      const project = await f.project("opening diagnostic"), base = pagesPath(project.project_id);
      const code = fault === "unavailable" ? "actions.dependency_missing" : "actions.connection_required";
      let blocked = true, attempts = 0;
      // The Web composition reads this cached Catalog directly. Host option overrides no longer intercept that read.
      await f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: f.home }, catalog => {
        const original = catalog.listWorkspaceDirectory;
        t.mock.method(catalog, "listWorkspaceDirectory", function (...args: Parameters<typeof original>) {
          if (args[0] === project.project_id) {
            attempts++;
            if (blocked) throw new ActionError(code, "directory unavailable");
          }
          return original.apply(catalog, args);
        });
      });
      const warnings = () => logs.filter(row => row.area === "workspace-settings" && row.event === "opened_announce_failed" && row.fields?.project_id === project.project_id);
      const warningId = (index: number) => {
        const warning = warnings()[index]; assert.ok(warning);
        assert.equal(warning.level, "warn"); assert.equal(warning.error?.code, code);
        assert.deepEqual(warning.fields, { project_id: project.project_id });
        assert.ok(warning.call_id, "the Host warning keeps the existing request scope without creating an action row");
        return warning.call_id;
      };
      for (const [raw, status, error, refusal] of [
        [" ".repeat(1_000_001), 413, "请求内容过大", "actions.input_too_large"],
        ["{not json", 400, "请求不是有效 JSON", "actions.input_invalid"],
      ] as const) {
        const index = warnings().length, response = await post(f, base, raw);
        assert.deepEqual([response.status, await response.json()], [status, { error, code: refusal }]);
        assert.equal(response.headers.get("x-molis-work-call-id"), null, "R-47 exposes an id only after an actual action record");
        assert.equal(warnings().length, index + 1, "the next route retries the failed opening");
        const id = warningId(index);
        assert.deepEqual(f.host.callLog.find(id), [], "the internal Catalog failure is a Host diagnostic, not a synthetic action");
        assert.equal(pagesCount(f, project.project_id), 0);
      }
      const firstId = warningId(0), secondId = warningId(1); assert.notEqual(firstId, secondId);
      assert.deepEqual(opened, [], "a failed directory read cannot announce an empty directory");

      const created = await post(f, base, JSON.stringify({ title: "real command" }));
      assert.equal(created.status, 200, await created.clone().text());
      const commandId = created.headers.get("x-molis-work-call-id");
      assert.ok(commandId); assert.notEqual(commandId, firstId); assert.notEqual(commandId, secondId);
      assert.equal(warningId(2), commandId, "the real Pages action and Host warning share this request's existing id");
      assert.equal((await created.json()).call_id, undefined, "a successful body keeps its business shape");
      const operation = f.host.callLog.find(commandId);
      assert.ok(operation.some(row => row.capability_id === pagesActions.create.capability_id && row.ok && row.call_id === commandId));
      assert.ok(operation.every(row => row.capability_id !== projectSettingsCapabilities.browsingWorkspace.capability_id));
      assert.equal(pagesCount(f, project.project_id), 1);

      const next = await post(f, base, JSON.stringify({ title: "next request" }));
      assert.equal(next.status, 200, await next.clone().text());
      const nextId = next.headers.get("x-molis-work-call-id");
      assert.ok(nextId); assert.notEqual(nextId, commandId); assert.notEqual(nextId, firstId); assert.notEqual(nextId, secondId);
      assert.equal(warningId(3), nextId);
      assert.ok(f.host.callLog.find(nextId).some(row => row.capability_id === pagesActions.create.capability_id && row.ok && row.call_id === nextId));
      assert.equal(pagesCount(f, project.project_id), 2);
      assert.equal(attempts, 4); assert.deepEqual(opened, []);

      blocked = false;
      assert.equal((await get(f, base)).status, 200);
      assert.deepEqual(opened, [""], "recovery reads the actual empty Catalog and announces it exactly once");
      assert.equal(attempts, 5); assert.equal(warnings().length, 4);
      assert.equal((await get(f, base)).status, 200);
      assert.deepEqual(opened, [""]); assert.equal(attempts, 5, "a successful opening is retained");
    });
  }
}
