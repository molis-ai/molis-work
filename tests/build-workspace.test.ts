// scripts/build-workspace.mjs (`pnpm workspace:build`): packages build after the packages they depend on, a change to a package's
// files reaches every package that depends on it, dist/ is not an input, a nested package owns its own files, and a package is
// rebuilt when nothing is recorded, its inputs changed or its dist/ is not the one its last build left.
import assert from "node:assert/strict";
import test from "node:test";
import { buildOrder, inputDigests, parseOptions, staleReason } from "../scripts/build-workspace.mjs";

const entry = (name: string, directory: string, dependencies: string[] = [], scripts: Record<string, string> = { build: "tsc" }) => ({ name, directory, dependencies, scripts });
const contents = (files: Record<string, string>) => (file: string) => files[file] ?? "absent";

test("buildOrder: every package after the packages it depends on; a cycle is refused", () => {
  const order = buildOrder([entry("app", "apps/app", ["kit", "contracts"]), entry("kit", "packages/kit", ["contracts"]), entry("contracts", "packages/contracts")]).map((item) => item.name);
  assert.deepEqual(order, ["contracts", "kit", "app"]);
  assert.throws(() => buildOrder([entry("a", "a", ["b"]), entry("b", "b", ["a"])]), /dependency cycle: a -> b -> a/);
});

test("inputDigests: a change in a package changes it and its dependents only; dist/ is not an input; a nested package owns its files", () => {
  const order = buildOrder([entry("contracts", "packages/contracts"), entry("kit", "packages/kit", ["contracts"]), entry("other", "packages/other"), entry("inner", "packages/kit/inner")]);
  const files = ["packages/contracts/src/a.ts", "packages/kit/src/b.ts", "packages/kit/dist/b.js", "packages/other/src/c.ts", "packages/kit/inner/src/d.ts"];
  const base = { "packages/contracts/src/a.ts": "1", "packages/kit/src/b.ts": "2", "packages/kit/dist/b.js": "built", "packages/other/src/c.ts": "3", "packages/kit/inner/src/d.ts": "4" };
  const before = inputDigests(order, files, contents(base));
  const changed = inputDigests(order, files, contents({ ...base, "packages/contracts/src/a.ts": "1 changed" }));
  assert.notEqual(changed.get("contracts"), before.get("contracts"));
  assert.notEqual(changed.get("kit"), before.get("kit"), "kit depends on contracts");
  assert.equal(changed.get("other"), before.get("other"));
  assert.equal(changed.get("inner"), before.get("inner"));
  assert.deepEqual(inputDigests(order, files, contents({ ...base, "packages/kit/dist/b.js": "rebuilt" })), before, "dist/ is output");
  const nested = inputDigests(order, files, contents({ ...base, "packages/kit/inner/src/d.ts": "4 changed" }));
  assert.notEqual(nested.get("inner"), before.get("inner"));
  assert.equal(nested.get("kit"), before.get("kit"), "the nested package's files are its own, not kit's");
});

test("staleReason: built when nothing is recorded or the inputs changed; a package without a build script never is", () => {
  const kit = entry("kit", "packages/no-such-package");
  assert.equal(staleReason(kit, "digest", undefined), "no build recorded");
  assert.equal(staleReason(kit, "digest", { input: "older", output: null }), "inputs changed");
  assert.equal(staleReason(kit, "digest", { input: "digest", output: null }), null, "no dist/ then, none now");
  assert.equal(staleReason(kit, "digest", { input: "digest", output: "a dist/ that is gone" }), "dist/ changed or missing");
  assert.equal(staleReason(entry("types", "packages/types", [], {}), "digest", undefined), null);
});

test("options: --clean (or MOLIS_WORK_BUILD_CLEAN=1), --jobs and --dry-run", () => {
  assert.deepEqual(parseOptions([], {}), { clean: false, jobs: 4, dryRun: false });
  assert.deepEqual(parseOptions(["--clean", "--jobs", "2", "--dry-run"], {}), { clean: true, jobs: 2, dryRun: true });
  assert.equal(parseOptions([], { MOLIS_WORK_BUILD_CLEAN: "1" }).clean, true);
});
