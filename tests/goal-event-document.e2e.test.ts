import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { insertHistoricalClaim, insertHistoricalEvidence, insertHistoricalRun } from "./historical-sql-fixture.js";

test("event document writes planning, report, concern, decision and closure through the production UI", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const created = app.goalEvents.createIntent({
    board_id: DEMO_BOARD_ID,
    title: "隔离演示：内部试用写回",
    outcome: "经正式页面写入后再读回",
    actor_id: "web-user",
    actor_kind: "user",
    idempotency_key: "e2e-intent",
  });
  const goalId = created.goal.goal_id;
  async function waitDom(expression: string) {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await evaluate("new Promise((resolve) => setTimeout(resolve, 400))");
    }
    throw new Error("DOM condition timeout: " + expression + "; " + await evaluate(
      "JSON.stringify({toast:document.querySelector('[data-toast]')?.textContent,status:document.querySelector('[data-form-status]:not([hidden])')?.textContent,conflict:document.querySelector('[data-event-conflict]:not([hidden])')?.textContent,busy:document.querySelector('[data-document-pane]')?.getAttribute('aria-busy'),goal:document.querySelector('[data-goal-event-document]')?.dataset.goalView,cursor:document.querySelector('[data-goal-event-document]')?.dataset.goalEventCursor})",
    ));
  }
  const visibleDoc = "[data-goal-event-document]:not([hidden])";
  async function openPlanning() {
    await waitIdle();
    await click(`${visibleDoc} .goal-more > summary`);
    await click(`${visibleDoc} .goal-more [data-event-reader="planning"]`);
    await waitDom(`document.querySelector('${visibleDoc} [data-event-reader-root]') && !document.querySelector('${visibleDoc} [data-event-reader-root]').hasAttribute('hidden')`);
  }
  async function openNamedForm(name: string) {
    await waitIdle();
    // Types/planning are configuration; progress/problems and completion are Goal actions.
    if (name === "note" || name === "progress" || name === "concern") {
      await click(`${visibleDoc} [data-record-menu] > summary`);
      await click(`${visibleDoc} [data-record-menu] [data-event-form-open=${JSON.stringify(name)}]`);
    } else if (name === "adopt") {
      await openPlanning();
      await click(`${visibleDoc} [data-event-panel="planning"] [data-event-form-open="adopt"]`);
    } else {
      const back = await evaluate(`Boolean(document.querySelector('${visibleDoc}.is-editing-goal'))`);
      if (back) await click(`${visibleDoc} .detail-toolbar [data-event-back]`);
      await click(`${visibleDoc} [data-event-reader="requirements"]`);
      await click(`${visibleDoc} [data-event-panel="requirements"] [data-event-form-open=${JSON.stringify(name)}]`);
    }
    await waitDom(`document.querySelector('${visibleDoc} [data-event-form=${JSON.stringify(name)}]')?.hidden === false`);
  }
  async function waitIdle() {
    await waitDom("document.querySelector('[data-document-pane]')?.getAttribute('aria-busy') !== 'true'");
  }
  async function submitSuccess(selector: string) {
    const before = app.goalEvents.readState(DEMO_BOARD_ID, goalId).goal_event_cursor;
    await click(selector);
    await waitDom(
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
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{const original=window.setInterval;window.setInterval=function(fn,ms,...args){if(ms===4000&&typeof fn==='function')window.__refreshCallback=fn;return original.call(this,fn,ms,...args);};})()` }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(goalId) }, sessionId));
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
  await waitDom(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`);
  const headerBeforeHistory = await evaluate("document.querySelector('[data-current-summary]')?.textContent");
  await openPlanning();
  await waitDom("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hasAttribute('hidden')");
  assert.match(await evaluate("document.querySelector('[data-event-panel=planning]')?.textContent || ''"), /未采用模板|空白起点/);
  await click("[data-goal-event-document]:not([hidden]) [data-event-panel='planning'] [data-event-reader='type']");
  await waitDom("document.querySelector('[data-event-form=type]') && document.querySelector('[data-event-form=type]').hidden === false");
  await evaluate(`(() => {
    const form = document.querySelector('[data-event-form="type"]');
    form.querySelector('[name="name"]').value = "进展记录";
    form.querySelector('[name="purpose"]').value = "记下实际做成的事";
    const fieldName = form.querySelector('[name="field_name"]');
    if (fieldName && !fieldName.value) fieldName.value = "内容";
    form.querySelector('[name="add_requirement"]').checked = true;
    const statement = form.querySelector('[name="requirement_statement"]');
    if (statement) {
      statement.closest("[data-new-requirement]")?.removeAttribute("hidden");
      statement.value = "能读回刚才写入的事实";
    }
    return true;
  })()`);
  await submitSuccess('[data-event-form="type"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.types.some((type) => type.name === "进展记录")) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  const typeId = app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.types.find((type) => type.name === "进展记录")?.type_id;
  assert.ok(typeId);
  await waitDom(`document.querySelector('[data-event-report="${typeId}"]')`);
  await openNamedForm("adopt");
  const methodId = await evaluate(`document.querySelector('[data-event-form="adopt"] [name="method_id"] option[value]:not([value=""])')?.value || ""`) as string;
  assert.ok(methodId, "adopt form must list current effective planning methods");
  await submitSuccess('[data-event-form="adopt"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.adopted_planning.length) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.adopted_planning.length);
  await openNamedForm("agreement");
  await evaluate(`document.querySelector('[data-event-form="agreement"] [name="outcome"]').value='经页面修改后的约定'`);
  await submitSuccess('[data-event-form="agreement"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (/经页面修改后的约定/.test(app.goalEvents.readState(DEMO_BOARD_ID, goalId).agreement.outcome)) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.match(app.goalEvents.readState(DEMO_BOARD_ID, goalId).agreement.outcome, /经页面修改后的约定/);
  await openPlanning();
  await click(`[data-goal-event-document]:not([hidden]) [data-event-form-open="type-edit"][data-type-id="${typeId}"]`);
  await waitDom(`document.querySelector('[data-event-form="type-edit"][data-type-id="${typeId}"]') && document.querySelector('[data-event-form="type-edit"][data-type-id="${typeId}"]').hidden === false`);
  await submitSuccess(`[data-event-form="type-edit"][data-type-id="${typeId}"] button[type="submit"]`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.types.find((type) => type.type_id === typeId)?.version === 2) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).config.types.find((type) => type.type_id === typeId)?.version, 2);
  await openPlanning();
  await click(`[data-goal-event-document]:not([hidden]) [data-event-report="${typeId}"]`);
  await waitDom(`document.querySelector('[data-event-form=report][data-type-id="${typeId}"]') && document.querySelector('[data-event-form=report][data-type-id="${typeId}"]').hidden === false`);
  await evaluate(`(() => {
    const form = document.querySelector('[data-event-form="report"][data-type-id=${JSON.stringify(typeId)}]');
    form.querySelector('[data-event-title]').value = "时间线已经接到真实写入";
    const body = form.querySelector("[data-report-field]");
    if (body) body.value = "这条是隔离演示库里的真实报告。";
    return true;
  })()`);
  await submitSuccess(`[data-event-form="report"][data-type-id="${typeId}"] button[type="submit"]`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).latest_reports[0]?.title === "时间线已经接到真实写入") break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).latest_reports[0]?.title, "时间线已经接到真实写入");
  await openNamedForm("progress");
  await fillField('[data-event-form="progress"] [name="summary"]', "主流程已跑通，正在核对问题");
  await fillField('[data-event-form="progress"] [name="next_step"]', "验证异常恢复");
  await submitSuccess('[data-event-form="progress"] button[type="submit"]');
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).progress_summary?.summary, "主流程已跑通，正在核对问题");
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).progress_summary?.next_step, "验证异常恢复");
  assert.match(await evaluate("document.querySelector('[data-current-summary]').textContent"), /主流程已跑通/);
  await openNamedForm("note");
  await fillField('[data-event-form="note"] [name="note"]', "备注只留在时间线，下一次试用时核对");
  await submitSuccess('[data-event-form="note"] button[type="submit"]');
  await waitDom("document.querySelector('[data-event-timeline]').textContent.includes('备注只留在时间线')");
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).progress_summary?.summary, "主流程已跑通，正在核对问题");
  await openNamedForm("concern");
  await evaluate(`(() => {
    const form = document.querySelector('[data-event-form="concern"]');
    form.querySelector('[name="title"]').value = "还要核对范围";
    form.querySelector('[name="statement"]').value = "Concern 必须指出影响的要求";
    const requirement = form.querySelector('[name="requirement_ids"]');
    if (requirement) requirement.checked = true;
    return true;
  })()`);
  await submitSuccess('[data-event-form="concern"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).concerns.length >= 1) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_BOARD_ID, goalId).concerns.length >= 1);
  await openNamedForm("decision");
  await evaluate(`(() => {
    const form = document.querySelector('[data-event-form="decision"]');
    const conclusion = form.querySelector('[name="conclusion"]');
    if (conclusion) conclusion.value = "接受当前范围";
    form.querySelectorAll('[name="effect"]').forEach((input) => {
      input.checked = input.value === "accept_requirements" || input.value === "accept_concerns";
    });
    form.querySelectorAll('[name="requirement_ids"]').forEach((input) => { input.checked = true; });
    form.querySelectorAll('[name="concern_ids"]').forEach((input) => { input.checked = true; });
    return true;
  })()`);
  await submitSuccess('[data-event-form="decision"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_BOARD_ID, goalId).current_decisions.length >= 1) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_BOARD_ID, goalId).current_decisions.length >= 1);
  const headerAfterWrites = await evaluate("document.querySelector('[data-current-summary]')?.textContent");
  await waitDom(`document.querySelectorAll('${visibleDoc} [data-timeline-item]').length > 1`);
  const older = await evaluate(`document.querySelectorAll('${visibleDoc} [data-timeline-item]').length`) as number;
  assert.ok(older > 1);
  const olderId = await evaluate(`document.querySelectorAll('${visibleDoc} [data-timeline-item]')[1].dataset.timelineItem`) as string;
  await click(`${visibleDoc} [data-timeline-item="${olderId}"]`);
  await waitDom("document.querySelector('[data-event-sheet] .event, [data-event-sheet] .no-results')");
  assert.equal(await evaluate("document.querySelector('[data-current-summary]')?.textContent"), headerAfterWrites);
  assert.notEqual(headerAfterWrites, headerBeforeHistory);
  await openNamedForm("closure");
  const versions = await evaluate<{ config: string; agreement: string }>(`({
    config: document.querySelector('[data-event-form="closure"] [name="expected_config_version"]').value,
    agreement: document.querySelector('[data-event-form="closure"] [name="expected_agreement_version"]').value,
  })`);
  await fillField('[data-event-form="closure"] [name="reason"]', "旧版本收尾");
  const current = app.goalEvents.readState(DEMO_BOARD_ID, goalId);
  app.goalEvents.setAgreement({
    board_id: DEMO_BOARD_ID,
    goal_id: goalId,
    actor_id: "web-user",
    actor_kind: "user",
    expected_config_version: current.config.version,
    expected_agreement_version: current.agreement.version,
    outcome: "并发修改后的约定，用来制造过期收尾",
    idempotency_key: "e2e-conflict-bump",
  });
  await click('[data-event-form="closure"] button[type="submit"]');
  await waitDom("document.querySelector('[data-conflict-retry]')");
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure] [name=reason]').value"), "旧版本收尾");
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure] [name=expected_config_version]').value"), versions.config);
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure] [name=expected_agreement_version]').value"), versions.agreement);
  assert.match(await evaluate("document.querySelector('[data-event-conflict]').textContent || ''"), /当前预期结果|约定版本|配置版本|并发修改后的约定/);
  const retryKey = await evaluate("document.querySelector('[data-event-form=closure]').dataset.idempotencyKey || ''");
  assert.ok(retryKey);
  const beforeReviewCursor = app.goalEvents.readState(DEMO_BOARD_ID, goalId).goal_event_cursor;
  await evaluate(`(() => {
    if (typeof window.__refreshCallback !== "function") throw new Error("Missing real refresh callback");
    const real = window.fetch.bind(window);
    let once = true;
    window.fetch = async (input, init) => {
      const response = await real(input, init);
      if (once && String(input).endsWith("/event-state")) {
        once = false;
        await window.__refreshCallback();
      }
      return response;
    };
  })()`);
  await click("[data-conflict-retry]");
  await waitDom(`document.querySelector('[data-event-form=closure] [name=expected_agreement_version]')?.value !== ${JSON.stringify(versions.agreement)}`);
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure] [name=reason]').value"), "旧版本收尾");
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure]').dataset.idempotencyKey || ''"), "");
  assert.equal(app.goalEvents.readState(DEMO_BOARD_ID, goalId).goal_event_cursor, beforeReviewCursor);
  const state = app.goalEvents.readState(DEMO_BOARD_ID, goalId);
  assert.equal(state.latest_reports[0]?.title, "时间线已经接到真实写入");
  assert.equal(state.owner?.kind, "event_work");
  assert.ok(state.concerns.length >= 1);
  assert.ok(state.current_decisions.length >= 1);
});

test("legacy unfinished Goal history remains readable without writing owner or a retired transfer form", { timeout: 60_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, click, navigate, waitFor, reloadPage } = browser;
  const app = new GoalProjectApplication(store);
  const goalId = "legacy-readonly-history";
  const originalTitle = "未转交历史草稿";
  const originalOutcome = "旧结果必须原样可读";
  const originalWhy = "历史资料不能在更换界面时消失";
  const originalLogic = "从目标说明直接读取原字段";
  const originalConstraint = "原约束：只修改已确认的文案";
  const evidenceId = "legacy-readonly-evidence";
  const evidenceLocator = "historical-readonly://original-body";
  app.goals.commands.createGoal(DEMO_BOARD_ID, {
    goal_id: goalId,
    title: originalTitle,
    outcome: originalOutcome,
    why: originalWhy,
    business_logic: originalLogic,
    definition_state: "draft",
    decomposition_state: "abstract",
    constraints: [originalConstraint],
    required_inputs: ["原输入：用户已确认的发布说明"],
    promised_outputs: ["原输出：可读的最终说明文档"],
    acceptance_criteria: [],
  }, { actor_id: "history-fixture", idempotency_key: "legacy-readonly-create", reason: "隔离验收无 owner 历史阅读" });
  insertHistoricalClaim(store.db, {
    claim_id: "legacy-readonly-claim",
    board_id: DEMO_BOARD_ID,
    goal_id: goalId,
    actor_id: "history-runtime",
  });
  insertHistoricalRun(store.db, {
    run_id: "legacy-readonly-run",
    board_id: DEMO_BOARD_ID,
    goal_id: goalId,
    claim_id: "legacy-readonly-claim",
    actor_id: "history-runtime",
    output_refs_json: JSON.stringify(["historical-readonly://run-output"]),
  });
  insertHistoricalEvidence(store.db, {
    evidence_id: evidenceId,
    board_id: DEMO_BOARD_ID,
    goal_id: goalId,
    producer_actor_id: "history-runtime",
    locator: evidenceLocator,
    kind: "artifact",
    result: "passed",
    run_id: "legacy-readonly-run",
  });
  const before = store.snapshot(DEMO_BOARD_ID);
  const beforeGoal = before.goals.find((item) => item.goal_id === goalId)!;
  const beforeEvidence = before.evidence.find((item) => item.evidence_id === evidenceId)!;
  assert.equal(app.goalEvents.isEventStateOwner(DEMO_BOARD_ID, goalId), false);
  assert.equal(beforeGoal.outcome, originalOutcome);
  assert.equal(beforeEvidence.locator, evidenceLocator);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(goalId) }, sessionId));
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
  await waitFor(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`);
  const page = await evaluate("document.querySelector('[data-goal-event-document]:not([hidden])')?.outerHTML || ''") as string;
  assert.match(page, new RegExp(originalTitle));
  assert.match(page, new RegExp(originalOutcome));
  assert.doesNotMatch(page, /data-open-goal-edit|data-event-form-open="note"|data-event-form="note"|data-event-form="type"|data-event-form="agreement"|data-event-form="closure"|data-event-form="continue"|data-event-form-open="resume"/);
  assert.match(page, /阅读原来的说明、要求和历史/);
  assert.equal(await evaluate(`document.querySelector('[data-event-form="continue"], [data-event-form-open="note"]')`), null);
  await click("[data-goal-event-document]:not([hidden]) .goal-info-actions > [data-event-reader='description']");
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hasAttribute('hidden')");
  const description = await evaluate("document.querySelector('[data-event-panel=description]')?.textContent || ''") as string;
  assert.match(description, new RegExp(originalWhy));
  assert.match(description, new RegExp(originalLogic));
  assert.match(description, new RegExp(originalConstraint));
  await click("[data-goal-event-document]:not([hidden]) [data-event-back]");
  await waitFor(`document.querySelector('[data-event-reader-root]')?.hasAttribute('hidden') === true`);
  const historyId = await evaluate(`document.querySelector('[data-source="legacy_evidence"]')?.dataset.timelineItem || ""`) as string;
  assert.ok(historyId, "unowned historical Goal must keep the original Evidence timeline item");
  await click(`[data-timeline-item="${historyId}"]`);
  await waitFor("document.querySelector('[data-event-sheet] .event')");
  const body = await evaluate("document.querySelector('[data-event-sheet]')?.textContent || ''") as string;
  assert.match(body, new RegExp(evidenceId));
  assert.match(body, /historical-readonly:\/\/original-body/);
  assert.match(body, /原 Evidence/);
  await reloadPage();
  await waitFor(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`);
  const after = store.snapshot(DEMO_BOARD_ID);
  const afterGoal = after.goals.find((item) => item.goal_id === goalId)!;
  const afterEvidence = after.evidence.find((item) => item.evidence_id === evidenceId)!;
  assert.equal(app.goalEvents.isEventStateOwner(DEMO_BOARD_ID, goalId), false);
  assert.equal(afterGoal.title, beforeGoal.title);
  assert.equal(afterGoal.outcome, beforeGoal.outcome);
  assert.deepEqual(afterGoal.constraints, beforeGoal.constraints);
  assert.equal(afterEvidence.locator, beforeEvidence.locator);
  assert.deepEqual(after.evidence.filter((item) => item.goal_id === goalId), before.evidence.filter((item) => item.goal_id === goalId));
  assert.equal(await evaluate(`document.querySelector('[data-event-form-open="note"], [data-open-goal-edit], [data-event-form="continue"]')`), null);
});

test("timeline pagination retries in place and preserves dates, type markers and readable historical results", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const { goal } = app.goalEvents.createIntent({ board_id: DEMO_BOARD_ID, title: "验证跨日时间线", outcome: "更早的结果仍然可以阅读", actor_id: "web-user", actor_kind: "user", idempotency_key: "paged-goal" });
  for (let index = 0; index < 42; index += 1) {
    app.goalEvents.recordNote({ board_id: DEMO_BOARD_ID, goal_id: goal.goal_id, actor_id: "web-user", actor_kind: "user", idempotency_key: "paged-note-" + index, body: "最近的工作记录 " + index });
  }
  insertHistoricalEvidence(store.db, { evidence_id: "paged-historical-result", board_id: DEMO_BOARD_ID, goal_id: goal.goal_id, producer_actor_id: "history-runtime", locator: "artifact://pagination-original", result: "passed", captured_at: "2026-09-01T16:40:00.000Z" });
  const before = store.snapshot(DEMO_BOARD_ID);
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setTimezoneOverride", { timezoneId: "Asia/Shanghai" }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(goal.goal_id) }, sessionId));
    if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
  if (await evaluate("document.querySelector('[data-document-pane]').hidden")) await click("[data-goal-details-toggle]");
  await waitFor("document.querySelector('[data-load-more-timeline]') && !document.querySelector('[data-load-more-timeline]').hidden");
  await command("Network.setBlockedURLs", { urls: [origin + "/api/goals/" + goal.goal_id + "/event-timeline*"] }, sessionId);
  await click("[data-load-more-timeline]");
  await waitFor("!document.querySelector('[data-load-more-timeline]').disabled && document.querySelector('[data-toast]').textContent.length > 0");
  assert.equal(await evaluate("document.querySelectorAll('[data-timeline-item]').length"), 40);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await click("[data-load-more-timeline]");
  const older = '[data-timeline-item][data-original-id="paged-historical-result"]';
  await waitFor("document.querySelector(" + JSON.stringify(older) + ")");
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(older) + ").querySelector('time').textContent"), "00:40");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-event-timeline] .day-label')].at(-1).textContent"), "2026-09-02");
  assert.equal(await evaluate("document.querySelector(" + JSON.stringify(older) + ").getAttribute('aria-expanded')"), "false");
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(older) + ").querySelector('.timeline-type').textContent"), /完成依据/);
  await click(older);
  await waitFor("document.querySelector('[data-event-sheet]').textContent.includes('artifact://pagination-original')");
  assert.equal(await evaluate("document.querySelector('[data-event-sheet]').previousElementSibling.dataset.originalId"), "paged-historical-result");
  const ids = await evaluate<string[]>("[...document.querySelectorAll('[data-timeline-item]')].map(node=>node.dataset.timelineItem)");
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(store.snapshot(DEMO_BOARD_ID), before, "reading and retrying history must not write facts");
});
