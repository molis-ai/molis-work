// PEQ-09 equal standing: a signed, installed plugin's declared `memory_scene` counts the same as a built-in's, per project, and only
// while it is installed there; an undeclared or unknown plugin stays "common".
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forgetInstalledMemoryScene, memoryRuntimePolicy, pluginInstallActions, memorySceneChoices, memorySceneTaxonomy, pluginMemoryScene, rememberInstalledMemoryScene, sceneAfterRestart, skillConsumerOf, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

const THIRD_PARTY = "com.example.peq09.coder";
const owner = (): MemoryRuntimePolicyOwner => ({
  alive: () => true, projectExists: async () => true, deletingProject: () => undefined,
  forgettingPhase: () => { throw new Error("not read by callerForSession"); },
  prefsFor: () => { throw new Error("not read by callerForSession"); }, owners: () => [], candidateOwners: () => [],
});

test("PEQ-09 an installed plugin's declared memory scene is honoured like a built-in's, per project and while installed", async t => {
  t.after(() => { forgetInstalledMemoryScene("p-one", THIRD_PARTY); forgetInstalledMemoryScene("p-two", THIRD_PARTY); });
  const policy = memoryRuntimePolicy(owner);
  const session = (project_id: string) => policy.callerForSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id, plugin_id: THIRD_PARTY, install_id: "inst-1" }, "s-1");

  assert.equal(pluginMemoryScene(THIRD_PARTY, undefined, "p-one"), "common", "not installed: common");
  assert.equal((await session("p-one"))?.current_scene, "common");

  rememberInstalledMemoryScene("p-one", THIRD_PARTY, "coding");
  assert.equal(pluginMemoryScene(THIRD_PARTY, undefined, "p-one"), "coding");
  const caller = await session("p-one");
  assert.ok(caller, "the policy accepts the installed plugin's own coding session");
  assert.equal(caller.current_scene, "coding");
  assert.equal(pluginMemoryScene(THIRD_PARTY, undefined, "p-two"), "common", "a declaration in one project says nothing about another");
  assert.equal(pluginMemoryScene(THIRD_PARTY), "common", "without a project there is no installation to read");

  forgetInstalledMemoryScene("p-one", THIRD_PARTY);
  assert.equal(pluginMemoryScene(THIRD_PARTY, undefined, "p-one"), "common", "removed: back to common");
  rememberInstalledMemoryScene("p-two", THIRD_PARTY, undefined);
  assert.equal(pluginMemoryScene(THIRD_PARTY, undefined, "p-two"), "common", "an undeclared scene is common");
});

// BL-b44-coding-scene-enum (用户 2026-11-21 定): a scene is a name a plugin declares; the Host lists the built-ins' and the kept
// packages' when it starts, and a package kept later whose scene is new keeps memories in it after the next start.
test("BL-b44-coding-scene-enum memory scenes are what plugins declare, listed when the Host starts", async t => {
  const home = mkdtempSync(join(tmpdir(), "molis-scenes-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const keep = (folder: string, manifest: Record<string, unknown>) => {
    mkdirSync(join(home, "plugin-packages", folder), { recursive: true });
    writeFileSync(join(home, "plugin-packages", folder, "bundle.json"), JSON.stringify({ payload: { manifest } }));
  };
  keep("notes", { name: "Notes", memory_scene: "notes" });
  keep("odd", { name: "Odd", memory_scene: "Not A Scene" });
  keep("shared", { name: "Second Coder", memory_scene: "coding" });

  const listed = memorySceneTaxonomy(home);
  assert.deepEqual(listed.slice(-2), ["assistant", "common"], "the platform's own scenes close the list");
  assert.ok(listed.includes("coding"), "Coding declares its scene; the platform does not name it");
  assert.ok(listed.includes("notes"), "a kept package's scene is listed");
  assert.ok(!listed.includes("Not A Scene"), "a name that is not a scene is not listed");
  assert.equal(listed.filter(scene => scene === "coding").length, 1, "plugins that declare the same name share one scene");
  assert.deepEqual(memorySceneChoices(home).find(row => row.scene === "notes"), { scene: "notes", name: "Notes" });
  assert.equal(memorySceneChoices(home).find(row => row.scene === "coding")?.name, "Coding", "a shared scene is named by the built-in");
  assert.ok(!memorySceneChoices(home).some(row => row.scene === "assistant" || row.scene === "common"));

  keep("later", { name: "Later", memory_scene: "later" });
  assert.ok(!memorySceneTaxonomy(home).includes("later"), "read once: a scene kept after the start waits for the next one");
  assert.equal(sceneAfterRestart(home, "later"), true);
  assert.equal(sceneAfterRestart(home, "notes"), false);
  assert.equal(sceneAfterRestart(home, "common"), false);
  assert.equal(sceneAfterRestart(home, undefined), false);
  // The preview says so (`memory_scene_after_restart`), and the preview action's closed output schema admits it: a preview that hits it is not refused.
  const previewOutput = pluginInstallActions.preview.action.output_schema as { properties: Record<string, unknown> };
  assert.deepEqual(previewOutput.properties.memory_scene_after_restart, { const: true });

  const plugin = "com.example.b44.later";
  t.after(() => forgetInstalledMemoryScene("p-one", plugin));
  const policy = memoryRuntimePolicy(owner, undefined, memorySceneTaxonomy(home));
  const session = () => policy.callerForSession({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "p-one", plugin_id: plugin, install_id: "inst-1" }, "s-1");
  rememberInstalledMemoryScene("p-one", plugin, "later");
  assert.equal(await session(), undefined, "a scene the running memory does not list is refused until the next start");
  rememberInstalledMemoryScene("p-one", plugin, "notes");
  assert.equal((await session())?.current_scene, "notes");

  assert.equal(skillConsumerOf("io.molis.work.coding"), "coding", "a plugin's workspace rounds read Skills for its scene");
  assert.equal(skillConsumerOf("com.example.none"), "agent", "a plugin without a scene reads plugin-work Skills");
});
