#!/usr/bin/env node
// Batch 100-2 (Decision 58): incremental zeroing ratchet for `tests/` TypeScript diagnostics.
// Runs `tsc --noEmit --pretty false -p tooling/types/tsconfig.tests.json`, counts errors per file,
// and ensures no existing file gains errors, no new test file introduces errors, and the committed
// baseline (`tooling/gates/test-typecheck-baseline.json`) only gets tighter against the merge-base.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { isMainScript } from "../script-paths.mjs";

export const BASELINE_FILE = "tooling/gates/test-typecheck-baseline.json";
export const TSCONFIG_FILE = "tooling/types/tsconfig.tests.json";

const DIAGNOSTIC_LINE = /^(.+?)\(\d+,\d+\): error (TS\d+):/;

export function parseTscDiagnostics(output, root = "") {
  const counts = {};
  let total = 0;
  const normalizedRoot = root ? path.resolve(root).replaceAll("\\", "/").replace(/\/$/, "") + "/" : "";
  for (const rawLine of String(output).split(/\r?\n/)) {
    const match = DIAGNOSTIC_LINE.exec(rawLine);
    if (!match) continue;
    let file = match[1].replaceAll("\\", "/").replace(/^\.\//, "");
    if (normalizedRoot && file.startsWith(normalizedRoot)) file = file.slice(normalizedRoot.length);
    counts[file] = (counts[file] ?? 0) + 1;
    total++;
  }
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  return { total, files: sorted };
}

export function parseBaseline(text, where = BASELINE_FILE) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error(`${where}: invalid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.files || typeof parsed.files !== "object" || Array.isArray(parsed.files)) {
    throw new Error(`${where}: expected { "files": { "<path>": <positive int> } }`);
  }
  const files = {};
  for (const [file, count] of Object.entries(parsed.files)) {
    if (typeof file !== "string" || !file || !Number.isInteger(count) || count < 0) {
      throw new Error(`${where}: invalid count for "${file}"`);
    }
    if (count > 0) files[file] = count;
  }
  return { total: Object.values(files).reduce((sum, n) => sum + n, 0), files };
}

export function baselineLooseningProblems(headBaseline, baseBaseline, renames = new Map()) {
  if (!baseBaseline) return [];
  const before = {};
  for (const [file, count] of Object.entries(baseBaseline.files)) {
    const renamed = renames.get(file) ?? file;
    before[renamed] = Math.max(before[renamed] ?? 0, count);
  }
  const errors = [];
  for (const [file, count] of Object.entries(headBaseline.files)) {
    const was = before[file] ?? 0;
    if (count > was) {
      errors.push(`${BASELINE_FILE}: allowed TS errors for ${file} raised ${was} → ${count}; baseline may only shrink`);
    }
  }
  return errors;
}

export function testTypecheckProblems(measured, headBaseline, baseBaseline = null, renames = new Map()) {
  const errors = [...baselineLooseningProblems(headBaseline, baseBaseline, renames)];
  for (const [file, count] of Object.entries(measured.files)) {
    const allowed = headBaseline.files[file] ?? 0;
    if (count > allowed) {
      errors.push(`${file}: TypeScript errors grew ${allowed} → ${count} (new test files start at 0; fix the type errors instead of growing the baseline)`);
    }
  }
  return errors;
}

const tscBin = () => path.join(path.dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin/tsc");

export function runTestsTypecheck(root) {
  const tsconfigPath = path.join(root, TSCONFIG_FILE);
  if (!existsSync(tsconfigPath)) throw new Error(`${TSCONFIG_FILE} is missing in ${root}`);
  const result = spawnSync(process.execPath, [tscBin(), "--noEmit", "--pretty", "false", "-p", tsconfigPath], {
    cwd: root, encoding: "utf8", maxBuffer: 64 << 20,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const measured = parseTscDiagnostics(output, root);
  if (result.status !== 0 && measured.total === 0) {
    throw new Error(`tsc failed with exit ${result.status} and no parsed diagnostics:\n${output.trim().slice(0, 600)}`);
  }
  return measured;
}

const git = (root, ...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 << 20 });

function readBaseContext(root, baseRef) {
  const target = git(root, "rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`).trim();
  const sha = git(root, "merge-base", "HEAD", target).trim();
  const present = git(root, "ls-tree", "--name-only", sha, "--", BASELINE_FILE).trim();
  const baseBaseline = present ? parseBaseline(git(root, "show", `${sha}:${BASELINE_FILE}`), `${sha.slice(0, 8)}:${BASELINE_FILE}`) : null;
  const renames = new Map();
  const fields = git(root, "diff", "-M", "-l", "5000", "--name-status", "--diff-filter=R", "-z", sha).split("\0");
  fields.forEach((field, index) => { if (/^R\d*$/.test(field)) renames.set(fields[index + 1], fields[index + 2]); });
  return { sha, baseBaseline, renames };
}

function main() {
  const args = process.argv.slice(2);
  const options = {}, flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const [name, inline] = args[i].split(/=(.*)/s);
    if (["--report", "--json", "--update"].includes(name)) flags.add(name);
    else if (["--base", "--root", "--top"].includes(name)) {
      const value = inline ?? args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
      options[name.slice(2)] = value;
    } else throw new Error(`unknown argument ${args[i]}`);
  }
  if (flags.has("--json") && !flags.has("--report")) throw new Error("--json goes with --report");
  const root = options.root ? path.resolve(options.root) : path.resolve(import.meta.dirname, "../..");
  const baselinePath = path.join(root, BASELINE_FILE);
  const measured = runTestsTypecheck(root);

  if (flags.has("--report")) {
    if (flags.has("--json")) {
      console.log(JSON.stringify(measured, null, 2));
      return;
    }
    const top = options.top ? Number(options.top) : 20;
    const rows = Object.entries(measured.files).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    console.log(`Test TypeScript errors: ${measured.total} across ${rows.length} files`);
    for (const [file, count] of rows.slice(0, top)) console.log(`${String(count).padStart(5)}  ${file}`);
    if (rows.length > top) console.log(`  … ${rows.length - top} more`);
    return;
  }

  let sha = "", baseBaseline = null, renames = new Map();
  if (options.base) ({ sha, baseBaseline, renames } = readBaseContext(root, options.base));

  if (flags.has("--update")) {
    const next = {
      note: "Per-file TypeScript diagnostic ceiling for tooling/types/tsconfig.tests.json (Batch 100-2). May only shrink; update with `node scripts/gates/test-typecheck.mjs --update --base origin/main`.",
      total: measured.total,
      files: measured.files,
    };
    const nextParsed = { total: measured.total, files: measured.files };
    const errors = baselineLooseningProblems(nextParsed, baseBaseline, renames);
    if (errors.length) {
      console.error(`Baseline not updated:\n- ${errors.join("\n- ")}`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n");
    console.log(`Updated ${BASELINE_FILE}: ${measured.total} errors across ${Object.keys(measured.files).length} files`);
    return;
  }

  if (!existsSync(baselinePath)) throw new Error(`${BASELINE_FILE} is missing; create it with --update`);
  const headBaseline = parseBaseline(readFileSync(baselinePath, "utf8"), BASELINE_FILE);
  const errors = testTypecheckProblems(measured, headBaseline, baseBaseline, renames);
  if (errors.length) {
    console.error(`Test typecheck gate failed${sha ? ` (base ${sha.slice(0, 8)})` : ""}:\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  const reduced = headBaseline.total - measured.total;
  const note = reduced > 0 ? ` (${reduced} fewer than baseline; run \`node scripts/gates/test-typecheck.mjs --update\` to ratchet down)` : "";
  console.log(`Test typecheck gate passed: ${measured.total} errors across ${Object.keys(measured.files).length} files (baseline ${headBaseline.total})${note}`);
}

if (isMainScript(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
}
