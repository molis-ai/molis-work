import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, seedDemoBoard } from "../apps/local-host/src/demo-seed.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { goalEventV35Kinds, materializeGoalEventV35Fixture } from "./goal-event-v35-fixture.js";

/**
 * Reads echo what is stored. One historical record that an output contract no longer admits makes the whole read
 * fail (a project page that does not open). Every parameterless read in the directory runs here over real historical
 * dumps and the demo seed; business errors are fine, a result that breaks its own contract is not.
 */
const needsNothing = (view: ActionView) => view.operation === "query"
  && view.action.input_schema?.type === "object" && !((view.action.input_schema.required as unknown[] | undefined)?.length);

async function probe(t: test.TestContext, databasePath: string, boardId: string) {
  const home = mkdtempSync(join(tmpdir(), "action-read-compatibility-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const copy = join(home, "project.sqlite"); copyFileSync(databasePath, copy);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: copy, boardId, projectId: boardId });
  const broken: string[] = []; let read = 0;
  try {
    const base = { actor_id: "web-user", project_id: boardId, audience: "user" as const, permissions: [] };
    for (const view of (await host.inspectActions(base, ref)).filter(needsNothing)) {
      const caller = { ...base, permissions: view.action.permissions };
      const client = view.action.scope === "home" ? host.homeActionClient() : host.actionClient(ref);
      try { await client.invoke(view.action.scope === "home" ? { ...caller, project_id: null } : caller, view, {}); read++; }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "actions.output_invalid") broken.push(`${view.capability_id}@${view.version}: ${(error as Error).message}`);
      }
    }
  } finally { await host.close(); }
  assert.ok(read > 10, "the directory must actually be read");
  assert.deepEqual(broken, []);
}

for (const kind of goalEventV35Kinds) {
  test(`every parameterless read accepts the historical v35 ${kind} project`, { timeout: 60_000 }, async t => {
    const fixture = materializeGoalEventV35Fixture(kind);
    t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
    // The dump predates the Molis Work rename and keeps the board id it was recorded with.
    await probe(t, fixture.path, "goalboard-v1-demo");
  });
}

test("every parameterless read accepts the demo seed project", { timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "action-read-demo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "demo.sqlite"); seedDemoBoard(databasePath);
  await probe(t, databasePath, DEMO_BOARD_ID);
});
