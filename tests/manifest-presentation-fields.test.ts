import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BUILTIN_PLUGIN_CATALOG, pluginMarketCards } from "@molis-ai/molis-work-app-workbench";
import { pluginRegistryProblems } from "../scripts/generate-plugin-registry.mjs";
import { WORKSPACE_PACKAGES } from "../scripts/workspace-packages.mjs";
import { declarationManifest, manifestProblems } from "./fixtures/declaration-manifest.js";

// RAC-568 (specs/repository-anti-corruption/slices/w5-02-registry.md §B2, PG-065): what the market and the page heading show is the
// plugin's own declaration, so it is in the Manifest like every other plugin's: `summary` and `developer`. The fields the Host trusts
// (personal, companions, the Home Runtime, …) stay on the trusted registration.

const root = fileURLToPath(new URL("..", import.meta.url));

test("RAC-568 the market's line and developer mode are read from the Manifest, and no registration says either", () => {
  const cards = new Map(pluginMarketCards({ developerMode: true }).map(card => [card.id, card]));
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    assert.equal(Object.hasOwn(entry, "summary") || Object.hasOwn(entry, "developer"), false, `${entry.project_plugin_id}'s registration has neither`);
    const card = cards.get(entry.project_plugin_id);
    if (card) assert.equal(card.copy, entry.manifest.summary, `${entry.project_plugin_id}'s card says its Manifest's summary`);
  }
  assert.equal(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "text-stats")?.manifest.developer, true);
  assert.equal(pluginMarketCards().some(card => card.id === "text-stats"), false, "a developer plugin is out of the market outside developer mode");
  assert.equal(cards.has("text-stats"), true);
});

test("RAC-568 the SDK takes a summary of at most 120 characters once trimmed and a developer mark of true, and refuses anything else", () => {
  const longest = "字".repeat(120);
  for (const parts of [{}, { summary: `  ${longest}  ` }, { summary: "一句话。" }, { developer: true }]) {
    assert.equal(manifestProblems(declarationManifest(parts)), "", JSON.stringify(parts));
  }
  for (const summary of ["", "   ", `${longest}字`, 42, null, ["一句话"]]) {
    assert.match(manifestProblems(declarationManifest({ summary })), /summary 必须是不超过 120 字的非空文字/, JSON.stringify(summary));
  }
  for (const developer of [false, "true", 1, null]) {
    assert.match(manifestProblems(declarationManifest({ developer })), /developer 只能写 true/, JSON.stringify(developer));
  }
});

test("RAC-568 a registration that still says summary or developer is refused by the generator's --check", () => {
  const files = readdirSync(path.join(root, "plugins/native")).map(directory => `plugins/native/${directory}/package.json`);
  const read = (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } };
  const feed = "plugins/native/feed/src/registration.ts";
  const edited = (extra: string) => ({ files, read: (file: string) => (file === feed ? read(file)!.replace("  manifest: feedManifest,\n", `  manifest: feedManifest,\n  ${extra},\n`) : read(file)) });
  assert.deepEqual(pluginRegistryProblems({ files, read }, WORKSPACE_PACKAGES), [], "the tree as it is passes");
  for (const [key, extra] of [["summary", 'summary: "订阅来源。"'], ["developer", "developer: true"]] as const) {
    assert.match(pluginRegistryProblems(edited(extra), WORKSPACE_PACKAGES).join("\n"), new RegExp(`feed/src/registration\\.ts has key "${key}", which PluginRegistration does not declare`));
  }
});
