import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { runningPluginPlatform } from "@molis-ai/molis-work-app-local-host";
import { partitionLibraryFile } from "./fixtures/plugin-home-stores.js";
import { probeAction, registerProbe } from "./fixtures/plugin-home-artifact-probe.js";
import { openTestHome } from "./fixtures/test-home.js";

test("BSH-02 · the real Host refuses a registered root with a mutable foreign-key target", async t => {
  // This process reads the Home store registry for the first time with this declaration already registered.
  let started = false;
  const probeManifestId = registerProbe(t, () => ({ ok: true }), () => { started = true; },
    sql => sql.replace("artifact_id TEXT NOT NULL", "artifact_id TEXT UNIQUE NOT NULL")
      + "CREATE TABLE history (source TEXT REFERENCES DATASETS(ARTIFACT_ID) ON UPDATE CASCADE);").plugin_id;
  const home = await openTestHome(t);
  const project = await home.createProject("Refused artifact owner", ["dataset"]);
  const caller = await home.host.localPersonContext(project.reference);
  await assert.rejects(home.host.actionClient(project.reference).invoke(caller, probeAction, {}), { code: "actions.missing" });
  // Dataset runs as its own instance in the partition (batch 107): the refused declaration starts none there.
  assert.equal(await home.host.withProject(project.reference, runtime => runningPluginPlatform(runtime.store, project.project_id, probeManifestId)), null);
  assert.equal(started, false);
  assert.equal(existsSync(partitionLibraryFile(home.home, project.project_id, "dataset")), false);
});
