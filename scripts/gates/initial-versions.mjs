// N41: inspect the live first-party declarations used by this build. The unified origin is not a date inferred from this check.
// Two halves. The source constants and the tooling/versions.json entries need no build and are an absolute rule of `pnpm health:check`
// (versionOriginProblems, user 2026-11-07). The registered actions, Manifests, prompts and roles need a build, so only this script checks
// them, and only when someone runs it: the rebuild window does (docs/releases/CHECKLIST.md §4.1). tooling/gates/README.md has the rules.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { collectHost, loadManifests, withIsolatedHome } from "./action-contract-host.mjs";

// Persistent formats (specs/upgrade-continuity/upgrade-chain-design.md §11.1, CONTRACT-CHANGES.md §3): after the unified origin these
// go up through the upgrade chain instead of staying at 1. Above 1 each needs a registered chain with consecutive steps and a replay
// that passed. Everything else (actions, Manifests, prompts, roles, methods, any other first-party constant) stays at 1.
// A constant is `file#NAME`, because the same name elsewhere (CATALOG_VERSION in the plugin builder) is not a persistent format.
// Not on the list, so above 1 they fail with or without a chain: a fixed version (CODING_PLAN, FEED_CAPTURE and the *_ARTIFACT_SCHEMA_VERSION
// of Dataset, Form, Pages, PPT) must not change after it is written, by contract and by its content_digest, not by anything in the
// database, so a step should not rewrite it; GMAIL_LIVE_CURSOR is sync progress a full sync rebuilds, so it needs no step.
const PERSISTENT_CONSTANTS = new Set([
  "apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION",
  "packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION",
  "apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION",
  "modules/shelf/src/catalog-shape.ts#CATALOG_VERSION",
  "apps/local-host/src/installer/home-contract.ts#SCHEMA_VERSION",
  "packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION",
]);
// The persistent formats that are no `*VERSION` constant reach this check through their tooling/versions.json entry. The code calls
// two stores a ledger (账本) and the design's §2.5 names both, so both are here; a chain is what any library needs to go above 1 anyway.
// format.jelly.workspace is the JSON in jelly_workspace.body, a row, not jelly/preferences.json: it is here because that row changes, a step
// can rewrite it and nothing rebuilds it. The last six are the files §2.6 of the design puts in the chain and §11.1 did not name, the
// last of them jelly/preferences.json: the user agreed to them on 2026-11-07.
const PERSISTENT_ENTRIES = new Map([
  ["database.ledger_baseline", "apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE"],
  ["database.memory_ledger_baseline", "packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE"],
  ["format.jelly.workspace", "plugins/native/jelly/src/contract.ts#schema_version"],
  ["format.home.onboarding", "apps/local-host/src/onboarding.ts#schema_version"],
  ["format.project.arrival", "apps/local-host/src/project-arrival.ts#schema_version"],
  ["format.browser.site-decisions", "apps/local-host/src/browser/browser-surfaces.ts#version"],
  ["format.computer.settings", "apps/local-host/src/computer/computer-settings.ts#version"],
  ["format.computer.record", "apps/local-host/src/computer/computer-records.ts#version"],
  ["format.model.preference", "apps/local-host/src/model-configuration.ts#schema_version"],
]);
export const PERSISTENT_DEFINITIONS = Object.freeze([...PERSISTENT_CONSTANTS, ...PERSISTENT_ENTRIES.values()]);
export const PERSISTENT_ENTRY_KEYS = Object.freeze(Object.fromEntries(PERSISTENT_ENTRIES));

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
 * `{ version, froms: number[], replay_passed: boolean }`. A missing chain, a gap, or anything but a passed replay fails.
 */
function persistentVersionProblems(definition, version, chains) {
  const at = `${definition} = ${String(version)}`;
  if (!Number.isInteger(version) || version < 2) return [`${at} (expected 1)`];
  const chain = chains.get(definition);
  if (chain === undefined) return [`${at} (expected 1; above 1 it needs a registered upgrade chain and a replay that passed)`];
  const problems = chain.version === version ? upgradeStepProblems(version, chain.froms).map(problem => `${at}: the registered upgrade chain has ${problem}`)
    : [`${at}: the registered upgrade chain goes to ${String(chain.version)}`];
  if (chain.replay_passed !== true) problems.push(`${at}: the replay of its upgrade chain did not pass`);
  return problems;
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

// Versions chosen by an upstream provider or the bundled SQLite binary are listed with their reason in one place; the product
// version carries its own marker, and a pattern (a RegExp named VERSION) is not a version at all.
const exceptionNames = (text) => new Set(JSON.parse(text).filter(entry => entry.file && entry.name).map(entry => `${entry.file}#${entry.name}`));
let thisRepository;
const repositoryExceptions = () => (thisRepository ??= exceptionNames(readFileSync(new URL("../../tooling/gates/version-exceptions.json", import.meta.url), "utf8")));

export function sourceVersionProblems(file, source, chains = new Map(), exceptions = repositoryExceptions()) {
  if (!/\b[A-Z_\d]*VERSION\b/.test(source)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const problems = [];
  const visit = (node) => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const)) {
      for (const declaration of node.declarations) {
        const name = declaration.name.getText(tree);
        if (!/^[A-Z_\d]*VERSION$/.test(name) || exceptions.has(`${file}#${name}`)) continue;
        let value = declaration.initializer;
        while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
        if (value && (ts.isRegularExpressionLiteral(value) || /@version product\./.test(source.slice(value.pos, value.getStart(tree))))) continue;
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
  return problems;
}

const SOURCE_AREAS = /^(?:apps|packages|plugins|modules|server|horizontal)\//;
const isCheckedSource = (file) => SOURCE_AREAS.test(file) && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) && !/(?:^|\/)(?:tests|fixtures)\//.test(file);

/**
 * The half with no build, over a snapshot (`files`, `read`): the version constants in source and the entries of tooling/versions.json.
 * A repository with neither table is not this one (the gates' scratch repositories); losing a table this one had, or one that cannot be
 * read, is a problem and not a pass. `chains` arrives with U1-d, here and in check() below: until then nothing above 1 can pass.
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
  const versionEntries = table("tooling/versions.json", text => JSON.parse(text).versions ?? {}, {});
  const exceptions = table("tooling/gates/version-exceptions.json", exceptionNames, new Set());
  problems.push(...initialVersionProblems({ manifests: [], hostViews: [], registrations: [], versionEntries, chains }));
  for (const file of files.filter(isCheckedSource)) problems.push(...sourceVersionProblems(file, read(file) ?? "", chains, exceptions));
  return problems;
}

async function check() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const files = execFileSync("git", ["ls-files", "-z", "--", "apps", "packages", "plugins", "modules", "server", "horizontal"],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean);
  // The register of upgrade chains and the replay that proves them arrive with U1-d and U2 (versionOriginProblems takes it too): nothing is registered yet, so a persistent
  // format above 1 fails here as it always did, and while everything is at 1 (the rebuild window) this is never consulted.
  const chains = new Map();
  const problems = await withIsolatedHome(async home => {
    const { builtinRegistrations } = await import("../../apps/local-host/dist/agent-definitions/builtin-registrations.js");
    const { manifests } = await loadManifests();
    const { hostViews } = await collectHost(home);
    const versionEntries = JSON.parse(readFileSync(path.join(root, "tooling/versions.json"), "utf8")).versions;
    return initialVersionProblems({ manifests, hostViews, registrations: builtinRegistrations(), versionEntries, chains });
  });
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) || /(?:^|\/)(?:tests|fixtures)\//.test(file)) continue;
    problems.push(...sourceVersionProblems(file, readFileSync(path.join(root, file), "utf8"), chains));
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log("The registered actions, manifests, prompts, instructions, roles, methods and first-party version constants are at the unified origin; a persistent format above it has its upgrade chain and a passed replay.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await check();
