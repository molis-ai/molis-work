import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { collectRuntimeDependencies, removedByOverrides } from "../apps/local-host/src/installer/home-dependencies.ts";
import type { RuntimeDependencyPackage } from "../apps/local-host/src/installer/home-contract.ts";

const root = fileURLToPath(new URL("../package.json", import.meta.url));

function walk(dependencies: readonly RuntimeDependencyPackage[], visit: (dependency: RuntimeDependencyPackage) => void): void {
  for (const dependency of dependencies) {
    visit(dependency);
    walk(dependency.nests ?? [], visit);
  }
}

test("Pages 与 Feed 共用一份 htmlparser2，不能平铺的另一主版本留在需要它的包下面", async () => {
  const metadata = JSON.parse(readFileSync(root, "utf8")) as { dependencies?: Record<string, unknown> };
  const dependencies = await collectRuntimeDependencies(root, metadata, await removedByOverrides(fileURLToPath(new URL("..", import.meta.url))));
  const htmlparser = dependencies.filter((dependency) => dependency.name === "htmlparser2");
  assert.deepEqual(htmlparser.map((dependency) => dependency.version), ["12.0.0"]);
  const topLevelNames = dependencies.map((dependency) => dependency.name);
  assert.equal(new Set(topLevelNames).size, topLevelNames.length);
  const readable = dependencies.find((dependency) => dependency.name === "readable-stream");
  assert.equal(readable?.version, "2.3.8");
  const nestedReadable: string[] = [];
  walk(dependencies, (dependency) => {
    for (const nested of dependency.nests ?? []) {
      if (nested.name === "readable-stream") nestedReadable.push(`${dependency.name} -> ${nested.version}`);
    }
  });
  assert.deepEqual(nestedReadable.sort(), ["bl -> 3.6.2", "tar-stream -> 3.6.2"]);
});

// pnpm-workspace.yaml removes officeparser's tesseract.js (`officeparser>tesseract.js: '-'`): pnpm never installs it, and the
// release neither looks for it nor copies it; the release records the pair so installing from the release agrees (PMAT-47).
test("PMAT-47 a dependency the workspace removes with an override is not collected, and only that pair is skipped", async () => {
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const removed = await removedByOverrides(repository);
  assert.ok(removed.has("officeparser>tesseract.js"), JSON.stringify([...removed]));
  for (const pair of removed) assert.match(pair, /^[^>\s]+>[^>\s]+$/u);
  const metadata = JSON.parse(readFileSync(root, "utf8")) as { dependencies?: Record<string, unknown> };
  const names = new Set<string>();
  walk(await collectRuntimeDependencies(root, metadata, removed), dependency => { names.add(dependency.name); });
  assert.ok(names.has("officeparser") && names.has("file-type"), "officeparser and its other dependencies are copied");
  assert.ok(!names.has("tesseract.js") && !names.has("tesseract.js-core"));
});
