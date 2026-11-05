import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";

// BL-953 (specs/visual-ui-experience VUX-16～18, specs/unified-input-voice UIV-02): the home bar and the Assistant are one
// composer (`[data-assistant-input]`). It was a single-line `<input type="text">`, which the engine strips line breaks from
// on paste, so a pasted multi-line Chinese text ran together on one line. It is a growing `<textarea>` now: the breaks
// stay in the field, the field grows to hold them, and what is sent still has them. (Coding's task field is already a
// textarea; the rule is checked here for the one shared composer.)
const PASTED = "第一行：先看日志\n第二行：再改配置\n\n第四行：最后跑检查";

test("BL-953 底栏/助理输入框：粘贴多行中文后换行还在，输入框长高，发送出去的内容保留换行", { timeout: 90_000 }, async t => {
  // A configured model, so the round starts and the thread shows the person's own message.
  const browser = await openGoalBrowser(t, true, undefined, undefined, undefined, undefined, {
    prepareHome: async homeDirectory => { await assistantTextModel(t, homeDirectory, "收到了。"); },
  });
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-dock] [data-assistant-input]')");

  // One shared field, and one that can hold a line break.
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').tagName"), "TEXTAREA", "the composer holds more than one line");
  const single = await evaluate<number>("document.querySelector('[data-assistant-input]').getBoundingClientRect().height");

  // The send request the page makes, kept as the page made it.
  await evaluate(`(() => { window.__sent = []; const real = window.fetch.bind(window);
    window.fetch = (input, init) => { const url = String(input?.url || input); if (/\\/api\\/assistant\\/send/.test(url) && init?.body) window.__sent.push(String(init.body)); return real(input, init); }; })()`);

  await evaluate("document.querySelector('[data-assistant-input]').focus()");
  // The engine's own text insertion, the path a paste takes: line breaks are the engine's to keep or strip.
  await command("Input.insertText", { text: PASTED }, sessionId);
  await waitFor("!document.querySelector('[data-assistant-send]').disabled");
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"), PASTED, "the pasted lines are still lines");
  const grown = await evaluate<number>("document.querySelector('[data-assistant-input]').getBoundingClientRect().height");
  assert.ok(grown > single + 10, `the field grew past one line (${single} → ${grown})`);
  const bar = await evaluate<number>("document.querySelector('[data-assistant-composer]').getBoundingClientRect().height");
  assert.ok(grown <= bar, `…and stays inside the bar's line, which keeps its height (${grown} in ${bar})`);
  assert.equal(await evaluate("(() => { const f = document.querySelector('[data-assistant-input]'); return f.scrollHeight > f.clientHeight; })()"), true, "the lines past the ceiling scroll inside the field");

  // Enter sends (Shift+Enter is the line break); the sent text keeps the breaks.
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  await waitFor("window.__sent.length >= 1");
  const body = JSON.parse(await evaluate<string>("window.__sent[0]")) as { text: string };
  assert.equal(body.text, PASTED, "the sent text carries every line break");
  await waitFor("[...document.querySelectorAll('.assistant-msg--user')].some((node) => node.textContent.includes('第四行：最后跑检查'))");
  assert.equal(await evaluate("[...document.querySelectorAll('.assistant-msg--user')].pop().textContent.trim()"), PASTED, "the thread shows the same lines");
  assert.equal(await evaluate("getComputedStyle([...document.querySelectorAll('.assistant-msg--user')].pop()).whiteSpace"), "pre-wrap");
});
