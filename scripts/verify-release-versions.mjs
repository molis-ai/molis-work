#!/usr/bin/env node
// Release version consistency (docs/releases/POLICY.md). One product version lives in the root package.json; everything
// that carries it must agree, the workspace packages stay private 0.0.0, the current version has release notes and a
// CHANGELOG section, and the per-database version table in docs/releases/CHECKLIST.md is the one the code has.
//
//   node scripts/verify-release-versions.mjs [--root <dir>] [--tag <vX.Y.Z>]
//
//   --root <dir>   check another repository root (tests/verify-release-versions.test.ts builds scratch roots)
//   --tag <tag>    also require the tag to be v<product version> (release-macos.yml passes the pushed tag)
// Exit codes: 0 consistent, 1 something disagrees (every finding is listed), 2 the command line is unusable.
// It only reads files: no build, no git.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = "usage: verify-release-versions.mjs [--root <dir>] [--tag <vX.Y.Z>]";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CHECKLIST = "docs/releases/CHECKLIST.md";
const CHANGELOG = "docs/releases/CHANGELOG.md";

// Everything besides the root package.json that must carry exactly the product version. The two strings in code are the
// User-Agent/app version Feed sends and the client version the Codex session browser announces.
const CARRIERS = [
  { file: "apps/desktop/src-tauri/tauri.conf.json", label: "apps/desktop/src-tauri/tauri.conf.json", pick: text => JSON.parse(text).version },
  { file: "apps/desktop/src-tauri/Cargo.toml", label: "apps/desktop/src-tauri/Cargo.toml", pick: text => text.match(/^\[package\][^[]*?^version = "([^"]+)"$/ms)?.[1] },
  { file: "apps/desktop/src-tauri/Cargo.lock", label: "apps/desktop/src-tauri/Cargo.lock#molis-work-desktop", pick: text => text.match(/\[\[package\]\]\nname = "molis-work-desktop"\nversion = "([^"]+)"/)?.[1] },
  { file: "apps/local-host/src/feed-source-runtime.ts", label: "apps/local-host/src/feed-source-runtime.ts#APP_VERSION", pick: text => text.match(/^const APP_VERSION = "([^"]+)";$/m)?.[1] },
  { file: "horizontal/runtime-host/src/adapters/codex-app-server.ts", label: "horizontal/runtime-host/src/adapters/codex-app-server.ts#clientInfo.version", pick: text => text.match(/clientInfo: \{ name: "molis-work-session-browser", title: "Molis Work", version: "([^"]+)" \}/)?.[1] },
];

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
const readOptional = file => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : null;
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
  for (const carrier of CARRIERS) {
    const text = readNeeded(carrier.file);
    if (text === null) continue;
    let found;
    try { found = carrier.pick(text); } catch { found = undefined; }
    if (found !== version) problem(`${carrier.label}: ${found ?? "no version found"}, but package.json is ${version}`);
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

function checkReleaseFiles(version) {
  if (readOptional(`docs/releases/v${version}.md`) === null) problem(`docs/releases/v${version}.md: release notes for ${version} are missing`);
  const changelog = readNeeded(CHANGELOG);
  if (changelog === null) return;
  const sections = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map(match => match[1]);
  if (sections[0] !== "Unreleased") problem(`${CHANGELOG}: the first section must be [Unreleased], found ${sections[0] ? `[${sections[0]}]` : "none"}`);
  if (!sections.includes(version)) problem(`${CHANGELOG}: no [${version}] section`);
}

// ---- the per-database version table ---------------------------------------------------------------------------------
// Rows of the table under the heading "各库版本表" (numbered or not) in the checklist, found by their column names: 版本 is a number (or 无
// for a database that carries none) and 定义处 is `path#NAME` (or just `path` for the databases without a version).
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
// What the code says about one table row: its version, "无" when the file carries no version marker at all, or null when
// the declared definition cannot be found.
function codeVersion(source, name) {
  if (name === undefined) return /SqliteBaseline|user_version|schema_version/.test(source) ? null : "无";
  const patterns = name === "PRAGMA user_version" ? [/PRAGMA user_version = (\d+)/]
    : [new RegExp(`\\b${escapeRegExp(name)}\\s*:\\s*SqliteBaseline\\s*=\\s*\\{\\s*version:\\s*(\\d+)`),
       new RegExp(`\\bconst\\s+${escapeRegExp(name)}\\s*=\\s*"?(\\d+)"?\\s*;`)];
  for (const pattern of patterns) { const found = source.match(pattern)?.[1]; if (found !== undefined) return found; }
  return null;
}

function sourceFiles(directory) {
  const files = [];
  const walk = relative => {
    if (!existsSync(path.join(root, relative))) return;
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== "dist") walk(`${relative}/${entry.name}`); }
      else if (/\.m?[tj]s$/.test(entry.name)) files.push(`${relative}/${entry.name}`);
    }
  };
  walk(`${directory}/src`);
  return files;
}

// Every `const NAME: SqliteBaseline = …` in package sources is a database the table has to list.
function declaredBaselines(directories) {
  const found = [];
  for (const directory of directories) {
    for (const file of sourceFiles(directory)) {
      const text = readFileSync(path.join(root, file), "utf8");
      if (!text.includes("SqliteBaseline")) continue;
      for (const match of text.matchAll(/\bconst\s+(\w+)\s*:\s*SqliteBaseline\s*=/g)) found.push(`${file}#${match[1]}`);
    }
  }
  return found;
}

function checkDatabaseTable(directories) {
  const text = readNeeded(CHECKLIST);
  if (text === null) return 0;
  const rows = tableRows(text);
  if (rows.length === 0) { problem(`${CHECKLIST}: the 各库版本表 has no rows`); return 0; }
  const listed = new Set();
  for (const row of rows) {
    const where = `${CHECKLIST}: ${row.store}`;
    if (!row.file || !/^(\d+|无)$/.test(row.version ?? "")) { problem(`${where}: needs a number or 无 in 版本 and a file in 定义处`); continue; }
    const source = readOptional(row.file);
    if (source === null) { problem(`${where}: ${row.file} does not exist`); continue; }
    listed.add(row.name === undefined ? row.file : `${row.file}#${row.name}`);
    const actual = codeVersion(source, row.name);
    if (actual === null) problem(`${where}: ${row.name ? `${row.file} has no ${row.name} with a version` : `${row.file} now carries a version marker; give the table a number`}`);
    else if (actual !== row.version) problem(`${where}: the table says ${row.version}, the code (${row.file}${row.name ? `#${row.name}` : ""}) says ${actual}`);
  }
  for (const definition of declaredBaselines(directories)) {
    if (!listed.has(definition)) problem(`${CHECKLIST}: ${definition} is a SqliteBaseline the 各库版本表 does not list`);
  }
  return rows.length;
}

// ---- run ------------------------------------------------------------------------------------------------------------
const version = checkProductVersion();
const directories = workspaceDirectories();
checkWorkspacePackages(directories);
if (version !== null) checkReleaseFiles(version);
const stores = checkDatabaseTable(directories);

if (problems.length > 0) {
  console.error(`Molis Work release versions are inconsistent (docs/releases/POLICY.md):\n${problems.map(item => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Molis Work release version sources agree: ${version}`);
console.log(`${directories.length} workspace packages are private 0.0.0; ${stores} stores in the ${CHECKLIST} database table match the code`);
