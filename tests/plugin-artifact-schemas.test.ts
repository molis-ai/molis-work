import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import * as module from "@molis-ai/molis-work-module-artifacts";
import * as plugin from "@molis-ai/molis-work-plugin-artifacts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** The text between `export const <name> =` and the `;` that ends the statement (schemas carry no `;` of their own). */
const declaration = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name} =`);
  assert.ok(start >= 0, `${name} is declared`);
  return source.slice(start, source.indexOf(";\n", start));
};

test("RAC-413: the plugin and the module keep the same artifact record schemas until the plugin goes", () => {
  const plugin = read("plugins/native/artifacts/src/action-schemas.ts");
  const moduleSource = read("modules/artifacts/src/plugin-action-schemas.ts");
  for (const name of ["object", "array", "nullable", "reference", "origin", "record"]) {
    assert.equal(declaration(moduleSource, name), declaration(plugin, name), `${name} is the same schema in both`);
  }
  assert.ok(moduleSource.includes(plugin.slice(plugin.indexOf("const fixedFields"), plugin.indexOf("/** Where a 成果 came from"))), "fixedFields is the same");
});

test("RAC-414: the module serves exactly the actions the plugin's Manifest declares, until the plugin goes", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(module.ARTIFACT_ACTIONS)), JSON.parse(JSON.stringify(plugin.artifactsManifest.actions)), "17 actions, same descriptors");
  assert.equal(module.ARTIFACT_ACTIONS.length, 17);
  assert.deepEqual(module.ARTIFACT_ACTION_PERMISSIONS, plugin.ARTIFACT_ACTION_PERMISSIONS);
  const { plugin_id, name, version, publisher } = plugin.artifactsManifest;
  assert.deepEqual(module.ARTIFACTS_PROVIDER, { plugin_id, name, version, publisher });
  assert.equal(module.ARTIFACTS_PLUGIN_ID, plugin.ARTIFACTS_PLUGIN_ID);
  assert.equal(module.ARTIFACTS_PROJECT_PLUGIN_ID, plugin.ARTIFACTS_PROJECT_PLUGIN_ID);
  assert.deepEqual(module.ARTIFACTS_HOME_STORE, plugin.ARTIFACTS_HOME_STORE);
  assert.equal(plugin.artifactsProjectData.label, module.artifactsProjectData.label);
  assert.equal(module.artifactVersionPath({ artifact_id: "a b", version: 3 }), plugin.artifactVersionPath({ artifact_id: "a b", version: 3 }));
  const sources = readFileSync(new URL("../plugins/native/artifacts/src/actions.ts", import.meta.url), "utf8");
  for (const source of module.EXTERNAL_DOCUMENT_SOURCES) assert.ok(sources.includes(`"${source}"`), `${source} is in the plugin's source list`);
});

test("RAC-413: the Host imports no 成果库 plugin package: its artifact code comes from the module", () => {
  assert.ok(!read("apps/local-host/package.json").includes("molis-work-plugin-artifacts"), "the Host does not depend on the plugin package");
  const importers = readdirSync(new URL("../apps/local-host/src/", import.meta.url)).filter(file => file.endsWith(".ts")
    && read(`apps/local-host/src/${file}`).includes("@molis-ai/molis-work-plugin-artifacts"));
  assert.deepEqual(importers, []);
});
