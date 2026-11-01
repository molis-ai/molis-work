import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { builtinCatalogText, checkArtifactsOwnership, checkMigratedFeedUiOwnership, checkMigratedGoalsCommandOwnership, checkMigratedGovernanceOwnership,
  checkMigratedIntegrationOwnership, checkPrivateWorkContextOwnership, checkProposalUiOwnership, checkProposalUiOwnershipInTree, checkRuntimeHostOwnership,
  hasImportFrom, hasInCode, hasInText, hasWorkbenchUiContribution, matchesInCode, matchesStatementInCode, mentionsWorkbenchUiContribution } from "../scripts/check-package-boundaries.mjs";
import { catalogText } from "../scripts/gates/catalog-entries.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const read = file => readFileSync(path.join(repository, file), "utf8");
const errorsOf = result => Array.isArray(result) ? result : result.errors;

/** Runs one section's check on the real tree with one file's text replaced (the check is synchronous, so the swap lasts one call). */
function checkWith(check, file, text) {
  const readFileSync = fs.readFileSync, target = path.join(repository, file);
  fs.readFileSync = (candidate, ...rest) => String(candidate) === target ? text : readFileSync(candidate, ...rest);
  try { return errorsOf(check(repository)); } finally { fs.readFileSync = readFileSync; }
}

const quoted = needle => JSON.stringify(needle);
const regexSource = needle => needle.replace(/[\\^$.*+?()[\]{}|/]/gu, "\\$&");
const templated = needle => needle.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
/** The ways a text stands in for the code that is not there: gone, then written again where no code is. */
const stand = {
  "a line comment": needle => `\n// ${needle}\n`,
  "a block comment": needle => `\n/* ${needle} */\n`,
  "a string": needle => `\nconst standIn = ${quoted(needle)};\n`,
  "a regular expression": needle => `\nconst standIn = /${regexSource(needle)}/;\n`,
  "template text": needle => `\nconst standIn = \`${templated(needle)}\`;\n`,
};
const without = (source, needle) => source.split(needle).join("");

// One row for each way a "must contain" is read: a name or syntax (`code`), a text that is the content (`text`), an import (`import`),
// a pattern (`pattern`). The `needle` is in the file as it stands.
const ROWS = [
  { check: checkMigratedGoalsCommandOwnership, file: "plugins/native/goals/src/goal-tree-fact-materializer.ts", needle: "this.createIntent(", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "apps/local-host/src/installer/home-release.ts", needle: "skillMethodsDirectory", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "tests/goals-query-module.test.ts", needle: "goals.query.readGoal", kind: "code" },
  { check: checkMigratedGovernanceOwnership, file: "plugins/native/goals/src/contract/governance-collaboration.ts", needle: "interface GovernanceQueryApi", kind: "code" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/index.ts", needle: "class ArtifactsModule", kind: "code" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/repository.ts", needle: "export const ARTIFACT_TABLES", kind: "code" },
  { check: checkPrivateWorkContextOwnership, file: "modules/private-work-context/src/index.ts", needle: "createRuntimeContextModule", kind: "code" },
  { check: checkRuntimeHostOwnership, file: "horizontal/runtime-host/src/index.ts", needle: "MolisWorkPtyHost", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "apps/local-host/src/installer/home-release.ts", needle: '"molis-work-plugin-goals"', kind: "text" },
  { check: checkMigratedGovernanceOwnership, file: "tests/governance-collaboration-module.test.ts", needle: "runtime_dialogue", kind: "text" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/service.ts", needle: "artifacts.artifact.version_not_increasing", kind: "text" },
  { check: checkArtifactsOwnership, file: "modules/artifacts/src/repository.ts", needle: "PRIMARY KEY (artifact_id, version)", kind: "text" },
  { check: checkArtifactsOwnership, file: "tests/artifacts-module.test.ts", needle: "opaque content, scope and producer binding", kind: "text" },
  { check: checkRuntimeHostOwnership, file: "packages/contracts/src/services/runtime-host.ts", needle: 'maturity: "partial"', kind: "text" },
  { check: checkMigratedGoalsCommandOwnership, file: "tests/planning-engine.test.ts", needle: 'from "./fixtures/goals-modules.js"', kind: "import" },
  { check: checkRuntimeHostOwnership, file: "apps/local-host/src/pty-socket.ts", needle: 'from "@molis-ai/molis-work-service-runtime-host"', kind: "import" },
  { check: checkRuntimeHostOwnership, file: "apps/local-host/src/web-request.ts", needle: 'from "@molis-ai/molis-work-service-runtime-host"', kind: "import" },
];

test("RAC-2010 the Goals, Governance, Artifacts, Private Work Context and Runtime Host checks accept the tree as it is", () => {
  for (const check of new Set(ROWS.map(row => row.check))) assert.deepEqual(errorsOf(check(repository)), [], check.name);
  for (const row of ROWS) assert.ok(read(row.file).includes(row.needle), `${row.file} has ${row.needle}`);
});

/** The three tests for each row of a table: taking the text out refuses; a code or import row refuses it written only where no code is; a text row also refuses a comment or a regular expression but takes a string. */
function defineRowTests(rows, [removed, standIns, content]) {
  for (const row of rows) test(`${removed} ${row.check.name}: ${row.needle} in ${path.basename(row.file)} is a ${row.kind} requirement that taking it out refuses`, () => {
    assert.ok(checkWith(row.check, row.file, without(read(row.file), row.needle)).length > 0);
  });

  for (const row of rows.filter(({ kind }) => kind !== "text")) test(`${standIns} ${row.check.name}: ${row.needle} written only in a comment, a string, a regular expression or template text no longer stands in for the ${row.kind}`, () => {
    const source = without(read(row.file), row.needle);
    for (const [name, write] of Object.entries(stand)) assert.ok(checkWith(row.check, row.file, source + write(row.needle)).length > 0, `${row.needle} as ${name}`);
  });

  for (const row of rows.filter(({ kind }) => kind === "text")) test(`${content} ${row.check.name}: ${row.needle} is content, so a string or template that holds it counts and a comment or a regular expression does not`, () => {
    const source = without(read(row.file), row.needle);
    for (const name of ["a line comment", "a block comment", "a regular expression"]) assert.ok(checkWith(row.check, row.file, source + stand[name](row.needle)).length > 0, `${row.needle} as ${name}`);
    for (const name of ["a string", "template text"]) {
      // The text may be one that a string alone cannot hold (the quotes are part of it); only the ones a string can hold are tried.
      if (!row.needle.includes('"') && !row.needle.includes("${")) assert.deepEqual(checkWith(row.check, row.file, source + stand[name](row.needle)), [], `${row.needle} as ${name}`);
    }
  });
}
defineRowTests(ROWS, ["RAC-2011", "RAC-2012", "RAC-2013"]);

// T-280: the Feed and Integration sections, Goals' route mount and the proposal UI check, read the same way.
const FEED_UI = checkMigratedFeedUiOwnership, INTEGRATION = checkMigratedIntegrationOwnership;
const MORE_ROWS = [
  { check: FEED_UI, file: "apps/workbench/src/renderer.ts", needle: "createWorkbenchStageRenderers(", kind: "code" },
  { check: FEED_UI, file: "apps/workbench/src/renderer.ts", needle: "stageModel: stages.declaredStageModel", kind: "code" },
  { check: FEED_UI, file: "apps/workbench/src/renderer.ts", needle: "stageFragmentModel: stages.stageFragmentModel", kind: "code" },
  { check: FEED_UI, file: "apps/workbench/src/stage-renderers.ts", needle: "sharedStageModel(projectPluginId, view)", kind: "code" },
  { check: FEED_UI, file: "apps/workbench/src/stage-renderers.ts", needle: "sharedStageModel(projectPluginId, context)", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/manifest.ts", needle: "routes: [", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/plugin.ts", needle: "createFeedRouteHandlers", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/plugin.ts", needle: "routes,", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/manifest.ts", needle: "routes: [", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/plugin.ts", needle: "createInboxRouteHandlers", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/plugin.ts", needle: "routes,", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/manifest.ts", needle: "stage_data: { action: feedQueryActions.stage.capability_id", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/manifest.ts", needle: "object_action: feedQueryActions.reader.capability_id", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/plugin.ts", needle: "createFeedQueryHandlers(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/query-actions.ts", needle: "bind(feedQueryActions.stage", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/query-actions.ts", needle: "bind(feedQueryActions.reader", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/manifest.ts", needle: "stage_data: { action: inboxActions.stage.capability_id", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/plugin.ts", needle: "createInboxActionHandlers(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/inbox/src/actions.ts", needle: "bind(inboxActions.stage", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/stage-ui.ts", needle: "function buildFeedStageUiModel(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/stage-ui.ts", needle: "function buildFeedReaderUiModel(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/ui.ts", needle: "buildFeedStageUiModel(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/ui.ts", needle: "buildFeedReaderUiModel(", kind: "code" },
  { check: FEED_UI, file: "plugins/native/feed/src/ui.ts", needle: "feedUiContribution", kind: "code" },
  { check: FEED_UI, file: "packages/ui-host/src/index.ts", needle: "class UiHost", kind: "code" },
  { check: FEED_UI, file: "packages/ui-host/src/index.ts", needle: "render<TModel>(request", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "plugins/native/goals/src/http/types.ts", needle: "actions(request: PluginRouteRequest): BoundActionClient", kind: "code" },
  { check: checkMigratedGoalsCommandOwnership, file: "plugins/native/goals/src/http/types.ts", needle: "actions: BoundActionClient", kind: "code" },
  // The client script is a browser script in a template string: its calls are template text.
  { check: checkProposalUiOwnershipInTree, file: "apps/workbench/src/scripts/client/events-accessibility.ts", needle: "handleGoalProposalSubmit(submittedForm, event)", kind: "text" },
  { check: INTEGRATION, file: "plugins/official-integrations/github/src/index.ts", needle: '"io.molis.work.integration.github"', kind: "text" },
  { check: INTEGRATION, file: "plugins/official-integrations/github/src/index.ts", needle: '"adeptify-official-signature-v1"', kind: "text" },
  { check: INTEGRATION, file: "apps/local-host/src/github-connector.ts", needle: 'from "@molis-ai/molis-work-integration-github"', kind: "import" },
  { check: INTEGRATION, file: "apps/local-host/src/gmail-connector.ts", needle: 'from "@molis-ai/molis-work-integration-gmail"', kind: "import" },
];

defineRowTests(MORE_ROWS, ["RAC-2061", "RAC-2062", "RAC-2063"]);

test("RAC-2507 the retired Feed and Inbox Workbench projections cannot be restored", () => {
  for (const retired of ["apps/workbench/src/feed-projection-ui.ts", "apps/workbench/src/inbox-projection-ui.ts"]) {
    const original = fs.existsSync, target = path.join(repository, retired);
    fs.existsSync = candidate => String(candidate) === target || original(candidate);
    try { assert.ok(errorsOf(FEED_UI(repository)).some(error => error.includes(retired)), retired); }
    finally { fs.existsSync = original; }
  }
});

// A requirement written as a pattern: the text the pattern finds is what is taken out and written back.
const COMPOSITION = "apps/workbench/src/ui-composition.ts", GOALS_FACTORIES = "plugins/native/goals/src/page/factories.ts", GOALS_SURFACES = "plugins/native/goals/src/page/surfaces.ts", RENDERER = "apps/workbench/src/renderer.ts", REGISTRY = "apps/workbench/src/plugin-workbench.ts", GOALS_PLUGIN = "plugins/native/goals/src/plugin.ts";
const PATTERNS = [
  { check: checkMigratedGoalsCommandOwnership, file: GOALS_PLUGIN, pattern: /routes:\s*goalsRoutes\s*\(\{/u },
  { check: checkMigratedGoalsCommandOwnership, file: GOALS_PLUGIN, pattern: /actions:\s*request\s*=>/u },
  { check: checkMigratedGoalsCommandOwnership, file: GOALS_PLUGIN, pattern: /actions\.invoke\(definition,\s*input,\s*request\.execution\)/u },
  { check: checkProposalUiOwnershipInTree, file: GOALS_FACTORIES, pattern: /surfaceRenderers<[^>]+>\(mount, GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES\)/u },
  { check: checkProposalUiOwnershipInTree, file: RENDERER, pattern: /createGoalsPage<[^>]+>\(\{\s*mount: mountContributionsOf\(GOALS_PLUGIN_ID\)/u },
  { check: checkProposalUiOwnershipInTree, file: COMPOSITION, pattern: /function mountContributionsOf\(pluginId: string, host: UiHost = workbenchUiHost\)[^{]*\{\s*return \(contributionId, surface, model\) => host\.mountDeclared\(\{[^}]*\}, pluginId\)\.html/u },
  { check: checkProposalUiOwnershipInTree, file: COMPOSITION, pattern: /function renderWorkbenchContribution\([^)]*\): string \{\s*return workbenchUiHost\.mountDeclared\(/u },
  { check: checkProposalUiOwnershipInTree, file: GOALS_SURFACES, pattern: /return mount\(contributionId, surface, model\)/u },
  { check: checkProposalUiOwnershipInTree, file: COMPOSITION, pattern: /import\s*\{\s*BUILTIN_PLUGIN_WORKBENCH(?:\s*,[^}]+)?\s*\}\s*from\s*["']\.\/plugin-workbench\.js["']/u },
  { check: checkProposalUiOwnershipInTree, file: COMPOSITION, pattern: /function createWorkbenchUiHost\(packs:[^=]+?=\s*BUILTIN_PLUGIN_WORKBENCH\)/u },
  { check: checkProposalUiOwnershipInTree, file: COMPOSITION, pattern: /for\s*\(const pack of packs\)\s*\{\s*for\s*\(const contribution of pack\.contributions\)\s*host\.register\(contribution\)/u },
  { check: checkProposalUiOwnershipInTree, file: REGISTRY, pattern: /import\s*\{\s*BUILTIN_PLUGIN_CATALOG[^}]*\}\s*from\s*["']\.\/builtin-plugins\.js["']/u },
  { check: checkProposalUiOwnershipInTree, file: REGISTRY, pattern: /export const BUILTIN_PLUGIN_WORKBENCH[^=]*=\s*pluginWorkbenchPacks\(\)/u },
  { check: checkProposalUiOwnershipInTree, file: REGISTRY, pattern: /function pluginWorkbenchPacks\(catalog:[^=]+?=\s*BUILTIN_PLUGIN_CATALOG\)/u },
  { check: checkProposalUiOwnershipInTree, file: REGISTRY, pattern: /return catalog\.flatMap\(entry => entry\.workbench \? \[\{ project_plugin_id: entry\.project_plugin_id, \.\.\.entry\.workbench \}\] : \[\]\)/u },
];

test("RAC-2060 the Feed and Integration, Goals route mount and proposal UI checks accept the tree as it is, and what they require is there", () => {
  for (const check of new Set([...MORE_ROWS.map(row => row.check), checkProposalUiOwnershipInTree])) assert.deepEqual(errorsOf(check(repository)), [], check.name);
  for (const row of MORE_ROWS) assert.ok(read(row.file).includes(row.needle), `${row.file} has ${row.needle}`);
  for (const { file, pattern } of PATTERNS) assert.ok(pattern.exec(read(file)), `${file} has ${pattern}`);
});
for (const { check, file, pattern } of PATTERNS) test(`RAC-2064 ${check.name}: what ${pattern.source.slice(0, 50)}… finds in ${path.basename(file)} is required, and the same words in a comment, a string, a regular expression or template text do not stand in`, () => {
  const found = pattern.exec(read(file));
  assert.ok(found, "the file says it as it did");
  const source = without(read(file), found[0]);
  assert.ok(checkWith(check, file, source).length > 0, "taking it out refuses");
  for (const [name, write] of Object.entries(stand)) assert.ok(checkWith(check, file, source + write(found[0])).length > 0, name);
});

test("RAC-2014 an import is the statement, written with double quotes: the same words in a comment, a string or single quotes are not", () => {
  const specifier = "@molis-ai/molis-work-service-runtime-host", real = `import { x } from "${specifier}";\n`;
  assert.ok(hasImportFrom(real, specifier));
  assert.ok(hasImportFrom(`import type { x } from "${specifier}"\n`, specifier));
  assert.ok(hasImportFrom(`export * from "${specifier}";\n`, specifier));
  assert.ok(hasImportFrom(`import {\n  a,\n  b,\n} from "${specifier}";\n`, specifier));
  for (const text of [
    `// import { x } from "${specifier}";\n`,
    `/* import { x } from "${specifier}"; */\n`,
    `const text = 'import { x } from "${specifier}"';\n`,
    `const text = \`import { x } from "${specifier}"\`;\n`,
    `import { x } from '${specifier}';\n`,
    `import { x } from "${specifier}-other";\n`,
    `import "${specifier}";\n`,
    `const x = import("${specifier}");\n`,
    "",
  ]) assert.equal(hasImportFrom(text, specifier), false, text);
});

test("RAC-2015 the pattern for the Goals Manifest's tables is read on the code: a comment that shows it does not stand in", () => {
  const file = "plugins/native/goals/src/manifest.ts", source = read(file);
  const found = /databases:\s*\{\s*project:\s*GOALS_PROJECT_DATABASE\s*(?:,\s*home:\s*GOALS_HOME_DATABASE\s*)?\}/u.exec(source);
  assert.ok(found, "the Manifest declares its tables as it did");
  for (const name of ["a line comment", "a block comment", "a string", "template text"]) {
    assert.ok(checkWith(checkMigratedGoalsCommandOwnership, file, without(source, found[0]) + stand[name](found[0])).length > 0, name);
  }
  const pattern = /databases:\s*\{\s*project:\s*GOALS_PROJECT_DATABASE\s*\}/u;
  assert.equal(matchesInCode("const manifest = { databases: { project: GOALS_PROJECT_DATABASE } };", pattern), true);
  assert.equal(matchesInCode("const manifest = { databases: { project: /* x */ GOALS_PROJECT_DATABASE } };", pattern), false);
  assert.equal(matchesInCode("// databases: { project: GOALS_PROJECT_DATABASE }", pattern), false);
});

test("RAC-2016 code beside a literal still counts, and the code inside a template's ${ … } is code", () => {
  assert.equal(hasInCode('const name = "x"; this.createIntent(name);', "this.createIntent("), true);
  assert.equal(hasInCode("const text = `a ${this.createIntent(1)} b`;", "this.createIntent("), true);
  assert.equal(hasInCode("const text = `a ${\"this.createIntent(\"} b`;", "this.createIntent("), false);
  assert.equal(hasInCode("const text = /this\\.createIntent\\(/u; // this.createIntent(", "this.createIntent("), false);
  assert.equal(hasInText('const text = "artifacts.artifact.hash_mismatch";', "artifacts.artifact.hash_mismatch"), true);
  assert.equal(hasInText("const text = `CREATE TABLE IF NOT EXISTS ${t.identities}`;", "CREATE TABLE IF NOT EXISTS ${t.identities}"), true);
  assert.equal(hasInText("// artifacts.artifact.hash_mismatch\n/* artifacts.artifact.hash_mismatch */", "artifacts.artifact.hash_mismatch"), false);
  assert.equal(hasInText("const text = /artifacts.artifact.hash_mismatch/u;", "artifacts.artifact.hash_mismatch"), false);
});

test("RAC-2017 nothing is accepted that the plain text check refused: every helper needs the text to be in the file as well", () => {
  const files = [...ROWS, ...MORE_ROWS].map(row => read(row.file));
  let seed = 20261029, tried = 0;
  const next = limit => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
  for (let round = 0; round < 600; round += 1) {
    const source = files[next(files.length)], start = next(Math.max(1, source.length - 40)), needle = source.slice(start, start + 3 + next(37));
    for (const has of [hasInCode, hasInText]) {
      if (has(source, needle)) assert.ok(source.includes(needle), needle);
      if (has(source.slice(0, start), needle)) assert.ok(source.slice(0, start).includes(needle), needle);
      tried += 1;
    }
  }
  assert.equal(tried, 1200);
  // Blanking turns a comment into as many spaces as it is long, so a needle of spaces could be "found" where the file has a comment; the plain check on the file still refuses it.
  assert.equal(hasInCode("x/**/y", "x    y"), false);
  assert.equal(hasInText("x/**/y", "x    y"), false);
  assert.equal(matchesInCode("x/**/y", /x {4}y/u), false);
});

test("RAC-2065 a registration file's comment or string does not list a contribution, and a host.register line in a comment does not register one", () => {
  const composition = read(COMPOSITION), registry = read(REGISTRY), descriptors = builtinCatalogText(repository);
  const listed = "contributions: [feedUiContribution]", registration = "plugins/native/feed/src/registration.ts";
  assert.ok(read(registration).includes(listed));
  const files = readdirSync(path.join(repository, "plugins/native")).map(directory => `plugins/native/${directory}/package.json`);
  const readFile = file => { try { return read(file); } catch { return null; } };
  const catalogWith = edit => catalogText({ files, read: file => (file === registration ? edit(readFile(file)) : readFile(file)) });
  assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", catalogWith(text => text)), true);
  for (const [name, replacement] of Object.entries({
    "a line comment": `// ${listed}\n  contributions: []`,
    "a block comment": `/* ${listed} */ contributions: []`,
    "a string": `note: ${quoted(listed)}, contributions: []`,
    "template text": `note: \`${listed}\`, contributions: []`,
  })) {
    const edited = catalogWith(text => text.replace(listed, replacement));
    assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", edited), false, name);
  }
  const register = "host.register(feedUiContribution)";
  for (const [name, text] of Object.entries({
    "a line comment": `// ${register}\n`, "a block comment": `/* ${register} */`, "a string": `const text = ${quoted(register)};`, "template text": `const text = \`${register}\`;`,
  })) {
    assert.equal(hasWorkbenchUiContribution(text, "", "feedUiContribution", ""), false, name);
    assert.equal(hasWorkbenchUiContribution(`${register};\n${text}`, "", "feedUiContribution", ""), true, `${name} beside the real call`);
  }
  // The import's path is a string, and the statement must start in code.
  const imported = "import { BUILTIN_PLUGIN_CATALOG } from \"./builtin-plugins.js\"";
  assert.ok(registry.includes(imported));
  for (const wrap of [text => `// ${text}`, text => `/* ${text} */`, text => `const standIn = ${quoted(text)};`, text => `const standIn = \`${text}\`;`]) {
    assert.equal(hasWorkbenchUiContribution(composition, wrap(imported) + "\n" + registry.replace(imported, ""), "feedUiContribution", descriptors), false);
  }
});

test("RAC-2066 a registration that must not be there is still found in a comment: the retired contribution and a Legacy host.register line stay refused", () => {
  const composition = read(COMPOSITION), registry = read(REGISTRY), descriptors = builtinCatalogText(repository);
  const retired = "goalsLegacyProposalUiContribution", clientDispatch = "handleGoalProposalSubmit(submittedForm, event)";
  const ok = (workbench, listing) => checkProposalUiOwnership(read(RENDERER), workbench, read(GOALS_FACTORIES), read(GOALS_SURFACES), clientDispatch, registry, listing);
  assert.deepEqual(ok(composition, descriptors), []);
  const inComment = descriptors.replace("contributions: [feedUiContribution]", "/* contributions: [feedUiContribution, goalsLegacyProposalUiContribution] */ contributions: [feedUiContribution]");
  assert.match(ok(composition, inComment).join("\n"), /retired/);
  assert.match(ok(`${composition}\n// host.register(${retired})\n`, descriptors).join("\n"), /retired/);
  assert.equal(mentionsWorkbenchUiContribution(composition, registry, "feedUiContribution", descriptors), true);
  assert.equal(mentionsWorkbenchUiContribution("// host.register(x)", "", "x"), true);
  assert.equal(hasWorkbenchUiContribution("// host.register(x)", "", "x"), false);
});

test("RAC-2067 a statement pattern must start in code: a comment, a string, a regular expression or template text that holds it does not", () => {
  const pattern = /import\s*\{\s*X\s*\}\s*from\s*["']\.\/x\.js["']/u, statement = 'import { X } from "./x.js"';
  assert.equal(matchesStatementInCode(`${statement};`, pattern), true);
  assert.equal(matchesStatementInCode(`const y = 1; /* c */ ${statement};`, pattern), true);
  assert.equal(matchesStatementInCode(`import {\n  X,\n} from "./other.js";`, /import\s*\{\s*X\s*\}/u), false, "the pattern is the old test as well");
  for (const text of [`// ${statement}`, `/* ${statement} */`, `const t = '${statement}';`, `const t = \`${statement}\`;`, `const t = /${regexSource(statement)}/;`, `import { X } from /* c */ "./x.js";`, ""]) {
    assert.equal(matchesStatementInCode(text, pattern), false, text);
  }
  assert.equal(matchesStatementInCode(`${statement}; ${statement};`, new RegExp(pattern.source, "gu")), true, "a global pattern is read the same way");
});

// One deliberate widening: a contributions list is read after comments are removed, so an entry with a comment beside it now counts
// where the plain reading refused it. Everywhere else, nothing the plain reading refused is accepted by the strict one.
test("RAC-2068 except that one deliberate widening (a contributions list is read without comments, so a commented entry now counts), nothing is accepted that the plain check refused: a registration found by the strict reading is found by the plain one", () => {
  const composition = read(COMPOSITION), registry = read(REGISTRY), descriptors = builtinCatalogText(repository);
  let seed = 20261029, strictAccepts = 0;
  const next = limit => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % limit; };
  const cut = text => { const start = next(Math.max(1, text.length - 30)); return text.slice(0, start) + text.slice(start + 1 + next(29)); };
  for (let round = 0; round < 300; round += 1) {
    const mutated = [composition, registry, descriptors].map((text, index) => (next(3) === index || next(4) === 0 ? cut(text) : text));
    for (const name of ["feedUiContribution", "goalsProposalUiContribution", "goalsLegacyProposalUiContribution"]) {
      if (hasWorkbenchUiContribution(...[mutated[0], mutated[1]], name, mutated[2])) {
        strictAccepts += 1;
        assert.equal(mentionsWorkbenchUiContribution(mutated[0], mutated[1], name, mutated[2]), true, name);
      }
    }
  }
  assert.ok(strictAccepts > 0, "the strict reading still accepts some of the cut sources");
});

test("RAC-2296 a contributions list is read after comments are removed, on purpose: a commented entry now counts, while a name only in a comment counts nowhere", () => {
  const composition = read(COMPOSITION), registry = read(REGISTRY), descriptors = builtinCatalogText(repository);
  const list = /contributions:\s*\[([^\]]*feedUiContribution[^\]]*)\]/u.exec(descriptors);
  assert.ok(list, "the built-in plugin catalog still has a contributions list holding feedUiContribution");
  const widened = [
    "feedUiContribution // note\n  ",
    "/* note */ feedUiContribution",
    "feedUiContribution /* note */",
  ];
  for (const form of widened) {
    const mutated = descriptors.replace(list[1], `\n    ${form}\n  `);
    assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", mutated), true, `a commented entry counts: ${form.trim()}`);
    assert.equal(mentionsWorkbenchUiContribution(composition, registry, "feedUiContribution", mutated), false, `the plain reading still refuses it: ${form.trim()}`);
  }
  const onlyComment = descriptors.replace(list[1], "\n    /* feedUiContribution */\n  ");
  assert.equal(hasWorkbenchUiContribution(composition, registry, "feedUiContribution", onlyComment), false, "a name only in a comment is no registration");
  assert.equal(mentionsWorkbenchUiContribution(composition, registry, "feedUiContribution", onlyComment), false, "and the plain reading does not count it either");
});
