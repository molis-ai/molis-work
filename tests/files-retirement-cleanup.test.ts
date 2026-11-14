import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

// WMD-13: after the Files retirement no build registration, action snapshot, live workbench source or CI timing table names the
// retired plugin. The migration code, goldens and their fixtures are deliberately outside these paths (they carry the old identity
// only to adopt it), so this is the "deleted, not merely disconnected" check.
const git = (...args: string[]) => execFileSync("git", args, { cwd: new URL("..", import.meta.url), encoding: "utf8" });

test("WMD-13 the Files plugin leaves no build registration, action row, live workbench reference or CI timing entry", () => {
  assert.equal(BUILTIN_PLUGIN_CATALOG.some(entry => entry.project_plugin_id === "files" || entry.manifest.plugin_id === "io.molis.work.files"), false,
    "no build registration names Files");
  const tracked = git("ls-files", "plugins/native").split("\n");
  assert.equal(tracked.some(file => file.startsWith("plugins/native/files/")), false, "the package directory is gone");

  const actions = readFileSync(new URL("../tooling/gates/actions/actions.tsv", import.meta.url), "utf8");
  assert.equal(actions.split("\n").some(line => line.startsWith("files.")), false, "the Manifest action snapshot has no files.* row");
  const hostActions = readFileSync(new URL("../tooling/gates/actions/host-actions.tsv", import.meta.url), "utf8");
  assert.ok(hostActions.split("\n").some(line => line.startsWith("materials.open\t")), "the materials service is registered instead");

  const live = spawnSync("git", ["grep", "-n", "io.molis.work.files", "--", "apps/workbench/src", "plugins/native"], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(live.status, 1, `no live source names Files: ${live.stdout}`);

  const weights = JSON.parse(readFileSync(new URL("./ci-shard-weights.json", import.meta.url), "utf8")) as Record<string, unknown>;
  for (const stale of ["tests/files-client-bundle.test.ts", "tests/files-git-actions.test.ts", "tests/files-plugin.test.ts", "tests/files-product-http.test.ts"]) {
    assert.equal(Object.hasOwn(weights, stale), false, `${stale} left the CI timing table`);
  }
});
