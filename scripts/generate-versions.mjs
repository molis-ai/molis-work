#!/usr/bin/env node
// tooling/versions.json is the one hand-edited source of first-party versions. This script copies each value to where it is
// consumed: code says `/* @version <key> */ 1` next to the literal, and `carriers` give a regex for every other file. It only
// generates: new declarations that bypass the source are scripts/gates/version-declarations.mjs's business, not this build step's.
//
//   node scripts/generate-versions.mjs --write | --check [--root <dir>]
//
// Everything is computed in memory and checked first, so a failure writes nothing.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isMainScript } from "./script-paths.mjs";
import { ANY_MARKER, isQuotedMarker, MARKED_LITERAL, readSourceFiles, REPOSITORY, versionSource } from "./version-source.mjs";

const quoted = (text, original) => original.startsWith("'") ? `'${text.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'` : JSON.stringify(text);

/** What is wrong with a carrier's one match, whose value it would replace. A carrier changes the one line it declares; in Markdown that line is in the frontmatter. */
function carrierMatchProblem(file, source, [whole, prefix, suffix], index) {
  if (whole.slice(prefix.length, whole.length - suffix.length).includes("\n")) return "replaces more than one line";
  const frontmatter = /^---\n[\s\S]*?\n---/.exec(source)?.[0].length ?? 0;
  return file.endsWith(".md") && index >= frontmatter ? "matches the body, not the frontmatter" : null;
}

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
    const output = source.replace(MARKED_LITERAL, (match, marker, key, written, original, offset) => {
      bound++;
      // A marker quoted in a comment declares nothing: it does not use the entry, and it is left as it was written.
      if (isQuotedMarker(file, source, offset)) return match;
      if (!Object.hasOwn(versions, key)) { problems.push(`${file}: unknown version key ${key}`); return match; }
      used.add(key);
      const template = written && JSON.parse(written);
      if (template && !template.includes("{version}")) { problems.push(`${file}: the template of ${key} has no {version}`); return match; }
      if (template?.includes("*")) { problems.push(`${file}: the template of ${key} contains *, which can end the comment it sits in`); return match; }
      const value = template ? template.replaceAll("{version}", String(versions[key])) : versions[key];
      return marker + (typeof value === "string" ? quoted(value, original) : String(value));
    });
    if ((source.match(ANY_MARKER) ?? []).length !== bound) problems.push(`${file}: a @version marker is not directly before a literal`);
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
    else if (matches.length > 1) problems.push(`${file}: carrier for ${key} matches ${matches.length} places; it has to name one`);
    else {
      const problem = carrierMatchProblem(file, source, matches[0], matches[0].index);
      if (problem) { problems.push(`${file}: carrier for ${key} ${problem}`); continue; }
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
export function generateVersions({ root = REPOSITORY, write = false } = {}) {
  const source = versionSource(root), { outputs, problems } = computeVersions(source, readVersionInputs(root, source));
  if (problems.length) throw new Error(problems.join("\n"));
  if (write) for (const [file, output] of outputs) writeFileSync(path.join(root, file), output);
  return [...outputs.keys()];
}

if (isMainScript(import.meta.url)) {
  const args = process.argv.slice(2), write = args.includes("--write"), check = args.includes("--check");
  const rootAt = args.indexOf("--root"), root = rootAt >= 0 ? path.resolve(args[rootAt + 1] ?? ".") : REPOSITORY;
  if (write === check || args.length !== (rootAt >= 0 ? 3 : 1)) throw new Error("usage: node scripts/generate-versions.mjs --write|--check [--root <dir>]");
  const changed = generateVersions({ root, write });
  if (changed.length && !write) { console.error(`Stale version outputs (run pnpm versions:generate):\n${changed.join("\n")}`); process.exitCode = 1; }
  else console.log(changed.length ? `Generated:\n${changed.join("\n")}` : "First-party version outputs match tooling/versions.json.");
}
