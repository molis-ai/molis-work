import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { cachedMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";

// ac-trust N3 (review of T7+T3b, RAC-400), with batch-41's full-run fix: whether a project has Goals is its plugin list, not the code a Goals
// read is refused with. A project without Goals draws as one with none and does not ask Goals; in a project with Goals, a refused read
// (any code: the policy answers `actions.plugin_disabled` too) is shown as the error it is.

const options = { databasePath: "/nonexistent/project.sqlite", projectId: "project-one" };
const answering = (code: string) => ({ invoke: async () => { throw new ActionError(code as never, "refused"); } }) as never;

test("RAC-400 a project without Goals draws as one with no Goals and does not read Goals", async () => {
  const asked: string[] = [];
  // The page's other areas (Feed, Inbox, Schedule) answer as plugins that are off; only what was asked is recorded.
  const recording = { invoke: async (definition: { capability_id: string }) => { asked.push(definition.capability_id); throw new ActionError("actions.plugin_disabled", "off"); } } as never;
  const view = await cachedMolisWorkWebView(new Map(), null as never, options, recording, false);
  assert.equal(asked.includes(goalsActions.collection.capability_id), false, "a project without Goals does not read Goals");
  assert.deepEqual(view.goals, []);
  assert.equal(view.snapshot.board.project_id, options.projectId);
});

for (const code of ["actions.plugin_disabled", "actions.missing", "actions.forbidden"]) {
  test(`RAC-400 a project with Goals whose read is refused (${code}) is an error to show, not a project with no Goals`, async () => {
    await assert.rejects(cachedMolisWorkWebView(new Map(), null as never, options, answering(code), true),
      error => error instanceof ActionError && error.code === code);
  });
}
