import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { CHARACTERS_ACTIONS, charactersActions as c } from "@molis-ai/molis-work-module-characters";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";

// RAC-63: the Module's handlers, bound by the Host's provider (CHR-1), are what the project's directory redeems; RAC-64: other people are refused.
// RAC-70: no plugin answers for Characters: the Host registers the provider io.molis.work.characters with every Characters action.
test("Character management is redeemed by the project Runtime and bound to the person who owns the drafts", { timeout: 60_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "characters-actions-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "角色动作", actor_id: "web-user" });
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["artifact:read", "artifact:write"] };
  const client = host.actionClient(ref), bound = bindActionClient(client, () => owner);
  try {
    const directory = (await client.discover(owner)).filter(row => row.provider.plugin_id === "io.molis.work.characters");
    // The person's directory lists every Characters action offered to the person; the role list and the resolution answer plugins
    // too (role-service-design §5), `characters.execution` the person only.
    assert.deepEqual(directory.map(row => row.capability_id).sort(), CHARACTERS_ACTIONS.filter(row => row.action.audiences.includes("user")).map(row => row.capability_id).sort());
    assert.ok(directory.some(row => row.capability_id === c.rolesList.capability_id), "the person reads the roles, as the Assistant's picker does");
    assert.ok(c.rolesList.action.audiences.includes("plugin") && c.resolve.action.audiences.includes("plugin"));
    assert.ok(!c.execution.action.audiences.includes("plugin"), "the launch details stay the person's");
    assert.ok(directory.every(row => row.availability.available));

    // ROLE-01: a new role is saved as v1 when it is created, and can be chosen at once.
    const { draft, version } = await bound.invoke(c.create, { title: "核对员", instructions: "先验证再下结论。", host_tools: ["read-file"] });
    assert.equal(version, 1);
    const edited = await bound.invoke(c.update, { id: draft.character_id, expected_revision: draft.revision, title: "核对员", instructions: "先验证，再下结论。", host_tools: ["read-file"] });
    assert.equal(edited.draft.revision, draft.revision + 1); assert.equal(edited.version, 2);
    await assert.rejects(bound.invoke(c.update, { id: draft.character_id, expected_revision: draft.revision, title: "过期", instructions: "过期", host_tools: null }),
      // R4C1-01: the real update refuses a stale revision without overwriting the draft.
      (error: { code?: string }) => error.code === "characters.conflict");
    // 存进成果库 stays a separate, optional step: a fixed 成果 to cite, not what makes the role choosable.
    const published = await bound.invoke(c.publish, { id: draft.character_id, expected_revision: edited.draft.revision });
    assert.equal(published.reference.version, 1);
    assert.equal((await bound.invoke(c.publish, { id: draft.character_id, expected_revision: edited.draft.revision })).replayed, true);
    const listed = await bound.invoke(c.rolesList, {});
    assert.equal(listed.originals.length, 1);
    assert.deepEqual(listed.originals[0]!.availability, { available: true });
    assert.equal(listed.originals[0]!.version, 2);

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
