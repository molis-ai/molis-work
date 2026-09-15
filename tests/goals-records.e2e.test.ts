import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { insertHistoricalRisk } from "./historical-sql-fixture.js";

test("Goal description keeps risk links and hash targets usable through real navigation", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, navigate, reloadPage } = browser;
  const description = "用户接入 Runtime 后没有新开会话，误以为安装失败";
  insertHistoricalRisk(store.db, {
    risk_id: "RISK-FIRST-RESTART",
    board_id: DEMO_BOARD_ID,
    goal_ids: ["RELEASE"],
    description,
    probability: "medium",
    impact: "用户看不到 Molis Work 工具，无法开始第一次使用",
    affected_surfaces: ["首次安装", "Runtime 接入"],
    trigger: "用户继续使用接入前已经打开的会话",
    treatment: "mitigate",
    blocking_mode: "none",
    revisit_condition: "安装结果和接入预览都清楚说明新开会话的原因和下一步",
    owner: "产品体验",
  });
  const before = store.snapshot(DEMO_BOARD_ID);
  const risk = before.risks.find(item => item.risk_id === "RISK-FIRST-RESTART")!;
  assert.equal(risk.description, description);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const riskVisible = "(() => { const e = document.getElementById('risk-RISK-FIRST-RESTART'); return Boolean(e && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && !e.closest('[hidden]')); })()";
  await navigate(() => command("Page.navigate", { url: origin + "/goals/RELEASE#risk-RISK-FIRST-RESTART" }, sessionId));
  await waitFor(riskVisible);
  assert.equal(await evaluate(`document.querySelector('[data-goal-factor-tab="risks"]').getAttribute("aria-selected")`), "true");
  assert.match(await evaluate<string>("document.querySelector('#risk-RISK-FIRST-RESTART')?.textContent || ''"), new RegExp(description.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await reloadPage();
  await waitFor(riskVisible);
  const after = store.snapshot(DEMO_BOARD_ID);
  for (const key of ["goals", "relations", "risks", "claims", "runs", "evidence"] as const) assert.deepEqual(after[key], before[key]);
  assert.equal(after.board.active_goal_id, before.board.active_goal_id);
});
