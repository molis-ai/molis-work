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

test("a wildcard exports entry cannot replace a dependency's own manifest with a nested module-type file", async t => {
  // Shape of @modelcontextprotocol/sdk: "./*" maps package.json to dist/cjs/package.json ({ "type": "commonjs" }).
  const root = await mkdtemp(join(tmpdir(), "wildcard-release-deps-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sdk = join(root, "node_modules", "@scope", "sdk");
  await mkdir(join(sdk, "dist", "cjs"), { recursive: true });
  await mkdir(join(sdk, "dist", "esm"), { recursive: true });
  await writeFile(join(sdk, "package.json"), JSON.stringify({ name: "@scope/sdk", version: "1.30.1", type: "module",
    exports: { ".": { import: "./dist/esm/index.js", require: "./dist/cjs/index.js" }, "./*": { import: "./dist/esm/*", require: "./dist/cjs/*" } } }));
  await writeFile(join(sdk, "dist", "cjs", "package.json"), JSON.stringify({ type: "commonjs" }));
  await writeFile(join(sdk, "dist", "cjs", "index.js"), "module.exports = {};\n");
  await writeFile(join(sdk, "dist", "esm", "index.js"), "export {};\n");
  const packages = await collectRuntimeDependencies(join(root, "package.json"), { dependencies: { "@scope/sdk": "1.30.1" } });
  assert.deepEqual(packages.map(value => [value.name, value.version, value.directory]), [["@scope/sdk", "1.30.1", await realpath(sdk)]]);
});
