import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { CHARACTERS_ACTIONS, charactersActions as c } from "@molis-ai/molis-work-plugin-characters";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

test("Character management is redeemed by the project Runtime and bound to the person who owns the drafts", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "characters-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "角色动作", actor_id: "web-user" });
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write"] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => owner);
  try {
    const directory = (await client.discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.characters");
    assert.deepEqual(directory.map(row => row.capability_id).sort(), CHARACTERS_ACTIONS.map(row => row.capability_id).sort());
    assert.ok(directory.every(row => row.availability.available));

    const { draft } = await bound.invoke(c.create, {});
    const edited = (await bound.invoke(c.update, { id: draft.character_id, expected_revision: 1, title: "核对员", instructions: "先验证再下结论。", host_tools: ["read-file"] })).draft;
    assert.equal(edited.revision, 2);
    await assert.rejects(bound.invoke(c.update, { id: draft.character_id, expected_revision: 1, title: "过期", instructions: "过期", host_tools: null }),
      (error: { code?: string }) => error.code === "character.conflict");
    const published = await bound.invoke(c.publish, { id: draft.character_id, expected_revision: 2 });
    assert.equal(published.reference.version, 1);
    assert.equal((await bound.invoke(c.publish, { id: draft.character_id, expected_revision: 2 })).replayed, true);
    const listed = await bound.invoke(c.list, {});
    assert.equal(listed.drafts.length, 1); assert.equal(listed.publications.length, 1);

    // Another identity sees the directory rows but cannot use them: the drafts and publications are this person's.
    const agent: ActionCallContext = { ...owner, actor_id: "agent:runtime", audience: "agent" };
    const foreign = (await client.discover(agent)).filter(row => row.provider.plugin_id === "io.molis.work.characters");
    assert.ok(foreign.length > 0 && foreign.every(row => !row.availability.available));
    assert.ok(!foreign.some(row => ["characters.launch", "characters.imports.discover", "characters.imports.import"].includes(row.capability_id)),
      "local Agent imports and launches never reach an Agent or MCP client");
    await assert.rejects(client.invoke(agent, c.create, {}), (error: { code?: string }) => ["actions.owner_mismatch", "actions.forbidden"].includes(error.code ?? ""));
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
