// Whose error is this (specs/repository-anti-corruption W3-02-B; user decision 2026-10-10 「一律用主人名开头」): every error code is
// `<owner>.<reason>`, the owner's name first. This is the table that says which part of the repository speaks for which owner, and the
// count of the codes that do not start with the name of the owner of the file that raises them.
//
// THE TABLE is tooling/gates/error-owners.json:
//   platform.prefixes   the prefixes the platform itself speaks in (`actions`, and the protocol prefixes the contracts' helpers raise).
//                       A code with a row in ACTION_ERROR_KINDS (packages/contracts/src/platform/action-errors.ts) may be raised by
//                       anyone; every row's prefix must be listed here, and a listed prefix must have a row.
//   owners.<name>       an owner, with the paths it owns and a reason that says why. The name is the first word of its codes.
// A path is a directory (ends with `/`), a glob in one path segment (`apps/local-host/src/jelly-*`, `*` stops at `/`) or one file. The most
// specific one wins: a file beats a glob beats a directory, a longer path beats a shorter one. Besides the table, every file under
// `plugins/native/<dir>/` belongs to the owner `<dir>` (hyphens become underscores), so a new plugin needs no entry; the table can still
// name a longer path inside it (the Work plugin's `http/` files, say) and then that wins.
//
// THE COUNT (errorCodeOwner, per file, only falls): a code site of scripts/gates/error-scan.mjs whose first word is not the name of the
// file's owner and that is not a platform code. A file with no owner raises nothing of its own: any code that is not a platform code
// counts. A bare word (`timeout`), an UPPER_CASE code and `plugin_grant_denied` all count: their first word is not an owner's name. The
// counts are measured with the working tree's table on both sides of the comparison, so changing the table cannot make a number fall.
//
// THE TABLE ONLY GETS STRICTER. Compared with the merge-base's table (errorOwnerTable): a file that had an owner there and has another
// now fails (a move of the file is not that: the count of the moved file says what changed), and a new platform prefix fails. A new owner
// for new files, a new path for files nobody owned, and stale entries leaving are free. The table's own rules have no baseline: a name
// that is not a plain word, the name `actions`, no reason, a path that matches no tracked file, one path under two owners, two owners
// whose paths tie on one file, a platform row whose prefix is not listed, and a listed prefix without a row.
//
// WHAT IT DOES NOT SEE: the same as scripts/gates/error-scan.mjs (a code that is not a literal, a factory under another name).
import ts from "typescript";

export const ERROR_OWNERS_FILE = "tooling/gates/error-owners.json";
export const ACTION_ERRORS_FILE = "packages/contracts/src/platform/action-errors.ts";
const OWNER_NAME = /^[a-z][a-z0-9_]*$/;
const PREFIX = /^[a-z][a-z0-9_]*$/;
const NATIVE_PLUGIN = /^plugins\/native\/([^/]+)\//;
const MIN_REASON_CHARACTERS = 20;
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** The files the metric reads besides the sources (the entry reads them from the merge-base too). */
export const errorOwnersWantsText = (file) => file === ERROR_OWNERS_FILE;

// ---- the platform's codes ---------------------------------------------------------------------------------------------------
/** The keys of ACTION_ERROR_KINDS in a snapshot (the platform's own codes); an empty set when the snapshot has no such file. */
export function platformCodes(snapshot) {
  const text = snapshot.read(ACTION_ERRORS_FILE);
  const codes = new Set();
  if (text === null) return codes;
  const source = ts.createSourceFile(ACTION_ERRORS_FILE, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "ACTION_ERROR_KINDS" && node.initializer) {
      let table = node.initializer;
      while (ts.isAsExpression(table) || ts.isSatisfiesExpression(table) || ts.isParenthesizedExpression(table)) table = table.expression;
      if (ts.isObjectLiteralExpression(table)) for (const property of table.properties) if (property.name && ts.isStringLiteral(property.name)) codes.add(property.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return codes;
}

// ---- reading the table ---------------------------------------------------------------------------------------------------------
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A compiled path: { rank, weight, test(file) }. A file is rank 3, a glob 2, a directory 1; a longer path weighs more. */
function compilePath(pattern) {
  if (pattern.endsWith("/")) return { rank: 1, weight: pattern.length, test: (file) => file.startsWith(pattern) };
  if (pattern.includes("*")) {
    const matcher = new RegExp(`^${pattern.split("*").map(escapeRegExp).join("[^/]*")}$`);
    return { rank: 2, weight: pattern.replaceAll("*", "").length, test: (file) => matcher.test(file) };
  }
  return { rank: 3, weight: pattern.length, test: (file) => file === pattern };
}
const validPath = (pattern) => typeof pattern === "string" && pattern.length > 0 && !pattern.startsWith("/") && !pattern.includes("**") && !pattern.includes("..") && !/\s/.test(pattern);

/**
 * The table of a snapshot: { owners: [{ name, reason, paths: [{ pattern, ...compiled }] }], platform: { prefixes, reason }, problems } with
 * `table: null` when the file is missing. `problems` holds what is wrong with the file's own shape; the rules that need the file list
 * and the platform codes are in `errorOwnerProblems`.
 */
export function readOwnerTable(snapshot) {
  const text = snapshot.read(ERROR_OWNERS_FILE);
  if (text === null) return { table: null, problems: [] };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { table: null, problems: [`${ERROR_OWNERS_FILE} is not valid JSON`], invalid: true }; }
  const problems = [];
  const where = (name, problem) => problems.push(`${ERROR_OWNERS_FILE}: ${name}: ${problem}`);
  if (!isRecord(parsed) || !isRecord(parsed.owners) || !isRecord(parsed.platform)) {
    return { table: null, problems: [`${ERROR_OWNERS_FILE} needs a "platform" object ({ prefixes, reason }) and an "owners" object keyed by owner name`], invalid: true };
  }
  for (const key of Object.keys(parsed)) if (!["note", "platform", "owners"].includes(key)) problems.push(`${ERROR_OWNERS_FILE}: unknown section "${key}"`);
  const platform = { prefixes: [], reason: parsed.platform.reason };
  if (!Array.isArray(parsed.platform.prefixes) || !parsed.platform.prefixes.length || !parsed.platform.prefixes.every((prefix) => typeof prefix === "string" && PREFIX.test(prefix))) {
    where("platform", `"prefixes" must list the platform's prefixes, each a plain lower-case word`);
  } else platform.prefixes = parsed.platform.prefixes;
  if (typeof platform.reason !== "string" || platform.reason.replace(/\s+/g, "").length < MIN_REASON_CHARACTERS) where("platform", `"reason" needs at least ${MIN_REASON_CHARACTERS} characters that say why these prefixes are the platform's`);
  const owners = [];
  for (const [name, entry] of Object.entries(parsed.owners)) {
    if (!OWNER_NAME.test(name)) { where(name, `an owner's name is one lower-case word (letters, digits, underscores), the first word of its codes`); continue; }
    if (name === "actions") { where(name, `"actions" is the platform's prefix; an owner needs a name of its own`); continue; }
    if (!isRecord(entry)) { where(name, `the entry must be an object with "paths" and "reason"`); continue; }
    for (const field of Object.keys(entry)) if (!["paths", "reason"].includes(field)) where(name, `unknown field "${field}"`);
    if (typeof entry.reason !== "string" || entry.reason.replace(/\s+/g, "").length < MIN_REASON_CHARACTERS) where(name, `"reason" needs at least ${MIN_REASON_CHARACTERS} characters that say why these paths are this owner's`);
    if (!Array.isArray(entry.paths) || !entry.paths.length || !entry.paths.every(validPath)) { where(name, `"paths" must list directories (ending with /), globs in one path segment (*) or files, none with .. or **`); continue; }
    owners.push({ name, reason: entry.reason, paths: entry.paths.map((pattern) => ({ pattern, ...compilePath(pattern) })) });
  }
  return { table: { owners, platform, note: parsed.note }, problems };
}

/** `ownerOf(file)`: the owner name of a file under the table (its most specific path, then the plugin directory rule), or undefined. */
export function ownerLookup(table) {
  const candidates = table.owners.flatMap((owner) => owner.paths.map((path) => ({ name: owner.name, ...path, explicit: true })));
  const best = (file) => {
    const matching = candidates.filter((candidate) => candidate.test(file));
    const plugin = NATIVE_PLUGIN.exec(file);
    if (plugin) matching.push({ name: plugin[1].replaceAll("-", "_"), rank: 1, weight: `plugins/native/${plugin[1]}/`.length, explicit: false });
    // An explicit path wins over the plugin directory rule when the two are equally specific.
    matching.sort((a, b) => b.rank - a.rank || b.weight - a.weight || Number(b.explicit) - Number(a.explicit));
    return matching;
  };
  return {
    ownerOf: (file) => best(file)[0]?.name,
    /** The owners that tie for the most specific path of a file (more than one means the table does not decide). */
    tiesOf(file) {
      const matching = best(file);
      if (!matching.length) return [];
      const top = matching[0];
      return [...new Set(matching.filter((candidate) => candidate.rank === top.rank && candidate.weight === top.weight && candidate.explicit === top.explicit).map((candidate) => candidate.name))];
    },
    candidates,
  };
}

// ---- the rules of the table itself ------------------------------------------------------------------------------------------
/** What is wrong with the table in a snapshot. Every problem is a failure; there is no baseline. A repository without the table has none. */
export function errorOwnerProblems(snapshot, { required = false } = {}) {
  const { table, problems } = readOwnerTable(snapshot);
  if (!table) return problems.length ? problems : required ? [`${ERROR_OWNERS_FILE} is missing: the error gates (scripts/gates/error-owners.mjs) read it, and without it no code has an owner`] : [];
  const out = [...problems];
  const lookup = ownerLookup(table);
  const files = snapshot.files;
  const seen = new Map();
  for (const owner of table.owners) {
    for (const path of owner.paths) {
      if (seen.has(path.pattern) && seen.get(path.pattern) !== owner.name) out.push(`${ERROR_OWNERS_FILE}: ${path.pattern} is under both "${seen.get(path.pattern)}" and "${owner.name}"; one path, one owner`);
      seen.set(path.pattern, owner.name);
      if (!files.some((file) => path.test(file))) out.push(`${ERROR_OWNERS_FILE}: ${owner.name}: ${path.pattern} matches no tracked file; delete it (the table lists what is there)`);
    }
  }
  for (const file of files) {
    if (!/\.(?:ts|mts)$/.test(file)) continue;
    const ties = lookup.tiesOf(file);
    if (ties.length > 1) out.push(`${ERROR_OWNERS_FILE}: ${file} is claimed by ${ties.map((name) => `"${name}"`).join(" and ")} with equally specific paths; make one of the paths longer`);
  }
  const prefixes = new Set(table.platform.prefixes);
  const used = new Set();
  for (const code of platformCodes(snapshot)) {
    const prefix = code.split(".")[0];
    used.add(prefix);
    if (!prefixes.has(prefix)) out.push(`${ACTION_ERRORS_FILE}: ACTION_ERROR_KINDS has a row for "${code}", whose prefix "${prefix}" is not a platform prefix in ${ERROR_OWNERS_FILE}; a code of an owner is declared with defineErrorCodes, not as a platform row`);
  }
  if (snapshot.read(ACTION_ERRORS_FILE) !== null) for (const prefix of prefixes) if (!used.has(prefix)) out.push(`${ERROR_OWNERS_FILE}: platform prefix "${prefix}" has no row in ACTION_ERROR_KINDS; delete it`);
  return out;
}

// ---- the count -------------------------------------------------------------------------------------------------------------
/** Where the sites of a snapshot break the rule: { counts: { file: n }, details: { file: [text] } } measured with `table`. */
export function measureOwners(snapshot, sites, table) {
  const counts = {}, details = {};
  if (!table) return { counts, details };
  const { ownerOf } = ownerLookup(table);
  const platform = platformCodes(snapshot);
  for (const [file, found] of Object.entries(sites)) {
    const owner = ownerOf(file);
    for (const { line, code } of found) {
      if (platform.has(code) || owner === code.split(".")[0]) continue;
      counts[file] = (counts[file] ?? 0) + 1;
      (details[file] ??= []).push(`line ${line}: "${code}" in ${owner ? `${owner}'s file` : "a file nobody owns"}`);
    }
  }
  return { counts, details };
}

/** The assignment a snapshot's table makes: { files: { file: owner }, prefixes: [...] }, for the comparison with the merge-base. */
export function ownerAssignment(snapshot, isSource) {
  const { table } = readOwnerTable(snapshot);
  if (!table) return null;
  const { ownerOf } = ownerLookup(table);
  const files = {};
  for (const file of snapshot.files) {
    if (!isSource(file)) continue;
    const owner = ownerOf(file);
    if (owner !== undefined) files[file] = owner;
  }
  return { files, prefixes: [...table.platform.prefixes].sort() };
}

/** What got looser from the merge-base's table (`ref`) to the head's: a file that changed owner (not a moved file), a new platform prefix. */
export function looserOwnership(head, ref, renames) {
  if (!head || !ref) return [];
  const out = [];
  const moved = new Set([...renames.keys(), ...renames.values()]);
  for (const [file, owner] of Object.entries(head.files)) {
    const was = ref.files[file];
    if (was !== undefined && was !== owner && !moved.has(file)) out.push(`${file} was the ${was} owner's at the merge-base and is the ${owner} owner's now`);
  }
  for (const prefix of head.prefixes) if (!ref.prefixes.includes(prefix)) out.push(`"${prefix}" is a platform prefix now, so anyone may raise codes that start with it`);
  return out;
}
