import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// RAC-564 (specs/repository-anti-corruption/slices/w5-02-registry.md §B1): the platform decides from its own registration
// (`apps/local-host/src/plugin-registry.ts`), never from the shell's copy of the catalog. Read as an import graph: of the names the
// workbench takes from its catalog modules, the Host imports only shell rendering that takes the Host's entries or titles a tab, and,
// until ac-artifacts' A3 derives them from the installed Manifests, the artifact types' five (and their type).

const WORKBENCH = "@molis-ai/molis-work-app-workbench";
const CATALOG_MODULES = ["./plugin-catalog.js", "./builtin-plugins.js"];
/** Shell rendering the Host still calls: `sideOpenedPlugins` takes the Host's own entries, `pluginTabTitles` only titles tabs. */
const RENDERING = ["sideOpenedPlugins", "pluginTabTitles"];
/** A3 删: the artifact types' five, left for ac-artifacts. This list only shrinks. */
const ARTIFACT_FIVE = ["HOST_ARTIFACT_PRODUCERS", "artifactContinuers", "artifactReferrerActions", "artifactTypeDeclarations", "declaredArtifactTypes", "ArtifactTypeDeclaration"];

const root = new URL("../", import.meta.url).pathname;

/** The names a source file binds from `from`, in `import { … }`, `import type { … }` and `export { … } from` (aliases by their imported name). */
function namesFrom(source: string, from: (specifier: string) => boolean): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!from(match[2]!)) continue;
    for (const part of match[1]!.split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|mts)$/.test(entry.name) ? [path] : [];
  });
}

test("RAC-564 the Host takes no catalog or platform fact from the workbench: only shell rendering and the artifact types' five (A3 删)", () => {
  const index = readFileSync(join(root, "apps/workbench/src/index.ts"), "utf8");
  const catalogNames = new Set(namesFrom(index, specifier => CATALOG_MODULES.includes(specifier)));
  assert.ok(catalogNames.has("BUILTIN_PLUGIN_CATALOG") && catalogNames.has("pluginMarketCards"), "the catalog modules' names are read from the workbench entry");
  assert.doesNotMatch(index, /export \* from "\.\/(?:plugin-catalog|builtin-plugins)\.js"/, "nothing of the catalog is exported unnamed");

  const allowed = new Set([...RENDERING, ...ARTIFACT_FIVE]);
  const found: string[] = [];
  for (const file of sourceFiles(join(root, "apps/local-host/src"))) {
    const source = readFileSync(file, "utf8"), relative = file.slice(root.length);
    // `import("…").Name` in a type is a name like any other; a module loaded at run time would hide what it takes.
    assert.doesNotMatch(source, /import\(\s*["']@molis-ai\/molis-work-app-workbench[^"']*["']\s*\)(?!\.\w)/, `${relative} does not load the workbench at run time`);
    assert.doesNotMatch(source, /from\s*["'](?:\.\.\/)+(?:apps\/)?workbench\//, `${relative} does not reach into the workbench's files`);
    const typeNames = [...source.matchAll(/import\(\s*["']@molis-ai\/molis-work-app-workbench[^"']*["']\s*\)\.(\w+)/g)].map(match => match[1]!);
    for (const name of [...namesFrom(source, specifier => specifier === WORKBENCH || specifier.startsWith(`${WORKBENCH}/`)), ...typeNames]) {
      if (catalogNames.has(name) && !allowed.has(name)) found.push(`${relative}: ${name}`);
    }
  }
  assert.deepEqual(found, [], "the platform decides from apps/local-host/src/plugin-registry.ts");
});
