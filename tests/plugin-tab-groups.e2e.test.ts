import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

/** WCAG contrast of every tab title in a group against the tint it sits on, composited over the desk. */
const GROUP_CONTRAST = `(() => {
  const rgb = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (t, b) => [0, 1, 2].map((i) => t[i] * t[3] + b[i] * (1 - t[3])).concat(1);
  const lum = (c) => c.slice(0, 3).map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  const desk = rgb(getComputedStyle(document.body).backgroundColor);
  return [...document.querySelectorAll("[data-titlebar-tabs] .tab-group .tab-item")].map((tab) => {
    let bg = over(rgb(getComputedStyle(tab.closest(".tab-group")).backgroundColor), desk);
    const own = rgb(getComputedStyle(tab).backgroundColor);
    if (own[3]) bg = over(own, bg);
    const a = lum(rgb(getComputedStyle(tab.querySelector(".tab-item-name")).color)), b = lum(bg);
    return { tab: tab.dataset.plugin + "/" + tab.dataset.tabKind, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
  });
})()`;

test("PTG-01 PTG-06 PTG-07 PTG-09 plugins stay on the strip as coloured groups; ⌘-click opens a record in its group", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "feed", actor_id: "plugin-tab-groups" });
  catalog.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/" }, sessionId));
  await waitFor("document.querySelector('.tab-item[data-tab-kind=home][aria-current]')");
  const plugin = (id: string) => `[data-titlebar-tabs] .tab-item[data-tab-kind=plugin][data-plugin=${id}]`;

  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor(`document.querySelector('${plugin("goals")}[aria-current]')`);
  await click("[data-titlebar-tabs] [data-tab-add]");
  await click("[data-tab-menu-action=open-feed]");
  await waitFor(`document.querySelector('${plugin("feed")}[aria-current]') && document.querySelector('${plugin("goals")}:not([aria-current])')`);
  // PTG-07 the plugin tab is the place; no location chip ahead of the tabs.
  assert.equal(await evaluate("document.querySelector('.tab-view-chip:not(.is-exclusive)')"), null);
  await click(`${plugin("goals")} .tab-item-trigger`);
  await waitFor(`document.body.dataset.desktopSurface === 'goal' && document.querySelector('${plugin("goals")}[aria-current]')`);

  // PTG-06 a ⌘-click on a Goal in the list opens it in the Goals group and the pane stays on the list.
  await evaluate("document.querySelector('[data-board-view-tab=list]')?.click()");
  await waitFor("document.querySelector('.tree-node[data-select-goal=\"CORE\"]')?.getClientRects().length > 0");
  const point = await evaluate<{ x: number; y: number }>("(() => { const r = document.querySelector('.tree-node[data-select-goal=\"CORE\"]').getBoundingClientRect(); return { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2 }; })()");
  for (const type of ["mousePressed", "mouseReleased"] as const) {
    await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1, modifiers: 4 }, sessionId);
  }
  await waitFor("document.querySelector('[data-plugin-group=goals] .tab-item[data-tab-kind=item][data-item-id=CORE]')");
  assert.equal(await evaluate(`document.querySelector('${plugin("goals")}')?.getAttribute('aria-current')`), "page");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-plugin-group=goals] .tab-item')].map((tab) => tab.dataset.tabKind).join()"), "plugin,item");

  // PTG-09 a plugin's group takes the plugin's hue, and every title in it reads at 4.5:1 or better in both themes.
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=goals]').style.getPropertyValue('--group-color')"), "var(--hue-blue)");
  assert.equal(await evaluate("document.querySelector('[data-plugin-group=feed]').style.getPropertyValue('--group-color')"), "var(--hue-brown)");
  for (const scheme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: scheme }] }, sessionId);
    await evaluate(`(() => { document.documentElement.dataset.theme = "${scheme}"; document.documentElement.dataset.resolvedTheme = "${scheme}"; })()`);
    await waitFor(`getComputedStyle(document.body).getPropertyValue('--hue-blue').trim() === ${JSON.stringify(scheme === "light" ? "#3c6fc6" : "#8fb2f5")}`);
    const low = (await evaluate<Array<{ tab: string; ratio: number }>>(GROUP_CONTRAST)).filter((entry) => entry.ratio < 4.5);
    assert.deepEqual(low, [], `${scheme}: every title in a group reads at 4.5:1`);
  }
});
