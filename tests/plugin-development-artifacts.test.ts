import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runLocalPluginDevelopment } from "@molis-ai/molis-work-app-local-host";
import { CHARACTER_ARTIFACT_TYPE } from "@molis-ai/molis-work-contracts/modules/characters";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

// `molis-work plugin dev` lists the 成果 versions the run's plugin published. A personal 成果 belongs to the Home's person whoever
// produced it (specs/artifact-positioning, 2026-10-07), so the run is told apart by the producing actor in `created_by`, not by owner.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("W3-07-6-01: plugin dev lists the 成果 versions the plugin published although the person owns them", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-artifacts-"));
  try {
    // The repository sample, with the workspace SDK where `npm install` would put the packed one.
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "manifest.json", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    const manifest = JSON.parse(readFileSync(join(sample, "manifest.json"), "utf8")) as { permissions: Array<{ permission: string }> };
    const run = () => runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true });

    const first = await run();
    assert.equal(first.poll.ok, true);
    assert.equal(first.artifacts.length, 1, "the version the plugin published is listed");
    assert.deepEqual([first.artifacts[0].owner_actor_id, first.artifacts[0].created_by], [LOCAL_PERSON_ACTOR_ID, "local-plugin-developer"]);
    assert.deepEqual(first.artifacts[0].payload, { title: "Local sample result", sequence: 1 });

    // Versions from earlier runs on the same development state stay listed.
    const second = await run();
    assert.deepEqual(second.artifacts.map(value => value.version).sort(), [1, 2]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});


// A3: the development run is judged by the Manifest it runs, like any installation. Binding it to the project's version stores lets it
// write what it declares; a type it does not declare is still refused (by the Runtime's own check first), and nothing is stored.
test("W3-07-6-01 A3: a development plugin that does not declare the type it publishes is refused and stores nothing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-undeclared-"));
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    const manifest = JSON.parse(readFileSync(join(root, "examples/plugin-sample/manifest.json"), "utf8")) as { permissions: Array<{ permission: string }>; artifacts: { produces: unknown[] } };
    manifest.artifacts.produces = [];
    writeFileSync(join(sample, "manifest.json"), JSON.stringify(manifest));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    const run = () => runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true });
    const result = await run().then(value => ({ value }), error => ({ error }));
    const refused = "error" in result ? String(result.error) : JSON.stringify(result.value.poll);
    assert.match(refused, /未声明生产此成果|没有在 artifacts\.produces 声明/u);
    if ("value" in result) assert.equal(result.value.artifacts.length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("W3-07-6-01: nonempty and unsupported development state are refused before loading code", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-dev-state-refusal-"));
  try {
    const ordinary = join(directory, "ordinary"), marked = join(directory, "marked"); mkdirSync(ordinary); mkdirSync(marked);
    writeFileSync(join(ordinary, "keep.txt"), "preserve this ordinary directory");
    writeFileSync(join(marked, ".molis-work-plugin-development.json"), JSON.stringify({ kind: "foreign", schema_version: 1 }));
    const input = { directory: join(directory, "does-not-exist"), grants: [], allow_unsigned_development: true as const };
    await assert.rejects(runLocalPluginDevelopment({ ...input, state_directory: ordinary }), /非空的普通目录/);
    await assert.rejects(runLocalPluginDevelopment({ ...input, state_directory: marked }), /不是受支持/);
    assert.equal(readFileSync(join(ordinary, "keep.txt"), "utf8"), "preserve this ordinary directory");
    assert.equal(existsSync(join(ordinary, "development.db")), false); assert.equal(existsSync(join(marked, "development.db")), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

// S-82: the development run reserves the names this build ships, so a plugin learns here what its real install would refuse.
test("RAC-417 S-82 a development plugin that declares a type this build already owns is refused and stores nothing", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-dev-owned-type-"));
  try {
    const sample = join(directory, "sample");
    mkdirSync(sample);
    for (const file of ["index.mjs", "package.json"]) cpSync(join(root, "examples/plugin-sample", file), join(sample, file));
    const manifest = JSON.parse(readFileSync(join(root, "examples/plugin-sample/manifest.json"), "utf8")) as {
      permissions: Array<{ permission: string }>; artifacts: { produces: Array<{ artifact_type_id: string }>; consumes: Array<{ artifact_type_id: string }> } };
    manifest.artifacts.produces[0]!.artifact_type_id = CHARACTER_ARTIFACT_TYPE;
    manifest.artifacts.consumes = [];
    writeFileSync(join(sample, "manifest.json"), JSON.stringify(manifest));
    mkdirSync(join(sample, "node_modules/@molis-ai"), { recursive: true });
    symlinkSync(join(root, "packages/plugin-sdk"), join(sample, "node_modules/@molis-ai/molis-work-plugin-sdk"), "dir");
    await assert.rejects(runLocalPluginDevelopment({ directory: sample, state_directory: join(directory, "state"),
      grants: manifest.permissions.map(value => value.permission), allow_unsigned_development: true }), /character\.definition\.v1|已由/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
