import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

/**
 * Serial project or Home operations wait for each other. An action that waits on a model inside its handler must run
 * beside that queue (and commit only against what it read), or one slow reply stalls every other operation.
 * Exceptions are listed with the reason they may stay serial.
 */
const SERIAL_BY_DESIGN: Record<string, string> = {
  "experiments.run@1": "starts a background run and returns at once",

};
const configurationOnly = (id: string) => id.startsWith("scenes.enable:");

test("every action that waits on a model runs beside the serial queue unless it is listed with a reason", async () => {
  const home = await mkdtemp(join(tmpdir(), "action-model-scheduling-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), boardId: "a", projectId: "a" });
  const found = new Map<string, string | undefined>();
  try {
    for (const audience of ["user", "agent", "workflow", "mcp", "plugin"] as const) {
      for (const [project, reference] of [["a", ref], [null, undefined]] as const) {
        for (const view of await host.inspectActions({ actor_id: "web-user", project_id: project, audience, permissions: [] }, reference)) {
          if ((view.capability_id === "feed.sources.sync" || view.action.permissions.some(permission => permission === "model:invoke" || permission === "functions:invoke")) && !configurationOnly(view.capability_id)) found.set(`${view.capability_id}@${view.version}`, view.action.scheduling);
        }
      }
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
  assert.ok(found.size >= 10, "the directory must actually contain the model actions");
  const serial = [...found].filter(([, scheduling]) => scheduling !== "concurrent").map(([id]) => id).sort();
  assert.deepEqual(serial, Object.keys(SERIAL_BY_DESIGN).sort());
});
