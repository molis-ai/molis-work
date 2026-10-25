import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GOAL_PLUGIN_OBJECT_SOURCE, goalPluginObjectRef } from "@molis-ai/molis-work-contracts/modules/goals";
import { GoalProjectApplication, boardSnapshot } from "./fixtures/goal-application.js";

test("event document writes planning, report, concern, decision and closure through the production UI", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const created = app.goalEvents.createIntent({
    project_id: DEMO_PROJECT_ID,
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
    const before = app.goalEvents.readState(DEMO_PROJECT_ID, goalId).goal_event_cursor;
    // The page puts the re-read document in first and closes its panels after; the submitted form stays busy until both are
    // done, so the next step does not open a form the closing then hides (seen on the slower Linux runner).
    await evaluate(`(window.__savingForm = document.querySelector(${JSON.stringify(selector)})?.closest("[data-event-form]") ?? null, true)`);
    await click(selector);
    await waitDom(
      `document.querySelector("[data-goal-event-document]")?.dataset.goalView === ${JSON.stringify(goalId)} && Number(document.querySelector("[data-goal-event-document]")?.dataset.goalEventCursor) > ${before} && document.querySelector("[data-document-pane]")?.getAttribute("aria-busy") !== "true" && !window.__savingForm?.hasAttribute("aria-busy")`,
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
  // The board's real 4-second refresh: since #150 it is a polled timeout (the UI lifecycle's poll), not an interval.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `(()=>{const original=window.setTimeout;window.setTimeout=function(fn,ms,...args){if(ms===4000&&typeof fn==='function')window.__refreshTick=fn;return original.call(this,fn,ms,...args);};})()` }, sessionId);
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
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.types.some((type) => type.name === "进展记录")) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  const typeId = app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.types.find((type) => type.name === "进展记录")?.type_id;
  assert.ok(typeId);
  await waitDom(`document.querySelector('[data-event-report="${typeId}"]')`);
  await openNamedForm("adopt");
  const methodId = await evaluate(`document.querySelector('[data-event-form="adopt"] [name="method_id"] option[value]:not([value=""])')?.value || ""`) as string;
  assert.ok(methodId, "adopt form must list current effective planning methods");
  await submitSuccess('[data-event-form="adopt"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.adopted_planning.length) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.adopted_planning.length);
  await openNamedForm("agreement");
  await evaluate(`document.querySelector('[data-event-form="agreement"] [name="outcome"]').value='经页面修改后的约定'`);
  await submitSuccess('[data-event-form="agreement"] button[type="submit"]');
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (/经页面修改后的约定/.test(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).agreement.outcome)) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.match(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).agreement.outcome, /经页面修改后的约定/);
  await openPlanning();
  await click(`[data-goal-event-document]:not([hidden]) [data-event-form-open="type-edit"][data-type-id="${typeId}"]`);
  await waitDom(`document.querySelector('[data-event-form="type-edit"][data-type-id="${typeId}"]') && document.querySelector('[data-event-form="type-edit"][data-type-id="${typeId}"]').hidden === false`);
  await submitSuccess(`[data-event-form="type-edit"][data-type-id="${typeId}"] button[type="submit"]`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.types.find((type) => type.type_id === typeId)?.version === 2) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).config.types.find((type) => type.type_id === typeId)?.version, 2);
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
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).latest_reports[0]?.title === "时间线已经接到真实写入") break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).latest_reports[0]?.title, "时间线已经接到真实写入");
  await openNamedForm("progress");
  await fillField('[data-event-form="progress"] [name="summary"]', "主流程已跑通，正在核对问题");
  await fillField('[data-event-form="progress"] [name="next_step"]', "验证异常恢复");
  await submitSuccess('[data-event-form="progress"] button[type="submit"]');
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).progress_summary?.summary, "主流程已跑通，正在核对问题");
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).progress_summary?.next_step, "验证异常恢复");
  assert.match(await evaluate("document.querySelector('[data-current-summary]').textContent"), /主流程已跑通/);
  await openNamedForm("note");
  await fillField('[data-event-form="note"] [name="note"]', "备注只留在时间线，下一次试用时核对");
  await submitSuccess('[data-event-form="note"] button[type="submit"]');
  await waitDom("document.querySelector('[data-event-timeline]').textContent.includes('备注只留在时间线')");
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).progress_summary?.summary, "主流程已跑通，正在核对问题");
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
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).concerns.length >= 1) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).concerns.length >= 1);
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
    if (app.goalEvents.readState(DEMO_PROJECT_ID, goalId).current_decisions.length >= 1) break;
    await evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  }
  assert.ok(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).current_decisions.length >= 1);
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
  // The closure offers the 成果库's versions as deliverables (artifact-positioning A5); the list finishes loading.
  await waitDom(`(() => { const list = document.querySelector('[data-event-form="closure"] [data-closure-deliverable-list]'); return Boolean(list?.textContent) && !/正在读取/.test(list.textContent); })()`);
  const versions = await evaluate<{ config: string; agreement: string }>(`({
    config: document.querySelector('[data-event-form="closure"] [name="expected_config_version"]').value,
    agreement: document.querySelector('[data-event-form="closure"] [name="expected_agreement_version"]').value,
  })`);
  await fillField('[data-event-form="closure"] [name="reason"]', "旧版本收尾");
  const current = app.goalEvents.readState(DEMO_PROJECT_ID, goalId);
  app.goalEvents.setAgreement({
    project_id: DEMO_PROJECT_ID,
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
  const beforeReviewCursor = app.goalEvents.readState(DEMO_PROJECT_ID, goalId).goal_event_cursor;
  await evaluate(`(() => {
    if (typeof window.__refreshTick !== "function") throw new Error("Missing real refresh callback");
    const real = window.fetch.bind(window);
    let once = true, boardReads = 0;
    // Run the real refresh now and wait for the board reads it starts, as the old awaited interval callback did.
    const refreshNow = async () => {
      window.__refreshTick();
      await new Promise(resolve => setTimeout(resolve, 0));
      while (boardReads > 0) await new Promise(resolve => setTimeout(resolve, 20));
    };
    window.fetch = async (input, init) => {
      const board = String(input).includes("/api/board");
      if (board) boardReads += 1;
      try {
        const response = await real(input, init);
        if (once && String(input).endsWith("/event-state")) {
          once = false;
          await refreshNow();
        }
        return response;
      } finally { if (board) boardReads -= 1; }
    };
  })()`);
  await click("[data-conflict-retry]");
  await waitDom(`document.querySelector('[data-event-form=closure] [name=expected_agreement_version]')?.value !== ${JSON.stringify(versions.agreement)}`);
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure] [name=reason]').value"), "旧版本收尾");
  assert.equal(await evaluate("document.querySelector('[data-event-form=closure]').dataset.idempotencyKey || ''"), "");
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goalId).goal_event_cursor, beforeReviewCursor);
  const state = app.goalEvents.readState(DEMO_PROJECT_ID, goalId);
  assert.equal(state.latest_reports[0]?.title, "时间线已经接到真实写入");
  assert.equal(state.owner?.kind, "event_work");
  assert.ok(state.concerns.length >= 1);
  assert.ok(state.current_decisions.length >= 1);
});

for (const action of ["resolve", "overturn"] as const) test(`W2-18-CONCERN-EVIDENCE-01 ${action} sends subsequent evidence and retains refused input`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t); if (!browser) return;
  const { store, origin, command, sessionId, evaluate, click, navigate, waitFor } = browser, app = new GoalProjectApplication(store);
  const goal = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "证据处理", outcome: "真实后续事实", requirements: [{ requirement_id: "delivered", statement: "真实结果" }], actor_id: "web-user", actor_kind: "user", idempotency_key: "concern-goal" }).goal;
  app.goalEvents.configure({ project_id: DEMO_PROJECT_ID, goal_id: goal.goal_id, actor_id: "web-user", actor_kind: "user", expected_version: 0, idempotency_key: "concern-config",
    types: [{ type_id: "delivery", version: 1, name: "交付", purpose: "真实结果", fields: [{ field_id: "body", name: "内容", purpose: "证据", format: "text", required: true }] }],
    requirement_bindings: [{ type_id: "delivery", requirement_id: "delivered" }] });
  app.goalEvents.report({ project_id: DEMO_PROJECT_ID, goal_id: goal.goal_id, actor_id: "web-user", actor_kind: "user", idempotency_key: "concern-report",
    events: [{ type_id: "delivery", type_version: 1, title: "已有真实结果", fields: { body: "本目标的结果可读" }, judgments: [{ requirement_id: "delivered", verdict: "supports" }] }] });
  const other = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "另一个目标", actor_id: "web-user", actor_kind: "user", idempotency_key: "other-goal" }).goal;
  const earlier = app.goalEvents.recordNote({ project_id: DEMO_PROJECT_ID, goal_id: goal.goal_id, body: "问题提出前的备注", actor_id: "web-user", actor_kind: "user", idempotency_key: "earlier-note" });
  const foreign = app.goalEvents.recordNote({ project_id: DEMO_PROJECT_ID, goal_id: other.goal_id, body: "其他 Goal 的备注", actor_id: "web-user", actor_kind: "user", idempotency_key: "foreign-note" });
  const formSelector = '[data-goal-event-document]:not([hidden]) [data-event-form="concern"]';
  const open = async (kind: string) => {
    await click('[data-goal-event-document]:not([hidden]) [data-record-menu] > summary');
    await click(`[data-goal-event-document]:not([hidden]) [data-event-form-open="${kind}"]`);
    await waitFor(`document.querySelector('[data-event-form="${kind}"]')?.hidden === false`);
  };
  const submit = async (selector: string) => {
    const cursor = app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id).goal_event_cursor;
    await click(selector);
    await waitFor(`Number(document.querySelector('[data-goal-event-document]')?.dataset.goalEventCursor) > ${cursor} && document.querySelector('[data-document-pane]')?.getAttribute('aria-busy') !== 'true'`, 10_000);
  };
  // The Goal details sit beside the work at the desktop width the other journeys here use; below 840px they fold away.
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + goal.goal_id }, sessionId));
  await browser.openGoalWork();
  await open("concern");
  await evaluate(`(() => { const form = document.querySelector(${JSON.stringify(formSelector)});
    form.querySelector('[name=title]').value='待核对的问题'; form.querySelector('[name=statement]').value='需要真实后续事实';
    form.querySelector('[name=scope_action]').value='complete'; })()`);
  await submit(formSelector + ' button[type=submit]');
  const concern = app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id).concerns[0]!;
  assert.equal(concern.status, "open"); assert.equal(concern.blocks_closure, true);
  await open("note");
  await evaluate("document.querySelector('[data-event-form=note] [name=note]').value='问题提出之后的实际处理记录'");
  await submit('[data-event-form=note] button[type=submit]');
  const later = app.goalEvents.listLatestEvents(DEMO_PROJECT_ID, goal.goal_id).events.find(event => event.kind === "system" && event.payload.operation === "observation_note")!;
  assert.ok(later); assert.notEqual(later.event_id, earlier.event_id);
  await open("concern");
  await evaluate(`(() => { const form=document.querySelector(${JSON.stringify(formSelector)}); const choose=form.querySelector('[name=concern_id]');
    choose.value=${JSON.stringify(concern.concern_id)}; choose.dispatchEvent(new Event('change',{bubbles:true}));
    const action=form.querySelector('[name=action]'); action.value=${JSON.stringify(action)}; action.dispatchEvent(new Event('change',{bubbles:true}));
    form.querySelector('[name=reason]').value='已检查实际处理记录'; })()`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(formSelector)}).querySelector('[data-concern-evidence]').hidden`), false);
  const before = app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id);
  for (const evidence of [earlier.event_id, foreign.event_id]) {
    await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(formSelector)}).querySelector('[name=supporting_event_ids]');
      input.value=${JSON.stringify(evidence)}; input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await click(formSelector + ' button[type=submit]');
    await waitFor(`!document.querySelector(${JSON.stringify(formSelector)}).querySelector('[data-form-status]').hidden && !document.querySelector(${JSON.stringify(formSelector)}).querySelector('[type=submit]').disabled`);
    assert.deepEqual(app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id), before);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(formSelector)}).querySelector('[name=supporting_event_ids]').value`), evidence);
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(formSelector)}).querySelector('[name=reason]').value`), "已检查实际处理记录");
  }
  await evaluate(`document.querySelector(${JSON.stringify(formSelector)}).querySelector('[name=supporting_event_ids]').value=${JSON.stringify(later.event_id)}`);
  await submit(formSelector + ' button[type=submit]');
  const updated = app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id).concerns[0]!;
  assert.equal(updated.status, action === "resolve" ? "resolved" : "overturned");
  const resolution = app.goalEvents.readEvent(DEMO_PROJECT_ID, goal.goal_id, updated.resolution_event_id!);
  assert.deepEqual((resolution.payload as { supporting_event_ids: string[] }).supporting_event_ids, [later.event_id]);
  await click('[data-goal-event-document]:not([hidden]) [data-goal-requirement-progress]');
  await click('[data-event-panel="requirements"] [data-event-form-open="closure"]');
  await evaluate("document.querySelector('[data-event-form=closure] [name=reason]').value='问题已按证据处理'; document.querySelector('[data-event-form=closure] [name=result]').value='真实结果与处理记录可读'");
  await submit('[data-event-form=closure] button[type=submit]');
  assert.equal(app.goalEvents.readState(DEMO_PROJECT_ID, goal.goal_id).work_status, "completed", "the handled concern no longer blocks closure");
});

test("W2-18-GOAL-PIN-RETRY-01 a lost real Pages/Goal receipt must be reconciled before retry, while a new explicit intent pins a new version", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t); if (!browser) return;
  const { origin, store, controlToken, command, sessionId, navigate, evaluate, waitFor, click, reloadPage } = browser, app = new GoalProjectApplication(store);
  const goal = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "固定回包恢复", outcome: "重复收尾不重复固定", requirements: [{ requirement_id: "pending", statement: "仍待验收" }],
    actor_id: "web-user", actor_kind: "user", idempotency_key: "pin-retry-goal" }).goal;
  const created = await fetch(origin + "/api/plugins/io.molis.work.pages/pages", { method: "POST", headers: { "content-type": "application/json", origin,
    "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": "pin-retry-create-page" }, body: JSON.stringify({ title: "真实交付稿", markdown: "保留这个固定版本" }) });
  assert.equal(created.status, 200, await created.clone().text());
  const document = (await created.json() as { document: { id: string } }).document, subject = { kind: "pages_document", id: document.id }, artifactId = "pages-" + document.id;
  app.goalInputs.register({ binding_id: "pin-retry-binding", project_id: DEMO_PROJECT_ID, goal_id: goal.goal_id, input_name: "交付稿", source_type: GOAL_PLUGIN_OBJECT_SOURCE,
    source_ref: goalPluginObjectRef(subject), snapshot_digest: null, state: "confirmed", reason: "Fixture", created_by: "web-user", created_at: new Date().toISOString() });
  const openClosure = async () => {
    await click('[data-goal-event-document]:not([hidden]) [data-goal-requirement-progress]');
    await click('[data-event-panel="requirements"] [data-event-form-open="closure"]');
    await waitFor("!!document.querySelector('[data-event-form=closure] input[name=deliverable-pin]')");
    await evaluate("document.querySelector('[data-event-form=closure] [name=reason]').value='记录真实交付物'");
  };
  const submit = '[data-event-form=closure] button[type=submit]';
  // The Goal details sit beside the work at the desktop width the other journeys here use; below 840px they fold away.
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + goal.goal_id }, sessionId));
  await browser.openGoalWork();
  await openClosure();
  await evaluate(`(() => { const original=window.fetch; window.__pinPosts=0; window.__pinLost=true; window.__rejectDeliverableRead=false;
    window.fetch=async(url, options)=>{
      const endpoint=String(url).endsWith(${JSON.stringify("/api/goals/" + goal.goal_id + "/deliverables")});
      if(endpoint && options?.method === 'POST' && JSON.parse(options.body).subject){
        window.__pinPosts++; const response=await original(url,options);
        if(window.__pinLost && response.ok){window.__pinLost=false; await response.text(); throw new TypeError('reply lost after commit');} return response;
      }
      // A read: the shared request helper names GET, a bare fetch names no method.
      if(endpoint && (!options?.method || options.method === 'GET') && window.__rejectDeliverableRead) return new Response('{}',{status:503});
      return original(url,options);
    }; })()`);
  await click('[data-event-form=closure] input[name=deliverable-pin]');
  await click(submit);
  await waitFor("document.querySelector('[data-event-form=closure] [data-form-status]')?.textContent.includes('尚未核对') && !document.querySelector('[data-event-form=closure] [type=submit]').disabled");
  const versions = () => openProjectVersionStores(store).artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, artifactId).map(row => row.version);
  const linked = async () => (await (await fetch(origin + "/api/goals/" + goal.goal_id + "/deliverables")).json() as { deliverables: Array<{ reference: { version: number } }> }).deliverables.map(row => row.reference.version);
  assert.deepEqual(versions(), [1]); assert.deepEqual(await linked(), [1]);
  await click(submit); await waitFor("!document.querySelector('[data-event-form=closure] [type=submit]').disabled");
  assert.equal(await evaluate("window.__pinPosts"), 1);
  await evaluate("window.__rejectDeliverableRead=true"); await click('[data-reconcile-deliverables]');
  await waitFor("document.querySelector('[data-deliverable-read-status]').textContent.includes('未读回') && !document.querySelector('[data-reconcile-deliverables]').disabled");
  await click(submit); await waitFor("!document.querySelector('[data-event-form=closure] [type=submit]').disabled");
  assert.equal(await evaluate("window.__pinPosts"), 1, "a failed read cannot unblock the original pin");
  await evaluate("window.__rejectDeliverableRead=false"); await click('[data-reconcile-deliverables]');
  await waitFor("document.querySelector('[data-reconcile-deliverables]').hidden && !!document.querySelector('[data-event-form=closure] input[name=deliverable]:checked')");
  // The closure is refused and said so; after the document reads back the message is the page's status toast (same on main), and
  // the versions below prove nothing was pinned or linked twice.
  await click(submit); await waitFor("[document.querySelector('[data-event-form=closure] [data-form-status]')?.textContent, document.querySelector('[data-toast]')?.textContent].some(text => text?.includes('收尾未生效')) && !document.querySelector('[data-event-form=closure] [type=submit]').disabled", 10_000);
  assert.deepEqual(versions(), [1]); assert.deepEqual(await linked(), [1]);
  await reloadPage(); await browser.openGoalWork(); await openClosure();
  await click('[data-event-form=closure] input[name=deliverable-pin]'); await click(submit);
  await waitFor("[document.querySelector('[data-event-form=closure] [data-form-status]')?.textContent, document.querySelector('[data-toast]')?.textContent].some(text => text?.includes('收尾未生效')) && !document.querySelector('[data-event-form=closure] [type=submit]').disabled", 10_000);
  assert.deepEqual(versions(), [1, 2]); assert.deepEqual((await linked()).sort(), [1, 2]);
});

test("a Goal without event work stays readable without writing an owner or offering a retired transfer form", { timeout: 60_000 }, async (t) => {
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
  app.goals.commands.createGoal(DEMO_PROJECT_ID, {
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
  const before = boardSnapshot(store, DEMO_PROJECT_ID);
  const beforeGoal = before.goals.find((item) => item.goal_id === goalId)!;
  assert.equal(app.goalEvents.isEventStateOwner(DEMO_PROJECT_ID, goalId), false);
  assert.equal(beforeGoal.outcome, originalOutcome);
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
  const historyId = await evaluate(`document.querySelector('[data-source="journal"]')?.dataset.timelineItem || ""`) as string;
  assert.ok(historyId, "an unowned Goal keeps its journal records in the timeline");
  await click(`[data-timeline-item="${historyId}"]`);
  await waitFor("document.querySelector('[data-event-sheet] .event')");
  const body = await evaluate("document.querySelector('[data-event-sheet]')?.textContent || ''") as string;
  assert.match(body, /隔离验收无 owner 历史阅读/);
  await reloadPage();
  await waitFor(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`);
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  const afterGoal = after.goals.find((item) => item.goal_id === goalId)!;
  assert.equal(app.goalEvents.isEventStateOwner(DEMO_PROJECT_ID, goalId), false);
  assert.equal(afterGoal.title, beforeGoal.title);
  assert.equal(afterGoal.outcome, beforeGoal.outcome);
  assert.deepEqual(afterGoal.constraints, beforeGoal.constraints);
  assert.equal(await evaluate(`document.querySelector('[data-event-form-open="note"], [data-open-goal-edit], [data-event-form="continue"]')`), null);
});

test("timeline pagination retries in place and preserves dates, type markers and readable historical results", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const { goal } = app.goalEvents.createIntent({ project_id: DEMO_PROJECT_ID, title: "验证跨日时间线", outcome: "更早的结果仍然可以阅读", actor_id: "web-user", actor_kind: "user", idempotency_key: "paged-goal" });
  for (let index = 0; index < 42; index += 1) {
    app.goalEvents.recordNote({ project_id: DEMO_PROJECT_ID, goal_id: goal.goal_id, actor_id: "web-user", actor_kind: "user", idempotency_key: "paged-note-" + index, body: "最近的工作记录 " + index });
  }
  store.appendEvent({ eventId: "paged-historical-result", projectId: DEMO_PROJECT_ID, actorId: "web-user", type: "goal.updated", objectType: "goal",
    objectId: goal.goal_id, reason: "更早的说明修订", payload: {}, at: "2026-09-01T16:40:00.000Z" });
  const before = boardSnapshot(store, DEMO_PROJECT_ID);
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
  assert.match(await evaluate<string>("document.querySelector(" + JSON.stringify(older) + ").querySelector('.timeline-type').textContent"), /更新目标/);
  await click(older);
  await waitFor("document.querySelector('[data-event-sheet]').textContent.includes('更早的说明修订')");
  assert.equal(await evaluate("document.querySelector('[data-event-sheet]').previousElementSibling.dataset.originalId"), "paged-historical-result");
  const ids = await evaluate<string[]>("[...document.querySelectorAll('[data-timeline-item]')].map(node=>node.dataset.timelineItem)");
  assert.equal(ids.length, new Set(ids).size);
  assert.deepEqual(boardSnapshot(store, DEMO_PROJECT_ID), before, "reading and retrying history must not write facts");
});
