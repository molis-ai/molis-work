import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const OUT = "/tmp/molis-work-grok/04-ui";

test("capture isolated production Goal event document screenshots", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate } = browser;
  const app = new GoalProjectApplication(store);
  const created = app.goalEvents.createIntent({
    board_id: DEMO_BOARD_ID,
    title: "隔离演示：内部试用截图",
    outcome: "截图标明这是隔离演示数据",
    actor_id: "web-user",
    actor_kind: "user",
    idempotency_key: "capture-intent",
  });
  app.goalEvents.configure({
    board_id: DEMO_BOARD_ID,
    goal_id: created.goal.goal_id,
    actor_id: "web-user",
    actor_kind: "user",
    expected_version: 0,
    idempotency_key: "capture-cfg",
    types: [{
      type_id: "note",
      version: 1,
      name: "进展记录",
      purpose: "记下实际做成的事",
      semantic_family: "progress",
      fields: [{ field_id: "body", name: "内容", purpose: "原文", format: "longtext", required: true }],
    }],
  });
  app.goalEvents.report({
    board_id: DEMO_BOARD_ID,
    goal_id: created.goal.goal_id,
    actor_id: "web-user",
    actor_kind: "user",
    idempotency_key: "capture-report",
    events: [{ type_id: "note", type_version: 1, title: "时间线已经接到真实写入", fields: { body: "这条是隔离演示库里的真实报告，不是原型示例。" } }],
  });
  await mkdir(OUT, { recursive: true });
  async function capture(name: string) {
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    const path = `${OUT}/${name}.png`;
    await writeFile(path, Buffer.from(data, "base64"));
    console.log("04 UI capture: " + path);
  }
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/" + encodeURIComponent(created.goal.goal_id) }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === " + JSON.stringify(created.goal.goal_id));
  await waitFor("document.querySelector('[data-event-sheet] .event, [data-event-sheet] .no-results')");
  await capture("desktop");
  await click('[data-goal-event-document]:not([hidden]) .goal-more > summary');
  await click('[data-goal-event-document]:not([hidden]) .goal-more [data-event-reader="planning"]');
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hidden");
  await capture("desktop-planning");
  await click('[data-goal-event-document]:not([hidden]) [data-event-panel="planning"] [data-event-reader="type"]');
  await waitFor("document.querySelector('[data-event-form=type]') && document.querySelector('[data-event-form=type]').hidden === false");
  await capture("desktop-type");
  await click('[data-event-form=type] [data-event-reader="planning"]');
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hidden");
  await click('[data-goal-event-document]:not([hidden]) [data-event-report="note"]');
  await waitFor("document.querySelector('[data-event-form=report][data-type-id=note]') && document.querySelector('[data-event-form=report][data-type-id=note]').hidden === false");
  await capture("desktop-report");
  await click('[data-event-form=report][data-type-id=note] [data-event-reader="planning"]');
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hidden");
  await click("[data-event-back]");
  await waitFor("document.querySelector('[data-event-sheet]') && !document.querySelector('[data-event-sheet]').hidden");
  await evaluate(`document.documentElement.dataset.resolvedTheme = 'dark'; document.documentElement.setAttribute('data-resolved-theme','dark'); true`);
  await capture("desktop-dark");
  await evaluate(`document.documentElement.dataset.density = 'compact'; document.documentElement.setAttribute('data-density','compact'); true`);
  await capture("desktop-dark-compact");
  await evaluate(`document.documentElement.removeAttribute('data-resolved-theme'); document.documentElement.removeAttribute('data-density'); true`);
  await evaluate(`(() => {
    const doc = document.querySelector("[data-goal-event-document]");
    if (!doc) return false;
    doc.style.width = "522px";
    doc.style.maxWidth = "522px";
    doc.style.minWidth = "522px";
    return true;
  })()`);
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const constrainedWidth = await evaluate("Math.round(document.querySelector('[data-goal-event-document]')?.getBoundingClientRect().width || 0)");
  assert.equal(constrainedWidth, 522);
  await capture("desktop-squeezed-reading");
  await evaluate(`document.querySelector("[data-goal-event-document]")?.removeAttribute("style")`);
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await click('[data-mobile-target="document"]');
  await waitFor("document.querySelector('[data-goal-event-document]')");
  await evaluate(`(() => {
    document.querySelector("[data-goal-layout]")?.classList.remove("is-showing-detail");
    document.querySelector("[data-goal-event-document]")?.classList.remove("is-showing-detail");
    return true;
  })()`);
  await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await capture("mobile-390-timeline");
  await capture("mobile-390");
  const firstItem = await evaluate("document.querySelector('[data-goal-event-document]:not([hidden]) [data-timeline-item]')?.dataset.timelineItem || ''") as string;
  assert.ok(firstItem);
  await click(`[data-goal-event-document]:not([hidden]) [data-timeline-item="${firstItem}"]`);
  await waitFor("document.querySelector('[data-goal-layout]')?.classList.contains('is-showing-detail')");
  await capture("mobile-390-detail");
  await click('[data-goal-event-document]:not([hidden]) .goal-more > summary');
  await click('[data-goal-event-document]:not([hidden]) .goal-more [data-event-reader="planning"]');
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hidden");
  await click('[data-goal-event-document]:not([hidden]) [data-event-panel="planning"] [data-event-reader="type"]');
  await waitFor("document.querySelector('[data-event-form=type]') && document.querySelector('[data-event-form=type]').hidden === false");
  await evaluate("document.querySelector('[data-event-form=type] h2')?.scrollIntoView({block:'start',behavior:'instant'})");
  await capture("mobile-390-form-top");
  await evaluate("document.querySelector('[data-event-form=type] button[type=submit]')?.scrollIntoView({block:'end',behavior:'instant'})");
  await capture("mobile-390-form-bottom");
  await click('[data-event-form=type] [data-event-reader="planning"]');
  await waitFor("document.querySelector('[data-event-reader-root]') && !document.querySelector('[data-event-reader-root]').hidden");
  await click("[data-action=timeline]");
  await waitFor("document.querySelector('[data-goal-layout]') && !document.querySelector('[data-goal-layout]').classList.contains('is-showing-detail')");
  await capture("mobile-390-back");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/goals/V1" }, sessionId));
  await waitFor("document.querySelector('[data-goal-event-document]')?.dataset.goalView === 'V1'");
  await capture("desktop-legacy-v1");
  assert.equal(await evaluate("document.querySelector('[data-goal-event-document]') != null"), true);
});
