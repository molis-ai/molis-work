import assert from "node:assert/strict";
import test from "node:test";
import { catalogProblems, HomePluginHost, PLATFORM_PLUGIN_REGISTRATIONS } from "@molis-ai/molis-work-app-local-host";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// specs/repository-anti-corruption/slices/home-instance-project-services.md, PG-025: a Home instance is given no 成果, ports or events
// (their wiring lives in a project); a plugin that declares them is a dual-instance plugin, whose project half gets them.

const publishing = (manifest: PluginManifest): PluginManifest => ({ ...manifest,
  events: { publishes: [{ event_type_id: `${manifest.plugin_id}.changed`, type_version: 1 }], subscribes: [] } } as PluginManifest);

test("RAC-690 the catalog refuses a Home plugin that declares 成果, ports or events unless its registration marks it dual-instance", () => {
  const todo = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "todo")!;
  assert.deepEqual(catalogProblems(PLATFORM_PLUGIN_REGISTRATIONS), [], "the shipped list is clean");
  const others = PLATFORM_PLUGIN_REGISTRATIONS.filter(entry => entry !== todo);
  const declarations: Array<[string, Partial<PluginManifest>]> = [
    ["ports", { ports: { inputs: [{ port: "in", artifact_type_id: "example.in.v1", schema_version: 1, optional: true }], outputs: [] } }],
    ["output ports", { ports: { inputs: [], outputs: [{ port: "out", artifact_type_id: "example.out.v1", schema_version: 1 }] } }],
    ["event publication", { events: { publishes: [{ event_type_id: "io.molis.work.todo.changed", type_version: 1 }], subscribes: [] } }],
    ["event subscription", { events: { publishes: [], subscribes: [{ event_type_id: "io.molis.work.issues.changed", type_version: 1, from_plugin_ids: ["io.molis.work.issues"] }] } }],
    ["produced 成果", { artifacts: { produces: [{ artifact_type_id: "example.out.v1", schema_version: 1 }], consumes: [] } }],
    ["consumed 成果", { artifacts: { produces: [], consumes: [{ artifact_type_id: "example.in.v1", schema_version: 1 }] } }],
    ["process items", { process_items: { produces: [{ artifact_type_id: "example.item.v1", schema_version: 1 }], consumes: [] } }],
  ] as never;
  for (const [what, change] of declarations) {
    const entry: PluginRegistration = { ...todo, manifest: { ...todo.manifest, ...change } as PluginManifest };
    assert.match(catalogProblems([...others, entry]).join("\n"), /todo: a Home instance is given no 成果, ports or events/u, what);
    // The same declarations on a dual-instance registration (the Home half leaves them to its project half) are fine.
    const dual: PluginRegistration = { ...entry, runtime: { ...entry.runtime!, dual_instance: true } };
    assert.deepEqual(catalogProblems([...others, dual]), [], `${what}: dual-instance`);
  }
});

test("RAC-691 a Home instance that is not dual-instance and declares an event is not started: the plugin's own start is never reached", async t => {
  const todo = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "todo")!;
  const declared = publishing(todo.manifest), type = declared.events!.publishes[0]!;
  const run = async (dual: boolean) => {
    const home = mkdtempSync(join(tmpdir(), "home-coordination-")), actions = new ActionService();
    let started = 0;
    const create = (): PluginDefinition => { const own = todo.runtime!.create(); return { ...own, manifest: declared, event_types: [{ ...type, validate: payload => payload }],
      async start(context) { started += 1; return own.start(context); } }; };
    const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions,
      entries: [{ ...todo.runtime!, create, scope: "home", manifest: declared, ...dual ? { dual_instance: true as const } : {} }] });
    t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
    const platform = await host.ready();
    return { started, status: platform.supervisor.state(todo.manifest.plugin_id)?.status };
  };
  const refused = await run(false);
  assert.equal(refused.started, 0, "the Home executor refuses before the plugin's code is given any service");
  assert.notEqual(refused.status, "running");
  const allowed = await run(true);
  assert.equal(allowed.started, 1, "the same declaration on a dual-instance Home half starts");
  assert.equal(allowed.status, "running");
});
