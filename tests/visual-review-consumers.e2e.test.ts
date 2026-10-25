import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages/testing";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience, consumers the review of 2026-10-20 found unconnected: a Home plugin's own page carries the
// overflow fade's sensor (VUX-27); a strip a page draws after load is found without a click; the workspace and terminal tab
// strips are marked; and Pages' code block copy answers through the one copy feedback (VUX-19).

test("VUX-27: a Home plugin's page fades its strip, and a strip drawn after load is found on its own", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor } = await pluginFrameBrowser(t,browser,"todo");
  const { command, sessionId, navigate, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/todo` }, sessionId));
  await waitFor("document.querySelector('.todo-views[data-overflow-fade]')", 20_000);
  // The opaque document exists before its bridge reveals the plugin; a hidden strip has two zero widths.
  await waitFor("document.querySelector('.todo-views').clientWidth > 0", 20_000);
  await evaluate("document.fonts.ready.then(() => undefined)");
  const strip = await evaluate<{ more: number; fade: string | null }>("(() => { const node = document.querySelector('.todo-views'); return { more: node.scrollWidth - node.clientWidth, fade: node.dataset.more ?? null }; })()");
  assert.ok(strip.more > 1, `the views do not fit at 360 px (${strip.more} px more)`);
  await waitFor("document.querySelector('.todo-views').dataset.more === 'end'", 5_000);

  // A strip put in later, with no click or focus after it: found when it arrives, faded only while it does not fit.
  await evaluate(`(() => { const row = document.createElement('div'); row.id = 'late'; row.setAttribute('data-overflow-fade', ''); row.style.cssText = 'display:flex;overflow:hidden;white-space:nowrap;width:120px';
    row.textContent = '起草 → 审阅 → 汇总 → 发布 → 归档'; document.body.append(row); })()`);
  await waitFor("document.querySelector('#late').dataset.more === 'end'", 5_000);
  await evaluate("document.querySelector('#late').style.width = '600px'");
  await waitFor("document.querySelector('#late').dataset.more === undefined", 5_000);
});

test("VUX-27: the workspace's container tabs and the terminal's tab list are marked for the fade", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-container-tabs]')", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-container-tabs]').hasAttribute('data-overflow-fade')"), true);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=work` }, sessionId));
  await waitFor("document.querySelector('[data-tui-tabs]')", 20_000);
  assert.equal(await evaluate("document.querySelector('[data-tui-tabs]').hasAttribute('data-overflow-fade')"), true);
});

test("VUX-19: Pages' code block copy says done only when the clipboard took it, and says so when it did not", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t,browser,"pages");
  const { evaluate, waitFor } = child;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const pages = openPagesStore(homeDirectory);
  const code = "const answer = 42;\nconsole.log(answer);";
  const page = pages.create({ project_id: projectId!, title: "代码复制", body: { type: "doc", content: [{ type: "code_block", attrs: { language: "typescript" }, content: [{ type: "text", text: code }] }] } });
  pages.close();
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages&openItem=${page.id}` }, sessionId));
  await waitFor("document.querySelector('.pages-code-copy')", 20_000);
  await command("Browser.grantPermissions", { origin, permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"] });
  const press = () => child.click(".pages-code-copy");
  await press();
  await waitFor("document.querySelector('.pages-code-copy').dataset.copy === 'done'", 5_000);
  assert.equal(await browser.evaluate("navigator.clipboard.readText()"), code);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.pages-code-copy')).opacity"), "1", "the answer stays visible while it holds");
  // A refused write is said on the button, not swallowed.
  await waitFor("document.querySelector('.pages-code-copy').dataset.copy === undefined", 6_000);
  await browser.evaluate("navigator.clipboard.writeText = () => Promise.reject(new Error('denied'))");
  await press();
  await waitFor("document.querySelector('.pages-code-copy').dataset.copy === 'failed'", 5_000);
});
