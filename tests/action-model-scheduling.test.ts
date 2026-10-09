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
  "images.jobs.start@1": "persists a background image job and returns running",
  "alchemist.explorations.start@1": "enqueues an exploration; the worker owns its lifetime",
  "alchemist.pulse.start@1": "enqueues a market pulse; the worker owns its lifetime",
  "alchemist.research.start@1": "enqueues a confirmed research plan; the worker owns its lifetime",

};
const configurationOnly = (id: string) => id.startsWith("scenes.enable:");

test("every action that waits on a model runs beside the serial queue unless it is listed with a reason", async () => {
  const home = await mkdtemp(join(tmpdir(), "action-model-scheduling-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "a.sqlite"), projectId: "a" });
  const found = new Map<string, string | undefined>();
  try {
    for (const audience of ["user", "agent", "workflow", "mcp", "plugin"] as const) {
      for (const [project, reference] of [["a", ref], [null, undefined]] as const) {
        for (const view of await host.inspectActions({ actor_id: "web-user", project_id: project, audience, permissions: [] }, reference)) {
          if ((view.action.execution?.cost === "metered" || view.capability_id === "feed.sources.sync" || view.action.permissions.some(permission => permission === "model:invoke" || permission === "functions:invoke")) && !configurationOnly(view.capability_id)) {
            assert.equal(view.action.execution?.cost, "metered", `${view.capability_id} must disclose its model use`);
            found.set(`${view.capability_id}@${view.version}`, view.action.scheduling);
          }
        }
      }
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
  assert.ok(found.size >= 10, "the directory must actually contain the model actions");
  const serial = [...found].filter(([, scheduling]) => scheduling !== "concurrent").map(([id]) => id).sort();
  assert.deepEqual(serial, Object.keys(SERIAL_BY_DESIGN).sort());
  assert.ok(found.has("alchemist.reuse.assess@1"), "custom AI permissions must also enter the scheduling check");
});

test("real Native AI declarations reach the Builder catalog and stop metered automatic queries", async () => {
  const { capabilityCatalog } = await import('../apps/local-host/src/plugin-builder/catalog.js');
  const { normalizeEffects } = await import('../plugins/native/plugin-builder/src/agent-authoring.js');
  const home = await mkdtemp(join(tmpdir(), 'native-execution-policy-'));
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, 'a.sqlite'), projectId: 'a' });
  try {
    const catalog = await capabilityCatalog({ registry: host.actionRegistry(ref), client: host.actionClient(ref), project_id: 'a', inspect: caller => host.inspectActions(caller, ref) }, 'web-user');
    for (const id of ['pages.ai', 'pages.generate', 'form.questions.ai', 'dataset.columns.ai', 'lingguang.conversation.message', 'jelly.plan.generate', 'cognia.knowledge.query', 'images.jobs.start', 'alchemist.reuse.assess']) {
      const entry = catalog.find(item => item.id === id); assert.ok(entry, id);
      assert.equal(entry.execution.cost, 'metered', id);
      assert.throws(() => normalizeEffects({ capabilities: [id] }, 'query', 'page load', catalog), /不能调用收费能力/, id);
    }
    const history = catalog.find(item => item.id === 'images.jobs.get'); assert.ok(history);
    assert.notEqual(history.execution.cost, 'metered');
    assert.deepEqual(normalizeEffects({ capabilities: [history.id] }, 'query', 'page load', catalog), { capabilities: [history.id] });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
