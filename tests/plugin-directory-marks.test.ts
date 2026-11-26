import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_REGISTRY, PERSONAL_PLUGIN_IDS, PLATFORM_PLUGIN_REGISTRATIONS, builtinMarketDirectory, installHostUiText, runningPluginDirectory, type DirectorySource } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { projectPluginRevisionAt } from "./fixtures/project-plugin-settings.js";

installHostUiText();

// W5-02 B1 (specs/archive/repository-anti-corruption/slices/w5-02-registry.md §3.0 Q3): which built-in is personal, which one is 常开 and what
// a plugin brings along are the Host's facts. It writes them on the directory the page is drawn with, from its own registration; the
// page only reads them, and what the page sends back is never read as one of them.

test("RAC-711 the Host marks each built-in from its own registration: personal, what it brings along, and 常开 only from what this Home agreed to", () => {
  const market = builtinMarketDirectory();
  assert.deepEqual(market.map(entry => entry.id), PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.project_plugin_id), "every built-in, in the registration's order");
  assert.deepEqual(market.filter(entry => entry.personal === true).map(entry => entry.id), [...PERSONAL_PLUGIN_IDS]);
  for (const entry of market) {
    const companions = BUILTIN_PLUGIN_REGISTRY.companions(entry.id);
    assert.deepEqual(entry.companions ?? [], companions, `${entry.id} brings along what the registration says`);
    if (companions.length === 0) assert.equal("companions" in entry, false, "no empty mark");
  }
  assert.deepEqual(market.find(entry => entry.id === "feed")?.companions, ["inbox"]);
});

test("RAC-711 a running plugin gets the marks only when it is the built-in itself: same plugin id and the same publisher", () => {
  // Jelly is a personal built-in (the partition plugins no longer are: batch 107's six, batch 108's Todo, Cognia, Issues and Images).
  const jelly = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "jelly")!;
  const manifests = new Map([
    [jelly.manifest.plugin_id, jelly.manifest],
    ["io.example.notes", { plugin_id: "io.example.notes", name: "Notes", publisher: { signature: "unsigned:io.example" }, ui: { views: [] } }],
  ]);
  const source = (signature: string): DirectorySource => ({
    enabledPluginIds: () => [...manifests.keys()],
    state: () => ({ status: "running" }),
    manifest: id => id === jelly.manifest.plugin_id ? { ...jelly.manifest, publisher: { signature } } : manifests.get(id),
  });
  const [builtin, other] = runningPluginDirectory(source(jelly.manifest.publisher.signature));
  assert.deepEqual([builtin!.id, builtin!.chosen, builtin!.personal], ["jelly", true, true]);
  assert.deepEqual([other!.id, other!.chosen, "personal" in other!, "companions" in other!], ["io.example.notes", false, false, false]);
  // A package that takes a built-in's plugin id under another publisher is not that built-in: keyed by its own id, no marks.
  const [impostor] = runningPluginDirectory(source("unsigned:io.example"));
  assert.deepEqual([impostor!.id, impostor!.chosen, "personal" in impostor!], [jelly.manifest.plugin_id, false, false]);
});

test("RAC-710 forged marks are refused: honest changes still bring companions and hide personal plugins, and a platform part is no plugin to remove", { timeout: 60_000 }, async t => {
  const { origin, request, project } = await serveHomeRuntime(t), here = await project("页面改过的标记");
  const plugins = `/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`;
  const revision = () => projectPluginRevisionAt(origin, here.project_id);
  const change = async (method: "POST" | "DELETE", plugin_id: string, forged: object) => {
    const expected_revision = await revision();
    const body = { plugin_id, expected_revision };
    const refused = await request(plugins, { method, body: { ...body, ...forged } });
    assert.equal(refused.status, 400);
    assert.equal((await refused.json()).code, "actions.input_invalid");
    assert.equal(await revision(), expected_revision, "the false marks cannot change membership");
    return request(plugins, { method, body });
  };

  // The page claims Feed is personal and brings nothing along; the Host adds Inbox with it, as its registration says.
  const added = await change("POST", "feed", { personal: true, companions: [] });
  assert.equal(added.status, 200);
  const membership = await added.json() as { plugins: string[]; hidden: string[] };
  assert.ok(membership.plugins.includes("feed") && membership.plugins.includes("inbox"), "Inbox comes along whatever the page says");
  assert.deepEqual(membership.hidden, []);

  const removed = await change("DELETE", "todo", { personal: false });
  assert.equal(removed.status, 200);
  assert.ok((await removed.json() as { hidden: string[] }).hidden.includes("todo"));

  // Shelf is a platform part (44B): whatever the page claims, there is no project plugin of that name to remove.
  const forged = await change("DELETE", "shelf", { personal: true });
  assert.notEqual(forged.status, 200);
  assert.equal((await forged.json() as { code?: string }).code, "catalog.plugin_not_found");
});
