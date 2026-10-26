import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { cachedMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";

// ac-trust N3 (review of T7+T3b, RAC-400): the page reads the project's Goals first. A project that has no Goals (the plugin is off, or its
// actions are not there) reads as one with none. A read Goals refuses (`actions.forbidden`) is not "no Goals": it is shown as the error it is.

const options = { databasePath: "/nonexistent/project.sqlite", projectId: "project-one" };
const answering = (code: string) => ({ invoke: async () => { throw new ActionError(code as never, "refused"); } }) as never;

for (const code of ["actions.plugin_disabled", "actions.missing"]) {
  test(`RAC-400 a project whose Goals answer ${code} draws as one with no Goals`, async () => {
    const view = await cachedMolisWorkWebView(new Map(), null as never, options, answering(code));
    assert.deepEqual(view.goals, []);
    assert.equal(view.snapshot.board.project_id, options.projectId);
  });
}

test("RAC-400 a project whose Goals refuse the read (actions.forbidden) is an error to show, not a project with no Goals", async () => {
  await assert.rejects(cachedMolisWorkWebView(new Map(), null as never, options, answering("actions.forbidden")),
    error => error instanceof ActionError && error.code === "actions.forbidden");
});
