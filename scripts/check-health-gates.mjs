#!/usr/bin/env node
// Repository health gates (specs/repository-anti-corruption §5a): numbers that may only go down, including the
// anti-backflow count of compatibility markers per file (§4.1).
//
//   node scripts/check-health-gates.mjs                  measure the working tree and compare it with the committed
//                                                        tooling/gates/baseline.json (the quick local check)
//   node scripts/check-health-gates.mjs --base <ref>     measure the working tree AND the merge-base of HEAD and <ref>
//                                                        with this same script and compare the two. The committed
//                                                        baseline is not consulted, so rewriting it in a PR hides
//                                                        nothing. CI always runs this form.
//   --update                      rewrite baseline.json (with --base: only when nothing grew relative to the merge-base)
//   --report [--top N] [--json]   print the per-file and per-unit numbers (with --base: next to the merge-base's)
//   --root <dir>                  gate another repository root (tests/health-gates-merge-base.test.ts)
// Exit codes: 0 passed, 1 a gate failed, 2 the command or the environment is unusable (there is no silent fallback).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createTranslationMetric } from "./gates/translations.mjs";

const USAGE = "usage: check-health-gates.mjs [--base <ref>] [--update] [--report [--top N] [--json]] [--root <dir>]";
const fail = (message) => { console.error(message); process.exit(2); };

// ---- command line ---------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const options = {};
const flags = new Set();
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (["--update", "--report", "--json"].includes(name)) flags.add(name);
  else if (["--base", "--root", "--top"].includes(name)) {
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) fail(`${name} needs a value\n${USAGE}`);
    options[name.slice(2)] = value;
  } else fail(`unknown argument ${args[index]}\n${USAGE}`);
}
if (flags.has("--json") && !flags.has("--report")) fail(`--json goes with --report\n${USAGE}`);
if (options.top !== undefined && !(Number(options.top) > 0)) fail(`--top needs a positive number\n${USAGE}`);
const update = flags.has("--update"), report = flags.has("--report");
const root = options.root ? path.resolve(options.root) : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const baselinePath = path.join(root, "tooling/gates/baseline.json");
const limitsPath = path.join(root, "tooling/gates/limits.json");

const run = (gitArgs, extra = {}) => execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"], ...extra });
const git = (gitArgs, extra) => {
  try { return run(gitArgs, extra); } catch (error) { fail(`git ${gitArgs.join(" ")} failed in ${root}: ${String(error.stderr ?? error.message).trim()}`); }
};
const gitMaybe = (gitArgs) => { try { return run(gitArgs).trim(); } catch { return ""; } };

// ---- the thresholds (§4.5): they may be tightened, never loosened; --base compares them with the merge-base's --------
const LIMIT_KEYS = ["file", "classLines", "classMethods", "functionLines", "vendoredPrologueSdk"];
const parseLimits = (text, where) => {
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(`${where} is not valid JSON`); }
  for (const key of LIMIT_KEYS) if (!(parsed[key] > 0)) fail(`${where} needs a positive number for "${key}"`);
  return parsed;
};
if (!existsSync(limitsPath)) fail(`${limitsPath} is missing`);
const limits = parseLimits(readFileSync(limitsPath, "utf8"), limitsPath);

// ---- what is scanned ------------------------------------------------------------------------------------------------
const AREAS = /^(apps|horizontal|modules|packages|plugins|server|tooling)\//;
const isSource = (file) => AREAS.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const isTestFile = (file) => /^tests\/.*\.(ts|mts|mjs)$/.test(file);
const isVendoredSdk = (file) => /^vendor\/prologue-sdk\/.*\.tgz$/.test(file);
const needsText = (file) => isSource(file) || isTestFile(file);

// A snapshot is a file list plus a reader: the working tree for the head, a commit read from the object database for the
// merge-base (no checkout, so it cannot disturb the working tree or another session's worktree).
const workingTree = () => ({
  files: git(["-c", "core.quotepath=off", "ls-files", "-z"]).split("\0").filter(Boolean),
  read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } },
});
const commitTree = (commit) => {
  const files = git(["ls-tree", "-r", "-z", "--name-only", commit]).split("\0").filter(Boolean);
  const paths = files.filter(needsText);
  const out = git(["cat-file", "--batch"], { input: Buffer.from(paths.map((file) => `${commit}:${file}\n`).join("")), encoding: "buffer" });
  const texts = new Map();
  let position = 0;
  for (const file of paths) {
    const end = out.indexOf(10, position);
    const [, type, size] = out.toString("utf8", position, end).split(" ");
    position = end + 1;
    if (type === "missing") continue;
    texts.set(file, out.toString("utf8", position, position + Number(size)));
    position += Number(size) + 1;
  }
  return { files, read: (file) => texts.get(file) ?? null };
};

// ---- the metrics ----------------------------------------------------------------------------------------------------
// Each metric measures one snapshot, writes itself into baseline.json (and reads itself back) and says what counts as
// growth relative to a reference: the committed baseline, or the merge-base measured by this same code. A new gate adds
// one entry here. Measuring both sides with one definition means a change of definition needs no re-baselining in CI.
const sizeOf = (value) => (typeof value === "number" ? value : Math.max(value.lines, value.methods));
const describeUnit = (value) => (typeof value === "number" ? String(value) : `${value.lines} lines, ${value.methods} methods`);
const sumOf = (record) => Object.values(record).reduce((sum, count) => sum + count, 0);
const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const requireShape = (ok, what) => { if (!ok) fail(`tooling/gates/baseline.json: ${what} is missing or has an old shape; regenerate it with \`node scripts/check-health-gates.mjs --update\``); };
// A file renamed or moved between the reference and the head keeps its record under the new name; only content that is
// new counts as new.
const unitFile = (unit) => unit.replace(/^(?:file|class|function) /, "").split("#")[0];
const rekeyUnit = (unit, renames) => (renames.has(unitFile(unit)) ? unit.replace(unitFile(unit), renames.get(unitFile(unit))) : unit);
const rekeyFile = (file, renames) => renames.get(file) ?? file;
const rekey = (record, renames, rename) => {
  const out = {};
  for (const [key, value] of Object.entries(record)) {
    const next = rename(key, renames);
    out[next] = typeof value === "number" ? Math.max(out[next] ?? 0, value) : value;
  }
  return out;
};

const giantUnits = {
  id: "giant",
  // 1. Giant units (§4.5 thresholds): files over 800 lines, classes over 300 lines or 25 methods, functions over 150
  // lines. A class records its lines and its methods separately, each against its own limit.
  measure(snapshot) {
    const giant = {};
    for (const file of snapshot.files.filter(isSource)) {
      const text = snapshot.read(file);
      if (text === null) continue;
      const lines = text.split("\n").length;
      if (lines > limits.file) giant[`file ${file}`] = lines;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const span = (node) => source.getLineAndCharacterOfPosition(node.getEnd()).line - source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      // An unnamed function is named by the named function it sits in and its order among the giant ones there, so an
      // edit above it does not make it look new.
      const callbacks = {};
      const ownerOf = (node) => {
        if (node.name && ts.isIdentifier(node.name)) return node.name.text;
        if ((ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)) && ts.isIdentifier(node.parent.name)) return node.parent.name.text;
        let outer = node.parent;
        while (outer && !((ts.isFunctionDeclaration(outer) || ts.isMethodDeclaration(outer) || ts.isVariableDeclaration(outer)) && outer.name && ts.isIdentifier(outer.name))) outer = outer.parent;
        const base = outer ? outer.name.text : "(module)";
        callbacks[base] = (callbacks[base] ?? 0) + 1;
        return `${base} callback ${callbacks[base]}`;
      };
      const visit = (node) => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
          const key = `class ${file}#${node.name?.text ?? "(anonymous)"}`;
          const methods = node.members.filter((member) => ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)).length;
          const size = span(node);
          if (size > limits.classLines || methods > limits.classMethods) giant[key] = { lines: Math.max(giant[key]?.lines ?? 0, size), methods: Math.max(giant[key]?.methods ?? 0, methods) };
        }
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
          const size = span(node);
          if (size > limits.functionLines) {
            const key = `function ${file}#${ownerOf(node)}`;
            giant[key] = Math.max(giant[key] ?? 0, size);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return giant;
  },
  toBaseline: (giant) => ({ giantUnits: Object.keys(giant).length, giant }),
  fromBaseline(json) {
    requireShape(isRecord(json.giant), "giant");
    for (const [unit, value] of Object.entries(json.giant)) {
      requireShape(unit.startsWith("class ") ? isRecord(value) && Number.isInteger(value.lines) && Number.isInteger(value.methods) : Number.isInteger(value), `giant "${unit}"`);
    }
    return json.giant;
  },
  grew(head, ref, { renames }) {
    const before = rekey(ref, renames, rekeyUnit);
    const errors = [];
    for (const [unit, value] of Object.entries(head)) {
      const was = before[unit];
      if (was === undefined) errors.push(`new giant unit: ${unit} (${describeUnit(value)}); split it or keep it under the limit`);
      else if (typeof value === "number") {
        if (value > was) errors.push(`giant unit grew: ${unit} ${was} → ${value}`);
      } else {
        // Two rules, both must hold. Lines and methods are two limits: whichever is over its limit may not exceed what the
        // reference recorded. And the old freeze stays: the larger of the two (the old single number) may not grow either,
        // so a class that is giant only by methods cannot gain lines while it is still under the line limit.
        const found = [];
        if (value.lines > limits.classLines && value.lines > was.lines) found.push(`giant class grew: ${unit} lines ${was.lines} → ${value.lines}`);
        if (value.methods > limits.classMethods && value.methods > was.methods) found.push(`giant class grew: ${unit} methods ${was.methods} → ${value.methods}`);
        if (!found.length && sizeOf(value) > sizeOf(was)) {
          found.push(`giant class grew: ${unit} ${sizeOf(was)} → ${sizeOf(value)} (lines ${was.lines} → ${value.lines}, methods ${was.methods} → ${value.methods}); a giant class may not get bigger in either dimension`);
        }
        errors.push(...found);
      }
    }
    return errors;
  },
  lowered: (head, ref) => Object.keys(head).length < Object.keys(ref).length || Object.entries(head).some(([unit, value]) => ref[unit] !== undefined && sizeOf(value) < sizeOf(ref[unit])),
  lines(head, ref, { top }) {
    const kindOf = (unit, value) => (typeof value === "number" ? unit.split(" ")[0]
      : value.lines > limits.classLines && value.methods > limits.classMethods ? "class both" : value.lines > limits.classLines ? "class lines" : "class methods");
    const rows = Object.entries(head).map(([unit, value]) => ({ unit, value, kind: kindOf(unit, value) }))
      .sort((a, b) => sizeOf(b.value) - sizeOf(a.value) || a.unit.localeCompare(b.unit));
    const tally = {};
    for (const row of rows) tally[row.kind] = (tally[row.kind] ?? 0) + 1;
    const out = [`Giant units: ${rows.length} (${Object.entries(tally).sort().map(([name, count]) => `${count} ${name}`).join(", ")})`,
      `  ${"kind".padEnd(13)}${"lines".padStart(6)}${"methods".padStart(9)}${ref ? "  base (l/m)".padEnd(14) : ""}  unit`];
    for (const row of rows.slice(0, top)) {
      const lines = typeof row.value === "number" ? row.value : row.value.lines;
      const methods = typeof row.value === "number" ? "" : row.value.methods;
      const was = ref?.[row.unit];
      const base = was === undefined ? "new" : typeof was === "number" ? was : `${was.lines}/${was.methods}`;
      out.push(`  ${row.kind.padEnd(13)}${String(lines).padStart(6)}${String(methods).padStart(9)}${ref ? `  ${String(base)}`.padEnd(14) : ""}  ${row.unit.replace(/^(?:file|class|function) /, "")}`);
    }
    if (top && rows.length > top) out.push(`  … ${rows.length - top} more (omit --top to see all)`);
    return out;
  },
  summary: (giant) => `${Object.keys(giant).length} giant units`,
};

// Per-file counts that may only fall; a file with no record (a new file, or one that had none) starts at 0.
const perFile = {
  grew: (what, hint) => (head, ref, { renames }) => {
    const before = rekey(ref, renames, rekeyFile);
    return Object.entries(head).filter(([file, count]) => count > (before[file] ?? 0))
      .map(([file, count]) => `${what} in ${file} ${before[file] ?? 0} → ${count}; ${hint}`);
  },
  fromBaseline(json, key) {
    requireShape(isRecord(json[key]) && Object.values(json[key]).every(Number.isInteger), key);
    return json[key];
  },
  lowered: (head, ref) => sumOf(head) < sumOf(ref) || Object.entries(head).some(([file, count]) => ref[file] !== undefined && count < ref[file]),
  lines(title, head, ref, { top }) {
    const rows = Object.entries(head).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const out = [`${title}: ${sumOf(head)} in ${rows.length} files`, `  ${"count".padStart(5)}${ref ? "   base" : ""}  file`];
    for (const [file, count] of rows.slice(0, top)) out.push(`  ${String(count).padStart(5)}${ref ? String(ref[file] ?? "new").padStart(7) : ""}  ${file}`);
    if (top && rows.length > top) out.push(`  … ${rows.length - top} more (omit --top to see all)`);
    return out;
  },
};

// 2. Tests that reach into another package's source or build output instead of its public entry. Counted per test file
// by parsing it: every import, export … from, import() and require() whose literal specifier resolves to a package's
// src/ or dist/ (server/src included). A test file may only lose them and a new test file starts with none.
const INTERNAL_TARGET = /^(?:apps|horizontal|modules|packages|plugins|server)\/(?:.+\/)?(?:src|dist)(?:\/|$)/;
const internalImportCount = (file, text) => {
  if (!/(?:src|dist)\b/.test(text)) return 0;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  let count = 0;
  const specifier = (node) => {
    if (!node || !ts.isStringLiteralLike(node) || !node.text.startsWith(".")) return;
    if (INTERNAL_TARGET.test(path.posix.normalize(path.posix.join(path.posix.dirname(file), node.text)))) count++;
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) specifier(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) specifier(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
};
const testImports = {
  id: "testImports",
  measure(snapshot) {
    const counts = {};
    for (const file of snapshot.files.filter(isTestFile)) {
      const text = snapshot.read(file);
      const count = text === null ? 0 : internalImportCount(file, text);
      if (count) counts[file] = count;
    }
    return counts;
  },
  toBaseline: (counts) => ({ testInternalImports: sumOf(counts), testImports: counts }),
  fromBaseline: (json) => perFile.fromBaseline(json, "testImports"),
  grew: perFile.grew("tests reach into package internals", "import the public entry instead"),
  lowered: perFile.lowered,
  lines: (head, ref, env) => perFile.lines("Test internal imports", head, ref, env),
  summary: (counts) => `${sumOf(counts)} test internal imports`,
};

// 3. Vendored Prologue SDK packages (AGENTS.md: the current one, at most one more for a branch in flight).
const vendoredSdk = {
  id: "vendored",
  measure: (snapshot) => snapshot.files.filter(isVendoredSdk).length,
  toBaseline: (count) => ({ vendoredPrologueSdk: count }),
  fromBaseline(json) { requireShape(Number.isInteger(json.vendoredPrologueSdk), "vendoredPrologueSdk"); return json.vendoredPrologueSdk; },
  absolute: (count) => (count > limits.vendoredPrologueSdk ? [`vendor/prologue-sdk holds ${count} packages; keep the current one and at most ${limits.vendoredPrologueSdk - 1} in flight`] : []),
  grew: () => [],
  lowered: (head, ref) => head < ref,
  lines: (head, ref) => [`Vendored Prologue SDK packages: ${head} (limit ${limits.vendoredPrologueSdk})${ref !== undefined && ref !== head ? `, base ${ref}` : ""}`],
  summary: (count) => `${count} vendored SDK`,
};

// 4. Compatibility code coming back: in-place table patching outside a baseline schema.
const schemaPatches = {
  id: "schemaPatches",
  measure(snapshot) {
    let count = 0;
    for (const file of snapshot.files.filter(isSource)) count += (snapshot.read(file)?.match(/ALTER TABLE|ensureSqliteColumn\(/g) ?? []).length;
    return count;
  },
  toBaseline: (count) => ({ schemaPatches: count }),
  fromBaseline(json) { requireShape(Number.isInteger(json.schemaPatches), "schemaPatches"); return json.schemaPatches; },
  grew: (head, ref) => (head > ref ? [`in-place schema patches ${ref} → ${head}; change the baseline schema instead`] : []),
  lowered: (head, ref) => head < ref,
  lines: (head, ref) => [`In-place schema patches: ${head}${ref !== undefined && ref !== head ? `, base ${ref}` : ""}`],
  summary: (count) => `${count} schema patches`,
};

// 5. Compatibility code coming back (§4.1 "no compat logic"): words that keep an old shape alive, counted per source
// file. A file may only lose them and a new file starts with none; a kept mechanism is recorded in the spec and stays in
// the baseline. Scene "compatible" alone is ordinary vocabulary; identifiers built on it (compatibleRun) are counted.
const COMPAT_MARKERS = /[Ll]egacy|LEGACY|\b[Cc]ompat(?![a-z])|\bcompatible(?=[A-Z])|@deprecated|[Bb]ackfill/g;
const compatMarkers = {
  id: "compatMarkers",
  measure(snapshot) {
    const counts = {};
    for (const file of snapshot.files.filter(isSource)) {
      const count = (snapshot.read(file)?.match(COMPAT_MARKERS) ?? []).length;
      if (count) counts[file] = count;
    }
    return counts;
  },
  toBaseline: (counts) => ({ compatMarkerTotal: sumOf(counts), compatMarkers: counts }),
  fromBaseline: (json) => perFile.fromBaseline(json, "compatMarkers"),
  grew: perFile.grew("compatibility markers", "delete the old path instead of keeping it (CI has no way to accept more, and neither does --update)"),
  lowered: perFile.lowered,
  lines: (head, ref, env) => perFile.lines("Compatibility markers", head, ref, env),
  summary: (counts) => `${sumOf(counts)} compat markers`,
};

// 7. Translations (decision #16): missing English fails, conflicting translations are frozen, dead keys are reported. The rules live in scripts/gates/translations.mjs.
const METRICS = [giantUnits, testImports, vendoredSdk, schemaPatches, compatMarkers, createTranslationMetric({ isSource, requireShape, isRecord })];
const measureAll = (snapshot) => Object.fromEntries(METRICS.map((metric) => [metric.id, metric.measure(snapshot)]));
const summaryOf = (measured) => METRICS.map((metric) => metric.summary(measured[metric.id])).join(", ");

// 6. specs/ root: only work in progress and current norms, each with a status line. Reads the working tree.
const specProblems = () => {
  const problems = [];
  const specs = path.join(root, "specs");
  if (!existsSync(specs)) return problems;
  for (const entry of readdirSync(specs, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    const spec = path.join(specs, entry.name, "spec.md");
    if (!existsSync(spec)) { problems.push(`specs/${entry.name}: no spec.md`); continue; }
    if (!/^状态：/m.test(readFileSync(spec, "utf8").split("\n").slice(0, 8).join("\n"))) problems.push(`specs/${entry.name}: no status line near the top`);
  }
  return problems;
};

// ---- the reference to compare with -----------------------------------------------------------------------------------
const committedBaseline = () => {
  if (!existsSync(baselinePath)) fail(`${baselinePath} is missing; create it with --update`);
  let json;
  try { json = JSON.parse(readFileSync(baselinePath, "utf8")); } catch { fail(`${baselinePath} is not valid JSON; regenerate it with \`node scripts/check-health-gates.mjs --update\``); }
  return Object.fromEntries(METRICS.map((metric) => [metric.id, metric.fromBaseline(json)]));
};

let mergeBase = "";
if (options.base) {
  const target = gitMaybe(["rev-parse", "--verify", "--quiet", `${options.base}^{commit}`]);
  if (!target) fail(`--base ${options.base} is not a commit in this clone; fetch it first (CI: actions/checkout with fetch-depth: 0)`);
  mergeBase = gitMaybe(["merge-base", "HEAD", target]);
  if (!mergeBase) fail(`HEAD and ${options.base} share no history in this clone; fetch the full history (CI: actions/checkout with fetch-depth: 0)`);
}

const head = measureAll(workingTree());
const renames = new Map();
let reference;
if (mergeBase) {
  reference = measureAll(commitTree(mergeBase));
  // Renames between the merge-base and the working tree, so moving a file does not make its records look new.
  const fields = git(["diff", "-M", "-l", "5000", "--name-status", "--diff-filter=R", "-z", mergeBase]).split("\0");
  fields.forEach((field, index) => { if (/^R\d*$/.test(field)) renames.set(fields[index + 1], fields[index + 2]); });
} else if (!update && !report) reference = committedBaseline();

// ---- the guards ------------------------------------------------------------------------------------------------------
const notes = [];
const growth = () => METRICS.flatMap((metric) => metric.grew(head[metric.id], reference[metric.id], { renames }));
// The limits may be tightened but never loosened or removed: compared with the merge-base's tooling/gates/limits.json.
const limitErrors = () => {
  if (!mergeBase) return [];
  const limitsFile = "tooling/gates/limits.json";
  // `git()` exits 2 when git itself fails, so only a clean answer that the file is not in the merge-base's tree (the first
  // run, before limits.json existed) skips the comparison; an unreadable tree or blob is an error, never a pass.
  if (!git(["ls-tree", "--name-only", mergeBase, "--", limitsFile]).trim()) {
    notes.push(`the merge-base has no ${limitsFile}, so the limits were not compared`);
    return [];
  }
  const before = parseLimits(git(["cat-file", "blob", `${mergeBase}:${limitsFile}`]), `${mergeBase.slice(0, 8)}:${limitsFile}`);
  return LIMIT_KEYS.filter((key) => limits[key] > before[key]).map((key) => `limit "${key}" loosened ${before[key]} → ${limits[key]} in tooling/gates/limits.json; limits only get tighter`);
};
const absolute = () => [...METRICS.flatMap((metric) => metric.absolute?.(head[metric.id]) ?? []), ...specProblems()];
const against = mergeBase ? `merge-base ${mergeBase.slice(0, 8)} (${options.base})` : "tooling/gates/baseline.json";

// ---- --report --------------------------------------------------------------------------------------------------------
if (report) {
  if (flags.has("--json")) {
    console.log(JSON.stringify({ limits, mergeBase: mergeBase || null, head, base: reference ?? null }, null, 2));
    process.exit(0);
  }
  const env = { top: options.top ? Number(options.top) : undefined };
  console.log(`Health report: working tree${mergeBase ? ` against ${against}` : ""}; limits ${JSON.stringify(limits)}`);
  for (const metric of METRICS) console.log("\n" + metric.lines(head[metric.id], reference?.[metric.id], env).join("\n"));
  const problems = specProblems();
  console.log(`\nSpec status lines: ${problems.length ? problems.join("; ") : "every specs/ root directory has one"}`);
  process.exit(0);
}

// ---- --update --------------------------------------------------------------------------------------------------------
if (update) {
  if (mergeBase) {
    const errors = [...growth(), ...limitErrors()];
    if (errors.length) {
      console.error(`Baseline not written: something grew relative to ${against}:\n- ` + errors.join("\n- "));
      process.exit(1);
    }
  }
  const written = Object.assign({}, ...METRICS.map((metric) => metric.toBaseline(head[metric.id])),
    { note: "Only decreases. Lower it with `node scripts/check-health-gates.mjs --update --base origin/main` in the PR that lowers a number. CI compares with the merge-base, not with this file." });
  writeFileSync(baselinePath, JSON.stringify(written, null, 2) + "\n");
  console.log(`baseline written: ${summaryOf(head)}`);
  process.exit(0);
}

// ---- the verdict -----------------------------------------------------------------------------------------------------
const errors = [...growth(), ...limitErrors(), ...absolute()];
if (errors.length) {
  console.error(`Health gates failed against ${against}:\n- ` + errors.join("\n- "));
  process.exit(1);
}
const lowered = METRICS.filter((metric) => metric.lowered(head[metric.id], reference[metric.id])).map((metric) => metric.id);
let hint = "";
// --base never reads the committed tooling/gates/baseline.json (not even to say it is stale): it may be missing, old or
// rewritten in the PR, and none of that matters here.
if (lowered.length && mergeBase) hint = ` Lower than the merge-base: ${lowered.join(", ")}; \`--update --base origin/main\` lowers the local quick check in tooling/gates/baseline.json.`;
else if (lowered.length) hint = ` Lower than the baseline: ${lowered.join(", ")}; lower it with --update --base origin/main.`;
console.log(`Health gates passed against ${against} (${summaryOf(head)}).${hint}${notes.length ? ` Note: ${notes.join("; ")}.` : ""}`);
