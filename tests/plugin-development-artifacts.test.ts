import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runLocalPluginDevelopment } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

// `molis-work plugin dev` lists the 成果 versions the run's plugin published. A personal 成果 belongs to the Home's person whoever
// produced it (specs/artifact-positioning, 2026-10-07), so the run is told apart by the producing actor in `created_by`, not by owner.
const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("plugin dev lists the 成果 versions the plugin published although the person owns them", async () => {
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
