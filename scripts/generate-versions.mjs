#!/usr/bin/env node
// tooling/versions.json is the one hand-edited source of first-party versions. This script copies each value to where it is
// consumed: code says `/* @version <key> */ 1` next to the literal, and `carriers` give a regex for every other file. It only
// generates: new declarations that bypass the source are scripts/gates/version-declarations.mjs's business, not this build step's.
//
//   node scripts/generate-versions.mjs --write | --check [--root <dir>]
//
// Everything is computed in memory and checked first, so a failure writes nothing.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LITERAL = String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?`;
const MARKED = new RegExp(String.raw`(/\* @version ([\w./-]+)(?: ("(?:[^"\\]|\\.)*"))? \*/\s*)(${LITERAL})`, "g");
const MARKER = /\/\* @version [^*]*\*\//g;
const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "target", ".git", ".build"]);
export const SOURCE_ROOTS = ["apps", "packages", "plugins", "modules", "horizontal", "server", "tooling/plugin-cli"];

/** Real tests and their fixtures hold frozen inputs, not current declarations. `src/fixtures/` ships, so it is not one of them. */
export function isTestFile(file) {
  return /(?:^|\/)tests?\//.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || /(?:^|\/)test\.[cm]?[jt]sx?$/.test(file)
    || (/(?:^|\/)fixtures\//.test(file) && !/\/src\/(?:.*\/)?fixtures\//.test(file));
}

export const versionSource = (root = ROOT) => JSON.parse(readFileSync(path.join(root, "tooling/versions.json"), "utf8"));

/** Every first-party code file (relative path, text). */
export function readSourceFiles(root = ROOT) {
  const files = new Map();
  const walk = directory => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (!SKIPPED_DIRECTORIES.has(entry.name)) walk(relative); }
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !isTestFile(relative)) files.set(relative, readFileSync(path.join(root, relative), "utf8"));
    }
  };
  for (const directory of SOURCE_ROOTS) if (existsSync(path.join(root, directory))) walk(directory);
  return files;
}

const quoted = (text, original) => original.startsWith("'") ? `'${text.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'` : JSON.stringify(text);

/**
 * What the source says every file should be. Pure: `files` maps a path to its text and must include the carrier files.
 * Returns the files whose text would change, the keys in use, and every problem found.
 */
export function computeVersions({ versions, carriers = [], ...extra }, files) {
  const problems = Object.keys(extra).map(field => `tooling/versions.json: unknown field ${field}`);
  const outputs = new Map(), used = new Set();
  for (const [key, value] of Object.entries(versions)) {
    if (!/^[a-zA-Z0-9][\w./-]+$/.test(key)) problems.push(`tooling/versions.json: invalid key ${key}`);
    if (!(Number.isSafeInteger(value) && value >= 0) && !(typeof value === "string" && value.length)) problems.push(`tooling/versions.json: ${key} is not a version`);
  }
  for (const [file, source] of files) {
    let bound = 0;
    const output = source.replace(MARKED, (match, marker, key, pattern, original) => {
      bound++;
      if (!Object.hasOwn(versions, key)) { problems.push(`${file}: unknown version key ${key}`); return match; }
      used.add(key);
      const value = pattern ? JSON.parse(pattern).replaceAll("{version}", String(versions[key])) : versions[key];
      return marker + (typeof value === "string" ? quoted(value, original) : String(value));
    });
    if ((source.match(MARKER) ?? []).length !== bound) problems.push(`${file}: a @version marker is not directly before a literal`);
    if (output !== source) outputs.set(file, output);
  }
  for (const { file, key, pattern } of carriers) {
    if (!Object.hasOwn(versions, key)) { problems.push(`${file}: unknown version key ${key}`); continue; }
    used.add(key);
    const source = outputs.get(file) ?? files.get(file);
    if (source === undefined) { problems.push(`${file}: carrier file is missing`); continue; }
    const regex = new RegExp(pattern, "gm"), matches = [...source.matchAll(regex)];
    if (!matches.length) problems.push(`${file}: carrier for ${key} matches nothing`);
    else if (matches.some(match => match.length !== 3)) problems.push(`${file}: carrier for ${key} needs exactly a prefix and a suffix capture`);
    else {
      const output = source.replace(regex, (_match, prefix, suffix) => `${prefix}${versions[key]}${suffix}`);
      if (output === files.get(file)) outputs.delete(file); else outputs.set(file, output);
    }
  }
  for (const key of Object.keys(versions)) if (!used.has(key)) problems.push(`tooling/versions.json: nothing uses ${key}`);
  return { outputs, used, problems };
}

/** What {@link computeVersions} needs for this tree: the code files and whatever the carriers name. */
export function readVersionInputs(root, source) {
  const files = readSourceFiles(root);
  for (const { file } of source.carriers ?? []) {
    const location = path.resolve(root, file);
    if (!location.startsWith(path.resolve(root) + path.sep)) throw new Error(`Version output outside repository: ${file}`);
    if (!files.has(file) && existsSync(location)) files.set(file, readFileSync(location, "utf8"));
  }
  return files;
}

/** Reads the tree, computes, and only when everything checks out writes. Returns the files that differ; throws on any problem. */
export function generateVersions({ root = ROOT, write = false } = {}) {
  const source = versionSource(root), { outputs, problems } = computeVersions(source, readVersionInputs(root, source));
  if (problems.length) throw new Error(problems.join("\n"));
  if (write) for (const [file, output] of outputs) writeFileSync(path.join(root, file), output);
  return [...outputs.keys()];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), write = args.includes("--write"), check = args.includes("--check");
  const rootAt = args.indexOf("--root"), root = rootAt >= 0 ? path.resolve(args[rootAt + 1] ?? ".") : ROOT;
  if (write === check || args.length !== (rootAt >= 0 ? 3 : 1)) throw new Error("usage: node scripts/generate-versions.mjs --write|--check [--root <dir>]");
  const changed = generateVersions({ root, write });
  if (changed.length && !write) { console.error(`Stale version outputs (run pnpm versions:generate):\n${changed.join("\n")}`); process.exitCode = 1; }
  else console.log(changed.length ? `Generated:\n${changed.join("\n")}` : "First-party version outputs match tooling/versions.json.");
}
