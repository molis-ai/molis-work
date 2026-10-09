import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// The relation editor says that relation changes proposed by tools wait in the Inbox, and links to it. The Goal-era `/decisions`
// page that link used to open (the Inbox as a page of its own) is gone (specs/repository-anti-corruption, W2-02): the link opens
// the Inbox plugin the way the plugin switcher does, and where the plugin is not available it falls back to the project's front page.
test("the Inbox link in the relation editor opens the Inbox plugin, not a page of its own", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t);
  if (!browser) return;
  const { origin, sessionId, command, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.navigate", { url: origin + "/goals/CORE" }, sessionId);
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.querySelector('[data-goal-view]')", 15_000);
  const link = ".relation-authority a[data-work-surface-link=\"inbox\"]";
  // The link is in the served markup before the page's client binds its click handler; a click before that is an ordinary
  // navigation to the front page. A person clicks a loaded page, so wait for it to be loaded and its surfaces settled.
  await waitFor(`document.readyState === "complete" && !document.querySelector('[data-ui-client-state="loading"]') && Boolean(document.querySelector(${JSON.stringify(link)}))`, 15_000);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(link)}).getAttribute("href")`), "/", "without the Inbox plugin the link falls back to the project's front page");
  // The click may leave the Goal's own page for the project's front page, so the page can be reloaded under the wait.
  await evaluate(`setTimeout(() => document.querySelector(${JSON.stringify(link)}).click(), 0), true`);
  const deadline = Date.now() + 20_000;
  let state = { path: "", surface: "" };
  while (Date.now() < deadline) {
    state = await evaluate<typeof state>("({ path: location.pathname, surface: document.body ? document.body.dataset.desktopSurface || '' : '' })").catch(() => state);
    if (state.surface === "inbox") break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(state.surface, "inbox");
  assert.doesNotMatch(state.path, /decisions/);
  assert.equal((await fetch(origin + "/decisions")).status, 404, "the Goal-era /decisions page is gone");
});
