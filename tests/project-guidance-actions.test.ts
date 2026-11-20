import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { projectGuidanceActions as g } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { createProjectGuidance } from "@molis-ai/molis-work-module-projects";
import { LocalSqliteJournal } from "@molis-ai/molis-work-storage";
import { bindActionClient, presentActionResult, validActionResultView, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { randomUUID } from "node:crypto";
import { createSingleHomeTestWebServer as createMolisWorkWebServer } from "./fixtures/local-web-core.js";

/*
 * A project's guidance is the platform's (specs/plugin-equal-standing/contract-design.md §9, PEQ-01): the same receipts, revisions,
 * prompt text, scope and live policy Goals gave, under `projects.guidance.*` and the `projects:guidance` permission.
 */
test("guidance action consumers preserve original receipts, revisions, prompt text, scope and policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-guidance-actions-"));
  const project = await withCatalog({ homeDirectory: home }, c => c.createProject({ display_name: "Guidance", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  let blocked = false;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
    blocked && action.capability_id.startsWith("projects.guidance.")
      ? { available: false, code: "actions.plugin_disabled", reason: "说明已停用" } : { available: true } });
  const caller: ActionCallContext = { actor_id: "runtime:guidance", project_id: project.project_id, audience: "agent", permissions: ["projects:guidance-read", "projects:guidance"] };
  const actions = host.actionClient(ref), bound = bindActionClient(actions, () => caller);
  const input = { kind: "constraint" as const, content: "用户数据只保存在本机。", source_refs: ["project://requirements"], reason: "长期数据边界",
    confirmation_summary: "用户已确认此原文", user_confirmed: true, idempotency_key: "original" };
  try {
    const before = await bound.invoke(g.read, {});
    await assert.rejects(bound.invoke(g.add, { ...input, user_confirmed: false }), { code: "projects.guidance.user_confirmation_required" });
    await assert.rejects(bound.invoke(g.add, { ...input, actor_id: "user" } as never), { code: "actions.input_invalid" });
    await assert.rejects(actions.invoke({ ...caller, permissions: [] }, g.add, input), { code: "actions.forbidden" });
    // Reading asks for its own permission, so a connected client reads the guidance only once granted (user 2026-11-18).
    await assert.rejects(actions.invoke({ ...caller, permissions: ["projects:guidance"] }, g.read, {}), { code: "actions.forbidden" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "foreign" }, g.add, input), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke({ ...caller, project_id: "foreign" }, g.read, {}), { code: "actions.scope_mismatch" });
    assert.deepEqual(await bound.invoke(g.read, {}), before);
    const legacy = await bound.invoke(g.add, input);
    assert.equal(legacy.replayed, false);
    const replayed = await bound.invoke(g.add, input);
    assert.deepEqual(replayed, { ...legacy, replayed: true });
    const duplicate = await bound.invoke(g.add, { ...input, idempotency_key: "same-content" });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.entry.guidance_id, legacy.entry.guidance_id);
    const addView = g.add.action.result_view;
    assert.ok(validActionResultView(addView));
    const link = { label: "查看项目说明", href: `/projects/${encodeURIComponent(project.project_id)}/settings/guidance` };
    for (const result of [legacy, replayed, duplicate]) assert.deepEqual(presentActionResult(addView, result, project.project_id), {
      summary: "项目长期说明已保存", text: input.content, link,
    }, "created, replayed and same-content results share a truthful saved-content entry without claiming a new row");
    assert.equal(presentActionResult(addView, duplicate)?.link, undefined, "without the original project context no management link is guessed");
    await assert.rejects(bound.invoke(g.add, { ...input, content: "不同请求" }));
    const update = { guidance_id: legacy.entry.guidance_id, action: "edit" as const, kind: "constraint" as const, content: "导出前由用户明确确认。",
      source_refs: ["project://new-requirements"], reason: "准确说明导出边界", confirmation_summary: "用户确认修改", user_confirmed: true, idempotency_key: "edit" };
    const edited = await bound.invoke(g.update, update);
    assert.equal(edited.entry.revision, 2); assert.equal(edited.entry.updated_by, caller.actor_id);
    assert.deepEqual(await bound.invoke(g.update, update), { ...edited, replayed: true });
    const afterEdit = await bound.invoke(g.read, {});
    assert.equal(afterEdit.entries[0]?.content, update.content);
    assert.deepEqual(new Set(afterEdit.revisions.map(revision => revision.content)), new Set([input.content, update.content]));
    assert.match(afterEdit.runtime_prompt_prefix, /导出前由用户明确确认/);
    assert.doesNotMatch(afterEdit.runtime_prompt_prefix, /用户数据只保存在本机/);
    // PLIB-15 (S8): the prefix no longer carries a "Project: <name>" line; the board has no name any more and the Host adds no layer to bring it back.
    assert.doesNotMatch(afterEdit.runtime_prompt_prefix, /^Project:/m);
    assert.doesNotMatch(afterEdit.runtime_prompt_prefix, /Guidance/);
    const change = { guidance_id: legacy.entry.guidance_id, reason: "用户改变项目设置", confirmation_summary: "已确认", user_confirmed: true };
    const deactivated = await bound.invoke(g.update, { ...change, action: "deactivate", idempotency_key: "off" });
    const disabled = await bound.invoke(g.read, {});
    assert.equal(disabled.entries.length, 0); assert.equal(disabled.inactive_entries.length, 1);
    assert.doesNotMatch(disabled.runtime_prompt_prefix, /导出前由用户明确确认/);
    const reactivated = await bound.invoke(g.update, { ...change, action: "restore", idempotency_key: "on" });
    const updateView = g.update.action.result_view;
    assert.ok(validActionResultView(updateView));
    for (const result of [edited, deactivated, reactivated]) assert.deepEqual(presentActionResult(updateView, result, project.project_id), {
      summary: "项目长期说明变更已保存", text: update.content, link,
    }, "edit, deactivate and restore point to the original content without claiming deletion or continued activation");
    const restored = await bound.invoke(g.read, {});
    assert.equal(restored.entries[0]?.revision, 4); assert.equal(restored.revisions.length, 4);
    blocked = true;
    await assert.rejects(bound.invoke(g.read, {}), { code: "actions.plugin_disabled" });
    await assert.rejects(bound.invoke(g.add, { ...input, idempotency_key: "denied" }), { code: "actions.plugin_disabled" });
    await assert.rejects(bound.invoke(g.update, { ...update, idempotency_key: "denied" }), { code: "actions.plugin_disabled" });
    await host.close();
    const restarted = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
    try { assert.deepEqual(await restarted.actionClient(ref).invoke(caller, g.read, {}), restored); }
    finally { await restarted.close(); }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("Web settings and Work prompt consume the same guidance and obey live read/write policy", async () => {
  const home = await mkdtemp(join(tmpdir(), "project-guidance-http-"));
  const project = await withCatalog({ homeDirectory: home }, async c => {
    const created = await c.createProject({ display_name: "Guidance HTTP", actor_id: "user" });
    c.addProjectPlugin({ project_id: created.project_id, plugin_id: "goals", actor_id: "user" });
    return created;
  });
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const denied = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
    denied.has(action.capability_id) ? { available: false, code: "actions.plugin_disabled", reason: "说明停用" } : { available: true } });
  const token = "guidance-control-token-0123456789";
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`, base = `${origin}/projects/${project.project_id}`;
    const request = (path: string, body?: unknown, method = "POST", authorized = true) => fetch(base + path, body === undefined ? {} : {
      method, headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(authorized ? { "x-molis-work-control-token": token } : {}) }, body: JSON.stringify(body),
    });
    const input = { kind: "constraint", content: "所有导出必须由用户发起。", reason: "项目数据边界", user_confirmed: true, idempotency_key: "web-guidance" };
    assert.equal((await request("/api/project-guidance", input, "POST", false)).status, 403);
    const response = await request("/api/project-guidance", input);
    assert.equal(response.status, 200, await response.clone().text());
    const added = await response.json() as { entry: { guidance_id: string; created_by: string }; project_guidance: unknown };
    assert.equal(added.entry.created_by, "web-user");
    assert.deepEqual(await (await request("/api/project-guidance")).json(), added.project_guidance);
    const goal_id = "GUIDANCE-WEB";
    const bound = bindActionClient(host.actionClient(ref), () => ({ actor_id: "user", audience: "user", project_id: project.project_id, permissions: ["goals:write"] }));
    await bound.invoke(goalsActions.create, { goal_id, title: "使用项目说明", idempotency_key: "create" });
    const promptPath = `/api/work-terminals/io.molis.work.goals/goal/${goal_id}/prompt`;
    const prompt = await request(promptPath, {});
    assert.equal(prompt.status, 200, await prompt.clone().text());
    assert.match((await prompt.json() as { prompt: string }).prompt, /所有导出必须由用户发起/);
    const editPath = `/api/project-guidance/${added.entry.guidance_id}`;
    denied.add(g.update.capability_id);
    const update = { ...input, action: "deactivate", idempotency_key: "off" };
    assert.equal((await request(editPath, update)).status, 403);
    assert.deepEqual(await (await request("/api/project-guidance")).json(), added.project_guidance);
    denied.clear();
    assert.equal((await request(editPath, update)).status, 200);
    assert.doesNotMatch((await (await request(promptPath, {})).json() as { prompt: string }).prompt, /所有导出必须由用户发起/);
    denied.add(g.read.capability_id);
    assert.equal((await request("/api/project-guidance")).status, 403);
    assert.equal((await request("/settings/guidance")).status, 403);
    const savedWithoutRefresh = await request("/api/project-guidance", { ...input, content: "保留恢复记录。", idempotency_key: "saved-without-refresh" });
    assert.equal(savedWithoutRefresh.status, 200);
    const receipt = await savedWithoutRefresh.json() as { created: boolean; project_guidance: unknown; project_guidance_error: string };
    assert.equal(receipt.created, true); assert.equal(receipt.project_guidance, null); assert.match(receipt.project_guidance_error, /说明停用/);
    assert.equal(await host.withProject(ref, runtime => createProjectGuidance({ db: runtime.store.db, journal: new LocalSqliteJournal(runtime.store.db),
      requestHash: () => "" }).read(project.project_id).entries[0]?.content), "保留恢复记录。");
    const deniedPrompt = await request(promptPath, {});
    assert.ok(deniedPrompt.status >= 400); assert.match(await deniedPrompt.text(), /说明停用/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await host.close(); await rm(home, { recursive: true, force: true }); }
});
