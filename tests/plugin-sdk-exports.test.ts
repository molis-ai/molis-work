import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

// specs/repository-anti-corruption W2-03 (§4.10): a plugin author builds with the helpers the contracts define (`define…Action`,
// `bind…Handler`, `with…`), and gets them from the plugin SDK. The reminders, fragment offers, 成果库 helpers and `withActionEffect` were
// once defined and used by built-in plugins while the SDK did not export them, so generated and third-party plugins could not reach
// them and the API snapshot only showed what the SDK did export. This test names every such helper the contracts define and fails
// when one is neither exported by the SDK nor listed below with the reason it is not.
const platform = fileURLToPath(new URL("../packages/contracts/src/platform", import.meta.url));

// The SDK is loaded through the entry its package.json declares, as a plugin would get it (the repository root does not depend on it).
const sdkDirectory = fileURLToPath(new URL("../packages/plugin-sdk/", import.meta.url));
const sdkEntry = (JSON.parse(readFileSync(join(sdkDirectory, "package.json"), "utf8")) as { exports: { ".": { import: string } } }).exports["."].import;
type Declaration = { capability_id: string; operation: string; action: { scope: string; audiences: string[]; effect?: string; plugin?: false } };
interface Sdk {
  [name: string]: unknown;
  defineDueRemindersAction(id: string, kinds: string[], title: string, permissions: string[]): Declaration;
  defineArtifactCompareAction(id: string, title: string, permissions: string[]): Declaration;
  withActionEffect(definition: Declaration, effect: string, plugin?: false): Declaration;
  FRAGMENT_ANY_OBJECT: string;
  FRAGMENT_INTENTS: readonly unknown[];
  FRAGMENT_GRANULARITIES: readonly unknown[];
  FRAGMENT_ROLES: readonly unknown[];
}
const sdk = await import(pathToFileURL(join(sdkDirectory, sdkEntry)).href) as Sdk;

/** Helpers a plugin does not take from the SDK, with why. An entry that is exported after all, or no longer exists, fails the test. */
const NOT_FOR_PLUGINS: Readonly<Record<string, string>> = {
  bindActionClient: "Host and test side: binds a client to a call context; a running plugin uses `context.services.actions`",
  defineInstructionPrompt: "plugins import it from `@molis-ai/molis-work-contracts/platform/model-prompts` (docs/platform/PLUGIN-DEVELOPMENT.md, 调用模型)",
};

const HELPER = /^export (?:async )?function ((?:define|bind|with)[A-Z]\w*)/gmu;

/** The contracts' helpers the SDK does not export (and has no reason to hold back), and exceptions that no longer hold. */
function sdkExportGaps(sources: Readonly<Record<string, string>>, exported: ReadonlySet<string>, exempt: Readonly<Record<string, string>>) {
  const defined = new Map<string, string>();
  for (const [file, text] of Object.entries(sources)) for (const match of text.matchAll(HELPER)) defined.set(match[1]!, file);
  return {
    missing: [...defined].filter(([name]) => !exported.has(name) && !(name in exempt)).map(([name, file]) => `${name} (${file})`).sort(),
    stale: Object.keys(exempt).filter(name => !defined.has(name) || exported.has(name)).sort(),
  };
}

test("every helper the platform contracts define for plugin authors is exported by the plugin SDK", () => {
  const sources = Object.fromEntries(readdirSync(platform).filter(name => name.endsWith(".ts")).map(name => [name, readFileSync(join(platform, name), "utf8")]));
  const exported = new Set(Object.keys(sdk));
  const { missing, stale } = sdkExportGaps(sources, exported, NOT_FOR_PLUGINS);
  assert.deepEqual(missing, [], "export these from packages/plugin-sdk/src/index.ts, or list them in NOT_FOR_PLUGINS with the reason");
  assert.deepEqual(stale, [], "these NOT_FOR_PLUGINS entries are exported now or not defined any more: remove them");
});

test("the SDK exports are working functions, among them the ones W2-03 added", () => {
  for (const name of [
    "defineDueRemindersAction", "assertDueReminderWindow", "withinDueReminderWindow", "defineFragmentOffersAction",
    "defineArtifactPreviewAction", "bindArtifactPreview", "defineArtifactPinAction", "nextPinnedVersion", "defineArtifactCompareAction", "bindArtifactCompare",
    "sameArtifactFields", "objectOrMissing", "defineArtifactContinueAction", "bindArtifactContinue", "defineArtifactReferrersAction", "linkedArtifactVersion",
    "linksToArtifactVersion", "withActionEffect",
  ]) assert.equal(typeof sdk[name], "function", name);
  assert.equal(sdk.FRAGMENT_ANY_OBJECT, "molis.any-object");
  assert.ok(sdk.FRAGMENT_INTENTS.length > 0 && sdk.FRAGMENT_GRANULARITIES.length > 0 && sdk.FRAGMENT_ROLES.length > 0);
  assert.equal("defineSearchQueryAction" in sdk, false, "decision 19 removed the on-demand search source");

  // What an author gets from the helpers is the same declaration the Host registers.
  const reminders = sdk.defineDueRemindersAction("notes.reminders.window", ["note"], "到期提醒", ["notes:read"]);
  assert.deepEqual([reminders.operation, reminders.action.scope, reminders.action.audiences], ["query", "home", ["user"]]);
  const effect = sdk.withActionEffect(sdk.defineArtifactCompareAction("notes.artifacts.compare", "笔记", ["notes:read"]), "irreversible", false);
  assert.deepEqual([effect.action.effect, effect.action.plugin], ["irreversible", false]);
});

// The rule is checked on source it can be shown wrong on: a new helper without an export fails, an exception that outlived its reason fails.
test("the export check flags a new helper, a stale exception and nothing else", () => {
  const sources = { "a.ts": "export function defineNewThingAction(id: string) {}\nexport async function bindNewThingHandler() {}\nexport function withNewEffect() {}\nexport function notAHelper() {}\nfunction defineLocalOnly() {}\n" };
  const clean = sdkExportGaps(sources, new Set(["defineNewThingAction", "bindNewThingHandler", "withNewEffect"]), {});
  assert.deepEqual(clean, { missing: [], stale: [] });
  const gaps = sdkExportGaps(sources, new Set(["defineNewThingAction"]), {});
  assert.deepEqual(gaps.missing, ["bindNewThingHandler (a.ts)", "withNewEffect (a.ts)"]);
  assert.deepEqual(sdkExportGaps(sources, new Set(["defineNewThingAction", "withNewEffect"]), { bindNewThingHandler: "Host side" }), { missing: [], stale: [] });
  const stale = sdkExportGaps(sources, new Set(["defineNewThingAction", "bindNewThingHandler", "withNewEffect"]), { bindNewThingHandler: "now exported", gone: "removed" });
  assert.deepEqual(stale.stale, ["bindNewThingHandler", "gone"]);
});
