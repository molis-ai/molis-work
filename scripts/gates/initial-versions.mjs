// N41: inspect the live first-party declarations used by this build. The unified origin is not a date inferred from this check.
// Two halves. The source versions and the entries of the persistent formats need no build and are an absolute rule of `pnpm health:check`
// (versionOriginProblems, user 2026-11-07). A source version is either a `const …VERSION` declaration or any literal a `/* @version */`
// marker names (property, return, type), so the same rule reaches the values `pnpm versions:generate` writes but no constant declares.
// The registered actions, Manifests, prompts and roles, and the prompt and method entries, only
// this script checks, and only when someone runs it: the rebuild window does (docs/releases/CHECKLIST.md §4.1). A prompt or method goes up
// when its text changes (tests/prompt-registration.test.ts), so those stay out of the rule. tooling/gates/README.md has the rules.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { CODE_FILE, isMainScript } from "../script-paths.mjs";
import { isTestFile, isUnderSourceRoots, markerAtEnd, REPOSITORY, SOURCE_ROOTS, versionSource } from "../version-source.mjs";
import { constantsIn, stepFroms, unwrapExpression, upgradesNameFor } from "./upgrade-steps.mjs";
import { goldenManifests } from "../golden/formats.mjs";
import { collectHost, loadManifests, withIsolatedHome } from "./action-contract-host.mjs";

// Persistent formats (specs/upgrade-continuity/upgrade-chain-design.md §11.1, CONTRACT-CHANGES.md §3): after the unified origin these
// go up through the upgrade chain instead of staying at 1. Above 1 each needs a registered chain with consecutive steps and a replay
// that passed. Everything else (actions, Manifests, prompts, roles, methods, any other first-party constant) stays at 1.
// A constant is `file#NAME`, because the same name elsewhere (CATALOG_VERSION in the plugin builder) is not a persistent format; each one
// names its tooling/versions.json entry, which is how a golden Home records the format (scripts/golden/formats.mjs).
// Not on the list, so above 1 they fail with or without a chain: a fixed version (CODING_PLAN, FEED_CAPTURE and the *_ARTIFACT_SCHEMA_VERSION
// of Dataset, Form, Pages, PPT) must not change after it is written, by contract and by its content_digest, not by anything in the
// database, so a step should not rewrite it; GMAIL_LIVE_CURSOR is sync progress a full sync rebuilds, so it needs no step.
const PERSISTENT_CONSTANTS = new Map([
  ["apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION", "database.home.catalog"],
  ["packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION", "format.secret-store.map"],
  ["apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION", "format.mcp.tool-preference"],
  ["modules/shelf/src/catalog-shape.ts#CATALOG_VERSION", "format.shelf.catalog"],
  ["apps/local-host/src/installer/home-contract.ts#SCHEMA_VERSION", "format.home.installation"],
  ["packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION", "database.search.text-index"],
  // The six files §2.6 of the design puts in the chain and §11.1 did not name (the user agreed to them on 2026-11-07). The last is jelly/preferences.json.
  ["apps/local-host/src/onboarding.ts#ONBOARDING_SCHEMA_VERSION", "format.home.onboarding"],
  ["apps/local-host/src/project-arrival.ts#PROJECT_ARRIVAL_SCHEMA_VERSION", "format.project.arrival"],
  ["apps/local-host/src/browser/browser-surfaces.ts#BROWSER_SITES_VERSION", "format.browser.site-decisions"],
  ["apps/local-host/src/computer/computer-settings.ts#COMPUTER_SETTINGS_VERSION", "format.computer.settings"],
  ["apps/local-host/src/computer/computer-records.ts#COMPUTER_RECORD_VERSION", "format.computer.record"],
  ["apps/local-host/src/model-configuration.ts#MODEL_PREFERENCE_SCHEMA_VERSION", "format.model.preference"],
  // The last-used language (batch 14 T10, #1976): a small versioned file in the chain since the 2026-11-11 review found it had none.
  ["apps/local-host/src/ui-locale-memory.ts#SCHEMA_VERSION", "format.ui.last-locale"],
]);
// The persistent formats that are no `*VERSION` constant reach this check through their tooling/versions.json entry. The code calls
// two stores a ledger (账本) and the design's §2.5 names both, so both are here; a chain is what any library needs to go above 1 anyway.
// format.jelly.workspace is the JSON in jelly_workspace.body, a row, not jelly/preferences.json: it is here because that row changes and
// nothing rebuilds it. A step cannot rewrite it today: the row carries a sha256 checksum checked on read, a built-in plugin's steps are only
// SQL, and SQLite cannot compute a sha256. The first raise decides how.
const PERSISTENT_ENTRIES = new Map([
  ["database.ledger_baseline", "apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE"],
  ["database.memory_ledger_baseline", "packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE"],
  ["format.jelly.workspace", "plugins/native/jelly/src/contract.ts#schema_version"],
]);
export const PERSISTENT_DEFINITIONS = Object.freeze([...PERSISTENT_CONSTANTS.keys(), ...PERSISTENT_ENTRIES.values()]);
export const PERSISTENT_ENTRY_KEYS = Object.freeze(Object.fromEntries(PERSISTENT_ENTRIES));
// The one first-party constant that is not held at 1. Its marker is what ties the literal to the table (scripts/generate-versions.mjs);
// the same marker on any other constant, or on something that is no version string, lets nothing through.
const PRODUCT_CONSTANT = "apps/local-host/src/product-version.ts#PRODUCT_VERSION";

/** Each persistent format's tooling/versions.json entry, by its definition: what a golden records it under. */
export const PERSISTENT_FORMAT_ENTRIES = Object.freeze(Object.fromEntries([...PERSISTENT_CONSTANTS, ...[...PERSISTENT_ENTRIES].map(([entry, definition]) => [definition, entry])]));

/** The other direction: a marker's entry name, back to the definition whose chain and old goldens it has to have. */
export const PERSISTENT_DEFINITION_BY_ENTRY = Object.freeze(Object.fromEntries(Object.entries(PERSISTENT_FORMAT_ENTRIES).map(([definition, entry]) => [entry, definition])));

/** Whether `froms` are the steps a chain to `version` needs: 1 to version - 1, each once. Empty when they are. */
export function upgradeStepProblems(version, froms) {
  const problems = [];
  for (let from = 1; from < version; from += 1) {
    const found = froms.filter(item => item === from).length;
    if (found !== 1) problems.push(found === 0 ? `no step from ${from}` : `${found} steps from ${from}`);
  }
  for (const from of new Set(froms)) if (!Number.isInteger(from) || from < 1 || from >= version) problems.push(`a step from ${String(from)}, outside 1 to ${version - 1}`);
  return problems;
}

/**
 * A persistent format at `version`. `chains` maps its definition to what the upgrade chain registers and what its replay found:
 * `{ version, froms: number[], replay_passed: boolean, unheld?: number[] }`. A missing chain, a gap, or anything but a passed replay fails;
 * `unheld` are the older versions no golden Home holds, which is why the replay cannot have passed.
 */
function persistentVersionProblems(definition, version, chains) {
  const at = `${definition} = ${String(version)}`;
  if (!Number.isInteger(version) || version < 2) return [`${at} (expected 1)`];
  const chain = chains.get(definition);
  if (chain === undefined) return [`${at} (expected 1; above 1 it needs a registered upgrade chain and a replay that passed)`];
  const problems = chain.version === version ? upgradeStepProblems(version, chain.froms).map(problem => `${at}: the registered upgrade chain has ${problem}`)
    : [`${at}: the registered upgrade chain goes to ${String(chain.version)}`];
  if (chain.replay_passed !== true) problems.push(Array.isArray(chain.unheld) && chain.unheld.length
    ? `${at}: the replay of its upgrade chain did not pass: no golden Home under tests/fixtures/golden-homes/ holds it at ${chain.unheld.join(", ")}, so the golden replay has nothing to bring up from there. Generate a golden on the code before the change (specs/upgrade-continuity/golden-replay-design.md §3)`
    : `${at}: the replay of its upgrade chain did not pass`);
  return problems;
}

/**
 * The chain one definition registers, read from its own file, with no build: `X_VERSION` (or `X_SCHEMA_VERSION`, or `SCHEMA_VERSION`) has its
 * steps in the array `X_UPGRADES` (`UPGRADES`) beside it, and a baseline object has them in its `upgrades`, in place or by that array's name.
 * Whatever this cannot read exactly is no chain, so it fails closed.
 */
function chainInSource(file, source, name) {
  const constants = constantsIn(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  const value = constants.get(name);
  if (!value) return undefined;
  if (ts.isNumericLiteral(value)) {
    const steps = upgradesNameFor(name);
    const list = constants.get(steps), froms = list && ts.isArrayLiteralExpression(list) ? stepFroms(list, constants) : undefined;
    return froms && { version: Number(value.text), froms };
  }
  if (!ts.isObjectLiteralExpression(value)) return undefined;
  const property = (key) => value.properties.find(item => ts.isPropertyAssignment(item) && ts.isIdentifier(item.name) && item.name.text === key)?.initializer;
  const version = unwrapExpression(property("version"));
  if (!version || !ts.isNumericLiteral(version)) return undefined;
  const upgrades = property("upgrades");
  const froms = upgrades ? stepFroms(upgrades, constants) : [];
  return froms && { version: Number(version.text), froms };
}

/** Each persistent format's entry and the versions the goldens under tests/fixtures/golden-homes/ hold it at (their manifests' `formats`). */
export function goldenFormatVersions(tree) {
  const held = new Map();
  for (const { manifest } of goldenManifests(tree)) {
    for (const item of Array.isArray(manifest?.formats) ? manifest.formats : []) {
      if (typeof item?.entry !== "string" || !Number.isInteger(item.version)) continue;
      if (!held.has(item.entry)) held.set(item.entry, new Set());
      held.get(item.entry).add(item.version);
    }
  }
  return held;
}

/**
 * The register `persistentVersionProblems` checks: each persistent format whose definition declares a chain (read with no build), and
 * whether its replay passed. The replay itself is the `golden-replay` job, which `Verify` requires, so nothing merges past a failed one;
 * what this half can know is whether there is anything to replay: `replay_passed` is true only when the goldens hold the format at every
 * version from 1 to the chain's version - 1 (U2-d). `tree` is `{ files, read }`; with no `files` there are no goldens, so nothing above 1 passes.
 *
 * This asks more than UPG-01 does of a library (scripts/gates/store-schemas.mjs), which wants a golden only at the version before the change,
 * and the two differ on purpose. UPG-01 compares with the merge-base, so it knows which version a change starts from, and each earlier raise
 * was checked the same way when it merged. This check reads one tree and no merge-base: it sees a format's current version but not where
 * this change took it from, so the only reading that cannot miss a version (a raise of two at once, a golden later removed) is every one.
 * A golden whose data is moved out of the repository (design §5, §6) keeps its manifest.json under tests/fixtures/golden-homes/, so both
 * checks still see the versions it holds.
 */
export function registeredUpgradeChains({ files = [], read }) {
  const chains = new Map(), held = goldenFormatVersions({ files, read });
  for (const definition of PERSISTENT_DEFINITIONS) {
    const [file, name] = definition.split("#");
    const source = read(file);
    const chain = source && chainInSource(file, source, name);
    if (!chain) continue;
    const versions = held.get(PERSISTENT_FORMAT_ENTRIES[definition]) ?? new Set(), unheld = [];
    for (let older = 1; older < chain.version; older += 1) if (!versions.has(older)) unheld.push(older);
    chains.set(definition, { ...chain, replay_passed: chain.version > 1 && unheld.length === 0, unheld });
  }
  return chains;
}

export function initialVersionProblems({ manifests, hostViews, registrations, versionEntries = {}, chains = new Map() }) {
  const problems = new Set();
  const check = (owner, kind, id, version) => {
    if (version !== 1) problems.add(`${owner}: ${kind} ${id} = ${String(version)} (expected 1)`);
  };
  const agent = (owner, declaration) => {
    for (const prompt of declaration.prompts) check(owner, "prompt", prompt.prompt_id, prompt.version);
    for (const role of declaration.roles) check(owner, "role", role.role_id, role.version);
    for (const role of declaration.subagents?.roles ?? []) check(owner, "child role", role.role_id, role.version);
  };
  for (const manifest of manifests) {
    const owner = manifest.plugin_id;
    check(owner, "Manifest", "schema_version", manifest.schema_version);
    check(owner, "Manifest", "host_api_version", manifest.host_api_version);
    for (const action of manifest.actions ?? []) check(owner, "action", action.capability_id, action.version);
    if (manifest.agent) agent(owner, manifest.agent);
    for (const method of manifest.methods ?? []) check(owner, "method", method.skill_id, method.version);
  }
  for (const view of hostViews) check(view.provider.plugin_id ?? view.provider.provider_id, "action", view.capability_id, view.version);
  for (const owner of registrations) agent(owner.owner_id, owner);
  // Instructions a running plugin carries and the Markdown methods reach the register only while a Home runs; their source entries say the same.
  for (const [key, version] of Object.entries(versionEntries)) {
    const kind = /^(prompt|method)\./.exec(key)?.[1];
    if (kind) check("tooling/versions.json", kind, key, version);
    if (PERSISTENT_ENTRIES.has(key) && version !== 1) for (const problem of persistentVersionProblems(PERSISTENT_ENTRIES.get(key), version, chains)) problems.add(problem);
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

/**
 * Whether an entry that is not a registered persistent format may be above 1 here. It may not: everything else stays at the unified origin,
 * including the `action.*` and `format.*` values no source constant names. The one exception is a library (`database.*` baselines and a
 * plugin's project tables): those are the version of a store, and `scripts/gates/store-schemas.mjs` with the golden replay is what lets one go
 * up (UPG-01), so this half skips them rather than reading them twice with a weaker rule.
 */
const libraryEntry = (entry) => entry.startsWith("database.") && !PERSISTENT_DEFINITION_BY_ENTRY[entry];

export function sourceVersionProblems(file, source, chains = new Map(), exceptions = repositoryExceptions()) {
  if (!/\b[A-Z_\d]*VERSION\b|@version/u.test(source)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const problems = [], named = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const)) {
      for (const declaration of node.declarations) {
        const name = declaration.name.getText(tree);
        if (!/^[A-Z_\d]*VERSION$/u.test(name)) continue;
        let value = declaration.initializer;
        while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
        // A version written as a named constant is judged once, here (or not at all, when an exception names it); the marker pass below
        // skips the same literal, so one literal never produces two problems.
        if (value) named.add(value.getStart(tree));
        if (exceptions.has(`${file}#${name}`)) continue;
        if (value && ts.isRegularExpressionLiteral(value)) continue;
        if (value && `${file}#${name}` === PRODUCT_CONSTANT && ts.isStringLiteralLike(value) && markerAtEnd(source.slice(value.pos, value.getStart(tree))) === "product.release") continue;
        if (value && ts.isNumericLiteral(value) && Number(value.text) === 1) continue;
        if (value && ts.isStringLiteralLike(value) && /^(?:[a-z][a-z0-9._-]*\/)?1$/.test(value.text)) continue;
        const stored = value && (ts.isNumericLiteral(value) || (ts.isStringLiteralLike(value) && /^\d+$/.test(value.text))) ? Number(value.text) : null;
        if (PERSISTENT_CONSTANTS.has(`${file}#${name}`) && Number.isInteger(stored) && stored > 1) problems.push(...persistentVersionProblems(`${file}#${name}`, stored, chains));
        else problems.push(`${file}: ${name} = ${value?.getText(tree) ?? "(missing)"} (expected 1)`);
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
    const definition = PERSISTENT_DEFINITION_BY_ENTRY[entry];
    if (definition !== undefined) {
      if (value !== 1) problems.push(...persistentVersionProblems(definition, value, chains));
    } else if (libraryEntry(entry)) return;
    else if (value !== 1) problems.push(`${file}: /* @version ${entry} */ = ${value} (expected 1; only a registered persistent format may be above the unified origin)`);
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
 * The half with no build, over a snapshot (`files`, `read`): the version constants in source and the persistent formats of tooling/versions.json.
 * A repository with neither table is not this one (the gates' scratch repositories); losing a table this one had, or one that cannot be
 * read, is a problem and not a pass. `chains` is `registeredUpgradeChains`, given here and in checkRepository() below.
 */
export function versionOriginProblems({ files, read }, { readBase, chains = new Map() } = {}) {
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
  const versionEntries = Object.fromEntries(Object.entries(listed).filter(([key]) => PERSISTENT_ENTRIES.has(key)));
  const exceptions = table("tooling/gates/version-exceptions.json", exceptionNames, new Set());
  problems.push(...initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries, chains }));
  for (const file of files.filter(isCheckedSource)) problems.push(...sourceVersionProblems(file, read(file) ?? "", chains, exceptions));
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
export async function checkRepository(root = REPOSITORY, declarations = builtDeclarations) {
  const files = execFileSync("git", ["ls-files", "-z", "--", ...SOURCE_ROOTS], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean);
  // A definition whose file is not there (another repository, --root) declares no chain, so a persistent format above 1 there fails.
  // The goldens this repository keeps: what a chain's replay must cover (U2-d).
  const goldens = execFileSync("git", ["ls-files", "-z", "--", "tests/fixtures/golden-homes"], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean);
  const chains = registeredUpgradeChains({ files: goldens, read: file => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : null) });
  const versionEntries = versionSource(root).versions;
  const exceptions = exceptionNames(readFileSync(path.join(root, "tooling/gates/version-exceptions.json"), "utf8"));
  const problems = initialVersionProblems({ ...await declarations(), versionEntries, chains });
  for (const file of files.filter(isCheckedSource)) problems.push(...sourceVersionProblems(file, readFileSync(path.join(root, file), "utf8"), chains, exceptions));
  return problems;
}

// --root checks another repository's source and tables, with this repository's build as the Host (tests/initial-versions-check.test.ts).
if (isMainScript(import.meta.url)) {
  const problems = await checkRepository(process.argv[2] === "--root" ? path.resolve(process.argv[3]) : REPOSITORY);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log("The registered actions, manifests, prompts, instructions, roles, methods and first-party version constants are at the unified origin; a persistent format above it has its upgrade chain and a passed replay.");
}
