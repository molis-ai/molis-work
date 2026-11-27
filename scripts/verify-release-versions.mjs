#!/usr/bin/env node
// Release version consistency (docs/releases/POLICY.md). Every first-party version lives in tooling/versions.json: everything
// that carries one must agree, no declaration may bypass it (scripts/gates/version-declarations.mjs), the workspace packages
// stay private 0.0.0, built-in plugin manifests match the product version, and the current version has release notes and a CHANGELOG section.
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
import { generateVersions } from "./generate-versions.mjs";
import { versionDeclarationProblems } from "./gates/version-declarations.mjs";
import { withoutMarkers } from "./version-source.mjs";

const USAGE = "usage: verify-release-versions.mjs [--root <dir>] [--tag <vX.Y.Z>]";
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
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

// ---- run ------------------------------------------------------------------------------------------------------------
const version = checkProductVersion();
const directories = workspaceDirectories();
checkWorkspacePackages(directories);
if (version !== null) { checkBuiltinVersions(directories, version); checkReleaseFiles(version); }

if (problems.length > 0) {
  console.error(`Molis Work release versions are inconsistent (docs/releases/POLICY.md):\n${problems.map(item => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Molis Work release version sources agree: ${version}`);
console.log(`${directories.length} workspace packages are private 0.0.0`);
