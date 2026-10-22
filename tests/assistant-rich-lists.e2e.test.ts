import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/visual-ui-experience VUX-01 / VUX-14 (slice 89, found in a real MiniMax run): an answer's lists keep their markers
// wherever the assistant is open. The project chooser resets every list on its own page, and an answer read there had lost
// its bullets and numbers; the answer's Markdown now owns its markers.
test("VUX-14: an answer's bullet and numbered lists keep their markers on the project chooser and in the project", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { homeDirectory, projectId, origin, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  await issueModel(t, homeDirectory, { replyText: "两件事：\n\n- 先读第一部分\n- 再定时间\n\n步骤：\n\n1. 开场\n2. 讨论" });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await click("[data-assistant-input]");
  await command("Input.insertText", { text: "列两件事和两个步骤" }, sessionId);
  await click("[data-assistant-send]");
  await waitFor("document.querySelector('[data-assistant-thread] .assistant-rich ol li')", 20_000);
  const markers = () => evaluate<string[]>(`[...document.querySelectorAll('[data-assistant-thread] .assistant-rich :is(ul, ol) > li')].map((li) => getComputedStyle(li).listStyleType)`);
  assert.deepEqual(await markers(), ["disc", "disc", "decimal", "decimal"], "on the chooser, whose page resets its own lists");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click("[data-assistant-input]");
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("document.querySelector('[data-assistant-thread] .assistant-rich ol li')", 20_000);
  assert.deepEqual(await markers(), ["disc", "disc", "decimal", "decimal"], "in the project");
});
