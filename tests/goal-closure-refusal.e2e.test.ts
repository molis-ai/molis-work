import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// BL-135: a refused closure writes 「收尾未生效」 and the response's unmet reasons onto the
// form, then reloadDocument replaces that form. The reasons must still sit on the new form.
// The empty reason field proves this is the post-read-back form. A status check alone would
// pass on the pre-reload node when the reload never replaced the document.
test("BL-135 refused closure keeps unmet reasons beside the form after the document read-back", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { store, origin, sessionId, command, evaluate, waitFor, click, navigate, projectId } = browser;
  // The catalog's project owns the Goal: its pages and Runtime plugin routes are served under the project prefix.
  const prefix = `/projects/${projectId}`;
  const app = new GoalProjectApplication(store);
  const created = app.goalEvents.createIntent({
    project_id: DEMO_PROJECT_ID,
    title: "收尾被拒后原因仍应留在表单旁",
    actor_id: "web-user",
    actor_kind: "user",
    idempotency_key: "bl135-intent",
  });
  const goalId = created.goal.goal_id;
  const closureForm = '[data-event-form="closure"]';
  const read = () => app.goalEvents.readState(DEMO_PROJECT_ID, goalId);

  async function view() {
    return evaluate<{ reason: string; statusText: string; formHidden: boolean; toast: string; hero: string }>(`(() => {
      const form = document.querySelector(${JSON.stringify(closureForm)});
      return {
        reason: form?.querySelector('[name="reason"]')?.value ?? "",
        statusText: form?.querySelector("[data-form-status]")?.textContent ?? "",
        formHidden: form?.hidden !== false,
        toast: document.querySelector("[data-toast]")?.textContent ?? "",
        hero: document.querySelector("[data-current-summary] .goal-current-fact")?.textContent ?? "",
      };
    })()`);
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
  async function submitRefused(reason: string) {
    await waitFor(`(() => { const list = document.querySelector("[data-closure-deliverable-list]"); const text = list?.textContent || ""; return Boolean(list) && !text.includes("正在读取"); })()`, 15_000);
    await fillField(`${closureForm} [name="result"]`, "还没有可以成立的结果");
    await fillField(`${closureForm} [name="reason"]`, reason);
    const before = read().goal_event_cursor;
    await click(`${closureForm} button[type="submit"]`);
    await waitFor(`(() => {
      const form = document.querySelector(${JSON.stringify(closureForm)});
      const toast = document.querySelector("[data-toast]")?.textContent || "";
      const ready = document.querySelector("[data-goal-event-document]")?.dataset.goalView === ${JSON.stringify(goalId)} && Number(document.querySelector("[data-goal-event-document]")?.dataset.goalEventCursor) > ${before} && document.querySelector("[data-document-pane]")?.getAttribute("aria-busy") !== "true" && toast.includes("收尾未生效");
      if (ready) window.__bl135 = { reason: form?.querySelector('[name="reason"]')?.value ?? "", statusText: form?.querySelector("[data-form-status]")?.textContent ?? "", formHidden: form?.hidden !== false, toast, hero: document.querySelector("[data-current-summary] .goal-current-fact")?.textContent ?? "" };
      return ready;
    })()`, 20_000);
    const shown = await evaluate<Awaited<ReturnType<typeof view>>>("window.__bl135");
    return { before, shown };
  }

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}${prefix}/goals/${encodeURIComponent(goalId)}` }, sessionId));
  if (await evaluate("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width > 0")) await click("[data-frame-goal-work]");
  await waitFor(`document.querySelector('[data-goal-event-document]')?.dataset.goalView === ${JSON.stringify(goalId)}`, 15_000);
  await click('[data-event-reader="requirements"]');
  await click('[data-event-panel="requirements"] [data-event-form-open="closure"]');
  await waitFor(`document.querySelector(${JSON.stringify(closureForm)})?.hidden === false`);

  const first = await submitRefused("BL-135 这条收尾应当留下未满足的原因");
  const beforeCursor = first.before;
  const shown = first.shown;
  const refused = read();
  const messages = refused.closure?.unmet_reasons.map((item) => item.message) ?? [];
  assert.equal(refused.work_status, "open");
  assert.equal(refused.closure?.completion_applied, false);
  assert.ok(messages.length > 0);
  assert.ok(refused.goal_event_cursor > beforeCursor);
  assert.equal(shown.formHidden, false);
  assert.equal(shown.reason, "", `read-back should replace the form before the refusal list is checked; status=${JSON.stringify(shown.statusText)}`);
  for (const message of messages) {
    assert.ok(
      shown.statusText.includes("收尾未生效") && shown.statusText.includes(message),
      `BL-135: after read-back the closure form should keep 「收尾未生效」 and ${JSON.stringify(message)}; status=${JSON.stringify(shown.statusText)} toast=${JSON.stringify(shown.toast)} hero=${JSON.stringify(shown.hero)}`,
    );
  }
  assert.equal(shown.toast, "收尾未生效。顶部已按当前权威状态更新。");
  assert.ok(shown.hero.includes(messages[0]!), `hero=${JSON.stringify(shown.hero)}`);
  assert.equal(shown.hero.includes("已有完成结论"), false);

  await fillField(`${closureForm} [name="reason"]`, "改了理由，表单上的原因列表应先收起");
  const edited = await view();
  assert.equal(edited.statusText.includes("收尾未生效"), false, `editing the form should clear the refusal list; status=${JSON.stringify(edited.statusText)}`);
  assert.ok(edited.hero.includes(messages[0]!), `hero stays the read-back unmet reason; hero=${JSON.stringify(edited.hero)}`);

  const second = await submitRefused("BL-135 再次提交仍被拒，原因要重新出现");
  const again = read();
  const againMessages = again.closure?.unmet_reasons.map((item) => item.message) ?? [];
  const retried = second.shown;
  assert.equal(retried.reason, "");
  for (const message of againMessages) {
    assert.ok(retried.statusText.includes("收尾未生效") && retried.statusText.includes(message), `retry should show ${JSON.stringify(message)}; status=${JSON.stringify(retried.statusText)}`);
  }
  assert.ok(retried.hero.includes(againMessages[0] ?? ""), `hero=${JSON.stringify(retried.hero)}`);
});
