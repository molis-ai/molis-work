// W5-08 (PG-064): the workbench's public entry gives out what the workbench itself makes. It does not hand a plugin's code on to
// the Host (the Host and the tests take it from the plugin's own entry), and it has no `export *`, so a helper added to a module
// does not become public by itself. What stays for another line is named in slices/w5-08-workbench-exports.md §3.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
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
  "artifactWorkbench", "createArtifactReferenceRenderer", "createWorkbenchUiHost", "renderPluginSettingsContribution",
  "renderWorkbenchDocument", "WORKBENCH_UI_SLOTS",
];

/** The plugin words (PG-071) `./i18n.js` gives out besides the locale names, each with the files outside the workbench that use it. */
const PLUGIN_WORDS_USERS: Readonly<Record<string, readonly string[]>> = {
  // Text a plugin's own code draws (its summary, its page) is translated with that plugin's words and no one else's.
  inWordsOf: ["apps/local-host/src/home-plugin-http.ts"],
  // A plugin that activates brings its Manifest's `ui.messages` and `ui.translations` to the pages' catalog, a built-in or an installed one.
  registerPluginMessages: ["apps/local-host/src/plugin-platform.ts"],
  // Takes a plugin's words out again; the Host has no path for it yet (an uninstalled plugin's words stay until restart), so only the tests call it.
  unregisterPluginMessages: ["tests/plugin-messages.test.ts", "tests/plugin-words-owned.test.ts"],
  // Every place the Host draws what a plugin supplies (a contribution, an action's title, a deletion dialog's data label) applies that plugin's words.
  withPluginWords: ["apps/local-host/src/artifact-native-plugin-http.ts", "apps/local-host/src/home-plugin-executor.ts", "apps/local-host/src/installed-plugin-host.ts",
    "apps/local-host/src/local-plugin-development.ts", "apps/local-host/src/project-plugins.ts", "apps/local-host/src/web-project-deletion.ts"],
};

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
  assert.deepEqual(named("./i18n.js"), ["LOCALE_COOKIE", "LOCALE_SWITCH_STYLES", "WEB_LOCALES", "WebLocale", "createWorkbenchLocale", ...Object.keys(PLUGIN_WORDS_USERS)].sort());
  for (const [name, users] of Object.entries(PLUGIN_WORDS_USERS)) {
    for (const file of users) assert.match(read(file), new RegExp(`\\b${name}\\b`, "u"), `${file} uses ${name}`);
  }
  assert.deepEqual(named("./capsule-view.js"), ["CapsuleGoalItem", "CapsuleSnapshot", "CapsuleState", "CapsuleStateKind", "CapsuleTab", "CapsuleTabKind"]);
  for (const name of [...UI_COMPOSITION_NAMES, "createWorkbenchLocale", "LOCALE_COOKIE", "WEB_LOCALES", "LOCALE_SWITCH_STYLES", ...Object.keys(PLUGIN_WORDS_USERS)]) {
    assert.ok(name in workbench, `${name} is given out`);
  }
});

/** Names the entry gives out with no importer outside the workbench, each with why it stays. */
const KEPT_WITHOUT_IMPORTER: Readonly<Record<string, string>> = {
  ...Object.fromEntries(["createWorkbenchGoalsPageRenderer", "WorkbenchShellPageView", "WorkbenchShellPageOwners"].map(name => [name, "Goals' interface adapters, removed when Goals S11 moves them out"])),
  ...Object.fromEntries(["CapsuleGoalItem", "CapsuleSnapshot", "CapsuleState", "CapsuleStateKind", "CapsuleTab", "CapsuleTabKind", "ChooserArrival",
    "ProjectSettingsFoldId", "SideViewDocumentInput"].map(name => [name, "types the Host's declarations name without importing (TS2742 without)"])),
};

test("RAC-1115 every name the workbench entry gives out has an importer outside the workbench, or a listed reason to stay (BL-635)", () => {
  const PACKAGE = "@molis-ai/molis-work-app-workbench", ENTRY_PATH = /apps\/workbench\/(src|dist)\/index(\.js|\.ts)?$/u;
  const isEntry = (specifier: string) => specifier === PACKAGE || ENTRY_PATH.test(specifier);
  const given = new Set<string>();
  for (const node of exportDeclarations) if (node.exportClause && ts.isNamedExports(node.exportClause)) for (const element of node.exportClause.elements) given.add(element.name.text);
  const files = execFileSync("git", ["ls-files", "*.ts", "*.mts", "*.mjs", "*.js"], { cwd: fileURLToPath(root), encoding: "utf8" }).trim().split("\n")
    .filter(file => !file.startsWith("apps/workbench/") && !file.includes("/dist/") && file !== "tests/workbench-entry-exports.test.ts");
  const used = new Set<string>();
  for (const file of files) {
    const text = read(file);
    if (!text.includes(PACKAGE) && !/apps\/workbench\/(src|dist)\/index/u.test(text)) continue;
    let whole = false;
    const visit = (node: ts.Node): void => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
      if (specifier && isEntry(specifier)) {
        const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
        if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) for (const element of bindings.elements) used.add((element.propertyName ?? element.name).text);
        else whole = true;
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && isEntry(node.arguments[0].text)) whole = true;
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal) && isEntry(node.argument.literal.text)) {
        if (node.qualifier) used.add(node.qualifier.getText().split(".")[0]!); else whole = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    // A namespace or dynamic import: a name written in the file counts as taken.
    if (whole) for (const name of given) if (new RegExp(`\\b${name}\\b`, "u").test(text)) used.add(name);
  }
  assert.deepEqual([...given].filter(name => !used.has(name) && !(name in KEPT_WITHOUT_IMPORTER)).sort(), [], "take these out of the entry; the workbench's own modules still have them");
  assert.deepEqual(Object.keys(KEPT_WITHOUT_IMPORTER).filter(name => !given.has(name) || used.has(name)).sort(), [], "an entry here that left the entry or found an importer comes off the list");
});
