import assert from "node:assert/strict";
import test from "node:test";
import { extractImportSpecifiers } from "@molis-ai/molis-work-test-kit";

test("boundary scanner distinguishes executable imports from exported Plugin source templates", () => {
  const source = [
    'import type { PluginManifest } from "public-contract";',
    'export const template = `import { definePlugin } from "generated-plugin-sdk";`;',
    'export const prose = "from \\\"not-a-module\\\"";',
    'export { current } from "public-owner";',
    'const lazy = import("public-lazy");',
    'const legacy = require("public-commonjs");',
  ].join("\n");
  assert.deepEqual([...extractImportSpecifiers(source)].sort(),
    ["public-commonjs", "public-contract", "public-lazy", "public-owner"]);
});
