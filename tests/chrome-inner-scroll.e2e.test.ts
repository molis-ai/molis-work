import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const scrollProbe = (chromeSelector: string, scrollerSelector: string) => `(() => {
  const chrome = document.querySelector(${JSON.stringify(chromeSelector)});
  const scroller = document.querySelector(${JSON.stringify(scrollerSelector)});
  if (!chrome || !scroller) throw new Error("missing " + ${JSON.stringify(chromeSelector)} + " or " + ${JSON.stringify(scrollerSelector)});
  document.querySelector("[data-scroll-pad]")?.remove();
  const pad = document.createElement("div");
  pad.dataset.scrollPad = "1";
  pad.style.cssText = "height:2400px;flex:none;width:100%;pointer-events:none;";
  scroller.append(pad);
  if (scroller.scrollHeight <= scroller.clientHeight) scroller.style.maxHeight = "360px";
  const before = chrome.getBoundingClientRect();
  scroller.scrollTop = 900;
  const after = chrome.getBoundingClientRect();
  return {
    chromeTopBefore: Math.round(before.top),
    chromeTopAfter: Math.round(after.top),
    chromeHeight: Math.round(before.height),
    htmlScroll: document.documentElement.scrollTop,
    bodyScroll: document.body.scrollTop,
    bodyOverflow: getComputedStyle(document.body).overflowY,
    scrollerOverflow: getComputedStyle(scroller).overflowY,
    scrollerTop: scroller.scrollTop,
  };
})()`;

test("Window chrome stays put while project index, settings, Feed, Sessions and Goals scroll inside their containers", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  for (const plugin_id of ["feed", "sessions", "artifacts"] as const) catalog.addProjectPlugin({ project_id: projectId!, plugin_id, actor_id: "scroll-test" });
  catalog.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const expectContained = async (chrome: string, scroller: string) => {
    const result = await evaluate<{
      chromeTopBefore: number; chromeTopAfter: number; chromeHeight: number; htmlScroll: number; bodyScroll: number;
      bodyOverflow: string; scrollerOverflow: string; scrollerTop: number;
    }>(scrollProbe(chrome, scroller));
    assert.equal(result.htmlScroll, 0, JSON.stringify({ chrome, scroller, ...result }));
    assert.equal(result.bodyScroll, 0, JSON.stringify({ chrome, scroller, ...result }));
    assert.equal(result.chromeTopAfter, result.chromeTopBefore, JSON.stringify({ chrome, scroller, ...result }));
    assert.ok(result.chromeHeight > 8, JSON.stringify({ chrome, scroller, ...result }));
    assert.equal(result.bodyOverflow, "hidden", JSON.stringify({ chrome, scroller, ...result }));
    assert.match(result.scrollerOverflow, /auto|scroll|overlay/, JSON.stringify({ chrome, scroller, ...result }));
    assert.ok(result.scrollerTop > 200, JSON.stringify({ chrome, scroller, ...result }));
    await evaluate(`(() => {
      const pad = document.querySelector("[data-scroll-pad]");
      const scroller = pad?.parentElement;
      pad?.remove();
      if (scroller instanceof HTMLElement) scroller.style.maxHeight = "";
    })()`);
  };

  await navigate(() => command("Page.navigate", { url: origin + "/?desktop=1" }, sessionId));
  await waitFor("document.body.classList.contains('project-index-page')");
  await expectContained(".project-directory-topbar", ".project-index-body");
  await expectContained(".project-index-heading", ".project-index-body");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await expectContained(".project-directory-topbar", ".project-index-body");
  await expectContained(".project-index-heading", ".project-index-body");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  await navigate(() => command("Page.navigate", { url: origin + "/settings/appearance?desktop=1" }, sessionId));
  await waitFor("document.body.classList.contains('settings-page')");
  await expectContained(".project-preferences-chrome", ".settings-content");

  await navigate(() => command("Page.navigate", { url: origin + "/settings/projects?desktop=1" }, sessionId));
  await waitFor("document.body.classList.contains('settings-page')");
  await expectContained(".project-preferences-chrome", ".project-manager-list");
  await expectContained(".project-manager-index-chrome", ".project-manager-list");

  await navigate(() => command("Page.navigate", { url: origin + "/projects/" + projectId + "/?desktop=1" }, sessionId));
  await waitFor("document.body.classList.contains('immersive-workbench') && document.body.dataset.desktopSurface === 'home'");
  const trafficLightClearance = await evaluate<{
    titlebarLeft: number; backLeft: number; hit: string | null; webTitlebarLeft: number;
  }>(`(() => {
    const titlebar = document.querySelector(".immersive-titlebar");
    const back = document.querySelector("[data-workspace-history=back]");
    if (!titlebar || !back) return { titlebarLeft: -1, backLeft: -1, hit: null, webTitlebarLeft: -1 };
    const native = titlebar.getBoundingClientRect();
    const backBox = back.getBoundingClientRect();
    const hit = document.elementFromPoint(22, 16);
    const covered = hit?.closest(".workspace-history-button, .immersive-titlebar");
    document.body.removeAttribute("data-native-desktop");
    const webLeft = titlebar.getBoundingClientRect().left;
    document.body.dataset.nativeDesktop = "true";
    return {
      titlebarLeft: Math.round(native.left),
      backLeft: Math.round(backBox.left),
      hit: covered ? covered.className : null,
      webTitlebarLeft: Math.round(webLeft),
    };
  })()`);
  assert.ok(trafficLightClearance.titlebarLeft >= 87, JSON.stringify(trafficLightClearance));
  assert.ok(trafficLightClearance.backLeft >= trafficLightClearance.titlebarLeft, JSON.stringify(trafficLightClearance));
  assert.equal(trafficLightClearance.hit, null, JSON.stringify(trafficLightClearance));
  assert.ok(trafficLightClearance.webTitlebarLeft <= 2, JSON.stringify(trafficLightClearance));
  assert.equal(await evaluate("document.querySelector('[data-directory-list-title]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=goals]')"), null);
  await expectContained(".immersive-titlebar", "[data-work-surface=home] .home-tl");
  await expectContained("[data-workspace-chrome]", "[data-work-surface=home] .home-tl");
  await expectContained(".plugin-rail", "[data-work-surface=home] .home-tl");

  await click('[data-plugin-strip] [data-plugin-id="feed"]');
  await waitFor("document.body.dataset.desktopSurface === 'feed' && document.querySelector('[data-feed-stage-directory]') && document.querySelector('[data-work-surface=feed]:not([hidden])') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await click('[data-project-menu] > summary');
  const projectMenuHit = await evaluate<{ onTop: boolean; islandZ: string; inViewport: boolean }>(`(() => {
    const menu = document.querySelector("[data-project-menu]");
    const add = document.querySelector("[data-feed-add-toggle]");
    const island = document.querySelector("[data-project-island]");
    if (!menu || !add || !island) return { onTop: false, islandZ: "", inViewport: false };
    const box = menu.querySelector('.navigator-project-menu-popover').getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    const onTop = Boolean(hit?.closest(".navigator-project-menu-popover"));
    const islandZ = getComputedStyle(island).zIndex;
    return { onTop, islandZ, inViewport: box.top >= 0 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight };
  })()`);
  assert.equal(projectMenuHit.islandZ, "50");
  assert.ok(projectMenuHit.onTop && projectMenuHit.inViewport, 'Open project menu is reachable above the work surface: ' + JSON.stringify(projectMenuHit));
  await click('[data-project-menu] > summary');
  assert.ok(await evaluate(`(() => { const add = document.querySelector('[data-feed-add-toggle]'); const box = add.getBoundingClientRect(); return add.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)); })()`), 'Closing the project menu restores the Feed add-task hit target');
  await expectContained(".immersive-titlebar", ".feed-stage-tree");
  await expectContained("[data-workspace-chrome]", ".feed-stage-tree");
  await expectContained(".plugin-rail", ".feed-stage-tree");

  await click('[data-plugin-strip] [data-plugin-id="sessions"]');
  await waitFor("document.body.dataset.desktopSurface === 'sessions' && document.querySelector('[data-session-stage-list]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await expectContained(".immersive-titlebar", "[data-session-stage-list]");
  await expectContained("[data-workspace-chrome]", "[data-session-stage-list]");
  await expectContained(".plugin-rail", "[data-session-stage-list]");

  await click('[data-plugin-strip] [data-plugin-id="artifacts"]');
  await waitFor("document.body.dataset.desktopSurface === 'artifacts' && document.querySelector('[data-artifact-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await expectContained(".immersive-titlebar", "[data-artifact-directory]");
  await expectContained("[data-workspace-chrome]", "[data-artifact-directory]");
  await expectContained(".plugin-rail", "[data-artifact-directory]");

  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await expectContained(".immersive-titlebar", "[data-shelf=directory] .shelf-side-scroll");
  await expectContained("[data-workspace-chrome]", "[data-shelf=directory] .shelf-side-scroll");
  await expectContained(".plugin-rail", "[data-shelf=directory] .shelf-side-scroll");

  await click('[data-plugin-strip] [data-plugin-id="goals"]');
  await waitFor("document.body.dataset.desktopSurface === 'goal' && document.querySelector('[data-goal-stage-list]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')");
  await expectContained(".immersive-titlebar", "[data-goal-stage-list]");
  await expectContained("[data-workspace-chrome]", "[data-goal-stage-list]");
  await expectContained(".plugin-rail", "[data-goal-stage-list]");

  await click('[data-work-surface-open="market"]');
  await waitFor("document.querySelector('[data-work-surface=market]:not([hidden])')");
  await expectContained(".immersive-titlebar", ".plugin-market-body");
});
