import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// ac-artifacts PG-080 (RAC-860). A plugin writes its own 成果 through `services.artifacts`, which the platform checks against the
// plugin's Manifest. The Host calls `registerVersion` itself only for what is the Host's own, so a new caller here is a plugin's
// write the Host made for it: the list below names every file that does today, and it only shrinks.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Why each Host file may still register a version. Feed pins its captures itself, through `services.artifacts.join` (RAC-510). */
const HOST_WRITERS: Readonly<Record<string, string>> = {
  "apps/local-host/src/characters-host.ts": "Characters is a Host producer, not a plugin (PG-085)",
  "apps/local-host/src/demo-deliverable.ts": "seeds the demo project",
  "apps/local-host/src/project-version-stores.ts": "the restore from a work-assets bundle (S-81)",
  "server/tooling/continuity-demo.mts": "a demo script",
};

function sources(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? sources(path) : /\.(ts|mts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

test("RAC-860 PG-080 only the Host's own files register a version on a plugin's behalf, and Pages is not among them", () => {
  const files = ["apps", "server"].flatMap(sources).filter(file => !file.includes("/tests/"));
  const callers = files.filter(file => /\bregisterVersion\(|\bregisterVersion:/.test(readFileSync(join(root, file), "utf8"))).sort();
  assert.deepEqual(callers, Object.keys(HOST_WRITERS).sort(), "a file that registers a version for a plugin is a plugin's own write: use services.artifacts");
  // The demo seed and the demo script put sample content in a project; the rest write only what is the Host's.
  for (const file of Object.keys(HOST_WRITERS).filter(name => !/demo/.test(name))) {
    assert.doesNotMatch(readFileSync(join(root, file), "utf8"), /PAGES_ARTIFACT_TYPE_ID|io\.molis\.work\.pages|"pages-"/, `${relative(root, join(root, file))} writes nothing for Pages`);
  }
});
