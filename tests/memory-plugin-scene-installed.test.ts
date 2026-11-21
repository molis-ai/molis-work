// PEQ-09 equal standing: a signed, installed plugin's declared `memory_scene` counts the same as a built-in's, per project, and only
// while it is installed there; an undeclared or unknown plugin stays "common".
import assert from "node:assert/strict";
import test from "node:test";
import { forgetInstalledMemoryScene, memoryRuntimePolicy, pluginMemoryScene, rememberInstalledMemoryScene, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
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
