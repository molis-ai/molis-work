import { compactClientScript } from "../scripts/client-literals.mjs";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import assert from "node:assert/strict";
import test from "node:test";
import { registration } from "@molis-ai/molis-work-plugin-goals/registration";
import { workbenchClientSource, pluginOnDemandStylesheet, pluginPageClientScript, pluginSettingsClients, pluginSettingsStyles, pluginWorkbenchPacks, pluginWorkbenchStyles,
  renderMolisWorkCapabilitiesClientScript } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

// PG-060 (T-115) & PEQ-08: the workbench takes Goals' styles and browser scripts from the plugin's registration, through the channels
// every plugin has, and never from the Goals package; Goals' stylesheet is served on demand rather than bundled into shared workbench.css.
const goals = registration.workbench!;
const count = (text: string, part: string) => text.split(part).length - 1;

test("RAC-2090 PEQ-08 Goals' page rules are served on demand from its registration, not embedded into shared shell sheets", () => {
  const sheet = renderMolisWorkWorkbenchStylesheet(), rules = goals.stylesheet!;
  const own = pluginOnDemandStylesheet("goals") ?? "";
  assert.equal(goals.stylesheetLayer, undefined, "PEQ-08: Goals has no beneath-shell special layer");
  assert.equal(pluginWorkbenchStyles(pluginWorkbenchPacks(), "beneath-shell"), "", "no plugin stays beneath the shell");
  assert.equal(count(sheet, ".goal-canvas-shell .goal-event-document {"), 0, "Goals' own rules are not bundled into shared workbench.css");
  assert.ok(!pluginWorkbenchStyles().includes(".goal-canvas-shell .goal-event-document {"), "nor bundled into shared pluginWorkbenchStyles");
  assert.ok(own.includes(".goal-event-document .filters") && own.includes(".goal-canvas-shell .goal-event-document {"),
    "Goals' own rules are served on demand through the shared plugin channel");
  // The canvas restyles the Goal document inside Goals' own sheet, so its rules come after the Goal document rules.
  assert.ok(own.indexOf(".goal-event-document .filters") < own.indexOf(".goal-canvas-shell .goal-event-document {"));
  assert.ok(rules.includes(".goal-canvas-shell .goal-event-document {"));
  for (const other of [renderMolisWorkSettingsStylesheet(), renderMolisWorkArrivalStylesheet()]) {
    assert.doesNotMatch(other, /\.goal-event-document \.filters\b/u, "the settings and arrival pages draw no Goal document");
  }
});

test("RAC-2091 and APR-19 project rule settings use the shared authorization styles on both settings surfaces", () => {
  assert.equal(goals.settingsStylesheet, undefined);
  assert.doesNotMatch(pluginSettingsStyles(), /\.project-rules-page|\[data-authorization-rule-form\]/u);
  for (const sheet of [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkSettingsStylesheet()]) {
    assert.equal([...sheet.matchAll(/\[data-authorization-layout\]\s*\{[^}]*grid-template-columns/gu)].length, 1);
    assert.doesNotMatch(sheet, /\.project-rules-page|\[data-project-rules-form\]/u);
  }
});

test("RAC-2092 PCL-01 the shell's page script takes Goals' page client from the registration, once, without naming the plugin", () => {
  const script = workbenchClientSource(), client = goals.pageClient!;
  assert.equal(typeof client, "string");
  assert.equal(Object.hasOwn(goals, "pageClients"), false, "the factories-by-name field is gone (no old field kept)");
  assert.equal(count(script, client), 1, "the page client is in the page script once");
  assert.match(pluginPageClientScript(), /^\[\["goals", \(host\) => /u, "the shell lists every registered page client with its plugin");
  assert.equal(pluginPageClientScript([]), "[]", "a registration list without page clients gives none");
});

// PCL-02: the shell's page scripts do not name Goals. The four files below are the follow-ups the spec leaves out (placement's
// attach-to-a-Goal flow, the Artifacts goal-input client, the Assistant's tab kinds and glyphs); their counts only go down.
test("PCL-02 the shell's page scripts do not name Goals outside the listed follow-ups", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const dir = new URL("../apps/workbench/src/scripts/client/", import.meta.url);
  const allowed: Record<string, number> = { "placement.ts": 85, "plugin-workbench.ts": 3, "assistant-materials.ts": 2, "assistant-side-kit.ts": 1 };
  const found: Record<string, number> = {};
  for (const name of (await readdir(dir)).filter((file) => file.endsWith(".ts"))) {
    const words = ((await readFile(new URL(name, dir), "utf8")).match(/goal/giu) ?? []).length;
    if (words > (allowed[name] ?? 0)) found[name] = words;
  }
  assert.deepEqual(found, {});
});

test("RAC-2093 and APR-19 project rule updates use the same client as authorization settings", () => {
  assert.equal(goals.settingsClient, undefined);
  const script = renderMolisWorkCapabilitiesClientScript();
  for (const code of [pluginSettingsClients(), workbenchClientSource(), script]) {
    assert.doesNotMatch(code, /molisWorkBindProjectRules|molisWorkBindPlanning/u);
  }
  assert.equal([...script.matchAll(/globalThis\.molisWorkBindAuthorizationSettings\s*=/gu)].length, 1);
  assert.match(script, /\/api\/settings\/authorizations/u);
  assert.match(script, /\/project-rules/u);
});


test("the shipped page preserves the assembled registration program after literal pooling and compaction", () => {
  const source = workbenchClientSource();
  assert.ok(source.startsWith(UI_REQUEST_CLIENT_SCRIPT));
  const program = compactClientScript(source.slice(UI_REQUEST_CLIENT_SCRIPT.length));
  const shipped = renderMolisWorkWorkbenchClientScript();
  assert.equal(shipped.slice(0, UI_REQUEST_CLIENT_SCRIPT.length), UI_REQUEST_CLIENT_SCRIPT);
  // The project home view is its own bundle between the request bootstrap and the shell that calls it (tooling/build-client.mjs).
  const rest = shipped.slice(UI_REQUEST_CLIENT_SCRIPT.length), at = rest.indexOf(program);
  assert.match(rest, /^"use strict";var molisWorkHomeView=/u);
  assert.ok(at > 0 && rest.indexOf(program, at + 1) < 0, "the assembled program is shipped once, whole, after the home view");
  // The foot's account menu (inside `program`, account-menu.ts) renders and closes on `[data-unified-account-link]`;
  // the Molis account IIFE itself is appended once after `program` (tooling/build-client.mjs).
  const account = rest.slice(at + program.length);
  assert.equal(count(account, "data-unified-account-link"), 1);
  assert.equal(count(shipped, "data-unified-account-link") - count(program, "data-unified-account-link"), 1);
});
