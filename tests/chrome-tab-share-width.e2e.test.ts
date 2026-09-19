import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("titlebar tabs hug short titles and share width when they overflow the strip", { timeout: 90_000 }, async (t) => {
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

  const compact = await evaluate<{ widths: number[]; lastRight: number; addLeft: number }>(`(() => {
    const tabs = [...document.querySelectorAll('[data-titlebar-tabs] .tab-item:not([data-pinned])')];
    const add = document.querySelector('[data-titlebar-tabs] .tab-add-button');
    return {
      widths: tabs.map((tab) => Math.round(tab.getBoundingClientRect().width)),
      lastRight: Math.round(tabs.at(-1).getBoundingClientRect().right),
      addLeft: Math.round(add.getBoundingClientRect().left),
    };
  })()`);
  assert.ok(compact.widths.length >= 2, JSON.stringify(compact));
  assert.ok(compact.widths.every((width) => width > 40 && width <= 172), "tabs stay at or under 172px: " + JSON.stringify(compact));
  assert.ok(compact.widths.some((width) => width < 140), "short titles must hug below the old 172px capsule: " + JSON.stringify(compact));
  assert.ok(compact.lastRight <= compact.addLeft + 1, "tabs stay left of the plus control: " + JSON.stringify(compact));

  await command("Emulation.setDeviceMetricsOverride", { width: 480, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor(`(() => {
    const tabs = [...document.querySelectorAll('[data-titlebar-tabs] [data-tab-scroll] .tab-item:not([data-pinned])')];
    if (tabs.length < 2) return false;
    const widths = tabs.map((tab) => Math.round(tab.getBoundingClientRect().width));
    const scroll = document.querySelector('[data-titlebar-tabs] [data-tab-scroll]').getBoundingClientRect();
    const right = Math.max(...tabs.map((tab) => tab.getBoundingClientRect().right));
    return Math.max(...widths) - Math.min(...widths) <= 2 && right <= scroll.right + 1 && widths.every((width) => width < 172);
  })()`);

  const packed = await evaluate<{ widths: number[]; tabRight: number; scrollRight: number; count: number }>(`(() => {
    const scroll = document.querySelector('[data-titlebar-tabs] [data-tab-scroll]');
    const tabs = [...scroll.querySelectorAll('.tab-item:not([data-pinned])')];
    const box = scroll.getBoundingClientRect();
    return {
      widths: tabs.map((tab) => Math.round(tab.getBoundingClientRect().width)),
      tabRight: Math.round(Math.max(...tabs.map((tab) => tab.getBoundingClientRect().right))),
      scrollRight: Math.round(box.right),
      count: tabs.length,
    };
  })()`);
  assert.ok(packed.count >= 2, JSON.stringify(packed));
  const spread = Math.max(...packed.widths) - Math.min(...packed.widths);
  assert.ok(spread <= 2, "overflowing tabs share width equally: " + JSON.stringify(packed));
  assert.ok(packed.widths.every((width) => width < 172), JSON.stringify(packed));
  assert.ok(packed.tabRight <= packed.scrollRight + 1, "shared tabs stay inside the strip: " + JSON.stringify(packed));
});
