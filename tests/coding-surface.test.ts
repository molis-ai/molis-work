import { fakeAgentHostActions, fakeGoalDirectory, pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEMO_PROJECT_ID,
  LocalProjectDatabase,
  codingDirectoryPanel,
  releaseProjectPlugins,
  seedDemoBoard,
  openProjectVersionStores,
} from "@molis-ai/molis-work-app-local-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

/**
 * 目录面板由**运行中的 Coding 插件**渲染，而不是壳自己画。
 * 这是从构建期组合走向运行期托管的那一步的实证。
 */

const escapeHtml = (value: unknown) => String(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function project(directory: string) {
  const file = join(directory, "board.db");
  seedDemoBoard(file);
  return new LocalProjectDatabase(file);
}

/** `titles` is what Goals' public directory answers (`goals.list`), the one place a Goal title is read from (PG-091). */
function ports(store: LocalProjectDatabase, titles: Readonly<Record<string, string>> = {}) {
  return {
    store,
    ...openProjectVersionStores(store),
    projectId: DEMO_PROJECT_ID, actions: fakeGoalDirectory(pluginActions(store, DEMO_PROJECT_ID), () => titles),
    actorId: "web-user",
    escapeHtml,
    translate: (value: string) => value,
  };
}

test("W5-01-CODING-20 面板来自运行中的插件，会话来自它自己的库；Goal 标题经 Goals 的公开读动作读到", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-surface-"));
  try {
    const store = project(directory);
    await codingSessions(store).create(noEffect, {
      project_id: DEMO_PROJECT_ID,
      session_id: "s1",
      title: "修好 runtime 连接提示",
      runtime_id: "claude-code",
      goal_id: "g1",
      at: "2026-09-19T14:00:00Z",
    });

    // The route reads titles through Goals' action and no Agent capability, so the Host's capability port is one that answers nothing.
    const host = { ...ports(store, { g1: "让首次使用不再卡住" }), capabilities: { async invoke<Input, Output>(definition: { capability_id: string }, _args: Input): Promise<Output> {
      throw new Error(`unexpected capability ${definition.capability_id}`);
    } } };
    const surface = await codingDirectoryPanel(host);
    assert.notEqual(surface, null, "插件跑起来了就该给出面板");
    assert.equal(surface?.plugin_id, "coding");
    assert.match(surface!.panel, /data-coding-directory/);
    assert.match(surface!.panel, /修好 runtime 连接提示/);
    // 目录当场渲染、等不了一次动作：第一次绘制时 Goal 标题还没读过，目录给出的是 Goal 的 id（预期变化：此前由宿主同步注入）。
    assert.doesNotMatch(surface!.panel, /让首次使用不再卡住/);
    assert.match(surface!.panel, /g1/);

    // 页面一打开就读 Coding 的路由；路由经 Goals 的公开读动作读标题并记下，之后目录画的就是标题。
    const { codingRouteHooks, handleProjectPluginHttp } = await import("@molis-ai/molis-work-app-local-host");
    const server = createServer((request, response) => {
      void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host, codingRouteHooks).catch(error => { response.writeHead(500); response.end(String(error)); });
    });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); assert.ok(address && typeof address === "object");
      const read = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/search/entries`);
      const answer = await read.text();
      assert.equal(read.status, 200, answer);
      assert.match(answer, /关联目标：让首次使用不再卡住/);
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    // Goal 标题是读时从 Goals 取的，不是存在 Coding 自己表里的会话字段
    const after = await codingDirectoryPanel(host);
    assert.match(after!.panel, /让首次使用不再卡住/);

    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("会话标题里的标记不会原样进页面", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-surface-"));
  try {
    const store = project(directory);
    await codingSessions(store).create(noEffect, {
      project_id: DEMO_PROJECT_ID,
      session_id: "s1",
      title: '<img src=x onerror="alert(1)">',
      runtime_id: "claude-code",
      at: "2026-09-19T14:00:00Z",
    });

    const surface = await codingDirectoryPanel(ports(store));
    assert.equal(surface?.panel.includes("<img src=x"), false);
    assert.match(surface!.panel, /&lt;img src=x/);

    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("没有会话时给出插件自己的空状态，而不是一段空白", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-surface-"));
  try {
    const store = project(directory);
    const surface = await codingDirectoryPanel(ports(store));
    assert.notEqual(surface, null);
    assert.match(surface!.panel, /还没有编码会话/);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("recovery receipt lists cross the formal HTTP surface without being rendered as conversation turns", async () => {
  const { codingRouteHooks, handleProjectPluginHttp } = await import("@molis-ai/molis-work-app-local-host");
  const { agentHostCapabilities } = await import("@molis-ai/molis-work-contracts/services/agent-host");
  const directory = mkdtempSync(join(tmpdir(), "coding-recovery-http-"));
  const store = project(directory), sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "中断", runtime_id: "prologue", at: "2026-09-20T00:00:00Z" });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", "2026-09-20T00:00:00Z");
  const report = { session_id: "sdk", blockers: [], runs: [{ run_id: "run", version: 1, live: false, waiting: 0,
    can_close: true, blockers: [], operations: [{ effect_id: "effect", kind: "edit", summary: "cart.mjs", outcome: "not-dispatched" }] }] };
  const agentHost = {
    async invoke<Input, Output>(definition: { capability_id: string }, args: Input): Promise<Output> {
      assert.equal(definition.capability_id, agentHostCapabilities.inspectRecovery.capability_id);
      assert.deepEqual(args, [{ runtime_id: "prologue", session_id: "sdk" }]);
      return structuredClone(report) as Output;
    },
  };
  const host = { ...ports(store), capabilities: agentHost };
  fakeAgentHostActions(host.actions, (definition, input) => agentHost.invoke(definition, input));
  const server = createServer((request, response) => {
    void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), host, codingRouteHooks).catch(error => {
      response.writeHead(500); response.end(String(error));
    });
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding/sessions/app/recovery`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), report);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(directory, { recursive: true, force: true });
  }
});
