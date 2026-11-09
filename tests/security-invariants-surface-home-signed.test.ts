import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { pluginInstallActions, type MolisWorkProjectRuntime } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginInstanceRecord, PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type { SurfaceDescription, SurfaceInstallationRef, SurfacePluginCard } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-app-workbench";
import { SqlitePluginPrivateStorage, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { APPROVED, person, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID } from "./fixtures/sandbox-package.js";
import { presentingPackage } from "./fixtures/surface-home-sandbox.js";

const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
const endpoint = "/api/host/surface-home", pageActions = "/api/host/plugin-page-actions";
const owner = PACKAGE_PLUGIN_ID;

async function body<T>(response: Response, status = 200): Promise<T> {
  const result = await response.json() as T;
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}

type Navigation = { kind: "stage"; installation: SurfaceInstallationRef; frame_path: string; shell_key: string; selection: { surface: string; id: string; panel?: string; intent: "open" } };

async function fixture(t: TestContext, scope: "project" | "home", delegated: readonly ActionDefinition[] = [], distinctForms = false) {
  const available = { available: true } as const;
  let hold: { action: string; entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const f = await serveHomeRuntime(t, { actionAvailability: (_caller, view) => {
    const waiting = hold;
    if (!waiting || view.capability_id + "@" + view.version !== waiting.action) return available;
    hold = undefined;
    waiting.entered.resolve();
    return waiting.release.promise.then(() => available);
  } });
  const project = await f.project("Signed homepage"), prefix = "/projects/" + project.project_id;
  const delegatedCalls: string[] = [], releases = new Map<ActionDefinition, () => void>();
  const register = (definition: ActionDefinition, edition: string) => f.host.actionRegistry(project.reference).registerProvider({
    provider: { kind: "system", provider_id: "system.homepage-form-fixture-" + edition, title: "Homepage form dependency", project_id: project.project_id },
    definitions: [definition], handlers: [{ ...definition, handle() { delegatedCalls.push(definition.capability_id); return null; } }],
  });
  for (const definition of delegated) releases.set(definition, register(definition, "original"));
  t.after(() => { for (const release of releases.values()) release(); });
  const replacePolicy = async (definition: ActionDefinition) => {
    const release = releases.get(definition);
    assert.ok(release);
    release();
    releases.set(definition, register(definition, "replacement"));
    await f.host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user", permissions: [] }, project.reference);
  };
  const client = f.host.actionClient(project.reference), caller = person(project.project_id);
  const bundle: PluginPackageBundle = presentingPackage(scope, delegated, distinctForms ? { editorDialog: true, distinctForms } : {});
  const install = async () => {
    const preview = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    assert.equal(preview.runtime_scope, scope);
    await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Homepage fixture" });
  };
  await install();
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
  return { ...f, project, prefix, post, description, card, click, open, read, confirm, close, install, delegatedCalls,
    replacePolicy, holdDiscovery(action: string) { return hold = { action, entered: deferred(), release: deferred() }; } };
}

test("S-surface-composition SCS-08 a signed owner answers a joint field batch, but each row delivers only its own form fields", mac, async t => {
  const f = await fixture(t, "project", [], true);
  const form = (await f.card()).start?.[0];
  assert.ok(form);
  const page = await f.open(await body<Navigation>(await f.click(form)));
  assert.equal(await body(await f.confirm(page, "Stored note")), true);
  await body(await f.close(page));
  const log = f.host.callLog!, record = log.record;
  let valuesCalls = 0;
  log.record = function (caller, action, outcome) {
    if (caller.project_id === f.project.project_id && outcome.ok && action.capability_id.endsWith(".notes.values")) valuesCalls++;
    return record.call(this, caller, action, outcome);
  };
  try {
    const display = await body<SurfaceHomeDisplay>(await f.post(endpoint, {}));
    const rows = display.display.rows.filter(row => row.owner === owner);
    assert.deepEqual(rows.map(row => [row.subject.kind, "values" in row.read ? row.read.values : null]), [
      ["sandbox-home-note", { title: "Stored note" }],
      ["sandbox-home-appendix", { title: "Stored note", summary: "Only the appendix row requested this field" }],
    ]);
    assert.equal(valuesCalls, 2, "one rule batch and one display batch across both subjects");
  } finally { log.record = record; }
});

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
  await refuseChanged(await f.click({ ...form, action: { ...form.action, ref: "other.create@1" } }));
  await refuseChanged(await f.click({ ...form, installation: { ...form.installation, install_id: "other-installation" } }));
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
  await body(await f.post(pageActions, { mode: "component_submit", component_id: "notes", payload: {} }, original), 400);
  assert.deepEqual(await f.read(original), [], "a component with only a read binding is not a submit form");
  assert.equal(await body(await f.confirm(original, "one note")), true);
  assert.deepEqual(await f.read(original), [{ id: "1", text: "one note" }]);
  await body(await f.close(original));

  await body(await f.post("/api/plugin-trust/installed/disable", { plugin_id: owner }));
  await refuseChanged(await f.click(form));
  await refuseChanged(await f.request(navigation.frame_path));
  const disabled = await f.card();
  assert.equal(disabled.enable?.kind, "project_installation");
  assert.deepEqual(await body(await f.click(disabled.enable)), { kind: "enabled" });
  assert.equal(records.get(record.install_id)?.state, "running");
  await body(await f.post("/api/plugin-trust/installed/uninstall", { plugin_id: owner, keep_data: false }));
  assert.equal((await f.description()).groups.some(group => group.owner_plugin_id === owner), false);
  await refuseChanged(await f.request(navigation.frame_path));
  await f.install();
  const reinstalled = (await f.card()).start?.[0];
  assert.ok(reinstalled?.kind === "form");
  assert.equal(reinstalled.installation.install_id, form.installation.install_id);
  assert.equal(reinstalled.installation.version, form.installation.version);
  assert.equal(reinstalled.installation.manifest_digest, form.installation.manifest_digest);
  assert.notEqual(reinstalled.installation.installation_generation, form.installation.installation_generation);
  await refuseChanged(await f.click(form));
  await refuseChanged(await f.request(navigation.frame_path));
  await body(await f.click(reinstalled));
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


test("S-surface-composition SCS-11 a real delegated form opens with its component approval and never grants ordinary action dispatch", mac, async t => {
  const permission = "fixture:homepage-form-read";
  const delegated: ActionDefinition = { capability_id: "surface-fixture.form-dependency", version: 1, operation: "query",
    action: { title: "Signed editor dependency", description: "Observe the real component submission", kind: "query", scope: "project", effect: "read",
      execution: { cost: "none" }, audiences: ["plugin"], permissions: [permission], subject_kinds: [], input_schema: { type: "null" }, output_schema: { type: "null" } } };
  const alternate = { ...delegated, capability_id: "surface-fixture.form-alternate" };
  const f = await fixture(t, "project", [delegated, alternate]);
  const ordinary = await f.host.localPersonContext(f.project.reference);
  const form = (await f.card()).start?.[0];
  assert.ok(form?.kind === "form");
  assert.equal(ordinary.permissions.includes(permission), false);
  assert.equal(ordinary.allowed_actions?.some(action => action.capability_id + "@" + action.version === form.action.ref && action.provider_id === form.action.provider_id), false);
  const navigation = await body<Navigation>(await f.click(form));
  assert.equal(navigation.selection.panel, "editor");
  const page = await f.open(navigation);
  assert.deepEqual(await f.read(page), []);
  assert.deepEqual(f.delegatedCalls, [], "discovery and navigation run no delegated action");

  const duringDiscovery = async (target: ActionDefinition) => {
    const paused = f.holdDiscovery(form.action.ref), pending = f.click(form);
    try {
      await Promise.race([paused.entered.promise, pending.then(async answer => assert.fail("The actual directory did not wait: " + await answer.clone().text()))]);
      await f.replacePolicy(target);
    } finally { paused.release.resolve(); }
    return pending;
  };
  // Both forms exist and both were eligible when the directory was sampled. Only one was selected by the real overview.
  assert.equal((await body<Navigation>(await duringDiscovery(alternate))).selection.panel, "editor", "an unreturned form's policy is not retained");
  const changed = await body<{ code: string }>(await duringDiscovery(delegated), 409);
  assert.match(changed.code, /^actions\.provider_(?:changed|replaced)$/u, "the sampled form cannot adopt a new operation policy");
  assert.equal((await f.card()).start?.[0]?.kind, "form", "a new sample may use the new authorized provider");

  const storage = await f.host.withProject(f.project.reference, runtime => new SqlitePluginPrivateStorage(runtime.store.db));
  const ownerKey = "agent-studio:" + f.project.project_id, approvalKey = APPROVED + owner;
  const snapshot = storage.snapshotInstallationData(ownerKey);
  const saved = snapshot.find(row => row.item_key === approvalKey);
  assert.ok(saved);
  const approval = JSON.parse(saved.item_value) as SandboxEffects;
  assert.deepEqual([...approval.capabilities ?? []].sort(), [delegated.capability_id, alternate.capability_id].sort());
  storage.restoreInstallationData(ownerKey, snapshot.map(row => row === saved
    ? { ...row, item_value: JSON.stringify({ ...approval, capabilities: [alternate.capability_id] }) } : row));
  try {
    assert.equal((await f.card()).start, undefined, "another approved capability with the same permission cannot revive the original form");
    await refuseChanged(await f.click(form));
    await body(await f.confirm(page, "revoked"), 403);
    assert.deepEqual(await f.read(page), []);
    assert.deepEqual(f.delegatedCalls, []);
  } finally { storage.restoreInstallationData(ownerKey, snapshot); }
  assert.equal(await body(await f.confirm(page, "approved once")), true);
  assert.deepEqual(f.delegatedCalls, [delegated.capability_id]);
  assert.deepEqual(await f.read(page), [{ id: "1", text: "approved once" }]);
  await body(await f.close(page));
});
