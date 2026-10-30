import assert from "node:assert/strict";
import test from "node:test";
import { registration } from "@molis-ai/molis-work-plugin-goals/registration";
import { pluginPageClients, pluginSettingsClients, pluginSettingsStyles, pluginWorkbenchPacks, pluginWorkbenchStyles } from "@molis-ai/molis-work-app-workbench";
import { renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchClientScript, renderMolisWorkWorkbenchStylesheet } from "./workbench-renderer-fixture.js";

// PG-060 (T-115): the workbench takes Goals' styles and browser scripts from the plugin's registration, through the channels
// every plugin has, and never from the Goals package.
const goals = registration.workbench!;
const count = (text: string, part: string) => text.split(part).length - 1;

test("RAC-2090 Goals' page rules reach the workbench sheet once, from its registration, beneath the shell's own layers", () => {
  const sheet = renderMolisWorkWorkbenchStylesheet(), rules = goals.stylesheet!;
  assert.equal(goals.stylesheetLayer, "beneath-shell");
  assert.equal(count(sheet, rules), 1);
  assert.equal(pluginWorkbenchStyles(pluginWorkbenchPacks(), "beneath-shell"), rules, "Goals is the one plugin beneath the shell");
  assert.ok(!pluginWorkbenchStyles().includes(rules), "and it is not in the layer over the shell");
  // The canvas restyles the Goal document the shell draws, so its rules come after Goals' and win ties with them.
  assert.ok(sheet.indexOf(rules) < sheet.indexOf(".goal-canvas-shell .goal-event-document {"));
  for (const other of [renderMolisWorkSettingsStylesheet(), renderMolisWorkArrivalStylesheet()]) {
    assert.doesNotMatch(other, /\.goal-event-document \.filters\b/u, "the settings and arrival pages draw no Goal document");
  }
});

test("RAC-2091 the rules of Goals' settings pages reach both sheets that draw settings, once each", () => {
  const rules = goals.settingsStylesheet!;
  assert.match(rules, /\[data-project-rules-form\]|\.planning-/u);
  assert.equal(pluginSettingsStyles(), rules, "Goals is the one plugin with settings rules");
  for (const sheet of [renderMolisWorkWorkbenchStylesheet(), renderMolisWorkSettingsStylesheet()]) assert.equal(count(sheet, rules), 1);
});

test("RAC-2092 the Goals page script takes each factory from the registration, by name", () => {
  const script = renderMolisWorkWorkbenchClientScript(), clients = goals.pageClients!;
  assert.equal(Object.keys(clients).length, 12);
  assert.equal(pluginPageClients("goals"), clients);
  for (const [name, factory] of Object.entries(clients)) assert.equal(count(script, factory), 1, `${name} is in the page script once`);
  assert.doesNotMatch(script, /\(undefined\)\(/u, "no factory the page script names is missing");
  assert.throws(() => pluginPageClients("files"), /files registers no page clients/u);
});

test("RAC-2093 Goals' settings scripts run from the registration's settings client", () => {
  const settings = goals.settingsClient!;
  for (const binder of ["molisWorkBindProjectRules", "molisWorkBindPlanningSettings", "molisWorkBindPlanningAdoption"]) assert.match(settings, new RegExp(binder, "u"));
  assert.ok(pluginSettingsClients().includes(settings));
  assert.equal(count(renderMolisWorkWorkbenchClientScript(), settings), 1);
});
