import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness, locateTestChrome, type ChromePage } from "@molis-ai/molis-work-test-kit/browser";
import { createPreviewServer } from "../scripts/input-receipts-slice/server.ts";

// RCPT-R0 (specs/ai-input-receipts §18.5): the receipt preview in a real browser. RECEIPTS_R0_SHOTS=<dir> also saves a
// picture of every layout x width x theme; the assertions do not depend on it.
const WIDTHS = [{ width: 1440, height: 900, mobile: false }, { width: 1024, height: 768, mobile: false }, { width: 390, height: 844, mobile: true }] as const;
/** Each scene at the place where it has receipts to show. */
const SCENES = [["main", "settled"], ["stopped-carry", "carried"], ["question", "waiting"], ["restart", "recovered"]] as const;
const LAYOUTS = ["assistant", "coding"] as const;
const THEMES = ["light", "dark"] as const;

interface Session { readonly browser: ChromeHarness; readonly origin: string; readonly errors: string[] }

async function withSession(t: test.TestContext, run: (session: Session) => Promise<void>): Promise<void> {
  const chrome = locateTestChrome();
  if (!chrome) return t.skip("Chrome is required for the receipt preview E2E");
  const directory = await mkdtemp(join(tmpdir(), "molis-work-receipts-r0-"));
  const server = await createPreviewServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await ChromeHarness.start(directory, { executable: chrome, commandTimeoutMs: 8_000 });
  try {
    await run({ browser, origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, errors: [] });
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

/** A fresh page at a place in the preview. Anything the page throws or logs as an error is collected in `errors`. */
async function openAt(session: Session, query: string, size: (typeof WIDTHS)[number] = WIDTHS[0]): Promise<ChromePage> {
  const page = await session.browser.page();
  await page.command("Runtime.enable");
  session.browser.on("Runtime.exceptionThrown", (params, sessionId) => { if (sessionId === page.sessionId) session.errors.push(JSON.stringify(params).slice(0, 300)); });
  session.browser.on("Runtime.consoleAPICalled", (params, sessionId) => { if (sessionId === page.sessionId && params["type"] === "error") session.errors.push(JSON.stringify(params["args"]).slice(0, 300)); });
  await page.viewport(size.width, size.height, size.mobile);
  await page.command("Page.navigate", { url: `${session.origin}/?${query}` });
  await page.wait("document.querySelector('[data-thread]') !== null && document.querySelector('.pv-titlebar') !== null");
  return page;
}

const press = async (page: ChromePage, key: "Tab" | "Enter" | "Escape" | " "): Promise<void> => {
  const code = key === " " ? "Space" : key;
  const virtual = { Tab: 9, Enter: 13, Escape: 27, " ": 32 }[key];
  const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
  await page.command("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: virtual, ...(text === undefined ? {} : { text }) });
  await page.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: virtual });
};
const shot = async (page: ChromePage, name: string): Promise<void> => {
  const dir = process.env["RECEIPTS_R0_SHOTS"];
  if (dir) { await mkdir(dir, { recursive: true }); await page.screenshot(join(dir, `${name}.png`)); }
};
const rowCount = (page: ChromePage): Promise<number> => page.evaluate("document.querySelectorAll('.rc-input').length");
const focused = (page: ChromePage): Promise<string> => page.evaluate("document.activeElement?.className + '|' + (document.activeElement?.dataset?.id ?? '')");

test("RCPT-R0-07 every layout x width x theme draws inside the viewport, with the receipt bar and the composer reachable", { timeout: 120_000 }, async (t) => {
  await withSession(t, async (session) => {
    const shots = process.env["RECEIPTS_R0_SHOTS"];
    if (shots) await mkdir(shots, { recursive: true });
    const background = new Map<string, string>();
    for (const layout of LAYOUTS) for (const size of WIDTHS) for (const theme of THEMES) for (const [scene, checkpoint] of SCENES) {
      const page = await openAt(session, `layout=${layout}&scene=${scene}&cp=${checkpoint}&theme=${theme}`, size);
      const where = `${layout} ${scene} ${String(size.width)} ${theme}`;
      const measured = await page.evaluate<{ over: number; threadOver: number; composer: boolean; theme: string; bar: number; notice: boolean; small: string[]; bg: string; stage: number }>(`(() => {
        const input = document.querySelector('[data-composer-input]');
        const box = input.getBoundingClientRect();
        const thread = document.querySelector('[data-thread]');
        return { over: document.documentElement.scrollWidth - innerWidth, threadOver: thread.scrollWidth - thread.clientWidth,
          composer: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
          theme: document.documentElement.dataset.theme, bar: document.querySelectorAll('.rc-status').length,
          notice: (() => { const n = document.querySelector('.pv-notice'); return n.offsetHeight > 0 && n.scrollHeight <= n.clientHeight + 1 && /不是真实运行/.test(n.innerText) && /不连接 Home/.test(n.innerText); })(),
          small: [...document.querySelectorAll('.pv-tools button, .rc-panel button:not([disabled]), .rc-panel input[type=text]')]
            .filter(el => el.getBoundingClientRect().height > 0 && el.getBoundingClientRect().height < 43.5).map(el => el.className.split(' ').pop() + ':' + Math.round(el.getBoundingClientRect().height)),
          bg: getComputedStyle(document.querySelector('.rc-panel')).backgroundColor, stage: document.querySelector('.rc-panel').getBoundingClientRect().height };
      })()`);
      assert.ok(measured.over <= 0, `${where}: the page scrolls sideways by ${String(measured.over)}px`);
      assert.ok(measured.threadOver <= 0, `${where}: the thread scrolls sideways`);
      assert.ok(measured.composer, `${where}: the composer is outside the viewport`);
      assert.equal(measured.theme, theme, where);
      if (size.mobile) assert.deepEqual(measured.small, [], `${where}: touch targets under 44px`);
      assert.ok(measured.notice, `${where}: the page does not say, in full, that this is not a real run`);
      assert.ok(measured.bar > 0, `${where}: no receipt bar is drawn`);
      assert.ok(measured.stage > 200, `${where}: the panel collapsed to ${String(measured.stage)}px`);
      background.set(`${layout}|${scene}|${String(size.width)}|${theme}`, measured.bg);
      if (shots) await page.screenshot(join(shots, `${layout}-${scene}-${String(size.width)}-${theme}.png`));
      await page.command("Target.closeTarget", { targetId: page.targetId }).catch(() => undefined);
    }
    for (const layout of LAYOUTS) for (const size of WIDTHS) {
      const key = (theme: string) => `${layout}|main|${String(size.width)}|${theme}`;
      assert.notEqual(background.get(key("light")), background.get(key("dark")), `${layout} ${String(size.width)}: the panel does not change with the theme`);
    }
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-05 keyboard: Tab reaches a receipt bar, Enter and Space open and close its detail, Escape closes it and gives focus back", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const page = await openAt(session, "layout=assistant&scene=main&theme=light");
    // The first input that can still be corrected: its detail has something to Tab to (a withdrawn input's has not).
    const id = await page.evaluate<string>("document.querySelector('.rc-input:not([data-key=withdrawn]) .rc-status').dataset.id");
    for (let i = 0; i < 60 && !(await focused(page)).endsWith(`|${id}`); i += 1) await press(page, "Tab");
    const start = await focused(page);
    assert.match(start, /rc-status/, "Tab never reached the receipt bar");
    assert.equal(start.split("|")[1], id);
    const expanded = () => page.evaluate<string>(`document.querySelector('.rc-status[data-id="${id}"]').getAttribute('aria-expanded')`);
    assert.equal(await expanded(), "false");
    await press(page, "Enter");
    assert.equal(await expanded(), "true");
    assert.equal(await page.evaluate(`document.getElementById('detail-${id}') !== null`), true);
    assert.equal(await focused(page), start, "opening the detail moved focus");
    await shot(page, "detail-open-1440-light");
    assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.rc-detail')).animationName"), "none", "motion is not reduced when the person asked for less");
    await press(page, "Enter");
    assert.equal(await expanded(), "false");
    await press(page, " ");
    assert.equal(await expanded(), "true");
    await press(page, "Tab");
    assert.equal(await page.evaluate("document.activeElement.closest('.rc-detail') !== null"), true, "Tab from the open receipt bar did not enter its detail");
    await press(page, "Escape");
    assert.equal(await expanded(), "false");
    assert.equal(await focused(page), start, "Escape did not give focus back to the receipt bar");
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-04 Enter that confirms Chinese input does not send; Enter after it plays the recorded next input once", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    // At "asked" the recording has one more input to play: the supplement the person is about to send.
    const page = await openAt(session, "layout=coding&scene=question&cp=asked&theme=light");
    assert.equal(await rowCount(page), 0);
    assert.match(await page.evaluate<string>("document.querySelector('[data-composer-input]').placeholder"), /回车播放/);
    await page.evaluate(`(() => {
      const input = document.querySelector('[data-composer-input]');
      input.focus();
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      input.closest('form').requestSubmit();
    })()`);
    assert.equal(await rowCount(page), 0, "a submit during composition sent something");
    await page.evaluate(`document.querySelector('[data-composer-input]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))`);
    await new Promise(resolve => setTimeout(resolve, 50));
    await page.evaluate(`document.querySelector('[data-composer-input]').closest('form').requestSubmit()`);
    assert.equal(await rowCount(page), 1, "Enter after the composition did not play the recorded input");
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-03 the tray lists what is not handled yet, opens an input from its row, and playback to the end draws no 'effective' claim", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const page = await openAt(session, "layout=assistant&scene=main&theme=light");
    await page.click("[data-action=tray]");
    assert.equal(await page.evaluate("document.querySelector('[data-action=tray]').getAttribute('aria-expanded')"), "true");
    assert.ok(await page.evaluate<number>("document.querySelectorAll('.rc-tray-item').length") > 0, "the open tray has no rows");
    await shot(page, "tray-open-1440-light");
    await page.click("[data-action=open-input]");
    assert.equal(await page.evaluate("document.querySelector('[data-action=tray]').getAttribute('aria-expanded')"), "false");
    assert.ok(await page.evaluate<number>("document.querySelectorAll('.rc-detail').length") > 0, "opening from the tray did not open the input's detail");
    const text = await page.evaluate<string>("document.body.innerText");
    assert.doesNotMatch(text, /已生效/);
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-07 a redraw that is not playback leaves the thread where the reader had it", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const page = await openAt(session, "layout=coding&scene=main&theme=light", WIDTHS[1]);
    const position = () => page.evaluate<number>("document.querySelector('[data-thread]').scrollTop");
    assert.ok(await page.evaluate<boolean>("(() => { const el = document.querySelector('[data-thread]'); el.scrollTop = 120; return el.scrollHeight > el.clientHeight + 120; })()"), "the thread is too short to test");
    const before = await position();
    assert.ok(before > 0);
    await page.click("[data-action=tray]");
    assert.equal(await position(), before, "opening the tray moved the thread");
    await page.click("[data-action=theme]");
    assert.equal(await position(), before, "a redraw moved the thread");
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-02 a correction is shown as the person's own decision on the Molis layer, never as something the AI did", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const page = await openAt(session, "layout=coding&scene=main&theme=dark");
    const id = await page.evaluate<string>("document.querySelector('.rc-input:not([data-key=withdrawn]) .rc-status').dataset.id");
    await page.click(`.rc-status[data-id="${id}"]`);
    await page.click(".rc-detail [data-action=correct]");
    await page.fill("[data-draft-note]", "这条是给步骤 4 的");
    await shot(page, "correction-form-1440-dark");
    await page.click("[data-action=submit-correction]");
    const text = await page.evaluate<string>("document.querySelector(`#in-${CSS.escape(" + JSON.stringify(id) + ")}`).innerText");
    assert.match(text, /你改为/);
    assert.match(text, /等 AI 采纳/);
    assert.match(text, /Molis 层（模拟）/);
    assert.match(text, /没有 SDK 事实/, "the evidence list must label the correction as simulated");
    assert.doesNotMatch(text, /已生效/);
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-06 the question scene: the supplement waits behind the question, and answering lets the AI read it", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const page = await openAt(session, "layout=coding&scene=question&cp=waiting&theme=light");
    const waiting = await page.evaluate<string>("document.body.innerText");
    assert.match(waiting, /要不要把 login-timeout 用例也一起处理/);
    assert.match(waiting, /排在你回答问题之后/);
    assert.equal(await page.evaluate("document.querySelector('[data-chip=questionnaire]').disabled"), true);
    assert.equal(await page.evaluate("document.querySelector('[data-chip=this-run]').getAttribute('aria-pressed')"), "true");
    // The shared composer-target mark (design system, #423) sits inside the composer pill, styled by its own sheet.
    assert.equal(await page.evaluate("document.querySelector('.rc-pill [data-ix-into]')?.textContent.trim()"), "补充这一轮");
    assert.ok(await page.evaluate<number>("document.querySelector('.rc-pill [data-ix-into]').getBoundingClientRect().height") > 20, "the shared mark is not styled");
    await page.click("[data-action=answer]");
    await page.wait("document.body.innerText.includes('已回答')");
    const answered = await page.evaluate<string>("document.body.innerText");
    assert.doesNotMatch(answered, /排在你回答问题之后/);
    assert.match(answered, /AI 的理解/, "after the answer the AI read and explained the supplement");
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-01 the restart scene: a killed Host is reconciled on reopen and the page says what it could and could not know", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    const killed = await openAt(session, "layout=assistant&scene=restart&cp=killed&theme=light");
    assert.doesNotMatch(await killed.evaluate<string>("document.body.innerText"), /重启后核对/);
    const page = await openAt(session, "layout=assistant&scene=restart&cp=recovered&theme=light");
    const text = await page.evaluate<string>("document.body.innerText");
    assert.match(text, /重启|强杀|收口/);
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-07 the opened detail and the opened tray fit the phone width", { timeout: 60_000 }, async (t) => {
  await withSession(t, async (session) => {
    for (const theme of THEMES) {
      const page = await openAt(session, `layout=assistant&scene=main&theme=${theme}`, WIDTHS[2]);
      const id = await page.evaluate<string>("document.querySelector('.rc-input:not([data-key=withdrawn]) .rc-status').dataset.id");
      await page.click(`.rc-status[data-id="${id}"]`);
      const over = () => page.evaluate<number>("document.documentElement.scrollWidth - innerWidth + Math.max(0, document.querySelector('[data-thread]').scrollWidth - document.querySelector('[data-thread]').clientWidth)");
      assert.ok(await over() <= 0, `${theme}: the open detail overflows sideways`);
      await shot(page, `detail-open-390-${theme}`);
      await page.click(`.rc-status[data-id="${id}"]`);
      await page.click("[data-action=tray]");
      assert.ok(await over() <= 0, `${theme}: the open tray overflows sideways`);
      assert.equal(await page.evaluate("(() => { const box = document.querySelector('.rc-tray-list').getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0; })()"), true, `${theme}: the open tray leaves the screen`);
      await shot(page, `tray-open-390-${theme}`);
    }
    assert.deepEqual(session.errors, []);
  });
});

test("RCPT-R0-03/06 the end-of-run actions and the restart each play their recorded branch, and the page changes only to what was recorded", { timeout: 90_000 }, async (t) => {
  await withSession(t, async (session) => {
    const carry = await openAt(session, "layout=assistant&scene=stopped-carry&cp=stopped&theme=light");
    assert.match(await carry.evaluate<string>("document.querySelector('.rc-end').innerText"), /留在会话里，没有自己开新的一轮/);
    await carry.click("[data-action=carry]");
    await carry.wait("document.body.innerText.includes('接续自上一轮')");
    assert.match(await carry.evaluate<string>("document.querySelector('.rc-end-queue').innerText"), /排队里的 \d+ 条已处理（带进下一轮）/);

    const withdrawn = await openAt(session, "layout=assistant&scene=stopped-carry&cp=stopped&theme=light");
    await withdrawn.click("[data-action=withdraw-all]");
    await withdrawn.wait("document.querySelector('.rc-end-queue')?.innerText.includes('撤回')");
    assert.match(await withdrawn.evaluate<string>("document.querySelector('.rc-end-queue').innerText"), /已处理（撤回）/);
    assert.doesNotMatch(await withdrawn.evaluate<string>("document.body.innerText"), /接续自上一轮/, "a withdrawn input must not appear in a next run");

    const killed = await openAt(session, "layout=assistant&scene=restart&cp=killed&theme=light");
    assert.match(await killed.evaluate<string>("document.querySelector('.rc-banner').innerText"), /宿主被强杀了（演示）/);
    await killed.click("[data-action=recover]");
    await killed.wait("document.querySelector('.rc-banner')?.innerText.includes('已核对并收口')");
    const banner = await killed.evaluate<string>("document.querySelector('.rc-banner').innerText");
    assert.match(banner, /不自动带入，不自动开新的一轮/);
    assert.match(banner, /没读到/);
    assert.deepEqual(session.errors, []);
  });
});
