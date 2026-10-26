import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { homeStores } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";

// specs/repository-anti-corruption/slices/pg022-manifest-declarations.md, P1: a library in the Home is declared in the plugin's
// Manifest (`databases.home`) and nowhere else. The start entries, the build's catalog and the Host's entry types carry no `database`.

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("PLIB-11 RAC-301 a Home library is declared only in the Manifest's databases.home: no start entry type, catalog entry or registration carries a database, and every shipped library is the Manifest's", () => {
  for (const file of ["apps/local-host/src/plugin-platform.ts", "apps/local-host/src/home-plugins.ts", "apps/local-host/src/plugin-owner-files-entries.ts",
    "apps/local-host/src/plugin-database-entries.ts", "apps/local-host/src/plugin-project-cleanup.ts", "packages/contracts/src/platform/plugin-registration.ts"]) {
    assert.doesNotMatch(source(file), /readonly database\??:/u, `${file}: an entry type with a database`);
  }
  assert.doesNotMatch(source("apps/local-host/src/project-plugins.ts"), /\bdatabase: |_DATABASE\b/u, "the project start list names no library");
  assert.doesNotMatch(source("apps/local-host/src/plugin-entry-identity.ts"), /new WeakMap<PluginDefinition, HomePluginDatabaseDeclaration>/u, "no library is remembered about a definition object");

  const registrations = readdirSync(new URL("../plugins/native/", import.meta.url)).filter(name => existsSync(new URL(`../plugins/native/${name}/src/registration.ts`, import.meta.url)));
  assert.ok(registrations.length > 20, "the shipped plugins' registrations were found");
  for (const name of registrations) {
    assert.doesNotMatch(source(`plugins/native/${name}/src/registration.ts`), /\bdatabase: /u, `${name}: its registration names a library`);
  }

  const libraries = BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.manifest.databases?.home ? [entry] : []);
  assert.deepEqual(libraries.map(entry => entry.manifest.databases!.home!.store_name).sort(),
    ["cognia", "dataset", "form", "goals", "images", "issues", "jelly", "lingguang", "pages", "ppt", "todo", "workflows"]);
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    assert.equal("database" in (entry.runtime ?? {}), false, `${entry.project_plugin_id}: runtime.database`);
    assert.equal(entry.home_store?.library, undefined, `${entry.project_plugin_id}: home_store.library`);
  }
  for (const { manifest } of libraries) {
    const library = manifest.databases!.home!, store = homeStores().get(library.store_name);
    assert.equal(store?.owner, manifest.plugin_id, library.store_name);
    assert.deepEqual(store?.library, { baseline: { version: library.version, schema: library.schema }, ...library.partition ? { partition: library.partition } : {} }, library.store_name);
    const permissions = new Set(manifest.permissions.map(item => item.permission));
    for (const permission of ["storage:private", library.read_permission, library.write_permission]) assert.ok(permissions.has(permission), `${manifest.plugin_id}: ${permission}`);
  }
});
