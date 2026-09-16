import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("event document pointer path covers requirement form, concern body, note, selection and resume", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const actor = { board_id: DEMO_BOARD_ID, actor_id: "review-runtime", actor_kind: "runtime" as const };
  const created = app.goalEvents.createIntent({
    ...actor, goal_id: "independent-ui", title: "隔离验收：首次使用与重启接续",
    outcome: "用户能创建项目、保存工作，并在重新打开后继续", idempotency_key: "review-ui-create",
  });
  const goalId = created.goal.goal_id;
  const base = { ...actor, goal_id: goalId };
  app.goalEvents.configure({
    ...base, expected_version: 0, idempotency_key: "review-ui-config",
    types: [{
      type_id: "delivery", version: 1, name: "交付记录", purpose: "说明做成了什么", semantic_family: "delivery",
      fields: [
        { field_id: "summary", name: "成果说明", purpose: "实际交付内容", format: "longtext", required: true },
        { field_id: "details", name: "打开与核对方法", purpose: "可复现的使用路径", format: "longtext", required: true },
      ],
    }],
  });
  const configured = app.goalEvents.readState(DEMO_BOARD_ID, goalId);
  app.goalEvents.setAgreement({
    ...base, idempotency_key: "review-ui-requirement",
    expected_config_version: configured.config.version,
    expected_agreement_version: configured.agreement.version,
    new_requirements: [{ requirement_id: "restart", statement: "重启后仍能接续同一个目标", bound_type_id: "delivery" }],
  });
  app.goalEvents.report({
    ...base, idempotency_key: "review-ui-reports", events: [
      { type_id: "delivery", type_version: 1, title: "首次项目已能保存并打开", fields: { summary: "项目创建与保存已接通。", details: "打开示例项目后选择目标。" } },
      { type_id: "delivery", type_version: 1, title: "重启接续仍需验证", fields: { summary: "已完成首次使用，重启路径尚未核对。", details: "重新启动服务后读取同一目标及历史。" }, judgments: [{ requirement_id: "restart", verdict: "unknown" }] },
    ],
  });
  app.goalEvents.recordProgress({
    ...base, idempotency_key: "review-ui-progress",
    based_on_cursor: app.goalEvents.readState(DEMO_BOARD_ID, goalId).observed_event_cursor,
    summary: "首次使用已接通，重启后的接续是当前缺口。", next_step: "重启隔离服务并读回当前目标与原报告", next_actor: "当前 Runtime",
  });
  const concern = app.goalEvents.applyConcern({
    ...base, idempotency_key: "review-ui-concern", action: "open",
    title: "重启接续还没有验证", statement: "这项结果只有首次使用证据，不能据此认定重启接续完成。",
    scope: { requirement_ids: ["restart"] }, blocks_closure: true,
  });
  const visible = (selector: string) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});return Boolean(e && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')})()`);
  const history = () => app.goalEvents.listEvents(DEMO_BOARD_ID, goalId, { limit: 100 }).events;
  async function openGoal() {
    await navigate(() => command("Page.navigate", { url: `${origin}/goals/${goalId}` }, sessionId));
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
    await waitFor(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`);
  }
  async function planning() {
    if (await evaluate("document.querySelector('[data-goal-event-document]')?.classList.contains('is-editing-goal')")) {
      const formOpen = await visible('[data-event-form]:not([hidden])');
      await click(formOpen ? '[data-event-form]:not([hidden]) footer [data-event-back]' : '.detail-toolbar [data-event-back]');
    }
    await click('.goal-more > summary');
    await click('[data-event-reader="planning"]');
    await waitFor(`!document.querySelector('[data-event-reader-root]').hidden`);
  }
  async function submitSuccess(selector: string) {
    const before = app.goalEvents.readState(DEMO_BOARD_ID, goalId).goal_event_cursor;
    await click(selector);
    await waitFor(
      `document.querySelector("[data-goal-event-document]")?.dataset.goalView === ${JSON.stringify(goalId)} && Number(document.querySelector("[data-goal-event-document]")?.dataset.goalEventCursor) > ${before} && document.querySelector("[data-document-pane]")?.getAttribute("aria-busy") !== "true"`,
    );
  }
  async function fillField(selector: string, value: string) {
    await evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      input.focus();
      input.value = ${JSON.stringify(value)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await openGoal();
  await click('[data-event-reader="requirements"]');
  await click('[data-event-panel="requirements"] [data-event-form-open="requirement"]');
  assert.equal(await visible('[data-event-form="requirement"]'), true);

  await openGoal();
  await click(`[data-event-id="${concern.event_id}"]`);
  await waitFor(`document.querySelector('[data-event-sheet] .event')`);
  const concernBody = await evaluate("document.querySelector('[data-event-sheet]').textContent") as string;
  assert.match(concernBody, /这项结果只有首次使用证据/);
  assert.match(concernBody, /重启后仍能接续同一个目标|restart/);

  await openGoal();
  await click('[data-record-menu] > summary');
  await click('[data-record-menu] [data-event-form-open="note"]');
  const beforeNote = app.goalEvents.readState(DEMO_BOARD_ID, goalId).observed_event_cursor;
  await fillField('[data-event-form="note"] [name="note"]', "补充说明：明天继续核对重启后的历史读取。");
  await submitSuccess('[data-event-form="note"] button[type="submit"]');
  assert.ok(app.goalEvents.readState(DEMO_BOARD_ID, goalId).observed_event_cursor > beforeNote);

  await openGoal();
  const selection = await evaluate(`document.querySelectorAll('[data-timeline-item]')[2].dataset.timelineItem`) as string;
  await click(`[data-timeline-item="${selection}"]`);
  await waitFor(`document.querySelector('[data-event-sheet] .event')`);
  await planning();
  await click('.detail-toolbar [data-event-back]');
  await click('[data-record-menu] > summary');
  await click('[data-record-menu] [data-event-form-open="progress"]');
  await fillField('[data-event-form="progress"] [name="summary"]', "保留当前阅读位置的进度更新");
  await fillField('[data-event-form="progress"] [name="next_step"]', "继续核对读取行为");
  await submitSuccess('[data-event-form="progress"] button[type="submit"]');
  assert.match(await evaluate("document.querySelector('[data-current-summary]')?.textContent || ''") as string, /保留当前阅读位置的进度更新/);
  const selectionAfter = await evaluate(`document.querySelector('[data-timeline-item][aria-current="true"]')?.dataset.timelineItem`);
  assert.equal(selectionAfter, selection);

  await planning();
  await click('.detail-toolbar [data-event-back]');
  await click('[data-record-menu] > summary');
  await click('[data-record-menu] [data-event-form-open="progress"]');
  const beforeRetry = history().filter((event) => event.kind === "system" && event.payload.operation === "progress_summary").length;
  await fillField('[data-event-form="progress"] [name="summary"]', "写入成功但读回断线");
  await evaluate(`(() => {
    window.__reviewFetch=window.fetch.bind(window); window.__reviewBreakReads=true;
    window.fetch=(input, init) => { const url=String(input); if(window.__reviewBreakReads && (!init?.method || init.method==='GET') && (url.includes('/document?') || url.endsWith('/event-state'))) return Promise.reject(new Error('验收注入：写入后读取断线')); return window.__reviewFetch(input, init); };
  })()`);
  await click('[data-event-form="progress"] button[type="submit"]');
  await waitFor(`(document.querySelector('[data-event-form="progress"] [data-form-status]')?.textContent || document.querySelector('[data-toast]')?.textContent || '').includes('读取断线')`);
  const firstCount = history().filter((event) => event.kind === "system" && event.payload.operation === "progress_summary").length;
  const retainedKey = await evaluate(`document.querySelector('[data-event-form="progress"]').dataset.idempotencyKey || ''`);
  assert.ok(retainedKey);
  await evaluate(`window.__reviewBreakReads=false; true`);
  assert.equal(await visible("[data-retry-read]"), true);
  await click("[data-retry-read]");
  await waitFor(`document.querySelector('[data-current-summary]')?.textContent.includes('写入成功但读回断线')`);
  const secondCount = history().filter((event) => event.kind === "system" && event.payload.operation === "progress_summary").length;
  assert.equal(firstCount, beforeRetry + 1);
  assert.equal(secondCount, firstCount);
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).progress_summary?.summary, "写入成功但读回断线");

  await planning();
  await click('.detail-toolbar [data-event-back]');
  await click('[data-event-reader="requirements"]');
  await click('[data-event-panel="requirements"] [data-event-form-open="closure"]');
  await waitFor(`document.querySelector('[data-event-form="closure"]') && document.querySelector('[data-event-form="closure"]').hidden === false`);
  await evaluate(`(() => { const f=document.querySelector('[data-event-form="closure"]'); f.querySelector('[name="kind"]').value='complete'; })()`);
  await fillField('[data-event-form="closure"] [name="reason"]', "Concern 仍开着，完成应被挡住");
  await fillField('[data-event-form="closure"] [name="result"]', "还不能完成");
  const beforeBlocked = app.goalEvents.readState(DEMO_BOARD_ID, goalId);
  const beforeBlockedCursor = beforeBlocked.goal_event_cursor;
  await submitSuccess('[data-event-form="closure"] button[type="submit"]');
  const blocked = app.goalEvents.readState(DEMO_BOARD_ID, goalId);
  assert.equal(blocked.work_status, "open");
  assert.equal(blocked.closure?.completion_applied, false);
  assert.ok(blocked.closure?.unmet_reasons.length);
  assert.ok(blocked.goal_event_cursor > beforeBlockedCursor);

  await waitFor(`document.querySelector('[data-event-form="closure"]')?.hidden === false`);
  await evaluate(`(() => { document.querySelector('[data-event-form="closure"] [name="kind"]').value='cancel'; })()`);
  await fillField('[data-event-form="closure"] [name="reason"]', "核对取消后的显式继续入口");
  await submitSuccess('[data-event-form="closure"]:not([hidden]) button[type="submit"]');
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).work_status, "cancelled");
  await waitFor(`document.querySelector('[data-event-form-open="resume"]') && document.querySelector('[data-event-form-open="resume"]').getClientRects().length > 0`);
  assert.equal(await visible('[data-event-form-open="resume"]'), true);
  await click('[data-event-form-open="resume"]');
  await fillField('[data-event-form="resume"] [name="reason"]', "继续核对完成闭环");
  await submitSuccess('[data-event-form="resume"] button[type="submit"]');
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).work_status, "open");
  const cancelHistory = history().filter((event) => event.kind === "system" && event.payload.operation === "closure_submitted" && event.payload.kind === "cancel");
  assert.ok(cancelHistory.length >= 1);
});
