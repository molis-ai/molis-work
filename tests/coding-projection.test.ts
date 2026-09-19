import assert from "node:assert/strict";
import test from "node:test";

import {
  filterSessions,
  groupByGoal,
  needsYou,
  toolAvailability,
  type CodingSessionEntry,
} from "@molis-ai/molis-work-plugin-coding";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";

/** C3 的投影层：分组、筛选，以及「哪几页是真的能用」。 */

const SESSIONS: CodingSessionEntry[] = [
  { session_id: "s1", title: "修好 runtime 连接提示", state: "running", updated_at: "2026-09-19T14:00:00Z", goal_id: "g1", goal_title: "让首次使用不再卡在连接" },
  { session_id: "s2", title: "补充失败时的下一步文案", state: "waiting-approval", updated_at: "2026-09-18T09:00:00Z", goal_id: "g1", goal_title: "让首次使用不再卡在连接" },
  { session_id: "s3", title: "看看 shelf 的抽取为什么慢", state: "done", updated_at: "2026-09-16T09:00:00Z" },
  { session_id: "s4", title: "补一个失败用例", state: "failed", updated_at: "2026-09-15T09:00:00Z" },
];

test("按 Goal 分组，没有 Goal 的是一个真实分组且排在最后", () => {
  const groups = groupByGoal(SESSIONS);
  assert.deepEqual(groups.map((group) => group.title),
    ["让首次使用不再卡在连接", "未关联目标"]);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.session_id), ["s1", "s2"]);
  assert.equal(groups.at(-1)?.goal_id, null);
  assert.deepEqual(groups.at(-1)?.entries.map((entry) => entry.session_id), ["s3", "s4"]);
});

test("「需要我」是对同一份列表的筛选，不是第二个收件箱", () => {
  assert.deepEqual(filterSessions(SESSIONS, "needs-you").map((entry) => entry.session_id),
    ["s2", "s4"]);
  assert.deepEqual(filterSessions(SESSIONS, "running").map((entry) => entry.session_id), ["s1"]);
  assert.equal(filterSessions(SESSIONS, "all").length, SESSIONS.length);
  // 每一条都由它自己的状态决定，不依赖任何别处记下的副本
  assert.equal(needsYou(SESSIONS[0]!), false);
  assert.equal(needsYou(SESSIONS[1]!), true);
});

test("运行时不提供命令回执时，终端页真实不可用并给出理由", () => {
  const pages = toolAvailability({ capabilities: emptyCapabilityMatrix(), embedded_browser: true });
  const terminal = pages.find((page) => page.page === "terminal");
  assert.equal(terminal?.available, false);
  assert.match(terminal?.reason ?? "", /命令回执/);
  // 结果页与 Canvas 不依赖运行时能力，始终可用
  assert.equal(pages.find((page) => page.page === "result")?.available, true);
  assert.equal(pages.find((page) => page.page === "canvas")?.available, true);
});

test("能读回执就够了——终端页不要求这个运行时还能跑命令", () => {
  const capabilities = emptyCapabilityMatrix();
  capabilities["command.receipts"] = "supported";
  const pages = toolAvailability({ capabilities, embedded_browser: true });
  const terminal = pages.find((page) => page.page === "terminal");
  assert.equal(terminal?.available, true);
  assert.equal(terminal?.reason, undefined);
  // 这正是 CLI 今天的处境：说得清跑过什么，但不能在宿主审批下跑新的
  assert.equal(capabilities.command, "unsupported");
});

test("反过来不成立：能跑命令但读不回执，终端页仍然不可用", () => {
  const capabilities = emptyCapabilityMatrix();
  capabilities.command = "supported";
  const pages = toolAvailability({ capabilities, embedded_browser: true });
  assert.equal(pages.find((page) => page.page === "terminal")?.available, false,
    "终端页显示的是回执，不是执行权限");
});

test("没有内嵌浏览器的构建里，浏览器页如实不可用而不是画个空壳", () => {
  const pages = toolAvailability({ capabilities: emptyCapabilityMatrix(), embedded_browser: false });
  const browser = pages.find((page) => page.page === "browser");
  assert.equal(browser?.available, false);
  assert.match(browser?.reason ?? "", /桌面版/);
});
