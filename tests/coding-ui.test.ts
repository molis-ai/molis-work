import assert from "node:assert/strict";
import test from "node:test";

import {
  renderCodingDirectory,
  renderCodingWorkbench,
  toolAvailability,
  type CodingSessionEntry,
  type CodingUiModel,
  type CodingUiPrimitives,
} from "@molis-ai/molis-work-plugin-coding";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";

const primitives: CodingUiPrimitives = {
  escape: (value) => String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"),
  icon: (name) => `<i data-icon="${name}"></i>`,
  text: (value) => value,
  formatDate: (value) => value.slice(0, 10),
};

function model(overrides: Partial<CodingUiModel> = {}): CodingUiModel {
  return {
    route_prefix: "",
    face: "sessions",
    filter: "all",
    sessions: [],
    tools: toolAvailability({ capabilities: emptyCapabilityMatrix(), embedded_browser: false }),
    workspace_path: "/Users/someone/code/goalboard",
    primitives,
    ...overrides,
  };
}

test("目录栏顶部有五个导航面，当前面被标记", () => {
  const html = renderCodingDirectory(model({ face: "taskboard" }));
  for (const face of ["sessions", "taskboard", "goals", "artifacts", "files"]) {
    assert.match(html, new RegExp(`data-coding-face="${face}"`));
  }
  assert.match(html, /data-coding-face="taskboard" aria-pressed="true"/);
  assert.match(html, /class="mw-dir__label">TaskBoard<\/span>/);
});

test("会话标题里的标记被转义，不会变成页面上的标签", () => {
  const nasty: CodingSessionEntry = {
    session_id: "s<1>",
    title: '<img src=x onerror="alert(1)">',
    state: "running",
    updated_at: "2026-09-19T14:00:00Z",
  };
  const html = renderCodingDirectory(model({ sessions: [nasty] }));
  assert.equal(html.includes("<img src=x"), false, "模型/用户内容不能原样进入标记");
  assert.match(html, /&lt;img src=x/);
});

test("不可用的工具页保留标签但禁用，并带上理由", () => {
  const html = renderCodingWorkbench(model());
  // 终端：命令未接审批；浏览器：这个构建没有内嵌浏览器
  assert.match(html, /data-coding-tool="terminal"[^>]*disabled/);
  assert.match(html, /data-coding-tool="browser"[^>]*disabled/);
  assert.match(html, /data-coding-tool-panel="terminal"[^>]*>[\s\S]*?命令回执/);
  assert.match(html, /is-unavailable/);
  // 结果页与 Canvas 不该被禁用
  assert.doesNotMatch(html, /data-coding-tool="result"[^>]*disabled/);
});

test("项目没绑定工作区时如实说明，不显示一个猜出来的路径", () => {
  const html = renderCodingWorkbench(model({ workspace_path: null }));
  assert.match(html, /还没有绑定工作区目录/);
  assert.doesNotMatch(html, /data-coding-workspace="/);
  assert.match(html, /data-coding-workspace-open/);
});

test("会话按 Goal 分组渲染，未关联目标是一个真实分组", () => {
  const sessions: CodingSessionEntry[] = [
    { session_id: "s1", title: "带目标的", state: "running", updated_at: "2026-09-19T14:00:00Z", goal_id: "g1", goal_title: "让首次使用不再卡住" },
    { session_id: "s2", title: "没目标的", state: "done", updated_at: "2026-09-18T14:00:00Z" },
  ];
  const html = renderCodingDirectory(model({ sessions }));
  assert.match(html, /data-coding-goal="g1"/);
  assert.match(html, /让首次使用不再卡住/);
  assert.match(html, /未关联目标/);
});
