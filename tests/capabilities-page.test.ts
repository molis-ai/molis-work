import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { INBOX_ACTION_PERMISSIONS, inboxActions, inboxNextScene, inboxSceneBindingId } from "@molis-ai/molis-work-plugin-inbox";
import { createFunctionsService } from "@molis-ai/molis-work-module-judgment-rules";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("system capability pages derive unknown capabilities, bindings, lifecycle and scoped history from the real Host", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "capability-page-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "能力范围", actor_id: "test" });
  catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "feed", actor_id: "test" });
  catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "inbox", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  // The project's plugins (Inbox among them) come from the Catalog, so the Host reads it the way the desktop does.
  const policy = projectActionAvailability(async (_options, run) => run(catalog), home);
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: {} }, actionAvailability: policy, sceneAvailability: policy });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: "capabilities-ui-test-control-token" });
  let enabled = true, calls = 0;
  const definition: ActionDefinition = { capability_id: "unknown.fixture.judge", version: 7, operation: "command", action: {
    title: '自定义判断 <script>untrusted()</script>', description: "根据真实材料判断下一步", kind: "judgment", scope: "home",
    audiences: ["user"], permissions: [], subject_kinds: ["inbox_entry"], input_schema: inboxNextScene.input_schema,
    output_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: ["inbox.done"] } } }, required: ["status", "suggested_behavior_ids"] },
    output_type: inboxNextScene.result_type,
  } };
  const stop = host.actionRegistry().registerProvider({ provider: { provider_id: "unknown.provider", title: "测试服务", kind: "plugin" },
    definitions: [definition], handlers: [{ ...definition, handle: () => { calls++; return { status: "ok", suggested_behavior_ids: ["inbox.done"] }; } }],
    availability: () => enabled ? { available: true } : { available: false, code: "test.disconnected", reason: "测试服务已断开" },
  });
  const caller = { actor_id: "web-user", project_id: reference.project_id, audience: "user" as const, permissions: [...INBOX_ACTION_PERMISSIONS] };
  try {
    // Inbox is a plugin of the project: its scene is there once the plugin has started, which an action of its own waits for.
    await host.actionClient(reference).invoke(caller, inboxActions.readJudgment, {});
    await host.sceneClient(reference).bind(caller, { binding_id: inboxSceneBindingId(project.project_id), scene_id: inboxNextScene.scene_id,
      scene_version: inboxNextScene.version, project_id: project.project_id, function: definition, enabled: true, title: "实际入箱绑定" });
    const functions = createFunctionsService({ home, credential: () => null });
    try {
      for (const [key, board] of [["global-record", undefined], ["selected-record", project.project_id], ["other-record", "other-project"]] as const) {
        functions.recordSceneJudgment({ function_key: key, function_version: 1, subject: { kind: "mcp_invoke", id: key, ...(board ? { project_id: board } : {}) },
          scene_id: null, outcome: "ok", suggested_behavior_ids: [], error_code: null });
      }
    } finally { functions.close(); }
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const read = async (path: string) => { const response = await fetch(base + path); assert.equal(response.status, 200, path); return response.text(); };
    const selected = `/capabilities/library?action=${definition.capability_id}&version=7`;
    const workbench = await read(`/projects/${project.project_id}/`);
    assert.doesNotMatch(workbench, /data-work-surface="functions"|data-directory-panel="functions"/);
    for (const query of ["openPlugin=functions&openItem=stable-rule", "panePlugin=functions&paneItem=stable-rule&workbenchPane=old-pane"]) {
      const redirected = await fetch(`${base}/projects/${project.project_id}/?${query}&desktop=1`, { redirect: "manual" });
      assert.equal(redirected.status, 302);
      assert.equal(redirected.headers.get("location"), `/capabilities/rules?project=${project.project_id}&rule=stable-rule&desktop=1`);
    }
    assert.match(await read(`/capabilities/rules?project=${project.project_id}`), /functions-system-editor/);
    assert.match(workbench, new RegExp(`href="/capabilities/library\\?project=${project.project_id}"`));
    assert.doesNotMatch(workbench, /__SYSTEM_CAPABILITIES__/);
    const global = await read(selected);
    assert.match(global, /自定义判断 &lt;script&gt;untrusted\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(global, /<script>untrusted\(\)<\/script>/);
    assert.match(global, /当前范围还没有保存的使用位置/);
    assert.doesNotMatch(global, /交互预览/);
    const scoped = await read(`${selected}&project=${project.project_id}&desktop=1`);
    assert.match(scoped, /合同兼容/);
    assert.match(scoped, /inbox\.list/);
    assert.match(scoped, /已启用/);
    assert.match(scoped, /project=.*desktop=1/);
    assert.equal(calls, 0, "browsing must not execute a judgment or probe its provider");
    assert.match(await read(`/capabilities/library?q=no-matches&project=${project.project_id}`), /没有符合条件的能力/);
    assert.equal((await fetch(`${base}/capabilities/library?project=missing`)).status, 404, "unknown scope must not silently show Home");
    enabled = false;
    assert.match(await read(selected), /测试服务已断开/);
    // A call turned away because the service is disconnected is in the call history, marked as not run (not as failed), with its error code and not the reason.
    await assert.rejects(host.actionClient(reference).invoke(caller, definition, {}));
    const turnedAway = await read(`/capabilities/history?project=${project.project_id}`);
    assert.match(turnedAway, /<span class="is-unavailable">未执行<\/span>/);
    assert.match(turnedAway, /<p>错误码：test\.disconnected<\/p>/);
    assert.doesNotMatch(turnedAway, /测试服务已断开|未执行的原因/, "the reason the provider gave is not stored, so it is not shown");
    assert.doesNotMatch(turnedAway, /<span class="is-unavailable">失败<\/span>/);
    enabled = true;
    assert.doesNotMatch(await read(selected), /测试服务已断开/);
    stop();
    assert.match(await read(selected), /能力已不可访问/);
    const globalHistory = await read("/capabilities/history");
    assert.match(globalHistory, /global-record/);
    assert.doesNotMatch(globalHistory, /selected-record|other-record/);
    const projectHistory = await read(`/capabilities/history?project=${project.project_id}`);
    assert.match(projectHistory, /selected-record/);
    assert.doesNotMatch(projectHistory, /global-record|other-record/);
    assert.match(await read("/capabilities/connections"), /<h1 id="settings-title">服务连接<\/h1>/);
    const connectionsPage = await read(`/capabilities/connections?project=${project.project_id}&desktop=1`);
    assert.match(connectionsPage, /data-connector-detail="typesafe"[\s\S]*data-functions-settings/);
    assert.match(connectionsPage, /<h3 id="functions-settings-title">/);
    assert.doesNotMatch(connectionsPage, /<h1 id="functions-settings-title">/);
    assert.equal((await fetch(`${base}/settings/functions?project=${project.project_id}&desktop=1`, { redirect: "manual" })).headers.get("location"), `/capabilities/connections?project=${project.project_id}&desktop=1&connector=typesafe`);
    assert.match(await read("/capabilities/access"), /<h1 id="settings-title">对外接入<\/h1>/);
    assert.match(await read(`/capabilities/access?project=${project.project_id}&desktop=1`), new RegExp(`href="/settings/runtimes\\?project=${project.project_id}&desktop=1"`));
    assert.equal((await fetch(base + "/capabilities", { redirect: "manual" })).headers.get("location"), "/capabilities/library");
    assert.equal((await fetch(`${base}/settings/connectors?desktop=1&project=${project.project_id}`, { redirect: "manual" })).headers.get("location"), `/capabilities/connections?desktop=1&project=${project.project_id}`);
    assert.equal((await fetch(base + "/settings/mcp", { redirect: "manual" })).headers.get("location"), "/capabilities/access");
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
});
