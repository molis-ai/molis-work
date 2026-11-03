import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_REGISTRY, PERSONAL_PLUGIN_IDS, PLATFORM_PLUGIN_REGISTRATIONS, builtinMarketDirectory, runningPluginDirectory, type DirectorySource } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// W5-02 B1 (specs/repository-anti-corruption/slices/w5-02-registry.md §3.0 Q3): which built-in is personal, which one is 常开 and what
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
  assert.deepEqual(market.find(entry => entry.id === "text-stats")?.companions, ["files"]);
  assert.equal(market.some(entry => entry.always_on === true), false, "without a Home nothing is 常开: a declaration alone is not agreement");
});

test("RAC-711 a running plugin gets the marks only when it is the built-in itself: same plugin id and the same publisher", () => {
  const pages = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "pages")!;
  const manifests = new Map([
    [pages.manifest.plugin_id, pages.manifest],
    ["io.example.notes", { plugin_id: "io.example.notes", name: "Notes", publisher: { signature: "unsigned:io.example" }, ui: { views: [] } }],
  ]);
  const source = (signature: string): DirectorySource => ({
    enabledPluginIds: () => [...manifests.keys()],
    state: () => ({ status: "running" }),
    manifest: id => id === pages.manifest.plugin_id ? { ...pages.manifest, publisher: { signature } } : manifests.get(id),
  });
  const [builtin, other] = runningPluginDirectory(source(pages.manifest.publisher.signature));
  assert.deepEqual([builtin!.id, builtin!.chosen, builtin!.personal], ["pages", true, true]);
  assert.deepEqual([other!.id, other!.chosen, "personal" in other!, "companions" in other!], ["io.example.notes", false, false, false]);
  // A package that takes a built-in's plugin id under another publisher is not that built-in: keyed by its own id, no marks.
  const [impostor] = runningPluginDirectory(source("unsigned:io.example"));
  assert.deepEqual([impostor!.id, impostor!.chosen, "personal" in impostor!], [pages.manifest.plugin_id, false, false]);
});

test("RAC-710 marks a page sends back are not read: adding still brings what the registration says, a personal plugin is still hidden, a 常开 one still stays", { timeout: 60_000 }, async t => {
  const { request, project } = await serveHomeRuntime(t), here = await project("页面改过的标记");
  const plugins = `/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`;

  // The page claims Text Stats is personal and brings nothing along; the Host adds Files with it, as its registration says.
  const added = await request(plugins, { method: "POST", body: { plugin_id: "text-stats", personal: true, companions: [] } });
  assert.equal(added.status, 200);
  const membership = await added.json() as { plugins: string[]; hidden: string[] };
  assert.ok(membership.plugins.includes("text-stats") && membership.plugins.includes("files"), "Files comes along whatever the page says");
  assert.deepEqual(membership.hidden, []);

  // The page claims Pages is not personal; removing it still hides the personal plugin in this project instead of dropping a choice.
  const removed = await request(plugins, { method: "DELETE", body: { plugin_id: "pages", personal: false } });
  assert.equal(removed.status, 200);
  assert.ok((await removed.json() as { hidden: string[] }).hidden.includes("pages"));

  // The page claims Goals is not 常开; the Host refuses to remove it all the same.
  const kept = await request(plugins, { method: "DELETE", body: { plugin_id: "goals", always_on: false } });
  assert.notEqual(kept.status, 200);
  assert.equal((await kept.json() as { code?: string }).code, "catalog.plugin_always_on");
});
