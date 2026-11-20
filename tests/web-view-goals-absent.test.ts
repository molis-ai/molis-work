import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { cachedMolisWorkWebView, declaredStageData } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

// ac-trust N3 (review of T7+T3b, RAC-400) + PEQ-03/PEQ-07: the platform WebView itself carries no Goals fields and
// never calls Goals; Goals stage data is read only through declared stage reads when "goals" is among the shown plugins.

const options = { databasePath: "/nonexistent/project.sqlite", projectId: "project-one" };

test("RAC-400 a project without Goals draws a generic WebView with no Goals fields and does not read Goals", async () => {
  const view = cachedMolisWorkWebView(new Map(), options);
  assert.equal("goals" in view, false, "platform WebView carries no Goals list");
  assert.equal("snapshot" in view, false, "platform WebView carries no Goals BoardSnapshot");
  const asked: string[] = [];
  const recording = { discover: async () => [], invoke: async (definition: { capability_id: string }) => { asked.push(definition.capability_id); throw new ActionError("actions.plugin_disabled", "off"); } } as never;
  const stageData = await declaredStageData(["schedule"], () => recording);
  assert.equal(asked.includes(goalsActions.collection.capability_id), false, "a project without Goals does not read goals.collection.read");
  assert.equal(asked.includes("goals.stage.read"), false, "a project without Goals does not read goals.stage.read");
  assert.equal("goals" in stageData, false);
});

test("RAC-400 declaredStageData omits a plugin whose read is refused by policy and propagates unexpected errors", async () => {
  for (const code of ["actions.plugin_disabled", "actions.missing", "actions.forbidden"] as const) {
    const answering = { discover: async () => [], invoke: async () => { throw new ActionError(code, "refused"); } } as never;
    const stageData = await declaredStageData(["goals"], () => answering);
    assert.equal("goals" in stageData, false, `${code} omits the optional stage payload`);
  }
  const failing = { discover: async () => [], invoke: async () => { throw new ActionError("actions.unavailable", "broken"); } } as never;
  await assert.rejects(declaredStageData(["goals"], () => failing),
    error => error instanceof ActionError && error.code === "actions.unavailable");
});
