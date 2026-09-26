import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { projectActionAvailability } from "../apps/local-host/dist/project-action-availability.js";
import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

test("directory reads installation once, while invocation and later discovery use current installation", async () => {
  const home = await mkdtemp(join(tmpdir(), "action-directory-install-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Directory", actor_id: "owner" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" });
  let catalogReads = 0, writes = 0, providerChecks = 0;
  const policy = projectActionAvailability(async (_options, run) => { catalogReads++; return run(catalog); }, home);
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined }, actionAvailability: policy });
  const reference = { project_id: project.project_id, board_id: project.board_id, storage_key: project.database_path };
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: [] };
  const empty = { type: "object", properties: {}, additionalProperties: false };
  const query: ActionDefinition = { capability_id: "fixture.sessions.read", version: 1, operation: "query", action: {
    title: "Read", description: "Read owner data", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: empty, output_schema: empty } };
  const write: ActionDefinition = { capability_id: "fixture.sessions.write", version: 1, operation: "command", action: { ...query.action,
    title: "Write", kind: "operation", required_actions: [{ capability_id: query.capability_id, version: 1 }] } };
  const sibling = { ...write, capability_id: "fixture.sessions.other-write" };
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture-work", plugin_id: "io.molis.work.sessions", kind: "plugin", title: "Work" },
    availability: () => { providerChecks++; return { available: true }; },
    definitions: [query, write, sibling], handlers: [{ ...sibling, handle: () => ({}) }, { ...query, handle: () => ({}) }, { ...write, handle: () => { writes++; return {}; } }] });
  const client = host.actionClient(reference);
  try {
    providerChecks = 0;
    assert.ok((await client.discover(caller)).every(view => view.availability.available));
    // Each directory checks three actions plus the two declared dependencies.
    assert.ok(providerChecks <= 3 + 2, `two dependent actions reuse the original visible directory; checks=${providerChecks}`);
    assert.equal(catalogReads, 1, "one current snapshot covers both actions and the dependency");
    await host.inspectActions(caller, reference);
    assert.equal(catalogReads, 2, "management inspection gets its own snapshot");
    await client.invoke(caller, write, {}); assert.equal(writes, 1);
    assert.ok(catalogReads > 2, "execution reads live policy rather than borrowing the directory snapshot");
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" });
    await assert.rejects(client.invoke(caller, write, {}), { code: "actions.plugin_disabled" });
    assert.equal(writes, 1);
    const before = catalogReads;
    assert.ok((await client.discover(caller)).every(view => !view.availability.available));
    assert.equal(catalogReads, before + 1);
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "sessions", actor_id: "owner" });
    assert.ok((await client.discover(caller)).every(view => view.availability.available));
    await client.invoke(caller, write, {}); assert.equal(writes, 2);
  } finally { await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); }
});
