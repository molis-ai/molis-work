import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("灵光主路径：记下、刷新还在、改字不丢光标、丢掉、本机头脑风暴", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
  assert.ok(projectId);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=lingguang]')");

  await click('[data-plugin-strip] [data-plugin-id="market"]');
  await waitFor("[...document.querySelectorAll('[data-market-plugin=lingguang] [data-market-add]')].some((button) => button.textContent.trim() === '已添加')", 8_000);
  assert.equal(await evaluate("document.querySelector('[data-market-plugin=lingguang] h2')?.textContent"), "灵光");
  assert.match(await evaluate("document.querySelector('[data-market-plugin=lingguang] p')?.textContent || ''"), /先记下还没想清楚的想法/);

  await click('[data-plugin-strip] [data-plugin-id="lingguang"]');
  await waitFor("document.body.dataset.desktopSurface === 'lingguang' && document.querySelector('[data-lingguang=workbench]:not([hidden]) [data-lingguang-empty]:not([hidden])')", 8_000);
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
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=lingguang]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "lingguang") {
    await click('[data-plugin-strip] [data-plugin-id="lingguang"]');
  }
  await waitFor("document.body.dataset.desktopSurface === 'lingguang' && document.querySelectorAll('[data-lingguang-id]').length === 3", 8_000);
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
  await evaluate(`(() => {
    const rows = [...document.querySelectorAll("[data-lingguang-id]")];
    rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
    rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true, metaKey: true }));
  })()`);
  await waitFor("document.querySelector('[data-lingguang-selection]:not([hidden])')");
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
  await waitFor("[...document.querySelectorAll('[data-lingguang-messages] .lingguang-message p')].some((item) => item.textContent === '先记着：明天试试')", 8_000);

  const store = openLingguangStore(homeDirectory);
  t.after(() => store.close());
  assert.equal(store.list(projectId!).length, 1);
  assert.equal(store.list(projectId!)[0]?.title, "窗边的光");
  assert.equal(store.list(projectId!)[0]?.body, "下午三点，灰尘在亮里转。");
  assert.match(store.openConversation([store.list(projectId!)[0]!.id], projectId!).messages.at(-1)?.body || "", /^先记着：明天试试$/);
});
