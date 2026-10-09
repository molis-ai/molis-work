#!/usr/bin/env node
// Which acceptance criteria of the specs in progress carry an id, and which of those ids a test cites
// (specs/repository-anti-corruption §4.8 "需求可追溯", slice W2-14). The convention (what an id looks like, where it is
// written, how a test cites it, how a criterion is marked manual or retired) is in specs/README.md under "验收编号"; the
// reading is scripts/gates/spec-coverage.mjs, and the cases it rejects are listed at the top of that file.
//
//   node scripts/check-spec-coverage.mjs            report mode: print what was found and exit 0, whatever it is.
//                                                   CI runs this form (continue-on-error), so it cannot fail a build yet.
//   node scripts/check-spec-coverage.mjs --strict   the gate it becomes once the specs in progress are numbered: exit 1
//                                                   when the report lists a problem. Nothing runs it yet.
//   --json                                          print { specs, problems, testFilesRead } instead of text
//   --root <dir>                                    read another repository root (tests/health-gates-spec-coverage.test.ts)
//
// It reads the files git tracks (a new file counts once it is added), the same snapshot the health gates use.
// Exit codes: 0 report printed (or strict and clean), 1 strict and a problem was found, 2 the command or the repository is unusable.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderReport, specCoverage } from "./gates/spec-coverage.mjs";

const USAGE = "usage: check-spec-coverage.mjs [--strict] [--json] [--root <dir>]";
const fail = (message) => { console.error(message); process.exit(2); };

const args = process.argv.slice(2);
const flags = new Set();
let rootOption;
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (name === "--strict" || name === "--json") flags.add(name);
  else if (name === "--root") {
    rootOption = inline ?? args[++index];
    if (!rootOption || rootOption.startsWith("--")) fail(`--root needs a value\n${USAGE}`);
  } else fail(`unknown argument ${args[index]}\n${USAGE}`);
}
const strict = flags.has("--strict");
const root = rootOption ? path.resolve(rootOption) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let files;
try {
  files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30, stdio: ["pipe", "pipe", "pipe"] })
    .split("\0").filter(Boolean);
} catch (error) {
  fail(`cannot list the tracked files of ${root}: ${String(error.stderr ?? error.message).trim()}`);
}
const snapshot = { files, read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };

const result = specCoverage(snapshot);
if (flags.has("--json")) console.log(JSON.stringify(result, null, 2));
else console.log(renderReport(result, { strict }).join("\n"));
process.exit(strict && result.problems.length ? 1 : 0);
