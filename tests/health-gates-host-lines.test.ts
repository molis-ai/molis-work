import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reportHostLines } from "../scripts/gates/host-lines.mjs";

const HOST = "apps/local-host/src";
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));

test("HOSTLN-01 counts physical lines in all tracked Host source directories", () => {
  const contents = new Map([
    [`${HOST}/entry.ts`, "export const first = 1;\n\n// a note\n"],
    [`${HOST}/generated/registry.ts`, "// generated\r\nexport const entry = 1;\r\nexport const last = 2;"],
    [`${HOST}/fixtures/nested/example.mts`, "// a fixture without a final newline"],
    [`${HOST}/tests/example.test.ts`, "\n"],
    [`${HOST}/types/shape.d.ts`, "export declare const shape: number;\n"],
    [`${HOST}/browser/program.js`, "export const html = '<main></main>';"],
    [`${HOST}/browser/view.tsx`, "export const panel = <main />;\n"],
    [`${HOST}/empty.ts`, ""],
    [`${HOST}/guide.md`, "# Host\n"],
    [`${HOST}/data.json`, "{}\n"],
    [`${HOST}-elsewhere/index.ts`, "export const sibling = 1;\n"],
    ["apps/local-host/tooling/build.mjs", "export const builder = 1;\n"],
    ["apps/workbench/src/entry.ts", "export const other = 1;\n"],
  ]);
  const report = reportHostLines({ files: [...contents.keys()], read: file => contents.get(file) ?? null }, undefined, new Map());
  assert.deepEqual(report, {
    head: {
      total: 11,
      files: {
        [`${HOST}/entry.ts`]: 3,
        [`${HOST}/generated/registry.ts`]: 3,
        [`${HOST}/fixtures/nested/example.mts`]: 1,
        [`${HOST}/tests/example.test.ts`]: 1,
        [`${HOST}/types/shape.d.ts`]: 1,
        [`${HOST}/browser/program.js`]: 1,
        [`${HOST}/browser/view.tsx`]: 1,
        [`${HOST}/empty.ts`]: 0,
      },
    },
    base: null,
    delta: null,
    changes: [],
  });
});

test("HOSTLN-02 HOSTLN-03 health compares both trees, reports growth, and still rejects a giant unit", (context) => {
  const repo = mkdtempSync(path.join(tmpdir(), "molis-health-host-lines-"));
  context.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", [
    "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args,
  ], { cwd: repo, encoding: "utf8", stdio: "pipe" }).trim();
  const put = (file: string, text: string) => {
    const target = path.join(repo, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const commit = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const gate = (...args: string[]) => {
    const result = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
    assert.ifError(result.error);
    return result;
  };

  const grown = `${HOST}/grown.ts`, shortened = `${HOST}/shortened.ts`, removed = `${HOST}/removed.ts`;
  const oldName = `${HOST}/old-name.ts`, newName = `${HOST}/nested/new-name.ts`;
  const fixture = `${HOST}/fixtures/example.cts`, fresh = `${HOST}/browser/fresh.js`;
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 20, classLines: 10, classMethods: 3, functionLines: 8, vendoredPrologueSdk: 2, docsJsonBytes: 65536 }));
  put(grown, "export const value = 1;\n");
  put(shortened, "export const short = 1;\n\n// will be removed\n");
  put(removed, "export const gone = 1;\n");
  put(oldName, "export const relocated = 1;\n");
  put(fixture, "export const example = 1;");
  commit("base");
  const base = git("rev-parse", "HEAD");
  const baselinePath = path.resolve(repo, git("rev-parse", "--git-path", "molis-health-baseline.json"));
  const init = gate("--update");
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const initialBaseline = readFileSync(baselinePath, "utf8");

  git("branch", "feature");
  put(grown, "export const value = 1;\n" + "// main only\n".repeat(5));
  commit("advance main after the fork");
  git("checkout", "-q", "feature");
  put(grown, "export const value = 1;\n\n// an added note\n");
  put(shortened, "export const short = 1;\n");
  git("rm", "-q", removed);
  mkdirSync(path.join(repo, HOST, "nested"));
  git("mv", oldName, newName);
  const newContents = "// first\r\n// second\r\n// third\r\n";
  put(fresh, newContents);
  commit("change the feature tree");
  put(fresh, newContents + "export const newest = 1;");
  put(`${HOST}/untracked.ts`, "// ignored by health\n".repeat(21));

  const summary = "Host source lines (report only) 7 → 10 (+3) in 5 files";
  const normal = gate("--base", "main");
  assert.equal(normal.status, 0, normal.stdout + normal.stderr);
  assert.ok(normal.stdout.includes(summary), normal.stdout);

  const details = gate("--base", "main", "--report", "--top", "1");
  assert.equal(details.status, 0, details.stdout + details.stderr);
  assert.ok(details.stdout.includes(`${summary}\n  new → 4 (+4)  ${fresh}\n  … 4 more (omit --top to see all)`), details.stdout);

  const json = gate("--base", "main", "--report", "--json", "--top", "1");
  assert.equal(json.status, 0, json.stdout + json.stderr);
  const output = JSON.parse(json.stdout);
  assert.equal(output.mergeBase, base);
  assert.deepEqual(output.hostLines, {
    head: { total: 10, files: { [grown]: 3, [shortened]: 1, [newName]: 1, [fixture]: 1, [fresh]: 4 } },
    base: { total: 7, files: { [grown]: 1, [shortened]: 3, [oldName]: 1, [fixture]: 1, [removed]: 1 } },
    delta: 3,
    changes: [
      { file: fresh, previousFile: null, before: null, after: 4, delta: 4 },
      { file: grown, previousFile: null, before: 1, after: 3, delta: 2 },
      { file: shortened, previousFile: null, before: 3, after: 1, delta: -2 },
      { file: removed, previousFile: null, before: 1, after: null, delta: -1 },
      { file: newName, previousFile: oldName, before: 1, after: 1, delta: 0 },
    ],
  });

  const updated = gate("--update", "--base", "main");
  assert.equal(updated.status, 0, updated.stdout + updated.stderr);
  assert.ok(updated.stdout.includes(summary), updated.stdout);
  assert.equal(Object.hasOwn(JSON.parse(initialBaseline), "hostLines"), false);
  assert.equal(readFileSync(baselinePath, "utf8"), initialBaseline);

  const quick = gate();
  assert.equal(quick.status, 0, quick.stdout + quick.stderr);
  assert.match(quick.stdout, /^Host source lines \(report only\) 10 in 5 files$/m);

  const giant = `${HOST}/too-long.ts`;
  put(giant, "// a line\n".repeat(21));
  git("add", giant);
  const blocked = gate("--base", "main");
  assert.equal(blocked.status, 1, blocked.stdout + blocked.stderr);
  assert.ok(blocked.stderr.includes(`new giant unit: file ${giant}`), blocked.stderr);
  assert.match(blocked.stdout, /^Host source lines \(report only\) 7 → 31 \(\+24\) in 6 files$/m);

  // A reader that pipes the JSON must get the complete report even when it exceeds the pipe buffer.
  const deep = `${HOST}/fixtures/${"nested-".repeat(14)}/${"entries-".repeat(14)}/${"comparison-".repeat(10)}`;
  const extraFiles = 640;
  for (let index = 0; index < extraFiles; index++) put(`${deep}/${index}.cts`, "");
  git("add", "--", deep);
  const piped = gate("--base", "main", "--report", "--json");
  assert.equal(piped.status, 0, piped.stderr);
  const fullReport = JSON.parse(piped.stdout).hostLines;
  assert.equal(fullReport.head.total, 31);
  assert.equal(Object.keys(fullReport.head.files).length, 6 + extraFiles);
  assert.equal(fullReport.head.files[`${deep}/${extraFiles - 1}.cts`], 0);
});
