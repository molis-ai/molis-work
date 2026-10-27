import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { codingManifest, codingRouteActions } from "@molis-ai/molis-work-plugin-coding";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

test("Coding's business surface is redeemed by the project Runtime, owner-bound, and the same code answers its routes", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "coding-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "编码动作", actor_id: "web-user" });
  catalog.close();
  const workspace = { workspace_id: "fixture", canonical_path: await realpath(home), realpath_verified: true as const, display_name: "fixture" };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspaceFor: async () => workspace, workspacesFor: async () => [workspace] });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"] };
  const client = host.actionClient(ref);
  const find = (id: string) => codingRouteActions[id]!.definition;
  try {
    const directory = (await client.discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.coding");
    // Its route actions plus the preview of its run reports (artifact-positioning A4): exactly what the Manifest declares for a person.
    // The text of a fixed result (`coding.results.document`) is declared too, but only a plugin can ask for it (W5-01-CODING-01), so a person's directory does not list it.
    const forPerson = codingManifest.actions!.filter(row => row.action.audiences.includes("user"));
    assert.deepEqual(forPerson.map(row => row.capability_id).sort(), codingManifest.actions!.map(row => row.capability_id).filter(id => id !== "coding.results.document").sort());
    assert.deepEqual(directory.map(row => row.capability_id).sort(), forPerson.map(row => row.capability_id).sort());

    const created = await client.invoke(owner, find("coding.create-session"), { title: "修复登录" }) as { session: { session_id: string; title: string } };
    assert.equal(created.session.title, "修复登录");
    const state = await client.invoke(owner, find("coding.state"), {}) as { sessions: Array<{ session_id: string }> };
    assert.ok(state.sessions.some(row => row.session_id === created.session.session_id));
    const read = await client.invoke(owner, find("coding.read-session"), { session_id: created.session.session_id }) as { session: { session_id: string }; runs: unknown[] };
    assert.equal(read.session.session_id, created.session.session_id);
    assert.deepEqual(read.runs, []);
    const renamed = await client.invoke(owner, find("coding.update-session"), { session_id: created.session.session_id, title: "修复登录超时" }) as { session: { title: string } };
    assert.equal(renamed.session.title, "修复登录超时");
    await assert.rejects(client.invoke(owner, find("coding.read-session"), { session_id: "missing" }), (error: { code?: string }) => error.code === "coding.session_unknown");

    // W2-18-CODING-CONTROL-VERSION-01, RC-01, AC-27-4, AC-28-5, RCPT-321: the expanded control schema has one current version (4: typed answers carry a value; 5: a value may be picked objects; 6: withdraw, and a supplement's about; 7: a supplement's source, RCPT-368).
    const control = find("coding.control-run"); assert.equal(control.version, 8);
    for (const version of [1, 2, 3, 4, 5, 6, 7]) await assert.rejects(client.invoke(owner, { ...control, version }, {}), (error: unknown) => error instanceof ActionError && error.code === "actions.missing");

    for (const [id, old] of [["coding.archive-preview", 1], ["coding.unarchive-preview", 1], ["coding.unarchive-session", 1], ["coding.update-session", 2]] as const) {
      assert.equal(find(id).version, old + 1, id);
      await assert.rejects(client.invoke(owner, { ...find(id), version: old }, {}), (error: unknown) => error instanceof ActionError && error.code === "actions.missing");
    }
    for (const [id, version] of [["coding.archived-sessions", 1], ["coding.unarchive-preview", 2], ["coding.unarchive-session", 2]] as const) {
      assert.equal(find(id).version, version, id); assert.deepEqual(find(id).action.audiences, ["user"]);
    }
    await assert.rejects(client.invoke(owner, find("coding.update-session"), { session_id: created.session.session_id, archive: true, archive_decision: { mode: "local" } }),
      (error: unknown) => error instanceof ActionError && error.code === "actions.input_invalid");

    // Other identities see the directory rows unavailable; starting rounds never reaches an Agent or MCP client at all.
    const external = (await client.discover({ ...owner, actor_id: "runtime:client", audience: "mcp" })).filter(row => row.provider.plugin_id === "io.molis.work.coding");
    assert.ok(external.length > 0 && external.every(row => !row.availability.available));
    assert.ok(!external.some(row => ["coding.runs.start", "coding.runs.control", "coding.sessions.update"].includes(row.capability_id)));
    await assert.rejects(client.invoke({ ...owner, actor_id: "runtime:client", audience: "mcp" }, find("coding.state"), {}),
      (error: { code?: string }) => ["actions.owner_mismatch", "actions.forbidden"].includes(error.code ?? ""));
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
