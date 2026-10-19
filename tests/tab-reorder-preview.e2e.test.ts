import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("dragging a tab on the strip shows a live landing slot", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, openGoalFrame, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-goal-momentum]')?.dataset.loaded === 'true'");
  await openGoalFrame('.tree-node[data-select-goal="CORE"]');
  await waitFor("document.querySelector('.tab-item[aria-current][data-plugin=goals][data-tab-kind=item][data-item-id=CORE]')");

  const preview = await evaluate<{
    goalSource: boolean;
    slotAfter: string;
    slotGroup: string;
    slotWidth: number;
    goalWidth: number;
    overlay: boolean;
  }>(`(() => {
    const home = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const goal = document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]');
    const transfer = new DataTransfer();
    goal.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const box = home.getBoundingClientRect();
    home.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: transfer,
      clientX: box.left + 8, clientY: box.top + box.height / 2,
    }));
    const slot = document.querySelector('[data-tab-reorder-slot]');
    const host = document.querySelector('[data-tab-panes]');
    return {
      goalSource: goal.classList.contains('is-tab-drag-source'),
      slotAfter: slot?.previousElementSibling?.dataset?.tabKind || '',
      slotGroup: slot?.closest('[data-plugin-group]')?.dataset.pluginGroup || '',
      slotWidth: slot ? slot.getBoundingClientRect().width : 0,
      goalWidth: Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--tab-reorder-width')) || 0,
      overlay: host?.hasAttribute('data-split-drop-preview') || false,
    };
  })()`);
  assert.equal(preview.goalSource, true);
  // PTG-03 a Goal's tab belongs to the Goals group: dragged toward Home, its slot stays after the group's plugin tab.
  assert.equal(preview.slotGroup, "goals");
  assert.equal(preview.slotAfter, "plugin");
  assert.ok(Math.abs(preview.slotWidth - preview.goalWidth) < 12, "slot matches dragged tab width: " + JSON.stringify(preview));
  assert.equal(preview.overlay, false);
  await evaluate("document.querySelector('[data-titlebar-tabs] .tab-item[data-item-id=CORE]').dispatchEvent(new DragEvent('dragend', { bubbles: true }))");

  // PTG-03 a plugin's tab carries its whole group: the slot is the group's width, starts where the group was, and lands
  // between groups, never inside one; the drop moves the plugin tab and its Goal together.
  await click("[data-titlebar-tabs] [data-tab-add]");
  await click("[data-tab-menu-action=open-feed]");
  await waitFor("document.querySelector('[data-titlebar-tabs] [data-plugin-group=feed] .tab-item[aria-current]')");
  const group = await evaluate<{ start: { group: boolean; width: number; next: string }; over: { parent: boolean; previous: string }; groupWidth: number; order: string }>(`(async () => {
    const q = (selector) => document.querySelector('[data-titlebar-tabs] ' + selector);
    const over = (el, at, transfer) => { const b = el.getBoundingClientRect(); el.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: b.left + b.width * at, clientY: b.top + b.height / 2 })); };
    const transfer = new DataTransfer();
    const groupWidth = q('[data-plugin-group=goals]').getBoundingClientRect().width;
    q('.tab-item[data-tab-kind=plugin][data-plugin=goals]').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    over(q('[data-tab-scroll]'), 0.01, transfer);
    let slot = document.querySelector('[data-tab-reorder-slot]');
    const start = { group: slot.classList.contains('is-group'), width: slot.getBoundingClientRect().width, next: slot.nextElementSibling?.dataset.pluginGroup || '' };
    over(q('[data-plugin-group=feed] .tab-item'), 0.8, transfer);
    slot = document.querySelector('[data-tab-reorder-slot]');
    const result = { start, over: { parent: slot.parentElement.hasAttribute('data-tab-scroll'), previous: slot.previousElementSibling?.dataset.pluginGroup || '' }, groupWidth };
    const feed = q('[data-plugin-group=feed] .tab-item'), b = feed.getBoundingClientRect();
    feed.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: b.left + b.width * 0.8, clientY: b.top + b.height / 2 }));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    result.order = [...document.querySelectorAll('[data-titlebar-tabs] .tab-item')].map((tab) => tab.dataset.tabKind + ':' + tab.dataset.plugin).join(',');
    return result;
  })()`);
  assert.equal(group.start.group, true, JSON.stringify(group));
  assert.ok(Math.abs(group.start.width - group.groupWidth) < 2, "the slot is the group's width: " + JSON.stringify(group));
  assert.equal(group.start.next, "feed", "the first slot is where the group was");
  assert.deepEqual(group.over, { parent: true, previous: "feed" }, "a group's slot lands after the group it is over, between groups");
  assert.equal(group.order, "home:home,plugin:feed,plugin:goals,item:goals");

  const edge = await evaluate<boolean>(`(() => {
    const home = document.querySelector('[data-titlebar-tabs] .tab-item[data-tab-kind=home]');
    const body = document.querySelector('[data-tab-pane-body]');
    const transfer = new DataTransfer();
    document.body.dataset.tabDragCopy = '1';
    home.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }));
    const r = body.getBoundingClientRect();
    body.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, altKey: true, dataTransfer: transfer,
      clientX: r.left + r.width * 0.1, clientY: r.top + r.height * 0.5,
    }));
    return Boolean(document.querySelector('[data-tab-panes][data-split-drop-preview]')) && !document.querySelector('[data-tab-reorder-slot]');
  })()`);
  assert.equal(edge, true, "split-edge preview hides the tab slot");
});
