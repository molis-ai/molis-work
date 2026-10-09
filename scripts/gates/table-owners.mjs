// Gate: a table is read and written only by the package that creates it (specs/repository-anti-corruption §4.11, W2-06).
//
// "Owner" is a package: the nearest ancestor directory of a source file that holds a package.json. A table's owners are the
// packages whose SQL text has a `CREATE [VIRTUAL] TABLE <name>`. Any other package whose SQL text reads or writes that table
// (SELECT … FROM, JOIN, INSERT INTO, REPLACE INTO, UPDATE, DELETE FROM, ALTER TABLE, DROP TABLE) fails, with no baseline: the
// rule starts at zero. The fix is the owner's own API, never a number in a baseline. Two packages that each create a table of
// the same name (`workspaces` in projects and alchemist, `jobs` in alchemist and images: different databases, spec §9.5 item 9)
// are both owners of it, but only when tooling/gates/table-owners.json says so: a second package that adds its own
// `CREATE TABLE <a table another package creates>` is not a way to become its co-owner.
//
// The allowance is tooling/gates/table-owners.json, with two sections, each checked against the code in both directions so
// it cannot go stale:
//   shared     tables that several packages write on purpose: the table, the package that creates it, every other package
//              that may use it, and why. A listed package that no longer touches the table, an owner that is not the creator,
//              a table nobody creates, and a reason that does not say anything all fail. A package that uses a shared table
//              and is not listed fails like any other.
//   same_name  tables that two packages each create, in different databases (`workspaces`, `jobs`): the table, the packages
//              that create it, and why they are not one table. A table that more than one package creates and is not listed
//              fails; so does an entry whose packages are not exactly the creators, or that only one package creates now.
//
// What it reads: the string and template-literal text of the TypeScript sources the entry calls sources (apps, horizontal,
// modules, packages, plugins, server, tooling; not tests, fixtures or build output), found in the syntax tree, so a comment
// never counts. SQL keywords are matched in upper case only (every SQL string in the repository is written that way, and a
// case-blind match reads English: "from Pages"). What it does not see, a known limit and not a decision: a table name that
// is not a literal (`FROM ${table}`: the Artifacts repository takes its table names as options, the assistant purge walks a
// list), SQL built by concatenation, and SQL kept in files that are not TypeScript.
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ts = createRequire(fileURLToPath(import.meta.url))("typescript");

export const TABLE_OWNERS_FILE = "tooling/gates/table-owners.json";
const MIN_REASON_CHARACTERS = 20;
const SQL_WORDS = /\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\b/;
const NAME = String.raw`["'\x60\[]?([A-Za-z_][A-Za-z0-9_]*)`;
const CREATE = new RegExp(String.raw`\bCREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${NAME}`, "g");
// Writes first: at one position the longer phrase (`DELETE FROM`) wins over the bare `FROM`.
const ACCESS = new RegExp(String.raw`\b(DELETE\s+FROM|INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO|REPLACE\s+INTO|UPDATE(?:\s+OR\s+[A-Z]+)?|ALTER\s+TABLE|DROP\s+TABLE(?:\s+IF\s+EXISTS)?|FROM|JOIN)\s+${NAME}`, "g");

/** The package directory a file belongs to: the nearest ancestor holding a package.json ("." when none does). */
function packageResolver(files) {
  const packages = new Set(files.filter((file) => /(?:^|\/)package\.json$/.test(file)).map((file) => path.posix.dirname(file)));
  const cache = new Map();
  return (file) => {
    let directory = path.posix.dirname(file);
    const walked = [];
    while (!cache.has(directory)) {
      walked.push(directory);
      if (packages.has(directory)) { cache.set(directory, directory); break; }
      const parent = path.posix.dirname(directory);
      if (parent === directory || directory === ".") { cache.set(directory, "."); break; }
      directory = parent;
    }
    const found = cache.get(directory);
    for (const step of walked) cache.set(step, found);
    return found;
  };
}

/** Every string and template-literal text of a source file, each with its line. */
function literals(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const found = [];
  const visit = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      found.push({ text: node.text, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/**
 * The tables the sources create and the accesses to them: { owners: Map<table, Set<package>>, accesses: [{ file, line, package,
 * table, writes }] } where `accesses` holds every access to a table another package creates, `table` lower-cased. Exported for the test.
 */
export function scanTables(snapshot, isSource) {
  const packageOf = packageResolver(snapshot.files);
  const owners = new Map();
  const seen = [];
  for (const file of snapshot.files.filter(isSource)) {
    const text = snapshot.read(file);
    if (text === null || !SQL_WORDS.test(text)) continue;
    const pieces = literals(file, text), pkg = packageOf(file);
    seen.push({ file, pkg, pieces });
    for (const piece of pieces) {
      for (const match of piece.text.matchAll(CREATE)) {
        const table = match[1].toLowerCase();
        if (!owners.has(table)) owners.set(table, new Set());
        owners.get(table).add(pkg);
      }
    }
  }
  const accesses = [];
  for (const { file, pkg, pieces } of seen) {
    for (const piece of pieces) {
      for (const match of piece.text.matchAll(ACCESS)) {
        const table = match[2].toLowerCase(), creators = owners.get(table);
        if (!creators || creators.has(pkg)) continue;
        accesses.push({ file, line: piece.line, package: pkg, table, writes: !/^(?:FROM|JOIN)$/.test(match[1]) });
      }
    }
  }
  return { owners, accesses };
}

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const reasonProblem = (entry, why) => (typeof entry.reason !== "string" || entry.reason.replace(/\s+/g, "").length < MIN_REASON_CHARACTERS
  ? `"reason" needs at least ${MIN_REASON_CHARACTERS} characters that say why ${why}` : null);
const packageList = (value, minimum) => Array.isArray(value) && value.length >= minimum && value.every((item) => typeof item === "string" && item);

/** One section of the allowance: { entries: Map<table, entry>, problems }. `check(entry, bad)` pushes what is wrong with one entry. */
function readSection(parsed, section, fields, check) {
  const entries = new Map(), problems = [];
  const body = parsed[section];
  if (body === undefined && section !== "shared") return { entries, problems };
  if (!isRecord(body)) return { entries, problems: [`${TABLE_OWNERS_FILE} needs a "${section}" object keyed by table name`] };
  for (const [name, entry] of Object.entries(body)) {
    const bad = [];
    if (!isRecord(entry)) bad.push(`the entry must be an object with ${fields.map((field) => `"${field}"`).join(", ")}`);
    else {
      for (const field of Object.keys(entry)) if (!fields.includes(field)) bad.push(`unknown field "${field}"`);
      check(entry, bad);
    }
    if (bad.length) problems.push(...bad.map((problem) => `${TABLE_OWNERS_FILE}: ${name}: ${problem}`));
    else entries.set(name.toLowerCase(), entry);
  }
  return { entries, problems };
}

/** The allowance, parsed: { shared: Map<table, { owner, users, reason }>, sameName: Map<table, { packages, reason }>, problems }. */
function readAllowance(snapshot) {
  const text = snapshot.read(TABLE_OWNERS_FILE);
  const none = { shared: new Map(), sameName: new Map() };
  if (text === null) return { ...none, problems: [] };
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ...none, problems: [`${TABLE_OWNERS_FILE} is not valid JSON`] }; }
  if (!isRecord(parsed) || !isRecord(parsed.shared)) return { ...none, problems: [`${TABLE_OWNERS_FILE} needs a "shared" object keyed by table name`] };
  const problems = Object.keys(parsed).filter((key) => !["note", "shared", "same_name"].includes(key)).map((key) => `${TABLE_OWNERS_FILE}: unknown section "${key}"`);
  const shared = readSection(parsed, "shared", ["owner", "users", "reason"], (entry, bad) => {
    if (typeof entry.owner !== "string" || !entry.owner) bad.push(`"owner" must name the package directory that creates the table`);
    if (!packageList(entry.users, 1)) bad.push(`"users" must list the other package directories that use the table`);
    const reason = reasonProblem(entry, "several packages share this table");
    if (reason) bad.push(reason);
  });
  const sameName = readSection(parsed, "same_name", ["packages", "reason"], (entry, bad) => {
    if (!packageList(entry.packages, 2) || new Set(entry.packages).size !== entry.packages.length) bad.push(`"packages" must list the package directories (at least two, each once) that each create a table of this name`);
    const reason = reasonProblem(entry, "these packages each create a table of this name and it is not one table");
    if (reason) bad.push(reason);
  });
  return { shared: shared.entries, sameName: sameName.entries, problems: [...problems, ...shared.problems, ...sameName.problems] };
}

/** Problems in the working tree; every one is a failure and there is no baseline. `isSource` is the entry's own source test. */
export function tableOwnerProblems(snapshot, { isSource }) {
  const { owners, accesses } = scanTables(snapshot, isSource);
  const { shared, sameName, problems } = readAllowance(snapshot);
  const touching = new Map();
  const unlisted = new Map();
  for (const access of accesses) {
    if (!touching.has(access.table)) touching.set(access.table, new Set());
    touching.get(access.table).add(access.package);
    if (shared.get(access.table)?.users.includes(access.package)) continue;
    const key = `${access.file}\0${access.table}`;
    const row = unlisted.get(key) ?? { ...access, writes: false, count: 0 };
    row.count++;
    row.writes ||= access.writes;
    row.line = Math.min(row.line, access.line);
    unlisted.set(key, row);
  }
  for (const row of [...unlisted.values()].sort((a, b) => a.file.localeCompare(b.file) || a.table.localeCompare(b.table))) {
    const creators = [...owners.get(row.table)].sort().join(" and ");
    const shareable = shared.has(row.table) ? ` ${TABLE_OWNERS_FILE} lists the packages that may use it, and ${row.package} is not one of them` : "";
    problems.push(`${row.file}:${row.line} ${row.writes ? "writes" : "reads"} table "${row.table}"${row.count > 1 ? ` (${row.count} places)` : ""}, which ${creators} creates; `
      + `go through that package's own API (a function it exports), not its table.${shareable}`);
  }
  for (const [table, entry] of [...shared].sort((a, b) => a[0].localeCompare(b[0]))) {
    const creators = owners.get(table);
    if (!creators) { problems.push(`${TABLE_OWNERS_FILE}: ${table}: no package creates a table of this name; delete the entry`); continue; }
    if (!creators.has(entry.owner)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: "owner" is ${entry.owner}, but the table is created by ${[...creators].sort().join(" and ")}`);
    for (const user of entry.users) {
      if (creators.has(user)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: ${user} creates the table and is not a "user" of it; remove it from "users"`);
      else if (!touching.get(table)?.has(user)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: ${user} no longer reads or writes this table; remove it from "users" (a shared table is a list that only shrinks)`);
    }
  }
  for (const [table, creators] of [...owners].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (creators.size < 2) continue;
    const names = [...creators].sort().join(" and "), entry = sameName.get(table);
    if (!entry) {
      problems.push(`table "${table}" is created by ${names}: one table, one creating package. If they are different databases that happen to share a name, `
        + `list the table under "same_name" in ${TABLE_OWNERS_FILE} with the reason; otherwise keep one CREATE and let the other package use its API.`);
      continue;
    }
    for (const listed of entry.packages) if (!creators.has(listed)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: ${listed} does not create this table; remove it from "packages"`);
    for (const creator of [...creators].sort()) if (!entry.packages.includes(creator)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: ${creator} also creates this table and is not in "packages"; list it with the reason, or drop its CREATE`);
  }
  for (const [table] of [...sameName].sort((a, b) => a[0].localeCompare(b[0]))) {
    const creators = owners.get(table);
    if (!creators) problems.push(`${TABLE_OWNERS_FILE}: ${table}: no package creates a table of this name; delete the entry from "same_name"`);
    else if (creators.size < 2) problems.push(`${TABLE_OWNERS_FILE}: ${table}: only ${[...creators][0]} creates this table now; delete the entry from "same_name" (a same-name list only shrinks)`);
    if (shared.has(table)) problems.push(`${TABLE_OWNERS_FILE}: ${table}: listed under both "shared" and "same_name"; a shared table has one creating package, a same-name table several`);
  }
  return problems;
}
