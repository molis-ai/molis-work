import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { charactersActions as c } from "@molis-ai/molis-work-plugin-characters";
import { WORKFLOWS_ACTION_PERMISSIONS, workflowsActions as w } from "@molis-ai/molis-work-plugin-workflows";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { actionUsageActions, type ActionUsagesResult } from "../apps/local-host/src/action-usage-actions.js";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";

test("where a capability is used comes from each owner of saved references: workflow steps, Character scopes and client grants", { timeout: 120_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "action-usages-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "使用位置", actor_id: "web-user" });
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const owner: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user",
    permissions: [...new Set(["artifact:read", "artifact:write", ...WORKFLOWS_ACTION_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS])] };
  const client = host.actionClient(ref), actions = bindActionClient(client, () => owner);
  try {
    const status = (await client.discover(owner)).find(row => row.capability_id === inboxActions.setStatus.capability_id)!;
    const target = { capability_id: status.capability_id, version: status.version, provider_id: status.provider.provider_id };
    const usagesOf = async (action = target, caller = owner) => await client.invoke(caller, actionUsageActions.read, { action }) as ActionUsagesResult;
    assert.deepEqual((await usagesOf()).usages, [], "nothing saved yet");

    // A workflow step, a Character scope and a client grant each save a reference to the same version.
    const step = (await actions.invoke(w.actionSteps, {})).actions.find(row => row.ref.capability_id === target.capability_id)!;
    const { workflow } = await actions.invoke(w.create, { title: "完成事项", chain: { stations: [{ plugin: "feed" },
      { plugin: "action", action: { ref: step.ref, title: step.title, group: step.group, mapping: { entry_id: { from: "title" }, status: { value: "done" }, expected_revision: { value: 1 } } } }],
      links: [{ kind: "function", title_template: "", body_template: "{正文}", instructions: "" }] } });
    const { draft } = await actions.invoke(c.create, {});
    await actions.invoke(c.update, { id: draft.character_id, expected_revision: draft.revision, title: "收尾员", instructions: "只做收尾", host_tools: null, action_tools: [target] });
    await writeMcpActionGrant(home, createMcpActionGrant("client-x", project.project_id, status, true));

    const { usages, issues } = await usagesOf();
    assert.deepEqual(issues, []);
    const byReporter = Object.fromEntries(usages.map(usage => [usage.reporter, usage]));
    assert.equal(byReporter["工作流程"]?.title, `流程「完成事项」第 2 步`);
    assert.match(byReporter["工作流程"]!.detail!, /entry_id ← 标题，status = done/);
    assert.equal(byReporter["Characters"]?.title, "角色「收尾员」");
    assert.equal(byReporter["Characters"]?.enabled, true);
    const grant = usages.find(usage => usage.title === "MCP 客户端「client-x」")!;
    assert.equal(grant.enabled, true);
    assert.equal(grant.href, `/capabilities/access?client=client-x&project=${project.project_id}`);
    assert.ok(usages.every(usage => usage.source.provider_id && usage.usage_id));

    // Another version or capability is not the same saved reference.
    assert.deepEqual((await usagesOf({ ...target, version: 2 })).usages, []);
    assert.deepEqual((await usagesOf({ ...target, capability_id: inboxActions.list.capability_id })).usages, []);
    // Owners the caller may not read stay out of its answer; an owner that is there but refuses this caller is named.
    const limited = await usagesOf(target, { ...owner, permissions: owner.permissions.filter(permission => permission !== "workflows:read") });
    assert.ok(!limited.usages.some(usage => usage.title.startsWith("流程")));
    const agent = await usagesOf(target, { ...owner, actor_id: "agent:runtime", audience: "agent" });
    assert.ok(!agent.usages.some(usage => usage.reporter === byReporter["Characters"]!.reporter || usage.title.startsWith("MCP")), JSON.stringify(agent.usages));
    assert.ok(agent.issues.some(issue => issue.startsWith(byReporter["Characters"]!.reporter + "：")), JSON.stringify(agent.issues));

    // Deleting the workflow removes its usage; the others stay.
    await actions.invoke(w.delete, { id: workflow.workflow_id });
    assert.deepEqual((await usagesOf()).usages.map(usage => usage.reporter).sort(), [byReporter["Characters"]!.reporter, grant.reporter].sort());
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});
