// W5-08 (PG-064): the workbench's public entry gives out what the workbench itself makes. It does not hand a plugin's code on to
// the Host (the Host and the tests take it from the plugin's own entry), and it has no `export *`, so a helper added to a module
// does not become public by itself. What stays for another line is named in slices/w5-08-workbench-exports.md §3.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import * as workbench from "@molis-ai/molis-work-app-workbench";

const PLUGIN_PACKAGE = /^@molis-ai\/molis-work-plugin-/u;
const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), "utf8");
const entry = ts.createSourceFile("index.ts", read("apps/workbench/src/index.ts"), ts.ScriptTarget.Latest, true);
const exportDeclarations = entry.statements.filter(ts.isExportDeclaration);

/** What `./ui-composition.js` gives out: the names that have a user outside it, each named here. */
const UI_COMPOSITION_NAMES = [
  "artifactWorkbench", "createArtifactReferenceRenderer", "createWorkbenchGoalsContextRenderer", "createWorkbenchGoalsDialogsRenderer",
  "createWorkbenchGoalsDocumentRenderer", "createWorkbenchGoalsFactorsRenderer", "createWorkbenchGoalsMomentumRenderer",
  "createWorkbenchGoalsPlanningRenderer", "createWorkbenchGoalsPolicyRenderer", "createWorkbenchGoalsRelationRenderer",
  "createWorkbenchGoalsStatusRenderer", "createWorkbenchGoalsTreeRenderer", "createWorkbenchUiHost", "renderPluginSettingsContribution",
];

test("RAC-710 the workbench entry has no export from a plugin package", () => {
  const relayed = exportDeclarations.flatMap(node => node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && PLUGIN_PACKAGE.test(node.moduleSpecifier.text)
    ? [node.moduleSpecifier.text] : []);
  assert.deepEqual(relayed, [], "take these from the plugin's own entry");
});

test("RAC-710 no name of a plugin package's entry leaves the workbench entry as the same value", async () => {
  const dependencies = Object.keys((JSON.parse(read("apps/workbench/package.json")) as { dependencies: Record<string, string> }).dependencies).filter(name => PLUGIN_PACKAGE.test(name));
  assert.ok(dependencies.length > 10, "the workbench's plugin packages are read from its package.json");
  const given = new Map(Object.entries(workbench));
  const relayed: string[] = [];
  for (const name of dependencies) {
    const plugin = await import(name) as Record<string, unknown>;
    for (const [key, value] of Object.entries(plugin)) if (given.has(key) && Object.is(given.get(key), value)) relayed.push(`${key} (from ${name})`);
  }
  assert.deepEqual(relayed, []);
});

test("RAC-711 the workbench entry has no `export *`, `export type *` or `export * as`", () => {
  const unnamed = exportDeclarations.filter(node => node.moduleSpecifier && (!node.exportClause || ts.isNamespaceExport(node.exportClause)));
  assert.deepEqual(unnamed.map(node => node.getText(entry).slice(0, 60)), []);
});

test("RAC-711 the names ui-composition, i18n and capsule-view give out are listed in the entry, one by one", () => {
  const named = (module: string) => exportDeclarations.flatMap(node => node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === module
    && node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(element => element.name.text) : []).sort();
  assert.deepEqual(named("./ui-composition.js"), [...UI_COMPOSITION_NAMES].sort());
  assert.deepEqual(named("./i18n.js"), ["LOCALE_COOKIE", "LOCALE_SWITCH_STYLES", "WEB_LOCALES", "WebLocale", "createWorkbenchLocale"]);
  assert.deepEqual(named("./capsule-view.js"), ["CapsuleGoalItem", "CapsuleSnapshot", "CapsuleState", "CapsuleStateKind", "CapsuleTab", "CapsuleTabKind"]);
  for (const name of [...UI_COMPOSITION_NAMES, "createWorkbenchLocale", "LOCALE_COOKIE", "WEB_LOCALES", "LOCALE_SWITCH_STYLES"]) {
    assert.ok(name in workbench, `${name} is given out`);
  }
});
