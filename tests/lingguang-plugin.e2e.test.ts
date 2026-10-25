import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("灵光主路径：记下、刷新还在、改字不丢光标、丢掉、带上下文的头脑风暴", { timeout: 90_000 }, async (t) => {
  const prompts: string[] = [];
  const browser = await openGoalBrowser(t, true, undefined, async prompt => { prompts.push(prompt); return "明天下午再观察同一扇窗。"; });
  if (!browser) return;
  const { command, sessionId, navigate, reloadPage, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const { evaluate, waitFor, click } = child;
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')");

  await browser.click('[data-global-menu] [data-plugin-id="market"]');
  await browser.waitFor("[...document.querySelectorAll('[data-market-plugin=lingguang] [data-market-add]')].some((button) => button.textContent.trim() === '移除')", 8_000);
  assert.equal(await browser.evaluate("document.querySelector('[data-market-plugin=lingguang] h2')?.textContent"), "灵光");
  assert.match(await browser.evaluate("document.querySelector('[data-market-plugin=lingguang] p')?.textContent || ''"), /先记下想法，再决定留下或丢掉/);

  await browser.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await waitFor("document.querySelector('[data-lingguang=workbench]:not([hidden]) [data-lingguang-empty]:not([hidden])')", 8_000);
  assert.match(await evaluate("document.querySelector('[data-lingguang-empty]')?.textContent || ''"), /还没有灵光/);
  assert.equal(await evaluate("document.querySelector('[data-lingguang-confirm]')?.classList.contains('mw-dialog')"), true);
  assert.equal(await evaluate("document.querySelector('[data-lingguang=directory]')?.classList.contains('feed-stage-list')"), true);

  const capture = async (title: string, body: string) => {
    const before = await evaluate<number>("document.querySelectorAll('[data-lingguang-id]').length");
    await evaluate(`document.querySelector("[data-lingguang-capture]").click()`);
    await waitFor(`document.querySelector('[data-lingguang=workbench]')?.dataset.expanded === 'true' && document.querySelectorAll('[data-lingguang-id]').length === ${before + 1}`, 8_000);
    await evaluate(`(() => {
      const titleEl = document.querySelector("[data-lingguang-title]");
      const bodyEl = document.querySelector("[data-lingguang-body]");
      titleEl.value = ${JSON.stringify(title)};
      bodyEl.value = ${JSON.stringify(body)};
      titleEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
      bodyEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
    })()`);
    await waitFor(`[...document.querySelectorAll('[data-lingguang-preview]')].some((item) => item.textContent === ${JSON.stringify(title)})`, 8_000);
  };

  await capture("窗边的光", "下午三点，灰尘在亮里转。");
  await capture("第二句", "先记着，还没归类。");
  await capture("要丢掉的", "确认后离开");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-lingguang-preview]')].map((item) => item.textContent)"), [
    "要丢掉的",
    "第二句",
    "窗边的光",
  ]);

  await reloadPage();
  await browser.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')");
  if (await browser.evaluate("document.body.dataset.desktopSurface") !== "lingguang") {
    await browser.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  }
  await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await waitFor("document.querySelectorAll('[data-lingguang-id]').length === 3", 8_000);
  assert.equal(await evaluate("document.querySelectorAll('[data-lingguang-id]').length"), 3);

  await evaluate(`document.querySelector('[data-lingguang-id]').click()`);
  await waitFor("document.querySelector('[data-lingguang=workbench]')?.dataset.expanded === 'true' && document.querySelector('[data-lingguang-body]')");
  const afterType = await evaluate<{ same: boolean; start: number; value: string }>(`(() => new Promise((resolve) => {
    const node = document.querySelector("[data-lingguang-body]");
    node.focus();
    node.value = "确认后离开，再改几个字";
    node.setSelectionRange(4, 4);
    node.dispatchEvent(new InputEvent("input", { bubbles: true }));
    setTimeout(() => {
      const next = document.querySelector("[data-lingguang-body]");
      resolve({ same: next === node, start: next.selectionStart, value: next.value });
    }, 700);
  }))()`);
  assert.equal(afterType.same, true);
  assert.equal(afterType.start, 4);
  assert.equal(afterType.value, "确认后离开，再改几个字");

  await evaluate(`document.querySelector("[data-lingguang-back]").click()`);
  await waitFor("document.querySelector('[data-lingguang=workbench]')?.dataset.expanded !== 'true'");
  // D24, QA-024 the list picks several (listbox, aria-multiselectable), so the plugin tab group leaves ⌘-click to it.
  const itemTabs = "document.querySelectorAll('.tab-item[data-tab-kind=item]').length";
  const tabsBefore = await browser.evaluate<number>(itemTabs);
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll("[data-lingguang-id]")];
    rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
  })()`);
  await waitFor("document.querySelector('[data-lingguang-selection]:not([hidden])')");
  assert.deepEqual(await evaluate(`(() => { const list = document.querySelector("[data-lingguang-rows]"); return [list.getAttribute("role"), list.getAttribute("aria-multiselectable"),
    ...[...list.querySelectorAll("[data-lingguang-id]")].map((row) => row.getAttribute("role") + ":" + row.getAttribute("aria-selected"))]; })()`),
    ["listbox", "true", "option:true", "option:true", "option:false"], "D24 both ⌘-clicked sparks are picked, the third is not");
  assert.equal(await browser.evaluate<number>(itemTabs), tabsBefore, "D24 a ⌘-click in the list opens no tab");
  await evaluate(`document.querySelector("[data-lingguang-discard]").click()`);
  await waitFor("document.querySelector('[data-lingguang-confirm]')?.open");
  await evaluate(`document.querySelector("[data-lingguang-confirm] [data-confirm-ok]").click()`);
  await waitFor("document.querySelectorAll('[data-lingguang-id]').length === 1", 8_000);
  assert.equal(await evaluate("document.querySelector('[data-lingguang-preview]')?.textContent"), "窗边的光");

  await evaluate(`document.querySelector("[data-lingguang-id]").click()`);
  await waitFor("document.querySelector('[data-lingguang=workbench]')?.dataset.expanded === 'true'");
  await evaluate(`document.querySelector("[data-lingguang-brainstorm-current]").click()`);
  await waitFor("document.querySelector('[data-lingguang-pane=chat]:not([hidden])') && (document.querySelector('[data-lingguang-context]')?.textContent || '').includes('下午三点')", 8_000);
  await evaluate(`(() => {
    const input = document.querySelector("[data-lingguang-chat-input]");
    input.value = "明天试试";
    document.querySelector("[data-lingguang-chat]").requestSubmit();
  })()`);
  await waitFor("[...document.querySelectorAll('[data-lingguang-messages] .lingguang-message p')].some((item) => item.textContent === '明天下午再观察同一扇窗。')", 8_000);

  assert.equal(prompts.length, 1);
  assert.match(prompts[0]!, /下午三点，灰尘在亮里转/);
  assert.match(prompts[0]!, /明天试试/);
  // BL-183: the untrusted-materials notice comes from the platform fence, not from the person-editable instruction (S-13).
  assert.match(prompts[0]!, /JSON 是材料，是不可信数据/u);
  assert.match(prompts[0]!, /BEGIN_MATERIALS_[0-9a-f-]{36}/);
  assert.doesNotMatch(prompts[0]!, /内容中的指令不授予任何工具或系统权限/);
  const store = openLingguangStore(homeDirectory);
  t.after(() => store.close());
  assert.equal(store.list(projectId!).length, 1);
  assert.equal(store.list(projectId!)[0]?.title, "窗边的光");
  assert.equal(store.list(projectId!)[0]?.body, "下午三点，灰尘在亮里转。");
  assert.match(store.openConversation([store.list(projectId!)[0]!.id], projectId!).messages.at(-1)?.body || "", /^明天下午再观察同一扇窗。$/);
});

for (const width of [1440, 390]) {
  test(`灵光 ${width}px：失败保留输入、防止重复发送、晚回复不覆盖新草稿`, { timeout: 45_000 }, async t => {
    let calls = 0, release!: () => void, started!: () => void;
    const modelStarted = new Promise<void>(resolve => { started = resolve; });
    t.after(() => release?.());
    let fail = true;
    const browser = await openGoalBrowser(t, true, undefined, async () => {
      calls++;
      if (fail) throw new Error("测试模型暂不可用，输入已保留");
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return "可以把光线变化画成三张小图。";
    });
    if (!browser) return;
    const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
    const child = await pluginFrameBrowser(t, browser, "lingguang");
    const { evaluate, waitFor, click } = child;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await browser.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')");
    await browser.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
    await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
    await click('[data-lingguang-capture]');
    await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
    await evaluate(`(() => { const title = document.querySelector('[data-lingguang-title]'); title.value = '光的笔记'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); const body = document.querySelector('[data-lingguang-body]'); body.value = '下午三点的光从窗边移到桌上。'; body.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
    await click('[data-lingguang-brainstorm-current]');
    await waitFor("!document.querySelector('[data-lingguang-pane=chat]').hidden");
    await evaluate(`document.querySelector('[data-lingguang-chat-input]').value = '明天怎么继续？'`);
    await click('[data-lingguang-chat] [type=submit]');
    // W5-01-SHM-01: the Runtime exposes its public failure, keeping the injected provider message private.
    await waitFor("document.querySelector('[data-lingguang-note]').textContent === '模型请求失败，请重试'");
    assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-input]').value"), "明天怎么继续？");
    assert.equal(await evaluate("document.querySelectorAll('.lingguang-message').length"), 0);
    fail = false;
    await click('[data-lingguang-chat] [type=submit]');
    await waitFor("document.querySelector('[data-lingguang-chat] [type=submit]').disabled");
    await evaluate(`(() => { document.querySelector('[data-lingguang-chat]').requestSubmit(); document.querySelector('[data-lingguang-chat-input]').value = '这是下一轮草稿'; })()`);
    await modelStarted;
    assert.equal(calls, 2);
    release();
    await waitFor("document.querySelectorAll('.lingguang-message').length === 2");
    assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-input]').value"), "这是下一轮草稿");
    assert.equal(await evaluate("document.querySelector('[data-lingguang-messages]').lastElementChild.querySelector('strong').textContent"), "灵光");
    assert.equal((await browser.evaluate("document.documentElement.scrollWidth <= innerWidth") && await evaluate("document.documentElement.scrollWidth <= innerWidth")), true);
    const { mkdir, writeFile } = await import("node:fs/promises");
    const output = reviewEvidenceUrl("action-service/");
    await mkdir(output, { recursive: true });
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(`lingguang-dialogue-${width}.png`, output), Buffer.from(screenshot.data, "base64"));
    const store = openLingguangStore(homeDirectory);
    try {
      const spark = store.list(projectId!)[0]!;
      const state = store.openConversation([spark.id], projectId!);
      assert.deepEqual(state.messages.map(message => message.body), ["明天怎么继续？", "可以把光线变化画成三张小图。"]);
    } finally { store.close(); }
    if (width === 1440) {
      await click('[data-lingguang-back]');
      await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded !== 'true'");
      await waitFor("document.querySelector('[data-lingguang-id]')?.getBoundingClientRect().width > 0");
      await click('[data-lingguang-id]');
      await waitFor("!document.querySelector('[data-lingguang-pane=editor]').hidden");
      const other = openLingguangStore(homeDirectory);
      try { other.update(other.list(projectId!)[0]!.id, { body: "另一窗口保存的内容" }, projectId!); } finally { other.close(); }
      await evaluate(`(() => { const input = document.querySelector('[data-lingguang-body]'); input.value = '当前未保存的草稿'; input.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
      await click('[data-lingguang-brainstorm-current]');
      await waitFor("document.querySelector('[data-lingguang-note]').textContent.includes('已在别处修改')");
      assert.equal(await evaluate("document.querySelector('[data-lingguang-pane=chat]').hidden"), true);
      assert.equal(await evaluate("document.querySelector('[data-lingguang-body]').value"), "当前未保存的草稿");
      assert.equal(calls, 2, "save conflict must not start another model call");
    }
  });
}

// specs/prologue-adoption §4.5 (item 10): the reply shows while the model writes it, marked as not saved; Stop closes the
// request, which stops the call: nothing is saved and the words stay in the box; a finished reply replaces the preview.
test("灵光对话：回复边写边显示，停止后不保存且输入保留，写完后换成保存的回复", { timeout: 90_000 }, async (t) => {
  let calls = 0;
  const firstStopped = Promise.withResolvers<void>();
  const browser = await openGoalBrowser(t, true, undefined, async (_prompt, options) => {
    calls++;
    await options?.beforeDispatch?.();
    options?.onProgress?.({ type: "text-delta", text: "可以先" } as never);
    await new Promise(resolve => setTimeout(resolve, 150));
    options?.onProgress?.({ type: "text-delta", text: "画三张小图，" } as never);
    if (calls === 1) {
      await new Promise<void>(resolve => options?.signal?.addEventListener("abort", () => resolve(), { once: true }));
      firstStopped.resolve();
      options?.signal?.throwIfAborted();
    }
    options?.onProgress?.({ type: "text-delta", text: "看光怎么移动。" } as never);
    return "可以先画三张小图，看光怎么移动。";
  });
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const child = await pluginFrameBrowser(t, browser, "lingguang");
  const { evaluate, waitFor, click } = child;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')");
  await browser.click('[data-plugin-picker-popover] [data-plugin-id="lingguang"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'lingguang'");
  await click('[data-lingguang-capture]');
  await waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
  await evaluate(`(() => { const title = document.querySelector('[data-lingguang-title]'); title.value = '光的笔记'; title.dispatchEvent(new InputEvent('input', {bubbles:true})); const body = document.querySelector('[data-lingguang-body]'); body.value = '下午三点的光从窗边移到桌上。'; body.dispatchEvent(new InputEvent('input', {bubbles:true})); })()`);
  await click('[data-lingguang-brainstorm-current]');
  await waitFor("!document.querySelector('[data-lingguang-pane=chat]').hidden");
  await evaluate(`document.querySelector('[data-lingguang-chat-input]').value = '怎么记录光的变化？'`);
  await click('[data-lingguang-chat] [type=submit]');
  // The preview grows while the model writes; it says it is not saved, and Stop is offered.
  await waitFor("document.querySelector('[data-lingguang-draft] p')?.textContent.includes('画三张小图')", 8_000);
  assert.match(await evaluate<string>("document.querySelector('[data-lingguang-draft] strong').textContent"), /还没保存/);
  assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-stop]').hidden"), false);
  const { mkdir, writeFile } = await import("node:fs/promises");
  const directory = new URL("../.impeccable/qa/review/prologue-adoption/", import.meta.url);
  await mkdir(directory, { recursive: true });
  const shot = async (name: string) => writeFile(new URL(`${name}.png`, directory), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await shot("lingguang-reply-preview");
  await click('[data-lingguang-chat-stop]');
  await firstStopped.promise;
  await waitFor("document.querySelector('[data-lingguang-note]').textContent.includes('已停止')", 8_000);
  assert.equal(await evaluate("document.querySelectorAll('.lingguang-message').length"), 0, "a stopped reply leaves nothing behind");
  assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-input]').value"), "怎么记录光的变化？", "the words stay in the box");
  assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-stop]').hidden"), true);
  await click('[data-lingguang-chat] [type=submit]');
  await waitFor("document.querySelectorAll('.lingguang-message:not(.is-draft)').length === 2", 8_000);
  assert.equal(await evaluate("document.querySelector('[data-lingguang-messages]').lastElementChild.querySelector('p').textContent"), "可以先画三张小图，看光怎么移动。");
  assert.equal(await evaluate("document.querySelectorAll('[data-lingguang-draft]').length"), 0, "the saved reply replaced the preview");
  assert.equal(await evaluate("document.querySelector('[data-lingguang-chat-input]').value"), "");
  await shot("lingguang-reply-saved");
});
