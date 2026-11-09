import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { pluginInstallActions, type MolisWorkProjectRuntime } from "@molis-ai/molis-work-app-local-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { SANDBOX_PACKAGE_FILES, type PluginInstanceRecord, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SurfaceDescription, SurfaceInstallationRef, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { signPluginPackage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxActionId, sandboxPackageBuildId, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { person, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID, newPublisher, packageContract, packageFiles, payloadOf, signedPackage } from "./fixtures/sandbox-package.js";

const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const endpoint = "/api/host/surface-home", pageActions = "/api/host/plugin-page-actions";
const owner = PACKAGE_PLUGIN_ID;

function presentingPackage(scope: "project" | "home") {
  const publisher = newPublisher(), contract = packageContract();
  // The writer reads the previous list before appending; both effects are part of its real approval.
  contract.operations.find(item => item.id === "notes.add")!.effects = { storage: ["read", "write"] };
  const build = sandboxPackageBuildId(contract.pluginId, publisher.identity);
  const overview = definePresentationOverviewAction(sandboxActionId(build, "notes.overview"), 1, "Notes overview", [], scope);
  const start = { capability_id: sandboxActionId(build, "notes.add"), version: 1 };
  const output = { summary: { literal: "Add your first note" }, subjects: [], start: [start] };
  contract.operations.push({ id: "notes.overview", kind: "query", read_protocol: { kind: "presentation_overview" },
    input: overview.action.input_schema, output: overview.action.output_schema!, errors: [], effects: {}, examples: [{ input: {}, output }] });
  contract.presentation = { objects: [], overview: { capability_id: overview.capability_id, version: overview.version,
    start: [{ ...start, open: { view_id: "app", panel: "editor" } }] } };
  const { files, manifest } = packageFiles(publisher.identity);
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  files[SANDBOX_PACKAGE_FILES.entrypoint] += `\noperations["notes.overview"] = async () => (${JSON.stringify(output)});\n`;
  const derived = sandboxPluginManifest({ contract, pluginId: manifest.plugin_id, name: manifest.name, version: manifest.version, publisher: manifest.publisher,
    ...(scope === "home" ? { runtime: { scope } } : {}) });
  return signPluginPackage({ payload: payloadOf(derived, files), signature: null, publisher_key: null }, publisher.signer);
}

async function body<T>(response: Response, status = 200): Promise<T> {
  const result = await response.json() as T;
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}

type Navigation = { kind: "stage"; installation: SurfaceInstallationRef; frame_path: string; shell_key: string; selection: { surface: string; id: string; panel?: string; intent: "open" } };

async function fixture(t: TestContext, scope: "project" | "home") {
  const f = await serveHomeRuntime(t), project = await f.project("Signed homepage"), prefix = "/projects/" + project.project_id;
  const client = f.host.actionClient(project.reference), caller = person(project.project_id);
  const install = async (bundle: PluginPackageBundle, expectedScope: "project" | "home") => {
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    assert.equal(preview.runtime_scope, expectedScope);
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Homepage fixture" });
  };
  await install(presentingPackage(scope), scope);
  const post = (path: string, value: unknown, headers?: Record<string, string>) => f.request(prefix + path, { method: "POST", body: value, headers });
  const description = () => post(endpoint, {}).then(answer => body<SurfaceDescription>(answer));
  const card = async (): Promise<SurfacePluginCard> => {
    const result = await description(), group = result.groups.find(item => item.owner_plugin_id === owner);
    assert.ok(group?.plugin_card, JSON.stringify(result));
    return group.plugin_card;
  };
  const click = (target: unknown) => post(endpoint + "/click", { owner_plugin_id: owner, target });
  const open = async (navigation: Navigation) => {
    const response = await f.request(navigation.frame_path), html = await response.text();
    assert.equal(response.status, 200, html.slice(0, 420));
    const pageId = /"page_id":"([^"]+)"/u.exec(html)?.[1];
    assert.ok(pageId, "the exact installed document issued its actual page credential");
    assert.match(html, /"id":"editor"/u);
    return { "x-molis-plugin-page": pageId };
  };
  const read = async (headers: Record<string, string>) =>
    (await body<{ value: unknown }>(await post("/api/plugins/" + owner + "/call", { componentId: "notes", binding: "read", payload: {} }, headers))).value;
  const confirm = (headers: Record<string, string>, text: string) =>
    post(pageActions, { mode: "component_submit", component_id: "editor", payload: { form: { text } } }, headers);
  const close = (headers: Record<string, string>) =>
    f.request(prefix + "/api/host/plugin-pages/" + headers["x-molis-plugin-page"], { method: "DELETE", body: {} });
  return { ...f, project, prefix, post, description, card, click, open, read, confirm, close, install };
}

async function refuseChanged(response: Response) {
  const answer = await body<{ code: string; page_id?: string }>(response, 409);
  assert.equal(answer.code, "actions.provider_changed");
  assert.equal(answer.page_id, undefined);
}

function oppositeScope(path: string, scope: "project" | "home") {
  const url = new URL(path, "http://localhost");
  const expected = JSON.parse(url.searchParams.get("installation")!) as SurfaceInstallationRef;
  url.searchParams.set("installation", JSON.stringify({ ...expected, scope }));
  return url.pathname + url.search;
}

async function interleavedGet(f: Awaited<ReturnType<typeof fixture>>, path: string, atWait: () => void, scope: "project" | "home") {
  const entered = deferred(), release = deferred();
  let restore: () => void;
  if (scope === "project") {
    const original = f.host.withProject, invoke = original.bind(f.host);
    let waiting = true;
    f.host.withProject = function <Result>(reference: LocalHostProjectReference, operation: (runtime: MolisWorkProjectRuntime) => Result | Promise<Result>,
      options?: { activatePlugins?: boolean }): Promise<Result> {
      const run = () => invoke<Result>(reference, operation, options);
      if (!waiting || reference.project_id !== f.project.project_id) return run();
      waiting = false; entered.resolve();
      return release.promise.then(run);
    };
    restore = () => { f.host.withProject = original; };
  } else {
    const home = f.host.homePlugins!, original = home.ready;
    let waiting = true;
    home.ready = function () {
      if (!waiting) return original.call(this);
      waiting = false; entered.resolve();
      return release.promise.then(() => original.call(this));
    };
    restore = () => { home.ready = original; };
  }
  const pending = f.request(path);
  try {
    await Promise.race([entered.promise, pending.then(async answer => assert.fail("The installed GET did not enter its real wait: " + await answer.clone().text()))]);
    atWait();
    release.resolve();
    await refuseChanged(await pending);
  } finally { release.resolve(); restore(); }
}

test("S-surface-composition SCS-11 project signed form resolves its actual editor, closes without writes, and submits once through the original gateway", mac, async t => {
  const f = await fixture(t, "project");
  const first = await f.card(), form = first.start?.[0];
  assert.ok(first.open && form?.kind === "form", JSON.stringify(first));
  assert.equal(form.action.provider_id, "plugin:" + owner);
  assert.equal(form.installation.scope, "project");
  const navigation = await body<Navigation>(await f.click(form));
  assert.deepEqual(navigation.selection, { surface: "workbench", id: "app", panel: "editor", intent: "open" });
  assert.deepEqual(navigation.installation, form.installation);
  assert.equal((await body<Navigation>(await f.click(first.open))).frame_path, navigation.frame_path);
  await refuseChanged(await f.click({ ...form, panel: "notes" }));
  await refuseChanged(await f.request(oppositeScope(navigation.frame_path, "home")));

  const records = await f.host.withProject(f.project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const record = records.get(form.installation.install_id);
  assert.ok(record?.state === "running");
  try {
    await interleavedGet(f, navigation.frame_path, () => records.save({ ...record, manifest_digest: "0".repeat(64) }), "project");
    await refuseChanged(await f.click(form));
  } finally { records.save(record); }

  const cancelled = await f.open(navigation);
  assert.deepEqual(await f.read(cancelled), [], "the form document and its initial real read write nothing");
  await body(await f.close(cancelled));
  await body(await f.confirm(cancelled, "closed"), 403);
  const original = await f.open(navigation);
  assert.deepEqual(await f.read(original), [], "cancelling and stale requests wrote nothing");
  assert.equal(await body(await f.confirm(original, "one note")), true);
  assert.deepEqual(await f.read(original), [{ id: "1", text: "one note" }]);
  await body(await f.close(original));

  await f.install(signedPackage(newPublisher(), (_files, manifest) => { manifest.runtime = { scope: "home" }; }), "home");
  const alongside = await f.open(navigation);
  assert.deepEqual(await f.read(alongside), [{ id: "1", text: "one note" }], "the original project document's read must not switch to a new Home package with the same id");
  await body(await f.close(alongside));
  await body(await f.request("/api/plugins/" + owner + "/uninstall", { method: "POST", body: { keep_data: false } }));
  await body(await f.post("/api/plugin-trust/disable", { plugin_id: owner }));
  const disabled = await f.card();
  assert.equal(disabled.enable?.kind, "project_installation");
  assert.deepEqual(await body(await f.click(disabled.enable)), { kind: "enabled" });
  assert.equal(records.get(record.install_id)?.state, "running");
  await body(await f.post("/api/plugin-trust/uninstall", { plugin_id: owner, keep_data: false }));
  assert.equal((await f.description()).groups.some(group => group.owner_plugin_id === owner), false);
  await refuseChanged(await f.request(navigation.frame_path));
});

test("S-surface-composition SCS-11 Home signed lazy document never changes scope or adopts a reinstall during the GET", mac, async t => {
  const f = await fixture(t, "home"), card = await f.card();
  assert.ok(card.open && card.start?.[0]?.kind === "form", JSON.stringify(card));
  assert.equal(card.open.installation.scope, "home");
  const navigation = await body<Navigation>(await f.click(card.start[0]));
  await refuseChanged(await f.request(oppositeScope(navigation.frame_path, "project")));
  const database = new DatabaseSync(join(f.home, "plugin-runtime", "plugin-runtime.db"));
  try {
    const records = new SqlitePluginRuntimeRepository(database), record = records.get(card.open.installation.install_id);
    assert.ok(record);
    const replacement: PluginInstanceRecord = { ...record, installation_generation: randomUUID() };
    try { await interleavedGet(f, navigation.frame_path, () => records.save(replacement), "home"); }
    finally { records.save(record); }
  } finally { database.close(); }
  const page = await f.open(navigation);
  assert.deepEqual(await f.read(page), []);
  await body(await f.close(page));
  await body(await f.request("/api/plugins/" + owner + "/disable", { method: "POST", body: {} }));
  const disabled = await f.card();
  assert.equal(disabled.enable?.kind, "home_plugin_settings");
  assert.deepEqual(await body(await f.click(disabled.enable)), { kind: "settings", section: "plugins" });
  assert.equal(f.host.homePlugins?.installation(owner)?.state, "disabled", "Home settings navigation does not enable the plugin");
});
