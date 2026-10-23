import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// BL-383 (Sessions cleanup D5): the module that holds the Runtime project bindings is `modules/runtime-context`; the old name
// "private-work-context" is gone from live code and configuration. Old documents (archives, release notes, reviews, earlier
// plans) keep the name they were written under.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OLD = "private-work-context";
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const LIVE = /^(apps|packages|modules|plugins|scripts|server|horizontal|tooling)\/|^(tests\/[^/]+|package\.json|pnpm-lock\.yaml|tsconfig[^/]*\.json)$/;
// Asserts the old exports are gone, so it must name them.
const NAMES_THE_OLD = new Set(["tests/sessions-offline.test.ts", "tests/runtime-context-rename.test.ts"]);

test("RAC-258 BL-383: no tracked path carries the old module name, and the renamed module and its contract subpath exist", () => {
  assert.deepEqual(tracked.filter(path => path.includes(OLD)), []);
  for (const path of ["modules/runtime-context/package.json", "packages/contracts/src/modules/runtime-context.ts", "tooling/gates/api/contracts/modules/runtime-context.txt"]) {
    assert.ok(existsSync(join(ROOT, path)), `${path} exists`);
  }
  const manifest = JSON.parse(readFileSync(join(ROOT, "modules/runtime-context/package.json"), "utf8"));
  assert.equal(manifest.name, "@molis-ai/molis-work-module-runtime-context");
});

test("RAC-258 BL-383: live code, scripts, tests and configuration do not name the old module", () => {
  const naming = tracked.filter(path => LIVE.test(path) && !NAMES_THE_OLD.has(path) && readFileSync(join(ROOT, path), "utf8").includes(OLD));
  assert.deepEqual(naming, []);
});
