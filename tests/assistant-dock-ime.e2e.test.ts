import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// AC27: typing Chinese through an input method, the Enter that commits a candidate is the IME's, never a Send.
test("底栏：输入法组合中按回车只确认候选、不发送；组合结束后回车才发送", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]')");
  const works = async () => (await evaluate<number>(`fetch(${JSON.stringify(`/projects/${projectId}/api/assistant/works`)}).then(r => r.json()).then(b => b.works.length)`));
  const before = await works();
  await evaluate("(() => { const input = document.querySelector('[data-assistant-input]'); window.__keys = []; input.addEventListener('keydown', e => window.__keys.push([e.key, e.keyCode, e.isComposing]), true); input.focus(); })()");
  // Pinyin still being composed; the IME's own Enter (key code 229) arrives while the composition is open.
  await command("Input.imeSetComposition", { text: "ceshi", selectionStart: 5, selectionEnd: 5 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 }, sessionId);
  await command("Input.insertText", { text: "测试" }, sessionId);
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), "测试", "the candidate is committed into the input");
  assert.equal(await works(), before, "nothing was sent while composing");
  // The page did receive that Enter: the guard, not a lost key, is what kept it from sending.
  assert.ok((await evaluate<Array<[string, number, boolean]>>("window.__keys")).some(([key, code, composing]) => key === "Enter" && (code === 229 || composing)), "the IME's Enter reached the input");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), true, "no work opened");
  // With the composition over, Enter sends what was typed.
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 }, sessionId);
  await waitFor(`!document.querySelector('[data-assistant-panel]').hidden`);
  assert.equal(await works(), before + 1, "one Enter after the composition sends once");
});
