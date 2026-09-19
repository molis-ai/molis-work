import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEMO_BOARD_ID,
  LocalProjectDatabase,
  codingDirectoryPanel,
  releaseCodingSurface,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";

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

function ports(store: LocalProjectDatabase, goalTitle: (id: string) => string | undefined = () => undefined) {
  return {
    store,
    boardId: DEMO_BOARD_ID,
    actorId: "web-user",
    goalTitle,
    escapeHtml,
    translate: (value: string) => value,
  };
}

test("面板来自运行中的插件，会话来自它自己的库", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-surface-"));
  try {
    const store = project(directory);
    new CodingSessionStore(store.db).create({
      board_id: DEMO_BOARD_ID,
      session_id: "s1",
      title: "修好 runtime 连接提示",
      runtime_id: "claude-code",
      goal_id: "g1",
      at: "2026-09-19T14:00:00Z",
    });

    const surface = await codingDirectoryPanel(ports(store, (id) => id === "g1" ? "让首次使用不再卡住" : undefined));
    assert.notEqual(surface, null, "插件跑起来了就该给出面板");
    assert.equal(surface?.plugin_id, "coding");
    assert.match(surface!.panel, /data-coding-directory/);
    assert.match(surface!.panel, /修好 runtime 连接提示/);
    // Goal 标题是读时解析的，不是存在 Coding 自己表里的
    assert.match(surface!.panel, /让首次使用不再卡住/);

    releaseCodingSurface(DEMO_BOARD_ID);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("会话标题里的标记不会原样进页面", async () => {
  const directory = mkdtempSync(join(tmpdir(), "coding-surface-"));
  try {
    const store = project(directory);
    new CodingSessionStore(store.db).create({
      board_id: DEMO_BOARD_ID,
      session_id: "s1",
      title: '<img src=x onerror="alert(1)">',
      runtime_id: "claude-code",
      at: "2026-09-19T14:00:00Z",
    });

    const surface = await codingDirectoryPanel(ports(store));
    assert.equal(surface?.panel.includes("<img src=x"), false);
    assert.match(surface!.panel, /&lt;img src=x/);

    releaseCodingSurface(DEMO_BOARD_ID);
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
    releaseCodingSurface(DEMO_BOARD_ID);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
