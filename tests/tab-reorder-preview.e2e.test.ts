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
    slotBefore: string;
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
      slotBefore: slot?.nextElementSibling?.dataset?.tabKind || '',
      slotWidth: slot ? slot.getBoundingClientRect().width : 0,
      goalWidth: Number.parseFloat(getComputedStyle(document.body).getPropertyValue('--tab-reorder-width')) || 0,
      overlay: host?.hasAttribute('data-split-drop-preview') || false,
    };
  })()`);
  assert.equal(preview.goalSource, true);
  assert.equal(preview.slotBefore, "home");
  assert.ok(Math.abs(preview.slotWidth - preview.goalWidth) < 12, "slot matches dragged tab width: " + JSON.stringify(preview));
  assert.equal(preview.overlay, false);

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
