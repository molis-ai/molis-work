import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, seedDemoBoard } from "../apps/local-host/src/demo-seed.js";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { goalEventHistoryKinds, materializeGoalEventHistory } from "./goal-event-history-fixture.js";

/**
 * Reads echo what is stored. One historical record that an output contract no longer admits makes the whole read
 * fail (a project page that does not open). Every parameterless read in the directory runs here over real historical
 * dumps and the demo seed. An unexpected error is a broken read, not an acceptable business result.
 */
const needsNothing = (view: ActionView) => view.operation === "query"
  && view.action.input_schema?.type === "object" && !((view.action.input_schema.required as unknown[] | undefined)?.length);

// These fixtures deliberately contain neither model settings nor a managed workspace.
// Match the exact capability/version AND code; unknown exceptions still fail the gate.
const unavailableInFixture: Record<string, string> = {
  "alchemist.runtime.verify@1": "RUNTIME_NOT_CONFIGURED",
  "git.operations@1": "actions.dependency_missing",
  "git.pr-support@1": "actions.dependency_missing",
  "git.results@1": "actions.dependency_missing",
  "git.state@1": "actions.dependency_missing",
  "git.summary@1": "actions.dependency_missing",
};

async function probe(t: test.TestContext, databasePath: string, boardId: string) {
  const home = mkdtempSync(join(tmpdir(), "action-read-compatibility-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const copy = join(home, "project.sqlite"); copyFileSync(databasePath, copy);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: copy, boardId, projectId: boardId });
  const broken: string[] = [], read = new Set<string>();
  try {
    const base = { actor_id: "web-user", project_id: boardId, audience: "user" as const, permissions: [] };
    for (const view of (await host.inspectActions(base, ref)).filter(needsNothing)) {
      const caller = { ...base, permissions: view.action.permissions };
      const client = view.action.scope === "home" ? host.homeActionClient() : host.actionClient(ref);
      try { await client.invoke(view.action.scope === "home" ? { ...caller, project_id: null } : caller, view, {}); read.add(view.capability_id); }
      catch (error) {
        const code = (error as { code?: string }).code;
        if (code && unavailableInFixture[`${view.capability_id}@${view.version}`] === code) continue;
        broken.push(`${view.capability_id}@${view.version}: ${code ?? "unexpected_error"}: ${(error as Error).message}`);
      }
    }
  } finally { await host.close(); }
  assert.deepEqual(broken, []);
  assert.ok(read.has("goals.snapshot.read"), "the historical project snapshot must actually succeed");
  assert.ok(read.size > 10, "the directory must actually be read");
}

for (const kind of goalEventHistoryKinds) {
  test(`every parameterless read accepts the historical v35 ${kind} project`, { timeout: 60_000 }, async t => {
    const fixture = materializeGoalEventHistory(kind);
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
