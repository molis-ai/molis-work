import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { createMcpActionGrant } from "../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../apps/local-host/src/mcp-settings-store.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Character and Coding discover authorized unknown actions, preserve exact selections and explain withdrawn providers", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { localHost, projectId, homeDirectory, command, sessionId, evaluate, waitFor, click } = b;
  assert.ok(localHost); assert.ok(projectId);
  const project = molisWorkHostProjectReference({ databasePath: b.databasePath, boardId: DEMO_BOARD_ID, projectId });
  const read: ActionDefinition = { capability_id: "unknown.character-notes.read", version: 2, operation: "query", action: {
    title: "读取校验笔记", description: "读取此插件的原始笔记", kind: "query", scope: "project", audiences: ["agent"], permissions: ["notes:read"], subject_kinds: [],
    input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "string" } } };
  const write: ActionDefinition = { ...read, capability_id: "unknown.character-notes.write", operation: "command", action: { ...read.action, title: "修改校验笔记", kind: "operation", permissions: ["notes:write"] } };
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.character-actions", version: "1.0.0", name: "校验笔记插件", kind: "app",
    publisher: { publisher_id: "example", signature: "fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: ["notes:read", "notes:write"].map(permission => ({ permission, required: false, reason: "访问原笔记" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read, write] },
    async start() { return { kind: "app", actions: [read, write].map(def => ({ ...def, handle: () => "原笔记" })) }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(b.store.db), undefined, { actions: { registry: localHost.actionRegistry(project), project_id: projectId } });
  const install = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read", "notes:write"] }).install;
  await runtime.start(install.install_id);
  t.after(() => runtime.stop(install.install_id));
  const ref = { capability_id: read.capability_id, version: 2, provider_id: install.install_id };
  const caller = { actor_id: "agent:prologue", project_id: projectId, audience: "agent" as const, permissions: [] };
  for (const view of (await localHost.inspectActions(caller, project)).filter(row => [read.capability_id, write.capability_id].includes(row.capability_id))) {
    await writeMcpActionGrant(homeDirectory, createMcpActionGrant(caller.actor_id, projectId, view, true));
  }
  const fill = (selector: string, value: string) => evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const choose = (selector: string, title: string) => evaluate(`(()=>{const label=[...document.querySelectorAll(${JSON.stringify(selector)})].find(node=>node.textContent.includes(${JSON.stringify(title)}));if(!label)throw new Error('missing choice');label.querySelector('input').click();})()`);
  const open = async (id: string) => { await click(`[data-plugin-id="${id}"][data-work-surface-open]`); await waitFor(`!document.querySelector('[data-work-surface="${id}"]').hidden`); };
  const capture = async (name: string) => { const directory = join(process.cwd(), ".impeccable/review/agent-actions"); await mkdir(directory, { recursive: true });
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId); await writeFile(join(directory, name + ".png"), Buffer.from(shot.data, "base64")); };
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/` }, sessionId));
  await open("characters"); await click('[data-character-new]');
  await waitFor("!document.querySelector('[data-character-workspace]').hidden && !document.querySelector('[data-character-title]').disabled");
  await fill('[data-character-title]', "仅查询笔记"); await fill('[data-character-instructions]', "只依据实际读取结果回答。");
  await click('[data-character-actions-inherit]');
  await waitFor("document.querySelector('[data-character-actions-list]').textContent.includes('读取校验笔记')");
  await choose('[data-character-actions-list] label', "读取校验笔记"); await click('[data-character-save]');
  await waitFor("document.querySelector('[data-character-notice]').textContent.includes('草稿已保存')");
  const personal = openCharacters(homeDirectory, "web-user"); t.after(() => personal.close());
  let draft = personal.service.list().find(row => row.title === "仅查询笔记")!; assert.ok(draft); assert.deepEqual(draft.action_tools, [ref]);
  await click('[data-character-preview]'); await waitFor("document.querySelector('[data-character-dialog]').open");
  assert.ok(await evaluate("document.querySelector('[data-character-dialog-content]').textContent.includes('读取校验笔记')"));
  await click('[data-character-confirm]'); await waitFor("document.querySelector('[data-character-notice]').textContent.includes('已发布')");
  await evaluate("document.querySelector('[data-character-actions-field]').scrollIntoView({block:'center'})"); await capture("character-desktop");
  await open("coding"); await click('[data-coding-workbench] [data-coding-new]');
  await waitFor("!document.querySelector('[data-coding-task]').disabled"); await fill('[data-coding-task]', "保留这段任务草稿");
  await click('[data-coding-character-open]'); await waitFor("document.querySelector('[data-coding-character-list]').textContent.includes('仅查询笔记')");
  await choose('[data-coding-character-list] label', "仅查询笔记"); await click('[data-coding-character-save]');
  await waitFor("!document.querySelector('[data-coding-character-dialog]').open");
  await click('[data-coding-actions-open]'); await waitFor("document.querySelector('[data-coding-actions-list]').textContent.includes('读取校验笔记')");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-coding-actions-list] label')].find(row=>row.textContent.includes('修改校验笔记')).querySelector('input').disabled"), true);
  await choose('[data-coding-actions-list] label', "读取校验笔记"); await capture("coding-desktop"); await click('[data-coding-actions-save]');
  await waitFor("!document.querySelector('[data-coding-actions-dialog]').open");
  const codingId = await evaluate<string>("document.querySelector('[data-coding-session][aria-current=true]').dataset.codingSession");
  const sessionPath = `/projects/${projectId}/api/plugins/io.molis.work.coding/sessions/${codingId}`;
  const saved = await evaluate<any>(`fetch(${JSON.stringify(sessionPath)}).then(response=>response.json())`);
  assert.deepEqual(saved.action_tools, [ref]); assert.equal(saved.draft, "保留这段任务草稿");
  await runtime.stop(install.install_id); await b.reloadPage(); await open("coding");
  await waitFor("document.querySelector('[data-coding-task]').value === '保留这段任务草稿'");
  await click('[data-coding-actions-open]'); await waitFor("document.querySelector('[data-coding-actions-list]').textContent.includes('原能力、版本或授权不可用')");
  assert.equal(await evaluate("document.querySelector('[data-coding-actions-list] input:checked') !== null"), true);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
  await capture("coding-missing-narrow"); assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  await click('[data-coding-actions-save]'); await waitFor("!document.querySelector('[data-coding-actions-dialog]').open");
  assert.deepEqual((await evaluate<any>(`fetch(${JSON.stringify(sessionPath)}).then(response=>response.json())`)).action_tools, [ref]);
  await open("characters");
  await click(`[data-character-id="${draft.character_id}"]`);
  await waitFor("!document.querySelector('[data-character-workspace]').hidden");
  await fill('[data-character-title]', "保留失效能力的角色"); await click('[data-character-save]');
  await waitFor("document.querySelector('[data-character-notice]').textContent.includes('草稿已保存')");
  draft = personal.service.get(draft.character_id)!; assert.deepEqual(draft.action_tools, [ref]);
  await click('[data-character-preview]'); await waitFor("document.querySelector('[data-character-dialog]').open"); await click('[data-character-confirm]');
  await waitFor("document.querySelector('[data-character-notice]').textContent.includes('不可用')");
  assert.equal(await evaluate("document.querySelector('[data-character-dialog]').open"), true, "failed publication keeps its exact preview and draft");
});
