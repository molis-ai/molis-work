import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkArtifactsPlatformUi } from "../scripts/gates/artifacts-platform-ui.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function changed(file, source) {
  const read = fs.readFileSync, target = path.join(root, file);
  fs.readFileSync = (candidate, ...args) => String(candidate) === target ? source : read(candidate, ...args);
  try { return checkArtifactsPlatformUi(root); } finally { fs.readFileSync = read; }
}

test("RAC-2340 platform Artifact presentation and other Plugins satisfy the fact and identity boundaries", () => {
  assert.deepEqual(checkArtifactsPlatformUi(root), []);
});

test("RAC-2340 platform Artifact UI refuses Store imports, namespace exports and direct SQL", () => {
  const file = "apps/workbench/src/artifacts/browser-view.ts";
  for (const source of [
    'import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";',
    'export * from "@molis-ai/molis-work-module-artifacts";',
    'import * as facts from "@molis-ai/molis-work-module-artifacts";',
    'import { DatabaseSync } from "node:sqlite";',
    'const query = "SELECT * FROM artifacts";',
    'const query = `DELETE FROM artifact_versions`;',
  ]) assert.ok(changed(file, source).length, source);
  assert.deepEqual(changed(file, 'export type { ArtifactBrowserView } from "@molis-ai/molis-work-module-artifacts";'), []);
});

test("RAC-2341 a Plugin cannot take the platform Artifact contribution id or retired project key", () => {
  const file = "plugins/native/goals/src/registration.ts";
  for (const source of [
    'const PROJECT_PLUGIN_ID = "artifacts";',
    'const registration = { project_plugin_id: "artifacts" };',
    'const id = "io.molis.work.native.artifacts.browser.v1";',
    'const id = "io.molis.work.native.artifacts.reference.v1";',
  ]) assert.ok(changed(file, source).length, source);
  assert.deepEqual(changed(file, 'const registration = { project_plugin_id: "goals" };'), []);
});

test("RAC-2341 restoring the former Artifact Plugin directory is refused", () => {
  const exists = fs.existsSync;
  fs.existsSync = file => String(file) === path.join(root, "plugins/native/artifacts") || exists(file);
  try { assert.match(checkArtifactsPlatformUi(root).join("\n"), /retired Manifest and registration/u); }
  finally { fs.existsSync = exists; }
});

test("RAC-2341 removing the resolved catalog key refusal is refused even when source literals look ordinary", () => {
  const file = "apps/local-host/src/plugin-registry.ts", source = fs.readFileSync(path.join(root, file), "utf8");
  assert.match(changed(file, source.replace("entry.project_plugin_id === ARTIFACTS_PROJECT_PLUGIN_ID", 'entry.project_plugin_id === "ordinary"')).join("\n"), /resolved registrations must refuse/u);
});
