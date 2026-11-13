import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DIFF_CHANGESET_SCHEMA_VERSION, DIFF_CHANGESET_TYPE, FILE_SNAPSHOT_SCHEMA_VERSION, FILE_SNAPSHOT_TYPE, FILE_TEXT_SELECTION_SCHEMA_VERSION, FILE_TEXT_SELECTION_TYPE,
  FILES_COLLECTION_SCHEMA_VERSION, FILES_COLLECTION_TYPE, GIT_RESULT_SCHEMA_VERSION, GIT_RESULT_TYPE, WORKSPACE_REF_SCHEMA_VERSION, WORKSPACE_REF_TYPE,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { computeVersions, readVersionInputs } from "../scripts/generate-versions.mjs";
import { versionSource } from "../scripts/version-source.mjs";

// Each entry of tooling/versions.json has to be one thing: moving it moves what reads and writes that thing, all of it and nothing
// else. Every number is 1 today, so a wrong marker or a split entry only shows at the first bump. These tests make that bump here.
const repository = fileURLToPath(new URL("..", import.meta.url));
const real = versionSource(repository);
const files: Map<string, string> = readVersionInputs(repository, real);
const entries = Object.keys(real.versions);

function move(key: string, value: string | number): Map<string, string> {
  assert.ok(entries.includes(key), `${key} is an entry`);
  const { outputs, problems } = computeVersions({ ...real, versions: { ...real.versions, [key]: value } }, files);
  assert.deepEqual(problems, []);
  return outputs;
}
const moved = (key: string, value: string | number) => [...move(key, value).keys()].sort();
const source = (file: string) => {
  const text = files.get(file);
  assert.ok(text !== undefined, `${file} is scanned`);
  return text;
};

test("a marker sits on a version, not on a lower or upper bound", () => {
  const onBound = /[<>]=?\s*\/\* @version /;
  assert.ok(onBound.test("type.schema_version < /* @version manifest.schema */ 1"), "the check sees the spelling it is for");
  assert.deepEqual([...files].filter(([, text]) => onBound.test(text)).map(([file]) => file), []);
  // A declared type's schema_version stays a plain positive integer when the Manifest format moves.
  assert.ok(move("manifest.schema", 2).get("packages/plugin-sdk/src/manifest.ts")?.includes("type.schema_version < 1)"));
});

test("the session index has one number, and the SDK's own record versions are not ours", () => {
  assert.deepEqual(moved("format.prologue.session-index", 2), ["horizontal/agent-host/src/adapters/prologue-session-index.ts"]);
  for (const writer of ["prologue-node-port.ts", "prologue-run.ts"]) {
    assert.match(source(`horizontal/agent-host/src/adapters/${writer}`), /deps\.index\.save\(\{ schema: SESSION_INDEX_SCHEMA,/, `${writer} writes the index at its one number`);
  }
  assert.ok(!entries.includes("format.prologue.session-metadata"), "the storage metadata tag has no reader, and the receipt version is the SDK's");
});

test("a Coding plan is one entry: its type, the number it is written at and the number the Manifest declares move together", () => {
  assert.ok(!entries.includes("format.coding.plan"));
  assert.deepEqual(moved("type.coding.plan", 2), ["plugins/native/coding/src/artifacts.ts"]);
  const output = move("type.coding.plan", 2).get("plugins/native/coding/src/artifacts.ts")!;
  assert.ok(output.includes('"coding.plan.v2"'));
  assert.ok(output.includes("CODING_PLAN_SCHEMA_VERSION = /* @version type.coding.plan */ 2"));
  assert.ok(output.includes("[CODING_PLAN_TYPE]: CODING_PLAN_SCHEMA_VERSION,"), "the map the Manifest declares from takes that number");
  assert.match(source("plugins/native/coding/src/manifest.ts"), /process_items: \{\n\s*produces: \[CODING_PLAN_TYPE,[^\n]*CODING_ARTIFACT_SCHEMA_VERSIONS\[artifact_type_id\]/);
  assert.match(source("plugins/native/coding/src/routes-setup.ts"), /artifact_type_id: CODING_PLAN_TYPE, schema_version: CODING_PLAN_SCHEMA_VERSION/);
});

test("a shared workspace type is one entry: its id and its schema version cannot part", () => {
  assert.deepEqual(entries.filter(key => key.startsWith("format.contracts.")), []);
  const types: ReadonlyArray<readonly [string, string, number]> = [
    ["type.workspace.ref", WORKSPACE_REF_TYPE, WORKSPACE_REF_SCHEMA_VERSION],
    ["type.files.snapshot", FILE_SNAPSHOT_TYPE, FILE_SNAPSHOT_SCHEMA_VERSION],
    ["type.files.text-selection", FILE_TEXT_SELECTION_TYPE, FILE_TEXT_SELECTION_SCHEMA_VERSION],
    ["type.files.collection", FILES_COLLECTION_TYPE, FILES_COLLECTION_SCHEMA_VERSION],
    ["type.diff.changeset", DIFF_CHANGESET_TYPE, DIFF_CHANGESET_SCHEMA_VERSION],
    ["type.git.result", GIT_RESULT_TYPE, GIT_RESULT_SCHEMA_VERSION],
  ];
  for (const [key, id, version] of types) {
    assert.ok(id.endsWith(`.v${version}`), `${id} says ${version}`);
    assert.deepEqual(moved(key, 2), ["packages/contracts/src/modules/workspace-artifacts.ts"], `${key} has one home; readers take the exported constant`);
    const output = move(key, 2).get("packages/contracts/src/modules/workspace-artifacts.ts")!;
    assert.ok(output.includes(`"${id.replace(/\.v\d+$/, ".v2")}"`), `${key} moves the id`);
    assert.ok(output.includes(`/* @version ${key} */ 2`), `${key} moves the schema version`);
  }
});

test("an encoding discriminator is not a version, so moving a version cannot make it collide", () => {
  for (const key of ["format.artifact.portable", "encoding.artifact.blobs", "format.project.sections", "encoding.project-goals.chunks"]) assert.ok(!entries.includes(key), key);
  const exceptions: Array<{ file?: string; name?: string }> = JSON.parse(readFileSync(new URL("../tooling/gates/version-exceptions.json", import.meta.url), "utf8"));
  for (const file of ["modules/artifacts/src/fixed-version-replication-shape.ts", "modules/artifacts/src/sync-content.ts", "packages/storage/src/project-replica-content.ts", "apps/local-host/src/project-goal-content.ts"]) {
    assert.ok(exceptions.some(entry => entry.file === file && entry.name === "format"), `${file} states why`);
    assert.ok(!source(file).includes("@version"), `${file} has no entry to move`);
  }
});

test("an entry that served two things is split, and two entries for one thing are one", () => {
  assert.ok(!entries.includes("role.reader"));
  assert.deepEqual(moved("role.coding.main-reader", 2), ["plugins/native/coding/src/roles.ts"]);
  assert.deepEqual(moved("role.schedule.reader", 2), ["plugins/native/schedule/src/roles.ts"]);
  assert.ok(!entries.includes("format.continuity.assets"), "the same molis-work-assets bundle");
  assert.deepEqual(moved("format.asset.bundle", 2), ["apps/local-host/src/work-assets.ts", "server/src/continuity/service.ts"], "the writer and the reader move together");
  assert.ok(!entries.includes("format.builder.files-envelope"), "the signed package's own envelope");
  assert.ok(moved("format.plugin.package", 2).includes("plugins/native/plugin-builder/src/sync-file-limits.ts"), "the size limit is computed from the package format it limits");
});

test("the desktop navigation state is an entry, and a state saved at another number opens at the root", () => {
  const output = move("format.workbench.navigation-state", 2).get("apps/workbench/src/scripts/client/bootstrap.ts");
  assert.ok(output?.includes("DESKTOP_NAVIGATION_STATE = /* @version format.workbench.navigation-state */ 2"));
  assert.ok(output?.includes("const desktopNavigationStateVersion = ${DESKTOP_NAVIGATION_STATE};"));
  assert.match(source("apps/workbench/src/scripts/client/documents-state.ts"), /ui\?\.navigationVersion === desktopNavigationStateVersion\n\s*\? ui\?\.directory \|\| "root"\n\s*: "root";/);
});

test("the platform's own artifact producer carries the product version", () => {
  assert.ok(moved("product.release", "9.9.9").includes("modules/artifacts/src/artifact-provider.ts"));
});

test("a fixed name stays out of the table: UI contribution ids and slots have no reader that compares a number", () => {
  assert.deepEqual(entries.filter(key => key.startsWith("contract.") && !/^contract\.io\.molis\.work\.(?:module|modules|platform|service)\./.test(key)), []);
  assert.deepEqual(entries.filter(key => key.startsWith("slot.")), []);
  assert.match(source("plugins/native/coding/src/ui.ts"), /CODING_UI_CONTRIBUTION_ID = "io\.molis\.work\.native\.coding\.ui\.v1";/);
  assert.match(source("packages/plugin-sdk/src/sandbox-ui.ts"), /pluginId \+ "\.ui\.v1"/, "written the same way as a built-in's");
});

test("the action gateway pack takes its version from the table, in the SemVer form the SDK requires", () => {
  const version = real.versions["protocol.prologue.pack.action-gateway"];
  assert.match(String(version), /^\d+\.\d+\.\d+$/);
  assert.ok(source("horizontal/agent-host/src/adapters/prologue-action-gateway.ts").includes(`/* @version protocol.prologue.pack.action-gateway */ "${version}"`));
});
