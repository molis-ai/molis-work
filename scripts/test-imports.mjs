#!/usr/bin/env node
// Tests and the packages they import (specs/repository-anti-corruption W2-10). A test process that loads one package from its
// source (../P/src/…, run by tsx) and from its build (the package name, ../P/dist/…) holds two copies of it, which breaks
// instanceof, module-level caches and AsyncLocalStorage. This tool finds those processes and rewrites the imports so that every
// package is reached from one place, public names through the package's entry. The graph and the rules are in
// scripts/test-imports/ (header of graph.mjs and plan.mjs); scripts/gates/test-import-splits.mjs holds the health gate on the
// same graph, which lets no test file, and no fixture a test spawns, load more packages twice than it does at the merge-base.
//
//   node scripts/test-imports.mjs --check [--chains]       list the split processes (exit 1 if any); --chains also prints how
//   node scripts/test-imports.mjs [--report] [<file>…]     the plan, per specifier: file:line, rule, old → new, names; with file
//                                                          arguments (relative to the root) or --limit N, only those and the files that must go with them
//   node scripts/test-imports.mjs --write [<file>…]        apply it (all files when none are named)
//   node scripts/test-imports.mjs --ledger                 the internal references that remain after the whole rewrite, one line each, with why
//   --summary                      with --report: counts and ledgers only, without the per-specifier lines
//   --limit <n>                    with no file arguments: the first n files by name, plus partners (one PR-sized cut)
//   --ref <commit>                 measure a commit (read from the object database) instead of the working tree; not with --write
//   --root <dir>                   another repository root
//   --json                         with --check or --report: the result as JSON
// Exit codes: 0 ok, 1 split processes found (--check) or the plan failed its self-checks (nothing is written), 2 usage or environment.
// It needs no build: the TypeScript compiler reads the sources. Run it again on the then-current main before every rewrite PR.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createGraph, splitCounts } from "./test-imports/graph.mjs";
import { checkLines, ledger, remainingLines, reportLines } from "./test-imports/report.mjs";
import { planRewrite, rewriteFiles } from "./test-imports/run.mjs";
import { commitSnapshot, workingTreeSnapshot } from "./test-imports/snapshot.mjs";

const USAGE = "usage: test-imports.mjs [--check [--chains] | --report [--summary] | --write | --ledger] [<file>…] [--limit N] [--ref <commit>] [--root <dir>] [--json]";
const fail = (message) => { console.error(message); process.exit(2); };

const flags = new Set(), options = {}, files = [];
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (["--check", "--report", "--write", "--ledger", "--chains", "--summary", "--json"].includes(name)) flags.add(name);
  else if (["--limit", "--ref", "--root"].includes(name)) {
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) fail(`${name} needs a value\n${USAGE}`);
    options[name.slice(2)] = value;
  } else if (name.startsWith("--")) fail(`unknown argument ${args[index]}\n${USAGE}`);
  else files.push(name);
}
if (flags.has("--check") + flags.has("--report") + flags.has("--write") + flags.has("--ledger") > 1) fail(`--check, --report, --write and --ledger are separate commands\n${USAGE}`);
if (flags.has("--write") && options.ref) fail("--write rewrites the working tree; --ref measures a commit");
if (options.limit !== undefined && !(Number(options.limit) > 0)) fail(`--limit needs a positive number\n${USAGE}`);
const root = path.resolve(options.root ?? path.join(path.dirname(new URL(import.meta.url).pathname), ".."));
const snapshot = options.ref ? commitSnapshot(root, options.ref) : workingTreeSnapshot(root);

if (flags.has("--check")) {
  const graph = createGraph(snapshot);
  const analysis = graph.analyze();
  if (flags.has("--json")) console.log(JSON.stringify({ processes: analysis.length, splits: splitCounts(analysis), entries: analysis.filter((result) => result.kind === "entry" && result.splits.length).map((result) => result.file) }, null, 2));
  else console.log(checkLines(graph, analysis, flags.has("--chains")).join("\n"));
  process.exit(analysis.some((result) => result.splits.length) ? 1 : 0);
}

const plan = planRewrite({ snapshot, root });
const editable = [...plan.edits.keys()].sort();
const requested = files.length ? files.map((file) => path.relative(root, path.resolve(root, file)).split(path.sep).join("/")) : options.limit ? editable.slice(0, Number(options.limit)) : undefined;
const unknown = (requested ?? []).filter((file) => !plan.edits.has(file));
if (unknown.length) console.error(`nothing to change in: ${unknown.join(", ")}`);
const result = rewriteFiles(plan, requested);
if (flags.has("--ledger")) console.log(remainingLines(plan, result).join("\n"));
else if (flags.has("--json")) {
  console.log(JSON.stringify({ files: [...result.selected].sort(), added: [...result.added].sort(), problems: result.problems, rows: ledger(plan, result.selected), blocked: plan.decision.groups.filter((group) => group.blocked).map((group) => ({ pkg: group.pkg, reason: group.blocked })) }, null, 2));
} else console.log(reportLines(plan, result, { summary: flags.has("--summary") }).join("\n"));
if (result.problems.length) process.exit(1);
if (flags.has("--write")) {
  for (const [file, text] of result.texts) writeFileSync(path.join(root, file), text);
  console.error(`wrote ${result.texts.size} files`);
}
