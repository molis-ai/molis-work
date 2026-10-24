import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** The text between `export const <name> =` and the `;` that ends the statement (schemas carry no `;` of their own). */
const declaration = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name} =`);
  assert.ok(start >= 0, `${name} is declared`);
  return source.slice(start, source.indexOf(";\n", start));
};

test("RAC-413: the plugin and the module keep the same artifact record schemas until the plugin goes", () => {
  const plugin = read("plugins/native/artifacts/src/action-schemas.ts");
  const module = read("modules/artifacts/src/plugin-action-schemas.ts");
  for (const name of ["object", "array", "nullable", "reference", "origin", "record"]) {
    assert.equal(declaration(module, name), declaration(plugin, name), `${name} is the same schema in both`);
  }
  assert.ok(module.includes(plugin.slice(plugin.indexOf("const fixedFields"), plugin.indexOf("/** Where a 成果 came from"))), "fixedFields is the same");
});
