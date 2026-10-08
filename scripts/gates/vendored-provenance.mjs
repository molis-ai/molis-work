// Health gate: every vendored package archive tells where it came from, and what the record says is what the files are
// (specs/repository-anti-corruption §1, decision 2026-10-08 "Prologue SDK 收敛与私有包"; plan:
// specs/repository-anti-corruption/dependencies-and-sdk-plan.md §4.4 step 1, §4.5; the folder's rules are
// vendor/prologue-sdk/README.md).
//
// The counts the other health gates keep only ever fall; this one is an invariant of the working tree, like the status line
// of a spec, so it is plugged into the `absolute` problems of scripts/check-health-gates.mjs and needs no baseline. Rules:
//
//   1. Every `vendor/**/*.tgz` has `<file>.sha256` ("<sha256>  <file name>") and `<file>.provenance.json` beside it.
//   2. The `.sha256` equals the SHA-256 of the archive; the provenance's `artifact` (file, bytes, sha256, integrity) equals
//      the archive; `source.commit` is a full 40-character commit and `source.dirty` is false (a package built from a dirty
//      tree cannot be rebuilt from its record).
//   3. A `.sha256` or `.provenance.json` whose archive is gone is left behind: the package was replaced, so its records go
//      with it (the folder keeps only the current package, AGENTS.md).
//   4. If a provenance names `alsoBuildableFrom.patch`, that patch file is in the folder and has the recorded size and
//      SHA-256. Dropping the patch means dropping the sentence in the same change.
//   5. `vendor/prologue-sdk/patch-history.json`, the record of the patches deleted from that folder, is well formed: schema,
//      per patch the bytes, SHA-256, git blob, base, commit, source kind and the package it made, per tgz-less package the
//      same, every commit it names listed in `upstream.commitsChecked`; and none of the recorded patches is back in the folder.
//
// What it does not read (docs/system/REPOSITORY-HYGIENE.md says the same): the numbers in `patch-history.json`. Rule 5 checks
// their shape, not that they are true: it does not fetch a `gitBlob` from Git to recompute the bytes and SHA-256, and it does
// not ask the upstream whether a commit exists. The numbers were checked once, when the record was written (2026-10-08); to
// check them again, use the commands in vendor/prologue-sdk/README.md. Likewise `source.commit` in a provenance file is
// checked for shape only. `retrieval.commitWithAllPatches` is a commit that is known to hold every recorded patch, not the
// last one that does; whether it is reachable is not checked either.
//
// Every check above is a `problems.push` in this file, and tests/vendor-provenance.test.ts has a case for each of them. That
// was verified on a scratch copy by removing each `problems.push` and swapping each `&&`, `||`, `===`, `!==` for its opposite,
// one change at a time: all 92 changes turn a case red. Repeat it after changing this file.
//
// Pure functions of a directory tree (Node built-ins only), so the gate runs before any dependency is installed.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;
const SOURCE_KINDS = ["upstream-commit", "uncommitted-worktree", "molis-repo"];
const PATCH_HISTORY = "vendor/prologue-sdk/patch-history.json";
const PATCH_HISTORY_SCHEMA = "prologue-sdk-patch-history-v1";

const tgzFiles = (directory, relative = "vendor") => {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...tgzFiles(path.join(directory, entry.name), child));
    else if (entry.name.endsWith(".tgz")) found.push(child);
  }
  return found.sort();
};

const sidecarsWithoutArchive = (directory, relative = "vendor") => {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) found.push(...sidecarsWithoutArchive(path.join(directory, entry.name), child));
    else {
      const archive = entry.name.replace(/\.(?:sha256|provenance\.json)$/, "");
      if (archive !== entry.name && archive.endsWith(".tgz") && !existsSync(path.join(directory, archive))) found.push(child);
    }
  }
  return found.sort();
};

const readJson = (file, label, problems) => {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch (error) {
    problems.push(`${label}: not readable JSON (${error instanceof Error ? error.message : String(error)})`);
    return undefined;
  }
};

const digest = (algorithm, buffer, encoding) => createHash(algorithm).update(buffer).digest(encoding);
const isCount = (value) => Number.isInteger(value) && value > 0;
const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

function archiveProblems(root, archive) {
  const problems = [];
  const file = path.join(root, archive);
  const bytes = readFileSync(file);
  const sha256 = digest("sha256", bytes, "hex");
  const base = path.basename(archive);

  const sumFile = `${file}.sha256`;
  if (!existsSync(sumFile)) problems.push(`${archive}: no ${base}.sha256 beside it`);
  else {
    const text = readFileSync(sumFile, "utf8").trim();
    if (text !== `${sha256}  ${base}`) problems.push(`${archive}.sha256 says "${text}", but the archive is ${sha256}  ${base}`);
  }

  const provenanceFile = `${file}.provenance.json`;
  if (!existsSync(provenanceFile)) { problems.push(`${archive}: no ${base}.provenance.json beside it`); return problems; }
  const label = `${archive}.provenance.json`;
  const provenance = readJson(provenanceFile, label, problems);
  if (provenance === undefined) return problems;
  const { artifact, source } = isObject(provenance) ? provenance : {};
  if (!isObject(artifact)) problems.push(`${label}: no "artifact" object`);
  else {
    if (artifact.file !== base) problems.push(`${label}: artifact.file is ${JSON.stringify(artifact.file)}, the archive is ${base}`);
    if (artifact.bytes !== bytes.length) problems.push(`${label}: artifact.bytes is ${artifact.bytes}, the archive has ${bytes.length}`);
    if (artifact.sha256 !== sha256) problems.push(`${label}: artifact.sha256 is ${artifact.sha256}, the archive is ${sha256}`);
    const integrity = `sha512-${digest("sha512", bytes, "base64")}`;
    if (artifact.integrity !== integrity) problems.push(`${label}: artifact.integrity does not match the archive`);
  }
  if (!isObject(source)) problems.push(`${label}: no "source" object`);
  else {
    if (typeof source.commit !== "string" || !HEX40.test(source.commit)) problems.push(`${label}: source.commit must be a full 40-character commit`);
    if (source.dirty !== false) problems.push(`${label}: source.dirty must be false; a package built from a dirty tree cannot be rebuilt from its record`);
  }

  const patch = isObject(provenance.alsoBuildableFrom) ? provenance.alsoBuildableFrom.patch : undefined;
  if (patch !== undefined) {
    const patchFile = isObject(patch) && typeof patch.file === "string" ? path.join(path.dirname(file), path.basename(patch.file)) : "";
    if (!patchFile || !existsSync(patchFile)) problems.push(`${label}: alsoBuildableFrom.patch names ${JSON.stringify(isObject(patch) ? patch.file : patch)}, which is not in the folder; drop the sentence together with the patch`);
    else {
      const content = readFileSync(patchFile);
      if (patch.bytes !== content.length || patch.sha256 !== digest("sha256", content, "hex")) problems.push(`${label}: alsoBuildableFrom.patch ${patch.file} has other bytes or SHA-256 than the file`);
    }
  }
  return problems;
}

function patchHistoryProblems(root) {
  const problems = [];
  const file = path.join(root, PATCH_HISTORY);
  if (!existsSync(file)) return problems;
  const history = readJson(file, PATCH_HISTORY, problems);
  if (history === undefined) return problems;
  const at = (suffix) => `${PATCH_HISTORY}: ${suffix}`;
  if (!isObject(history)) return [at("must be an object")];
  if (history.schema !== PATCH_HISTORY_SCHEMA) problems.push(at(`schema must be ${PATCH_HISTORY_SCHEMA}`));
  if (!isObject(history.retrieval) || !HEX40.test(history.retrieval.commitWithAllPatches ?? "")) problems.push(at("retrieval.commitWithAllPatches must be a full 40-character commit"));
  const upstream = isObject(history.upstream) ? history.upstream : {};
  if (!HEX40.test(upstream.mainHead ?? "")) problems.push(at("upstream.mainHead must be a full 40-character commit"));
  const checked = Array.isArray(upstream.commitsChecked) ? upstream.commitsChecked : [];
  if (!checked.length || checked.some((commit) => typeof commit !== "string" || !HEX40.test(commit))) problems.push(at("upstream.commitsChecked must list full 40-character commits"));
  const needed = (commit, where) => { if (!checked.includes(commit)) problems.push(at(`${where} names ${commit}, which upstream.commitsChecked does not list`)); };

  const packageFiles = new Set();
  const packageRecord = (record, where) => {
    if (!isObject(record)) { problems.push(at(`${where} must be an object`)); return; }
    if (typeof record.file !== "string" || !record.file.endsWith(".tgz")) problems.push(at(`${where}.file must be a .tgz name`));
    else if (packageFiles.has(record.file)) problems.push(at(`${where}.file ${record.file} appears twice`));
    else packageFiles.add(record.file);
    if (!isCount(record.bytes)) problems.push(at(`${where}.bytes must be a positive integer`));
    if (!HEX64.test(record.sha256 ?? "")) problems.push(at(`${where}.sha256 must be 64 hex characters`));
    if (!HEX40.test(record.gitBlob ?? "")) problems.push(at(`${where}.gitBlob must be 40 hex characters`));
  };

  const patchFiles = new Set();
  if (!Array.isArray(history.patches) || !history.patches.length) problems.push(at("patches must be a non-empty list"));
  else history.patches.forEach((patch, index) => {
    const where = `patches[${index}]`;
    if (!isObject(patch)) { problems.push(at(`${where} must be an object`)); return; }
    if (typeof patch.file !== "string" || !/^[\w.-]+\.patch$/.test(patch.file)) problems.push(at(`${where}.file must be a .patch name`));
    else if (patchFiles.has(patch.file)) problems.push(at(`${where}.file ${patch.file} appears twice`));
    else {
      patchFiles.add(patch.file);
      if (existsSync(path.join(root, path.dirname(PATCH_HISTORY), patch.file))) problems.push(at(`${patch.file} is recorded as deleted but is back in vendor/prologue-sdk/`));
    }
    if (!isCount(patch.bytes)) problems.push(at(`${where}.bytes must be a positive integer`));
    if (!isCount(patch.diffEntries)) problems.push(at(`${where}.diffEntries must be a positive integer`));
    if (!HEX64.test(patch.sha256 ?? "")) problems.push(at(`${where}.sha256 must be 64 hex characters`));
    if (!HEX40.test(patch.gitBlob ?? "")) problems.push(at(`${where}.gitBlob must be 40 hex characters`));
    if (!HEX40.test(patch.base ?? "")) problems.push(at(`${where}.base must be a full 40-character commit`));
    else needed(patch.base, `${where}.base`);
    if (!SOURCE_KINDS.includes(patch.sourceKind)) problems.push(at(`${where}.sourceKind must be one of ${SOURCE_KINDS.join(", ")}`));
    if ((patch.sourceKind === "upstream-commit") !== (patch.commit !== null)) problems.push(at(`${where}.commit must be set exactly for the sourceKind upstream-commit`));
    if (patch.commit !== null) {
      if (!HEX40.test(patch.commit ?? "")) problems.push(at(`${where}.commit must be a full 40-character commit or null`));
      else needed(patch.commit, `${where}.commit`);
    }
    if (typeof patch.source !== "string" || !patch.source.trim()) problems.push(at(`${where}.source must say where the patch came from`));
    if (typeof patch.summary !== "string" || !patch.summary.trim()) problems.push(at(`${where}.summary must say what the patch did`));
    packageRecord(patch.package, `${where}.package`);
  });

  if (!Array.isArray(history.packagesWithoutPatch)) problems.push(at("packagesWithoutPatch must be a list"));
  else history.packagesWithoutPatch.forEach((record, index) => {
    const where = `packagesWithoutPatch[${index}]`;
    packageRecord(record, where);
    if (isObject(record)) {
      if (!HEX40.test(record.commit ?? "")) problems.push(at(`${where}.commit must be a full 40-character commit`));
      else needed(record.commit, `${where}.commit`);
      if (typeof record.description !== "string" || !record.description.trim()) problems.push(at(`${where}.description must say where the package came from`));
    }
  });
  return problems;
}

/** Problems with the vendored package records under `root`, as readable lines; an empty list means the records hold. */
export function vendoredProvenanceProblems(root) {
  const problems = [];
  for (const archive of tgzFiles(path.join(root, "vendor"))) problems.push(...archiveProblems(root, archive));
  for (const left of sidecarsWithoutArchive(path.join(root, "vendor"))) problems.push(`${left}: its archive is gone; a replaced package takes its records with it`);
  problems.push(...patchHistoryProblems(root));
  return problems;
}
