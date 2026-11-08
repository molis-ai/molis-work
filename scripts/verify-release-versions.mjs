#!/usr/bin/env node
// Release version consistency (docs/releases/POLICY.md). Every first-party version lives in tooling/versions.json: everything
// that carries one must agree, no declaration may bypass it (scripts/gates/version-declarations.mjs), the workspace packages
// stay private 0.0.0, the current version has release notes and a CHANGELOG section, and the per-database version table in
// docs/releases/CHECKLIST.md is the one the code has (every SqliteBaseline constant is listed, and every baseline handed to
// applySqliteBaseline is such a constant).
//
//   node scripts/verify-release-versions.mjs [--root <dir>] [--tag <vX.Y.Z>]
//
//   --root <dir>   check another repository root (tests/verify-release-versions.test.ts builds scratch roots)
//   --tag <tag>    also require the tag to be v<product version> (release-macos.yml passes the pushed tag)
// Exit codes: 0 consistent, 1 something disagrees (every finding is listed), 2 the command line is unusable.
// It only reads files: no build, no git.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { generateVersions } from "./generate-versions.mjs";
import { versionDeclarationProblems } from "./gates/version-declarations.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkFiles } from "./script-paths.mjs";
import { VERSION_FIELD, scriptKind, withoutMarkers } from "./version-source.mjs";

const USAGE = "usage: verify-release-versions.mjs [--root <dir>] [--tag <vX.Y.Z>]";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CHECKLIST = "docs/releases/CHECKLIST.md";
const CHANGELOG = "docs/releases/CHANGELOG.md";

// ---- command line ---------------------------------------------------------------------------------------------------
const fail = message => { console.error(message); process.exit(2); };
const options = {};
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (name !== "--root" && name !== "--tag") fail(`unknown argument ${args[index]}\n${USAGE}`);
  const value = inline ?? args[++index];
  if (!value || value.startsWith("--")) fail(`${name} needs a value\n${USAGE}`);
  options[name.slice(2)] = value;
}
const root = path.resolve(options.root ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

// ---- reading --------------------------------------------------------------------------------------------------------
const problems = [];
const problem = message => problems.push(message);
// Markers are comments next to the literal; the checks below read the literal.
const inspectSource = (file, text) => /\.m?[tj]s$/.test(file) ? withoutMarkers(text) : text;
const readOptional = file => existsSync(path.join(root, file)) ? inspectSource(file, readFileSync(path.join(root, file), "utf8")) : null;
try {
  for (const file of generateVersions({ root })) problem(`${file}: differs from tooling/versions.json (run pnpm versions:generate)`);
} catch (error) { problem(`tooling/versions.json: ${error.message}`); }
try {
  for (const finding of versionDeclarationProblems(root)) problem(finding);
} catch (error) { problem(`version declarations: ${error.message}`); }
function readNeeded(file) {
  const text = readOptional(file);
  if (text === null) problem(`${file}: the file is missing`);
  return text;
}
function readJson(file) {
  const text = readNeeded(file);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { problem(`${file}: not valid JSON`); return null; }
}

// ---- the product version and what carries it ------------------------------------------------------------------------
function checkProductVersion() {
  const version = readJson("package.json")?.version;
  if (typeof version !== "string" || !SEMVER.test(version)) {
    problem(`package.json: version ${JSON.stringify(version)} is not MAJOR.MINOR.PATCH`);
    return null;
  }
  if (options.tag !== undefined && options.tag !== `v${version}`) problem(`tag ${options.tag} is not v${version} (package.json)`);
  return version;
}

// The `packages:` list of pnpm-workspace.yaml: `dir/*` or a single directory. Anything fancier is refused, not skipped.
function workspaceDirectories() {
  const text = readNeeded("pnpm-workspace.yaml");
  if (text === null) return [];
  const lines = text.split("\n");
  const start = lines.findIndex(line => /^packages:\s*$/.test(line));
  if (start < 0) { problem("pnpm-workspace.yaml: no `packages:` list"); return []; }
  const directories = [];
  for (const line of lines.slice(start + 1)) {
    const entry = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/)?.[1];
    if (entry === undefined) { if (/^\S/.test(line)) break; continue; }
    if (entry.endsWith("/*") && !entry.slice(0, -2).includes("*")) {
      const base = entry.slice(0, -2);
      if (!existsSync(path.join(root, base))) { problem(`pnpm-workspace.yaml: ${entry} names a directory that does not exist`); continue; }
      for (const child of readdirSync(path.join(root, base), { withFileTypes: true }).filter(item => item.isDirectory())) {
        if (existsSync(path.join(root, base, child.name, "package.json"))) directories.push(`${base}/${child.name}`);
      }
    } else if (entry.includes("*")) problem(`pnpm-workspace.yaml: pattern ${entry} is not supported by this check`);
    else if (existsSync(path.join(root, entry, "package.json"))) directories.push(entry);
  }
  return directories.sort();
}

function checkWorkspacePackages(directories) {
  for (const directory of directories) {
    const manifest = readJson(`${directory}/package.json`);
    if (manifest === null) continue;
    if (manifest.private !== true) problem(`${directory}/package.json: workspace packages are private`);
    if (manifest.version !== "0.0.0") problem(`${directory}/package.json: workspace packages stay 0.0.0, found ${manifest.version}`);
  }
}

// Native plugins ship with the product; integrations and external plugin packages keep their own versions.
function checkBuiltinVersions(directories, version) {
  for (const directory of directories.filter(item => item.startsWith("plugins/native/"))) {
    const file = `${directory}/src/manifest.ts`;
    const source = readNeeded(file);
    if (source === null) continue;
    const found = source.match(/\bversion\s*:\s*["']([^"']+)["']/)?.[1];
    if (found !== version) problem(`${file}: bundled Manifest version ${found ?? "not found"}, but package.json is ${version}`);
  }
}

function checkReleaseFiles(version) {
  if (readOptional(`docs/releases/v${version}.md`) === null) problem(`docs/releases/v${version}.md: release notes for ${version} are missing`);
  const changelog = readNeeded(CHANGELOG);
  if (changelog === null) return;
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map(match => match[1]);
  if (sections[0] !== "Unreleased") problem(`${CHANGELOG}: the first section must be [Unreleased], found ${sections[0] ? `[${sections[0]}]` : "none"}`);
  if (!sections.includes(version)) problem(`${CHANGELOG}: no [${version}] section`);
}

// ---- the per-database version table ---------------------------------------------------------------------------------
// Rows of the table under the heading "各库版本表" (numbered or not) in the checklist, found by their column names: 版本 is a whole number
// and 定义处 is `path#NAME`. scripts/gates/store-versions.mjs reads the same 版本 cells and accepts the same numbers.
function tableRows(text) {
  const lines = text.split("\n");
  const heading = lines.findIndex(line => /^#{2,4}\s+(?:\d+\.\s+)?各库版本表\s*$/.test(line));
  if (heading < 0) { problem(`${CHECKLIST}: no section titled 各库版本表`); return []; }
  const cells = line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
  const rows = [];
  let columns = null;
  for (const line of lines.slice(heading + 1)) {
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.trim().startsWith("|")) continue;
    if (columns === null) {
      const header = cells(line);
      columns = { version: header.indexOf("版本"), definition: header.indexOf("定义处") };
      if (columns.version < 0 || columns.definition < 0) { problem(`${CHECKLIST}: the table needs the columns 版本 and 定义处`); return []; }
    } else if (!/^\|[\s:|-]+\|$/.test(line.trim())) {
      const row = cells(line);
      const [file, name] = (row[columns.definition] ?? "").replace(/`/g, "").split("#");
      rows.push({ store: row[0], version: row[columns.version], file, name });
    }
  }
  return rows;
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// If a string, template literal or comment starts at `index`, the index just after it; otherwise `index`.
function skipLiteral(text, index) {
  const char = text[index];
  if (char === "/" && text[index + 1] === "/") { const end = text.indexOf("\n", index); return end < 0 ? text.length : end; }
  if (char === "/" && text[index + 1] === "*") { const end = text.indexOf("*/", index + 2); return end < 0 ? text.length : end + 2; }
  if (char === '"' || char === "'" || char === "`") {
    for (let cursor = index + 1; cursor < text.length; cursor++) {
      if (text[cursor] === "\\") cursor++;
      else if (text[cursor] === char) return cursor + 1;
    }
    return text.length;
  }
  return index;
}

// The index of the bracket closing the one at `open`, or -1.
function closingBracket(text, open) {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const skipped = skipLiteral(text, index);
    if (skipped !== index) { index = skipped - 1; continue; }
    if ("([{".includes(text[index])) depth++;
    else if (")]}".includes(text[index]) && --depth === 0) return index;
  }
  return -1;
}

// The number in `version: N` at the top level of an object literal such as `{ version: 3, schema: `…` }`, or null.
function objectVersion(object) {
  let depth = 0;
  for (let index = 0; index < object.length; index++) {
    const skipped = skipLiteral(object, index);
    if (skipped !== index) { index = skipped - 1; continue; }
    const char = object[index];
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) depth--;
    else if (depth === 1 && object.startsWith("version", index) && !/\w/.test(object[index - 1] ?? "")) {
      const found = /^version\s*:\s*(\d+)\b/.exec(object.slice(index, index + 40));
      if (found) return found[1];
    }
  }
  return null;
}

// PluginDatabaseDeclaration carries the same version/schema baseline through the Host-owned connection service, and
// HomePluginDatabaseDeclaration is that with what a Home library adds (`project_rows`, `partition`). All three types,
// including satisfies/as spellings, name databases the table has to list.
const BASELINE_TYPES = "SqliteBaseline|PluginDatabaseDeclaration|HomePluginDatabaseDeclaration";
function baselineNames(text) {
  const names = new Set();
  for (const match of text.matchAll(new RegExp(`\\bconst\\s+(\\w+)\\s*:\\s*(?:${BASELINE_TYPES})\\s*=`, "g"))) names.add(match[1]);
  for (const match of text.matchAll(new RegExp(`\\b(?:satisfies|as)\\s+(?:${BASELINE_TYPES})\\b`, "g"))) {
    const owner = [...text.slice(0, match.index).matchAll(/\bconst\s+(\w+)\s*=/g)].pop()?.[1];
    if (owner !== undefined) names.add(owner);
  }
  return [...names];
}

// The version of the baseline constant `name` in `text`, whichever of the three spellings declares it: the `version:` number
// of its object literal. null when the constant is not an object literal with a literal version.
function baselineVersion(text, name) {
  const declaration = new RegExp(`\\bconst\\s+${escapeRegExp(name)}\\s*(?::\\s*(?:${BASELINE_TYPES})\\s*)?=\\s*\\{`).exec(text);
  if (declaration === null) return null;
  const open = declaration.index + declaration[0].length - 1;
  const close = closingBracket(text, open);
  return close < 0 ? null : objectVersion(text.slice(open, close + 1));
}

// A JSON file's version is what the code that writes it puts at `name`, read from the syntax tree: every property of that name, quoted
// or not, in an object (`name: 1`, `"name": 1`) or a type (`name: 1;`), and `name: N` written inside a string or template. They must all
// be the same number; two different ones read as none. A property whose value is not a number, such as a constant (`name: FORMAT`) or
// `{ name }`, is refused (`named`): the 定义处 of a JSON file is the literal it writes. Not read: comments, a type that is not one number
// (`name: number` describes what is read), and a version put together elsewhere (a spread object, a computed key). (VG-24, VG-41)
function fieldVersion(file, source, name) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const inText = new RegExp(`\\b${name}["']?\\s*:\\s*(\\d+)\\b`, "g");
  const numbers = new Set(), named = [];
  const visit = node => {
    const typed = ts.isPropertySignature(node) || ts.isPropertyDeclaration(node);
    const key = (typed || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
      && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : undefined;
    if (key === name && typed) {
      if (node.type && ts.isLiteralTypeNode(node.type) && ts.isNumericLiteral(node.type.literal)) numbers.add(node.type.literal.text);
    } else if (key === name) {
      let value = ts.isPropertyAssignment(node) ? node.initializer : node.name;
      while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
      if (ts.isNumericLiteral(value)) numbers.add(value.text);
      else named.push(value.getText(tree));
    } else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      for (const match of node.text.matchAll(inText)) numbers.add(match[1]);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (named.length) return { named: named[0] };
  return numbers.size === 1 ? [...numbers][0] : null;
}

// What the code says about one table row: its version; null when the declared definition cannot be found; `{ named }` for a JSON
// file's field written from a name instead of a number.
function codeVersion(file, source, name) {
  if (name === "PRAGMA user_version") return source.match(/PRAGMA user_version = (\d+)/)?.[1] ?? null;
  if (VERSION_FIELD.test(name)) return fieldVersion(file, source, name);
  return baselineVersion(source, name) ?? source.match(new RegExp(`\\bconst\\s+${escapeRegExp(name)}\\s*=\\s*"?(\\d+)"?\\s*;`))?.[1] ?? null;
}

// A package's own source: .ts, .js, .mts and .mjs under src/. A baseline is a server-side declaration, so .tsx and .cjs are not read.
const sourceFiles = directory => walkFiles(root, [`${directory}/src`], file => /\.m?[tj]s$/.test(file));

// Each baseline in package sources is a database the table has to list, as `file#NAME`.
function declaredBaselines(directories) {
  const found = [];
  for (const directory of directories) {
    for (const file of sourceFiles(directory)) {
      for (const name of baselineNames(inspectSource(file, readFileSync(path.join(root, file), "utf8")))) found.push(`${file}#${name}`);
    }
  }
  return found;
}

// The arguments of the call whose "(" is at `open`, split at top-level commas; strings, template literals and comments are skipped.
function callArguments(text, open) {
  const args = [];
  let depth = 0, start = open + 1;
  for (let index = open; index < text.length; index++) {
    const skipped = skipLiteral(text, index);
    if (skipped !== index) { index = skipped - 1; continue; }
    const char = text[index];
    if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) {
      depth--;
      if (depth === 0) { args.push(text.slice(start, index).trim()); return args; }
    } else if (char === "," && depth === 1) { args.push(text.slice(start, index).trim()); start = index + 1; }
  }
  return args;
}

// A baseline handed to `applySqliteBaseline(db, path, baseline)` or `openBaselineHomeSqlite(home, name, baseline)` has to be a
// named, declared constant. An inline object or a name no package declares is a database the table cannot list. The file that
// defines the two functions is exempt: it only passes its own parameter on. The two aggregate copy openers take one the same way
// (design §2.5), and their file is exempt for the same reason. `runSqliteUpgrade(db, path, baseline)` forwards what a store's
// descriptor carries (specs/upgrade-continuity/upgrade-chain-design.md §2.3), so there, and only there, a property is fine too.
function checkBaselineCalls(directories, declaredNames) {
  for (const directory of directories) {
    for (const file of sourceFiles(directory)) {
      if (file === "packages/storage/src/sqlite-baseline.ts" || file === "packages/storage/src/aggregate-copy-store.ts") continue;
      const text = readFileSync(path.join(root, file), "utf8");
      for (const match of text.matchAll(/(?<!function\s)\b(applySqliteBaseline|openBaselineHomeSqlite|runSqliteUpgrade|openOwnerCopyStore|openAggregateCopyOwner)\s*\(/g)) {
        const args = callArguments(text, match.index + match[0].length - 1);
        const baseline = args[2];
        // This one typed connection bridge forwards the trusted declaration for the Host client and the SQL worker, and the
        // project of a library partitioned by project (specs/archive/plugin-project-partition), which is not a baseline. Its declarations are counted above;
        // no other file, inline argument, or different call in this file is exempt from named-baseline checks.
        if (file === "apps/local-host/src/plugin-database.ts" && match[1] === "openBaselineHomeSqlite"
          && args.join(",") === "home,declaration.store_name,declaration,partition?.project_id"
          && /function openPluginDatabaseConnection\(home: string, declaration: PluginDatabaseDeclaration,/.test(text)) continue;
        const unnamed = `declare the baseline as a named constant so the 各库版本表 can list it`;
        if (baseline === undefined) problem(`${file}: ${match[1]} is called without a baseline`);
        else if (match[1] === "runSqliteUpgrade" && /^\w+(?:\.\w+)+$/.test(baseline)) continue;
        else if (!/^\w+$/.test(baseline)) problem(`${file}: ${match[1]} is called with an inline baseline; ${unnamed}`);
        else if (!declaredNames.has(baseline)) problem(`${file}: ${match[1]} is called with ${baseline}, which no package declares as a SqliteBaseline; ${unnamed}`);
      }
    }
  }
}

function checkDatabaseTable(directories) {
  const text = readNeeded(CHECKLIST);
  if (text === null) return 0;
  const rows = tableRows(text);
  if (rows.length === 0) { problem(`${CHECKLIST}: the 各库版本表 has no rows`); return 0; }
  const listed = new Set();
  for (const row of rows) {
    const where = `${CHECKLIST}: ${row.store}`;
    if (!row.file || !row.name || !/^\d+$/.test(row.version ?? "")) { problem(`${where}: needs a whole number in 版本 and \`path#NAME\` in 定义处`); continue; }
    const source = readOptional(row.file);
    if (source === null) { problem(`${where}: ${row.file} does not exist`); continue; }
    listed.add(`${row.file}#${row.name}`);
    const actual = codeVersion(row.file, source, row.name);
    if (actual?.named) problem(`${where}: ${row.file} writes ${row.name}: ${actual.named}; write the number itself at every ${row.name} (定义处写字面量)`);
    else if (actual === null) problem(`${where}: ${row.file} has no ${row.name} with a version`);
    else if (actual !== row.version) problem(`${where}: the table says ${row.version}, the code (${row.file}#${row.name}) says ${actual}`);
  }
  const baselines = declaredBaselines(directories);
  for (const definition of baselines) {
    if (!listed.has(definition)) problem(`${CHECKLIST}: ${definition} is a SqliteBaseline the 各库版本表 does not list`);
  }
  checkBaselineCalls(directories, new Set(baselines.map(definition => definition.split("#")[1])));
  return rows.length;
}

// ---- run ------------------------------------------------------------------------------------------------------------
const version = checkProductVersion();
const directories = workspaceDirectories();
checkWorkspacePackages(directories);
if (version !== null) { checkBuiltinVersions(directories, version); checkReleaseFiles(version); }
const stores = checkDatabaseTable(directories);

if (problems.length > 0) {
  console.error(`Molis Work release versions are inconsistent (docs/releases/POLICY.md):\n${problems.map(item => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Molis Work release version sources agree: ${version}`);
console.log(`${directories.length} workspace packages are private 0.0.0; ${stores} stores in the ${CHECKLIST} database table match the code`);
