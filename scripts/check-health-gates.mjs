#!/usr/bin/env node
// Repository health gates (specs/repository-anti-corruption §5a): numbers that may only go down.
// Measures the working tree, compares with tooling/gates/baseline.json and fails on any growth.
// `--update` rewrites the baseline; a change that lowers a number should update it in the same PR.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const baselinePath = path.join(root, "tooling/gates/baseline.json");
const update = process.argv.includes("--update");

const tracked = execFileSync("git", ["-c", "core.quotepath=off", "ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const AREAS = /^(apps|horizontal|modules|packages|plugins|server|tooling)\//;
const isSource = (file) => AREAS.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const sources = tracked.filter(isSource);
const read = (file) => readFileSync(path.join(root, file), "utf8");

// 1. Giant units (§4.5 thresholds): files over 800 lines, classes over 300 lines or 25 methods, functions over 150 lines.
const LIMITS = { file: 800, classLines: 300, classMethods: 25, functionLines: 150 };
const giant = {};
for (const file of sources) {
  const text = read(file);
  const lines = text.split("\n").length;
  if (lines > LIMITS.file) giant[`file ${file}`] = lines;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const span = (node) => source.getLineAndCharacterOfPosition(node.getEnd()).line - source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  // An unnamed function is named by the named function it sits in and its order among the giant ones there, so an edit
  // above it does not make it look new.
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
      const name = node.name?.text ?? "(anonymous)";
      const methods = node.members.filter((member) => ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)).length;
      const size = span(node);
      if (size > LIMITS.classLines || methods > LIMITS.classMethods) giant[`class ${file}#${name}`] = Math.max(size, methods);
    }
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const size = span(node);
      if (size > LIMITS.functionLines) {
        const owner = ownerOf(node);
        giant[`function ${file}#${owner}`] = Math.max(giant[`function ${file}#${owner}`] ?? 0, size);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

// 2. Tests that reach into another package's source or build output instead of its public entry.
const testFiles = tracked.filter((file) => /^tests\/.*\.(ts|mts|mjs)$/.test(file));
let internalImports = 0;
for (const file of testFiles) {
  internalImports += (read(file).match(/from\s+["'](?:\.\.\/)+(?:apps|horizontal|modules|packages|plugins|server)\/[^"']*\/(?:src|dist)\//g) ?? []).length;
}

// 3. Vendored Prologue SDK packages (AGENTS.md: the current one, at most one more for a branch in flight).
const vendored = tracked.filter((file) => /^vendor\/prologue-sdk\/.*\.tgz$/.test(file)).length;

// 4. Compatibility code coming back: in-place table patching outside a baseline schema.
let schemaPatches = 0;
for (const file of sources) schemaPatches += (read(file).match(/ALTER TABLE|ensureSqliteColumn\(/g) ?? []).length;

// 5. specs/ root: only work in progress and current norms, each with a status line.
const specProblems = [];
for (const entry of readdirSync(path.join(root, "specs"), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === "archive") continue;
  const spec = path.join(root, "specs", entry.name, "spec.md");
  if (!existsSync(spec)) { specProblems.push(`${entry.name}: no spec.md`); continue; }
  if (!/^状态：/m.test(readFileSync(spec, "utf8").split("\n").slice(0, 8).join("\n"))) specProblems.push(`${entry.name}: no status line near the top`);
}

const measured = { giantUnits: Object.keys(giant).length, giant, testInternalImports: internalImports, vendoredPrologueSdk: vendored, schemaPatches };
if (update) {
  writeFileSync(baselinePath, JSON.stringify({ ...measured, note: "Only decreases. Regenerate with `node scripts/check-health-gates.mjs --update` in the PR that lowers a number." }, null, 2) + "\n");
  console.log(`baseline written: ${measured.giantUnits} giant units, ${internalImports} test internal imports, ${vendored} vendored SDK, ${schemaPatches} schema patches`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const errors = [];
for (const [unit, size] of Object.entries(giant)) {
  const before = baseline.giant[unit];
  if (before === undefined) errors.push(`new giant unit: ${unit} (${size}); split it or keep it under the limit`);
  else if (size > before) errors.push(`giant unit grew: ${unit} ${before} → ${size}`);
}
if (internalImports > baseline.testInternalImports) errors.push(`tests reach into package internals ${baseline.testInternalImports} → ${internalImports}; import the public entry instead`);
if (vendored > 2) errors.push(`vendor/prologue-sdk holds ${vendored} packages; keep the current one and at most one in flight`);
if (schemaPatches > baseline.schemaPatches) errors.push(`in-place schema patches ${baseline.schemaPatches} → ${schemaPatches}; change the baseline schema instead`);
errors.push(...specProblems.map((problem) => `specs/${problem}`));

const lowered = [
  measured.giantUnits < baseline.giantUnits && "giant units",
  internalImports < baseline.testInternalImports && "test internal imports",
  schemaPatches < baseline.schemaPatches && "schema patches",
].filter(Boolean);
if (errors.length) {
  console.error("Health gates failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`Health gates passed (${measured.giantUnits} giant units, ${internalImports} test internal imports, ${vendored} vendored SDK, ${schemaPatches} schema patches).`
  + (lowered.length ? ` Lower than the baseline: ${lowered.join(", ")}; update it with --update.` : ""));
