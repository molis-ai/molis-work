import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin } from "../packages/plugin-sdk/src/index.js";
import type { ActionDefinition, ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxNextScene, inboxSceneBindingId, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withFunctionsService } from "../apps/local-host/src/functions-host.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Inbox shows and runs an installed plugin judgment, then withdraws advice while preserving its stopped binding and history", { timeout: 90000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { store, localHost, projectId, homeDirectory, command, sessionId, navigate, evaluate, waitFor, click, origin } = browser;
  assert.ok(localHost); assert.ok(projectId);
  const boardId = store.goalsQuery.listBoardIds()[0]!;
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, boardId, projectId });
  await localHost.withProject(reference, () => undefined);
  const feed = createLocalFeedApplication(store.db);
  const source = createLocalFeedSourceService(store.db, boardId).register({ kind: "research_library", repository: "fixture/inbox", research_source: "current" }).source;
  const item = feed.ingestItem({ source, externalId: "inbox-current", title: "等待核对的研究", summary: "待核对", body: "研究原文需要人工确认", occurredAt: new Date().toISOString(), attention: false }).item;
  const entry = feed.ensureInboxEntryForFeedItem(boardId, item.item_id, "manual").entry;
  const definition: ActionDefinition = { capability_id: "fixture.inbox." + randomUUID(), version: 1, operation: "command", action: {
    title: "插件判断：核对研究", description: "检查原材料", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: ["fixture:inbox"], subject_kinds: ["inbox_entry"],
    input_schema: inboxNextScene.input_schema, output_schema: inboxNextScene.result_schema, output_type: inboxNextScene.result_type } };
  const inputs: string[] = [];
  const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.inbox-current", version: "1.0.0", name: "Inbox 判断插件",
    kind: "app", publisher: { publisher_id: "example", signature: "inbox-fixture" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }], permissions: [{ permission: "fixture:inbox", required: true, reason: "运行插件判断" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [definition] },
    async start() { return { kind: "app", actions: [{ ...definition, handle: (_caller, input) => { assert.ok(_caller.permissions.includes("fixture:inbox")); inputs.push((input as { content: string }).content); return { status: "ok", suggested_behavior_ids: ["inbox.verify"] }; } }] }; } });
  const runtime = new PluginRuntime(new SqlitePluginRuntimeRepository(store.db), undefined, { actions: { registry: localHost.actionRegistry(reference), project_id: projectId } });
  const installed = runtime.install({ definition: plugin, deployment: "local", grants: ["fixture:inbox"] }).install;
  await runtime.start(installed.install_id);
  const caller: ActionCallContext = { actor_id: "owner", project_id: projectId, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "fixture:inbox"] };
  await localHost.sceneClient(reference).bind(caller, { binding_id: inboxSceneBindingId(projectId), scene_id: inboxNextScene.scene_id, scene_version: 1, project_id: projectId,
    enabled: true, function: { capability_id: definition.capability_id, version: 1 }, title: "Inbox 下一步", href: `/projects/${projectId}/?openPlugin=inbox` });
  const open = async () => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=inbox` }, sessionId));
    await waitFor("document.querySelector('[data-plugin-id=inbox]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "inbox") {
      if (await evaluate("innerWidth") === 390) await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=inbox]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'inbox'");
    await evaluate("document.querySelector('.inbox-next-config').open = true");
  };
  try {
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
    await open();
    assert.match(await evaluate<string>("document.querySelector('.inbox-next-config').innerText"), /插件判断：核对研究/);
    assert.equal(await evaluate("document.querySelector('.inbox-next-config [data-inbox-evaluate]').disabled"), false);
    await click('.inbox-next-config [data-inbox-evaluate]');
    await waitFor("document.querySelector('[data-inbox-evaluate-status]')?.textContent.includes('已更新')");
    assert.ok(inputs.some(input => input.includes("研究原文需要人工确认")));
    const history = withFunctionsService(homeDirectory, service => service.listJudgments().filter(record => record.scene_id === inboxNextScene.scene_id && record.subject.id === entry.entry_id));
    assert.equal(history.length, 1); assert.ok(history[0]!.scene_provenance);
    assert.ok(await evaluate("Array.from(document.querySelectorAll('.inbox-next-suggestion')).some(node => node.textContent.includes('先核查'))"));
    assert.equal(feed.getInboxEntry(boardId, entry.entry_id).status, "open");
    await runtime.stop(installed.install_id);
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await open();
    assert.equal(await evaluate("document.querySelector('.inbox-next-config [data-inbox-evaluate]').disabled"), true);
    assert.equal(await evaluate("document.querySelectorAll('.inbox-next-suggestion').length"), 0);
    const text = await evaluate<string>("document.querySelector('.inbox-next-config').innerText");
    assert.match(text, /已绑定判断能力/); assert.doesNotMatch(text, /尚未绑定规则|在 Functions/);
    assert.ok((await localHost.sceneClient(reference).usages(caller)).some(usage => usage.function.capability_id === definition.capability_id && !usage.availability.available));
    assert.ok(withFunctionsService(homeDirectory, service => service.listJudgments()).some(record => record.judgment_id === history[0]!.judgment_id));
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), true);
    const dir = new URL("../.impeccable/review/inbox-current/", import.meta.url); await mkdir(dir, { recursive: true });
    await writeFile(new URL("unavailable-narrow.png", dir), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  } finally { await runtime.stop(installed.install_id); }
});
