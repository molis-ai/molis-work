import assert from "node:assert/strict";
import test from "node:test";
import { readWork, waitWork } from "./fixtures/assistant-send-journey.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

// specs/unified-input-voice K3 (UIV-12, UIV-17, UIC-06, UIC-09, RC-03): the bottom bar's Assistant is the platform's unified
// composer. Its receiver row says who the next Send goes to (「发给：…」); Enter is a new line and ⌘↵ (Ctrl+↵) sends, with a
// one-time tip the first time Enter could have been meant as Send; a work's draft is the Assistant's own (the Host keeps it, the
// browser keeps no copy); while a turn runs the Send is 补充, interrupting takes two steps (▾, then 打断并改向) and the next Send
// is 补充 again; ⌘⇧↵ is 下一轮再做, and with nothing running it simply sends. Each Send's body is read as the page made it.
test("UIV-12 UIV-17 UIC-06 UIC-09 RC-03: the Assistant's composer names its receiver, sends on ⌘↵, keeps the work's draft on the Host and offers the three deliveries while a turn runs", { timeout: 150_000 }, async (t) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, {
    prepareHome: async (homeDirectory) => { await issueModel(t, homeDirectory, { replyText: "收到。", held }); },
  }); if (!browser) return;
  t.after(() => release());
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(projectId)}`);
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input')", 20_000);
  await evaluate(`(() => { const real = window.fetch.bind(window); window.__sent = [];
    window.fetch = (input, init) => { const url = String(input && input.url || input);
      if (/\\/api\\/assistant\\/send$/.test(url) && init && init.body) window.__sent.push(JSON.parse(String(init.body)));
      return real(input, init); }; })()`);
  const field = "document.querySelector('[data-assistant-composer] .mw-composer__input')";
  const to = () => evaluate<string>("document.querySelector('[data-assistant-composer] .mw-composer__to')?.textContent ?? ''");
  const sent = () => evaluate<Array<{ text: string; delivery?: string; work_id?: string }>>("window.__sent");
  const key = async (modifiers: number, text?: string) => {
    await command("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers, ...(text ? { text } : {}) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, modifiers }, sessionId);
  };
  const CTRL = 2, SHIFT = 8;
  const type = (text: string) => command("Input.insertText", { text }, sessionId);
  const settled = `!document.querySelector('[data-assistant-composer] .mw-composer')?.matches('[data-state=sending]')`;

  // A new work: the receiver row names the Assistant.
  assert.match(await to(), /^发给：\s*助理/, "UIV-12: the receiver row says who the next Send goes to");

  // UIC-06: Enter is a new line, nothing is sent, and the first time it says once how to send.
  await evaluate(`${field}.focus()`);
  await type("第一行");
  await key(0, "\r");
  await type("第二行");
  assert.equal(await evaluate(`${field}.value`), "第一行\n第二行", "Enter adds a new line");
  assert.deepEqual(await sent(), [], "Enter sends nothing");
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-composer]').textContent"), /⌘↵|Ctrl\+↵/, "UIC-06: the one-time tip names the keys that send");

  // ⌘↵ sends; the new work becomes the receiver, with a mark to start a new work instead.
  await key(CTRL);
  await waitFor("window.__sent.length === 1", 10_000);
  assert.equal((await sent())[0].text, "第一行\n第二行");
  assert.equal((await sent())[0].delivery, undefined, "nothing runs yet: the first Send carries no delivery");
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] .mw-composer__to [data-tag-remove]'))", 15_000);
  const works = await evaluate<Array<{ work_id: string }>>("fetch('/api/assistant/works').then((r) => r.json()).then((b) => b.works)");
  const id = works[0]!.work_id;
  await waitWork(browser, id, (view) => view.rounds.at(-1)?.phase === "running");
  assert.match(await to(), /^发给：/, "the receiver is now the work");
  assert.equal(await evaluate(`${field}.value`), "", "the sent words left the box");

  // UIV-17: a work's draft is the Host's, through the Assistant's own adapter; the browser keeps no copy of it.
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] [data-compose-menu-toggle]'))", 15_000);
  await evaluate(`${field}.focus()`);
  await type("先把标题改短");
  await waitWork(browser, id, (view) => view.work.draft === "先把标题改短");
  assert.equal(await evaluate<boolean>("Object.keys(localStorage).some((k) => String(localStorage.getItem(k)).includes('先把标题改短'))"), false, "no copy of the work's draft in the browser");

  // While the turn runs the Send is 补充, with ▾ for the other two and Stop beside them.
  const running = await evaluate<{ send: string; stop: boolean }>(`(() => { const c = document.querySelector('[data-assistant-composer]');
    return { send: c.querySelector('[data-composer-send]').textContent.trim(), stop: Boolean(c.querySelector('[data-composer-stop]')) }; })()`);
  assert.deepEqual(running, { send: "补充", stop: true }, "RC-03: the running Send is 补充, and Stop is there");

  // UIC-09: interrupting is two steps. ▾ only opens the menu (nothing is sent); choosing 打断并改向 sends.
  await evaluate("document.querySelector('[data-assistant-composer] [data-compose-menu-toggle]').click()");
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] [data-composer-delivery=interrupt]'))");
  const menu = await evaluate<Array<{ mode: string; label: string; disabled: boolean }>>(`[...document.querySelectorAll('[data-assistant-composer] [data-composer-delivery]')]
    .map((b) => ({ mode: b.dataset.composerDelivery, label: b.querySelector('[id$="-label"]').textContent, disabled: b.disabled }))`);
  assert.deepEqual(menu, [{ mode: "next-boundary", label: "补充", disabled: false }, { mode: "interrupt", label: "打断并改向", disabled: false }, { mode: "after-run", label: "下一轮再做", disabled: false }]);
  assert.equal((await sent()).length, 1, "opening ▾ sends nothing");
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-delivery=interrupt]').click()");
  await waitFor("window.__sent.length === 2", 10_000);
  assert.deepEqual([(await sent())[1].text, (await sent())[1].delivery], ["先把标题改短", "interrupt"]);
  await waitFor(settled, 15_000);
  await waitWork(browser, id, (view) => view.rounds.at(-1)?.phase === "running");
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] [data-compose-menu-toggle]'))", 15_000);

  // The next Send is 补充 again: the interrupt was for that one Send.
  assert.equal(await evaluate<string>("document.querySelector('[data-assistant-composer] [data-composer-send]').textContent.trim()"), "补充", "UIC-09: after it fires the Send returns to 补充");
  await evaluate(`${field}.focus()`);
  await type("再看一下错别字");
  await key(CTRL);
  await waitFor("window.__sent.length === 3", 10_000);
  // 补充 is the Host's way when the body names none (AssistantSendInput.delivery: absent is next-boundary), so the page sends none.
  assert.deepEqual([(await sent())[2].text, (await sent())[2].delivery], ["再看一下错别字", undefined], "⌘↵ while a turn runs is 补充");
  await waitFor(settled, 15_000);

  // ⌘⇧↵ is 下一轮再做.
  await waitFor("Boolean(document.querySelector('[data-assistant-composer] [data-compose-menu-toggle]'))", 15_000);
  await evaluate(`${field}.focus()`);
  await type("做完后再整理目录");
  await key(CTRL | SHIFT);
  await waitFor("window.__sent.length === 4", 10_000);
  assert.equal((await sent())[3].delivery, "after-run", "⌘⇧↵ while a turn runs is 下一轮再做");
  await waitFor(settled, 15_000);

  // Stopped, nothing runs: ⌘⇧↵ sends as ⌘↵ does, with no delivery.
  await evaluate("document.querySelector('[data-assistant-composer] [data-composer-stop]').click()");
  release();
  await waitWork(browser, id, (view) => !["running", "queued"].includes(view.work.state) && view.rounds.at(-1)?.phase !== "running");
  await waitFor("!document.querySelector('[data-assistant-composer] [data-compose-menu-toggle]')", 15_000);
  await evaluate(`${field}.focus()`);
  await type("空闲时也能发");
  await key(CTRL | SHIFT);
  await waitFor("window.__sent.length === 5", 10_000);
  assert.equal((await sent())[4].delivery, undefined, "with nothing running ⌘⇧↵ simply sends");
  assert.equal((await readWork(browser, id)).work.work_id, id);
});

// specs/unified-input-voice §3.3 (K3): `/` lists this page's commands and the Assistant's methods and capabilities; the words typed
// after it narrow the list in the composer itself (a command's name, words or hint holding them), in one scrolling list; words that
// name none say so; taking them back lists all again; and a chosen command takes the `/words` out of the text.
test("UIV-12: the words after `/` narrow the Assistant's commands, methods and capabilities in the composer's own menu", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer] .mw-composer__input')", 20_000);
  const field = "document.querySelector('[data-assistant-composer] .mw-composer__input')";
  const ITEMS = "[data-assistant-composer] [data-composer-command]";
  const listed = () => evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(ITEMS)})].map((item) => item.textContent.replace(/\\s+/g, ' ').trim())`);
  const holding = (list: string[], words: string) => list.filter((one) => one.toLocaleLowerCase().includes(words.toLocaleLowerCase()));
  const backspace = async () => {
    await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  };
  await evaluate(`${field}.focus()`);
  await command("Input.insertText", { text: "/" }, sessionId);
  await waitFor(`document.querySelectorAll(${JSON.stringify(ITEMS)}).length > 1`, 15_000);
  const all = await listed();
  // A word from the last one's own name: it names that one, and only those that hold it too.
  const word = all.at(-1)!.replace(/^\/\S+\s+/u, "").slice(0, 2);
  await command("Input.insertText", { text: word }, sessionId);
  await waitFor(`document.querySelectorAll(${JSON.stringify(ITEMS)}).length === ${holding(all, word).length}`);
  const narrowed = await listed();
  assert.deepEqual(narrowed, holding(all, word), "only the commands the words name, in the page's order");
  assert.ok(narrowed.length >= 1 && narrowed.length < all.length, "the list is narrower, and holds the one named");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-assistant-composer] [data-composer-files]'))"), false, "while narrowing, the menu is the commands alone");
  // Words that name none say so.
  await command("Input.insertText", { text: "zzqx" }, sessionId);
  await waitFor("document.querySelector('[data-assistant-composer] .mw-compose__menu:not([hidden]) .mw-composer__line')?.textContent === '没有找到'");
  // Taking the words back lists all again.
  for (let i = 0; i < word.length + 4; i += 1) await backspace();
  await waitFor(`document.querySelectorAll(${JSON.stringify(ITEMS)}).length === ${all.length}`);
  assert.deepEqual(await listed(), all);
  // A chosen command takes the `/words` out of the text.
  await command("Input.insertText", { text: word }, sessionId);
  await waitFor(`document.querySelectorAll(${JSON.stringify(ITEMS)}).length === ${narrowed.length}`);
  await evaluate(`[...document.querySelectorAll(${JSON.stringify(ITEMS)})].at(-1).click()`);
  assert.ok(!(await evaluate<string>(`${field}.value`)).includes("/" + word), "the `/words` left the text (a starting point may put its own words in)");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer] .mw-compose__menu:not([hidden])')"), null, "the menu closed");
});
