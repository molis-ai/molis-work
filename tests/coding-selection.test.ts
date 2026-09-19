import assert from "node:assert/strict";
import test from "node:test";

import { projectMcp, projectSkills } from "@molis-ai/molis-work-plugin-coding";
import type {
  AgentMcpServerHealth,
  AgentMcpToolRef,
  AgentSkillCatalogEntry,
} from "@molis-ai/molis-work-contracts/services/agent-host";

/** 方法与 MCP 的选择：你选的 ≠ 这一轮冻结的，两者都要说清。 */

const catalog: AgentSkillCatalogEntry[] = [
  { skill_id: "review", version: 1, name: "代码评审", summary: "逐文件看", tools: ["read-file"], source: "builtin", enabled: true },
  { skill_id: "refactor", version: 2, name: "重构", summary: "小步改", tools: ["edit-file"], source: "installed", enabled: false },
];

test("运行时不支持方法时，如实说不可用，不给一个空列表冒充", () => {
  const view = projectSkills({ support: "unsupported", catalog, selected: [], frozen: null });
  assert.equal(view.available, false);
  assert.match(view.unavailable_reason ?? "", /不支持方法/);
  assert.deepEqual(view.rows, []);
});

test("被停用的方法仍然列出并说明原因，而不是消失", () => {
  const view = projectSkills({ support: "supported", catalog, selected: [], frozen: null });
  const refactor = view.rows.find((row) => row.ref.skill_id === "refactor");
  assert.equal(refactor?.unavailable, "这个方法已被停用", "消失了比说明白更难解释");
  assert.equal(view.rows.length, 2);
});

test("改了选择而这一轮已经冻结时，说「下一轮生效」", () => {
  const frozen = [{ skill_id: "review", version: 1 }];
  const unchanged = projectSkills({ support: "supported", catalog, selected: frozen, frozen });
  assert.equal(unchanged.applies_next_task, false);
  assert.deepEqual(unchanged.this_run, frozen);

  const changed = projectSkills({
    support: "supported", catalog,
    selected: [{ skill_id: "refactor", version: 2 }],
    frozen,
  });
  assert.equal(changed.applies_next_task, true, "已冻结的这一轮不会因为你改了选择而改变");
  assert.deepEqual(changed.this_run, frozen, "这一轮用的仍然是冻结时那些");
});

test("没有运行中的轮次时，谈不上「下一轮生效」", () => {
  const view = projectSkills({
    support: "supported", catalog,
    selected: [{ skill_id: "review", version: 1 }], frozen: null,
  });
  assert.equal(view.applies_next_task, false);
  assert.equal(view.this_run, null);
});

const servers: AgentMcpServerHealth[] = [
  { server: "docs", status: "ready" },
  { server: "db", status: "failed" },
];
const tools: AgentMcpToolRef[] = [
  { server: "docs", tool: "search" },
  { server: "db", tool: "query" },
];

test("服务挂了的工具仍然列出并标明，而不是藏起来", () => {
  const view = projectMcp({ support: "supported", servers, tools, selected: [], frozen: null });
  const db = view.servers.find((row) => row.server === "db");
  assert.equal(db?.status, "failed");
  assert.equal(db?.tools[0]?.unavailable, "这个服务当前不可用");
  const docs = view.servers.find((row) => row.server === "docs");
  assert.equal(docs?.tools[0]?.unavailable, undefined);
});

test("选过但目录里已经没有的工具，单独列为失效而不是悄悄丢掉", () => {
  const view = projectMcp({
    support: "supported", servers, tools,
    selected: [{ server: "docs", tool: "gone" }, { server: "ghost", tool: "x" }],
    frozen: null,
  });
  assert.equal(view.stale.length, 2);
  assert.equal(view.stale.find((row) => row.ref.tool === "gone")?.unavailable, "这个工具已经不在目录里");
  assert.equal(view.stale.find((row) => row.ref.server === "ghost")?.unavailable, "这个服务已经不在了");
  assert.equal(view.selected_count, 2, "失效不改变「你选了几个」这个事实");
});

test("MCP 同样区分选择与本轮冻结", () => {
  const frozen = [{ server: "docs", tool: "search" }];
  const view = projectMcp({
    support: "supported", servers, tools,
    selected: [{ server: "db", tool: "query" }], frozen,
  });
  assert.equal(view.applies_next_task, true);
  assert.deepEqual(view.this_run, frozen);
});

test("不支持 MCP 时同样如实说明", () => {
  const view = projectMcp({ support: "unsupported", servers, tools, selected: [], frozen: null });
  assert.equal(view.available, false);
  assert.match(view.unavailable_reason ?? "", /不支持 MCP/);
  assert.deepEqual(view.servers, []);
});
