import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { PluginInstalledView, PluginPublisherPin } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";
import { pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { connectionsProbe } from "./fixtures/connections-runtime.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { mac, person } from "./fixtures/home-sandbox.js";
import { SHEET_KEY_VALUE as KEY_VALUE, SHEET_PLUGIN_ID as ID, pinSheetPublisher, retainedSheetNotes, sheetPackage } from "./fixtures/install-sheet.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// S-package-install-sheet (docs/system/security-invariants/S-package-install-sheet.md), the Host's half of the in-place install sheet
// (specs/plugin-builder-upgrade/spec.md §7.0, batch 47): a plugin page hands the trusted shell a signed package, and the shell previews and
// installs it through `POST /api/host/plugin-page-install` with the outer document's page header. The package is verified by the install
// provider as any package is; the page decides nothing. Every refusal below asserts that nothing was installed and no publisher pinned.

const PATH = "/api/host/plugin-page-install";
async function sheetHome(t: TestContext) {
  const owner = connectionsProbe("sheetowner"), second = connectionsProbe("sheetsecond");
  const f = await serveHomeRuntime(t, { pluginFixtures: { home: [owner.definition, second.definition] } });
  await f.host.homePlugins!.ready();
  const project = await f.project("Install sheet"), other = await f.project("Install sheet elsewhere");
  const prefix = `/projects/${project.project_id}`;
  const open = async (plugin_id = owner.id, at = prefix) => {
    const opened = await f.request(at + "/api/host/plugin-pages", { method: "POST", body: { plugin_id } });
    assert.equal(opened.status, 200, await opened.clone().text());
    return (await opened.json() as { page_id: string }).page_id;
  };
  const sheet = (page_id: string, body: unknown, headers: Record<string, string> = { "x-molis-context-page": page_id }, at = prefix) =>
    f.request(at + PATH, { method: "POST", headers, body });
  const overview = async () => {
    const response = await f.request(prefix + "/api/plugin-trust/overview");
    assert.equal(response.status, 200, await response.clone().text());
    return await response.json() as { plugins: PluginInstalledView[]; publishers: PluginPublisherPin[] };
  };
  /** Everything a sheet could write: the project's installations with their grants, and the Home's publisher pins. */
  const state = async () => { const { plugins, publishers } = await overview(); return JSON.stringify([plugins.map(row => [row.plugin_id, row.version, row.state, row.permissions.filter(item => item.granted).map(item => item.permission)]), publishers.map(pin => pin.key_id)]); };
  const pin = (publisher: ReturnType<typeof newPublisher>) => pinSheetPublisher(f.home, publisher);
  return { f, project, other, prefix, open, sheet, overview, state, pin, owner, second };
}

async function refusedWith(response: Response, status: number, code: string) {
  const text = await response.text();
  assert.equal(response.status, status, text);
  assert.equal((JSON.parse(text) as { code?: string }).code, code, text);
}

interface View { kept_data_incompatible: boolean; preview_id: string; plugin_id: string; version: string; from_version: string | null; runtime_scope: string; publisher: { label: string | null; local: boolean; trusted: boolean };
  permissions: Array<{ permission: string; required: boolean; on: boolean; fresh: boolean }>; secrets: Array<{ name: string; saved: boolean }>; network: string[] }
const previewed = async (response: Response): Promise<View> => { const text = await response.text(); assert.equal(response.status, 200, text); return JSON.parse(text) as View; };

test("S-package-install-sheet PBU-47-1 only the outer document's page header reaches the sheet route, in the page's own project, with exactly the fields an operation takes", { timeout: 120_000 }, async t => {
  const c = await sheetHome(t), page = await c.open(), bundle = sheetPackage();
  const before = await c.state();
  // The child's fetch bridge carries `x-molis-plugin-page` and drops the outer header; neither it, nor both, nor none reach the route.
  const refused: Array<Record<string, string>> = [{}, { "x-molis-plugin-page": page }, { "x-molis-context-page": page, "x-molis-plugin-page": page }];
  for (const headers of refused) {
    assert.equal((await c.sheet(page, { operation: "preview", bundle }, headers)).status, 403, JSON.stringify(headers));
  }
  // The page's project only: the same page from another project's path is refused.
  assert.equal((await c.sheet(page, { operation: "preview", bundle }, undefined, `/projects/${c.other.project_id}`)).status, 403);
  for (const body of [{}, { operation: "install", bundle }, { operation: "preview" }, { operation: "preview", bundle: "text" }, { operation: "preview", bundle, pin_label: "Mine" },
    { operation: "confirm" }, { operation: "confirm", preview_id: "x", discard_kept_data: "true" }, { operation: "confirm", preview_id: "x", pin_label: "Mine" }, { operation: "confirm", preview_id: "x", consent: true }]) {
    await refusedWith(await c.sheet(page, body), 400, "actions.input_invalid");
  }
  // A package that is not what it says it is stops at the preview, as it does at the settings door.
  const altered = structuredClone(bundle); altered.payload.manifest.name = "Another name";
  assert.equal((await c.sheet(page, { operation: "preview", bundle: altered })).status >= 400, true);
  assert.equal(await c.state(), before, "nothing was installed and no publisher pinned");
});

test("S-package-install-sheet PBU-47-2 the sheet shows what the verified package asks, and a publisher the person has not trusted is not installed from a page", { timeout: 120_000 }, async t => {
  const c = await sheetHome(t), page = await c.open(), before = await c.state();
  const view = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage() }));
  assert.deepEqual([view.plugin_id, view.version, view.from_version, view.runtime_scope], [ID, "1.0.0", null, "project"]);
  assert.deepEqual(view.publisher, { label: null, local: false, trusted: false });
  assert.deepEqual(view.permissions.map(row => [row.permission, row.required, row.on, row.fresh]),
    [["storage:private", true, true, false], ["network:request", false, false, false], ["secret:use", false, false, false]]);
  assert.deepEqual(view.secrets, [{ name: "calendar-key", saved: false }]);
  assert.deepEqual(view.network, ["api.example.test"]);
  await refusedWith(await c.sheet(page, { operation: "confirm", preview_id: view.preview_id }), 403, "host.package_install.publisher_untrusted");
  // The preview is used up by the refusal: the same confirmation again finds nothing.
  await refusedWith(await c.sheet(page, { operation: "confirm", preview_id: view.preview_id }), 404, "host.package_install.preview_unknown");
  assert.equal(await c.state(), before, "nothing was installed and no publisher pinned");
});

test("S-package-install-sheet PBU-47-3 a preview is confirmed only by the page whose sheet showed it, with only what it offered", { timeout: 120_000 }, async t => {
  const c = await sheetHome(t), publisher = newPublisher(); c.pin(publisher);
  const page = await c.open(), elsewhere = await c.open(c.second.id), before = await c.state();
  const first = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage(publisher) }));
  assert.deepEqual(first.publisher, { label: "Sheet publisher", local: false, trusted: true });
  // Another page of the same project cannot press the first page's confirmation.
  await refusedWith(await c.sheet(elsewhere, { operation: "confirm", preview_id: first.preview_id }), 404, "host.package_install.preview_unknown");
  // A key for a reference the package does not name, or of another shape, is refused before anything is asked of the install provider.
  for (const secrets of [[{ name: "other-key", header: "Authorization", value: KEY_VALUE }], [{ name: "calendar-key", value: KEY_VALUE }], "calendar-key"]) {
    const view = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage(publisher) }));
    await refusedWith(await c.sheet(page, { operation: "confirm", preview_id: view.preview_id, secrets }), 400, "actions.input_invalid");
  }
  // A switch the preview did not offer (one the package never asked for, or its required one) is refused by the install provider.
  for (const optional of [["model:invoke"], ["storage:private"]]) {
    const view = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage(publisher) }));
    await refusedWith(await c.sheet(page, { operation: "confirm", preview_id: view.preview_id, optional }), 400, "plugin.grant_denied");
  }
  assert.equal(await c.state(), before, "nothing was installed");
});

test("S-package-install-sheet PBU-47-4 the person's confirmation installs with the switches they turned on and seals the keys they typed; an upgrade moves only the switches that differ", mac, async t => {
  const c = await sheetHome(t), publisher = newPublisher(); c.pin(publisher);
  const page = await c.open();
  const view = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage(publisher) }));
  const confirmed = await c.sheet(page, { operation: "confirm", preview_id: view.preview_id, optional: ["network:request", "secret:use"],
    secrets: [{ name: "calendar-key", header: "Authorization", value: KEY_VALUE }] });
  const text = await confirmed.text();
  assert.equal(confirmed.status, 200, text);
  // What the page may hear is the plugin and its version; where it opens (`open_surface`) is for the shell's own 「打开」.
  const { open_surface: _open, ...done } = JSON.parse(text) as Record<string, unknown>;
  assert.deepEqual(done, { plugin_id: ID, version: "1.0.0", publisher_key_id: publisher.identity });
  assert.ok(!text.includes(KEY_VALUE), "a key never comes back");
  const granted = async () => (await c.overview()).plugins.find(row => row.plugin_id === ID)!.permissions.filter(row => row.granted).map(row => row.permission).sort();
  assert.deepEqual(await granted(), ["network:request", "secret:use", "storage:private"]);

  // The next version asks for nothing new. Its sheet shows the switches as they stand and that the key is saved; turning one off moves that one alone.
  const next = await previewed(await c.sheet(page, { operation: "preview", bundle: sheetPackage(publisher, "1.1.0") }));
  assert.deepEqual([next.version, next.from_version], ["1.1.0", "1.0.0"]);
  assert.deepEqual(next.permissions.map(row => [row.permission, row.on, row.fresh]), [["storage:private", true, false], ["network:request", true, false], ["secret:use", true, false]]);
  assert.deepEqual(next.secrets, [{ name: "calendar-key", saved: true }]);
  assert.ok(!JSON.stringify(next).includes(KEY_VALUE));
  const upgraded = await c.sheet(page, { operation: "confirm", preview_id: next.preview_id, optional: ["network:request"] });
  assert.equal(upgraded.status, 200, await upgraded.clone().text());
  const { open_surface: _again, ...moved } = await upgraded.json() as Record<string, unknown>;
  assert.deepEqual(moved, { plugin_id: ID, version: "1.1.0", publisher_key_id: publisher.identity });
  assert.deepEqual(await granted(), ["network:request", "storage:private"]);
  assert.equal((await c.overview()).plugins.find(row => row.plugin_id === ID)!.version, "1.1.0");
});

test("B47-K1 B47-K2 only the person can discard the retained generation shown by their preview", mac, async t => {
  const c = await sheetHome(t), page = await c.open(), { f, project } = c;
  const rig = await retainedSheetNotes(f.host, project.reference, new LocalHostHttpClient({ origin: f.origin, controlToken: f.token }));
  const old = await rig.uninstallKeepingNote();
  const preview = () => c.sheet(page, { operation: "preview", bundle: old.next }).then(previewed);
  const confirm = (view: View, choice: object) => c.sheet(page, { operation: "confirm", preview_id: view.preview_id, ...choice });
  for (const choice of [{}, { discard_kept_data: false }]) {
    const shown = await preview();
    assert.equal(shown.kept_data_incompatible, true);
    await refusedWith(await confirm(shown, choice), 400, "plugin.kept_data_incompatible");
    assert.deepEqual(await old.saved(), old.before);
  }
  const shown = await preview(), client = f.host.actionClient(project.reference);
  const caller = person(project.project_id);
  for (const denied of [caller, { ...caller, audience: "agent" as const }, { ...caller, user_action: undefined }]) {
    await assert.rejects(client.invoke(denied, pluginInstallActions.confirm,
      { preview_id: shown.preview_id, consent: true, discard_kept_data: true }), (error: { code?: string }) => error.code === "actions.forbidden" || error.code === "actions.audience_denied");
    assert.deepEqual(await old.saved(), old.before);
  }
  const stale = await preview();
  const ok = await confirm(shown, { discard_kept_data: true });
  assert.equal(ok.status, 200, await ok.text());
  assert.deepEqual(await rig.notes("notes.list"), []);
  const replacement = await rig.uninstallKeepingNote();
  await refusedWith(await confirm(stale, { discard_kept_data: true }), 404, "plugin.preview_unknown");
  assert.deepEqual(await replacement.saved(), replacement.before);
});
