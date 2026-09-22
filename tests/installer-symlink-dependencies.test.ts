import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectRuntimeDependencies } from "../apps/local-host/src/installer/home-dependencies.js";

test("release collection resolves children of linked ESM packages from their real package location", async t => {
  const root = await mkdtemp(join(tmpdir(), "jelly-release-deps-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = join(root, "store", "outer", "node_modules");
  await mkdir(join(root, "node_modules"), { recursive: true });
  await mkdir(join(store, "outer"), { recursive: true });
  await mkdir(join(store, "inner"), { recursive: true });
  await writeFile(join(store, "outer", "package.json"), JSON.stringify({ name: "outer", version: "1.0.0", type: "module", exports: { import: "./index.js" }, dependencies: { inner: "1.0.0" } }));
  await writeFile(join(store, "outer", "index.js"), "export {};\n");
  await writeFile(join(store, "inner", "package.json"), JSON.stringify({ name: "inner", version: "1.0.0" }));
  await symlink(join(store, "outer"), join(root, "node_modules", "outer"));
  const packages = await collectRuntimeDependencies(join(root, "package.json"), { dependencies: { outer: "1.0.0" } });
  assert.deepEqual(packages.map(value => value.name), ["inner", "outer"]);
  assert.equal(packages.find(value => value.name === "inner")?.directory, await realpath(join(store, "inner")));
});
