// Pre-development v1 guard: every first-party persistent store, format, action, manifest, and artifact version stays at 1,
// with zero concrete upgrade steps (`upgrades: []` / empty `*_UPGRADES`).
// Two halves:
//   - `versionOriginProblems` needs no build and runs as an absolute rule of `pnpm health:check`: checks every first-party
//     `const …VERSION`, every inline `/* @version */` literal (outside content versions `prompt.*`/`method.*`/`role.*`), every
//     non-content numeric entry in `tooling/versions.json`, empty `upgrades` declarations, and `contentVersionChanges`.
//   - `checkRepository` also checks the running Host's registered manifests, actions, prompts, roles and methods
//     (`--content-current` compares registered content versions with `tooling/versions.json`; without it, content must also be 1).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CODE_FILE, isMainScript } from "../script-paths.mjs";
import { isTestFile, isUnderSourceRoots, markerAtEnd, REPOSITORY, SOURCE_ROOTS, versionSource } from "../version-source.mjs";
import { contentVersionChanges } from "./content-versions.mjs";
import { collectHost, loadManifests, withIsolatedHome } from "./action-contract-host.mjs";

// The one first-party constant that is not held at 1. Its marker is what ties the literal to the table (scripts/generate-versions.mjs);
// the same marker on any other constant, or on something that is no version string, lets nothing through.
const PRODUCT_CONSTANT = "apps/local-host/src/product-version.ts#PRODUCT_VERSION";
const BASELINE_TYPES = new Set([
  "SqliteBaseline",
  "PluginDatabaseDeclaration",
  "HomePluginDatabaseDeclaration",
  "PartitionPluginDatabaseDeclaration",
  "VersionedFile",
]);
const UPGRADES_CONSTANT = /^(?:[A-Z_\d]+_)?UPGRADES$/u;
const CONTENT_ENTRY = /^(?:prompt|method|role)\./u;

const unwrapExpression = (node) => {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
  return node;
};

const namesBaselineType = (type, tree) => {
  if (!type || !ts.isTypeReferenceNode(type)) return false;
  const name = ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.getText(tree);
  return BASELINE_TYPES.has(name);
};

const isEmptyArrayLiteral = (node) => Boolean(node && ts.isArrayLiteralExpression(node) && node.elements.length === 0);

const propertyNamed = (object, name) => object.properties.find((property) =>
  ts.isPropertyAssignment(property)
  && (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name))
  && property.name.text === name);

/** The object literal of a `const` declared as a baseline / VersionedFile / PluginDatabaseDeclaration, or null. */
function baselineObjectLiteral(declaration, tree) {
  if (!(declaration.parent.flags & ts.NodeFlags.Const)) return null;
  let typed = namesBaselineType(declaration.type, tree), value = declaration.initializer;
  while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) {
    if (!ts.isParenthesizedExpression(value) && namesBaselineType(value.type, tree)) typed = true;
    value = value.expression;
  }
  return typed && value && ts.isObjectLiteralExpression(value) ? value : null;
}

export function contentVersionKey(kind, id, owner, versions) {
  const suffix = owner.split(".").at(-1);
  const names = kind === "prompt" && id.startsWith("builder-")
    ? ["plugin-builder." + (id === "builder-review" ? "ui-review" : id.slice("builder-".length))]
    : kind === "role" ? [suffix + "." + id, suffix + ".main-" + id, id] : [id];
  return names.map(name => kind + "." + name).find(key => Object.hasOwn(versions, key));
}

export function initialVersionProblems({ manifests, hostViews, registrations, versionEntries = {}, currentContent = false }) {
  const problems = new Set();
  const check = (owner, kind, id, version) => {
    if (version !== 1) problems.add(`${owner}: ${kind} ${id} = ${String(version)} (expected 1)`);
  };
  const content = (owner, kind, id, version) => {
    if (!currentContent) { check(owner, kind, id, version); return; }
    const key = contentVersionKey(kind === "child role" ? "role" : kind, id, owner, versionEntries);
    if (!key) problems.add(`${owner}: ${kind} ${id} has no entry in tooling/versions.json`);
    else if (versionEntries[key] !== version) problems.add(`${owner}: ${kind} ${id} = ${String(version)} (tooling/versions.json ${key} = ${String(versionEntries[key])})`);
  };
  const agent = (owner, declaration) => {
    for (const prompt of declaration.prompts) content(owner, "prompt", prompt.prompt_id, prompt.version);
    for (const role of declaration.roles) content(owner, "role", role.role_id, role.version);
    for (const role of declaration.subagents?.roles ?? []) content(owner, "child role", role.role_id, role.version);
  };
  for (const manifest of manifests) {
    const owner = manifest.plugin_id;
    check(owner, "Manifest", "schema_version", manifest.schema_version);
    check(owner, "Manifest", "host_api_version", manifest.host_api_version);
    for (const action of manifest.actions ?? []) check(owner, "action", action.capability_id, action.version);
    if (manifest.agent) agent(owner, manifest.agent);
    for (const method of manifest.methods ?? []) content(owner, "method", method.skill_id, method.version);
  }
  for (const view of hostViews) check(view.provider.plugin_id ?? view.provider.provider_id, "action", view.capability_id, view.version);
  for (const owner of registrations) agent(owner.owner_id, owner);
  // Every non-content numeric entry in tooling/versions.json must stay at 1 during pre-development.
  for (const [key, version] of Object.entries(versionEntries)) {
    const kind = /^(prompt|method)\./.exec(key)?.[1];
    if (kind) {
      if (!currentContent) check("tooling/versions.json", kind, key, version);
      else if (!Number.isSafeInteger(version) || version < 1) problems.add(`tooling/versions.json: ${key} must be a positive integer`);
    } else if (/^role\./.test(key)) {
      if (currentContent && (!Number.isSafeInteger(version) || version < 1)) problems.add(`tooling/versions.json: ${key} must be a positive integer`);
    } else if (typeof version === "number" || (typeof version === "string" && /^\d+$/u.test(version))) {
      if (Number(version) !== 1) problems.add(`tooling/versions.json: ${key} = ${String(version)} (expected 1)`);
    }
  }
  return [...problems].sort();
}

// Versions chosen by an upstream provider or the bundled SQLite binary are listed with their reason in one place; a pattern (a RegExp
// named VERSION) is not a version at all.
const exceptionNames = (text) => new Set(JSON.parse(text).filter(entry => entry.file && entry.name).map(entry => `${entry.file}#${entry.name}`));
let thisRepository;
const repositoryExceptions = () => (thisRepository ??= exceptionNames(readFileSync(new URL("../../tooling/gates/version-exceptions.json", import.meta.url), "utf8")));

/** A literal behind a `/* @version *\/` marker, when it is a whole number: the form a version can be compared in. */
const markedNumber = (node) => ts.isNumericLiteral(node) || (ts.isStringLiteralLike(node) && /^\d+$/u.test(node.text)) ? Number(node.text) : undefined;

export function sourceVersionProblems(file, source, exceptions = repositoryExceptions()) {
  if (!/\b[A-Z_\d]*(?:VERSION|UPGRADES)\b|@version|\bupgrades\b/u.test(source)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const problems = [], named = new Set(), checkedUpgrades = new Set(), constants = new Map();
  const collectConstants = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const constant = Boolean(node.parent && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0);
      constants.set(node.name.text, constants.has(node.name.text) || !constant ? null : unwrapExpression(node.initializer) ?? null);
    }
    ts.forEachChild(node, collectConstants);
  };
  collectConstants(tree);

  const visit = (node) => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const)) {
      for (const declaration of node.declarations) {
        const name = declaration.name.getText(tree);
        const value = unwrapExpression(declaration.initializer);
        if (/^[A-Z_\d]*VERSION$/u.test(name)) {
          // A version written as a named constant is judged once, here (or not at all, when an exception names it); the marker pass below
          // skips the same literal, so one literal never produces two problems.
          if (value) named.add(value.getStart(tree));
          if (exceptions.has(`${file}#${name}`)) continue;
          if (value && ts.isRegularExpressionLiteral(value)) continue;
          if (value && `${file}#${name}` === PRODUCT_CONSTANT && ts.isStringLiteralLike(value) && markerAtEnd(source.slice(value.pos, value.getStart(tree))) === "product.release") continue;
          if (value && ts.isNumericLiteral(value) && Number(value.text) === 1) continue;
          if (value && ts.isStringLiteralLike(value) && /^(?:[a-z][a-z0-9._-]*\/)?1$/.test(value.text)) continue;
          problems.push(`${file}: ${name} = ${value?.getText(tree) ?? "(missing)"} (expected 1)`);
          continue;
        }
        if (UPGRADES_CONSTANT.test(name) && !isEmptyArrayLiteral(value)) {
          problems.push(`${file}: ${name} must be empty during pre-development (expected [])`);
        }
        const baseline = baselineObjectLiteral(declaration, tree);
        const upgradesProperty = baseline && propertyNamed(baseline, "upgrades");
        if (upgradesProperty) {
          checkedUpgrades.add(upgradesProperty.getStart(tree));
          const upgradesValue = unwrapExpression(upgradesProperty.initializer);
          if (isEmptyArrayLiteral(upgradesValue)) continue;
          if (upgradesValue && ts.isIdentifier(upgradesValue)) {
            if (UPGRADES_CONSTANT.test(upgradesValue.text)) continue;
            if (isEmptyArrayLiteral(constants.get(upgradesValue.text))) continue;
          }
          problems.push(`${file}: ${name}.upgrades must be empty during pre-development (expected [])`);
        }
      }
    }
    if (ts.isPropertyAssignment(node) && !checkedUpgrades.has(node.getStart(tree))
      && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && node.name.text === "upgrades") {
      const upgradesValue = unwrapExpression(node.initializer);
      if (upgradesValue && ts.isArrayLiteralExpression(upgradesValue) && upgradesValue.elements.length > 0) {
        problems.push(`${file}: upgrades must be empty during pre-development (expected [])`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  // Every other literal a marker names: an inline value (a property, a return, a type) whose version no constant declaration would show.
  // The same marker grammar `pnpm versions:generate` rewrites, so a value it can write is a value this reads.
  const marked = (node) => {
    if (named.has(node.getStart(tree))) return;
    const entry = markerAtEnd(source.slice(node.pos, node.getStart(tree)));
    if (entry === undefined) return;
    const value = markedNumber(node);
    if (value === undefined) return;
    // Prompts, methods and roles are content versions: their text follows `tooling/versions.json` (the content check reads that table).
    if (CONTENT_ENTRY.test(entry)) return;
    if (value !== 1) problems.push(`${file}: /* @version ${entry} */ = ${value} (expected 1)`);
  };
  const visitMarkers = (node) => {
    if (ts.isNumericLiteral(node) || ts.isStringLiteralLike(node)) marked(node);
    ts.forEachChild(node, visitMarkers);
  };
  visitMarkers(tree);
  return problems;
}

// A test file is skipped only where both boundaries skip it: the shared one (scripts/version-source.mjs) and this gate's own before it,
// a `tests/` or `fixtures/` directory at any depth. Either alone would leave out files the other checks (VG-29, VG-39).
const OWN_TEST_DIRECTORY = /(?:^|\/)(?:tests|fixtures)\//;
export const isCheckedSource = (file) => isUnderSourceRoots(file) && CODE_FILE.test(file) && !(isTestFile(file) && OWN_TEST_DIRECTORY.test(file));

/**
 * The half with no build, over a snapshot (`files`, `read`): every first-party version constant, inline `@version` literal,
 * non-content numeric entry of `tooling/versions.json`, and `upgrades` declaration stays at v1 / empty.
 * A repository with neither table is not this one (the gates' scratch repositories); losing a table this one had, or one that cannot be
 * read, is a problem and not a pass.
 */
export function versionOriginProblems({ files, read }, { readBase } = {}) {
  const problems = [];
  const table = (file, parse, empty) => {
    const text = read(file);
    if (text === null || text === undefined) {
      if (readBase?.(file)) problems.push(`${file} is gone, so the versions it holds cannot be checked`);
      return empty;
    }
    try { return parse(text); } catch (error) { problems.push(`${file} cannot be read: ${error.message}`); return empty; }
  };
  const listed = table("tooling/versions.json", text => JSON.parse(text).versions ?? {}, {});
  const versionEntries = Object.fromEntries(Object.entries(listed).filter(([key]) => !CONTENT_ENTRY.test(key)));
  const exceptions = table("tooling/gates/version-exceptions.json", exceptionNames, new Set());
  problems.push(...initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries }));
  for (const file of files.filter(isCheckedSource)) problems.push(...sourceVersionProblems(file, read(file) ?? "", exceptions));
  try { problems.push(...contentVersionChanges({ files, read }, readBase)); }
  catch (error) { problems.push("Cannot compare the content version table: " + error.message); }
  return problems;
}

// What a running Host registers, from this repository's build, on a throwaway Home.
const builtDeclarations = () => withIsolatedHome(async home => {
  const { builtinRegistrations } = await import("../../apps/local-host/dist/agent-definitions/builtin-agents.js");
  const { manifests } = await loadManifests();
  const { hostViews } = await collectHost(home);
  return { manifests, hostViews, registrations: builtinRegistrations() };
});

/** Both halves over the repository at `root`: its tracked source and its two tables, and the `declarations` of a running Host. */
export async function checkRepository(root = REPOSITORY, declarations = builtDeclarations, currentContent = false) {
  const files = execFileSync("git", ["ls-files", "-z", "--", ...SOURCE_ROOTS], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean);
  const versionEntries = versionSource(root).versions;
  const exceptions = exceptionNames(readFileSync(path.join(root, "tooling/gates/version-exceptions.json"), "utf8"));
  const problems = initialVersionProblems({ ...await declarations(), versionEntries, currentContent });
  for (const file of files.filter(isCheckedSource)) problems.push(...sourceVersionProblems(file, readFileSync(path.join(root, file), "utf8"), exceptions));
  return problems;
}

// --root checks another repository's source and tables, with this repository's build as the Host (tests/initial-versions-check.test.ts).
if (isMainScript(import.meta.url)) {
  const args = process.argv.slice(2), rootAt = args.indexOf("--root"), currentContent = args.includes("--content-current");
  const problems = await checkRepository(rootAt >= 0 ? path.resolve(args[rootAt + 1]) : REPOSITORY, builtDeclarations, currentContent);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else if (currentContent) console.log("The registered content versions match tooling/versions.json; all persistent stores, formats, actions, manifests and artifacts stay at v1 with zero upgrade steps.");
  else console.log("All registered actions, manifests, prompts, instructions, roles, methods, stores, formats and first-party version constants stay at v1 with zero upgrade steps.");
}
