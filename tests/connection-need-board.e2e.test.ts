import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/assistant-service-connections/spec.md §13.5, ASC-71: the connection card the shell draws on a plugin page, every stage as the
// component board shows it (原处的连接卡 · 平台区域版, drawn with the card's own markup and styles). At 375 and 400 wide (the narrow step,
// 432 tall) the foot's buttons, two at most, sit inside the foot and touch neither the header nor what the card says; nothing scrolls
// sideways. In Chinese and in English, since the English words are longer.

const CJK = /[㐀-鿿]/u;

test("ASC-71 at 375 and 400 wide every stage of the connection card keeps its buttons in the foot, clear of what it says", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  const shots = reviewEvidenceUrl("connection-need-board/");
  await mkdir(shots, { recursive: true });
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  for (const lang of ["zh", "en"] as const) {
    await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog?lang=${lang}#connection-need` }, sessionId));
    await waitFor("document.readyState === 'complete' && !!document.querySelector('#connection-need [data-connection-need-specimen]')", 20_000);
    const stages = await evaluate<string[]>(`[...new Set([...document.querySelectorAll('#connection-need [data-connection-need-specimen]')].map(card => card.dataset.connectionNeedSpecimen))]`);
    assert.deepEqual(stages.sort(), ["ask", "assistant", "choose", "disabled", "expired", "key", "line", "other", "paste", "refused", "running", "unsupported"], "every stage is on the board");
    assert.equal(await evaluate<number>(`document.querySelectorAll('#connection-need [data-board-review="d-track"]').length`), 12, "every specimen is marked for the D track");
    if (lang === "en") assert.equal(CJK.test(await evaluate<string>(`[...document.querySelectorAll('#connection-need .mw-platform-area')].map(card => card.textContent).join(" ").replace(/读取你为这个来源选好的账号/gu, "")`)), false, "in English the cards have no Chinese but the plugin's own quoted reason");
    for (const width of [375, 400]) {
      const found = await evaluate<Array<{ stage: string; buttons: number; problems: string[] }>>(`(() => {
        const cards = [...document.querySelectorAll('#connection-need [data-connection-need-specimen]')].filter(card => !['line', 'assistant'].includes(card.dataset.stage));
        for (const card of cards) { card.style.width = '${width}px'; card.style.height = '432px'; }
        document.body.offsetHeight;
        const box = node => node.getBoundingClientRect(), meet = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        return cards.map(card => {
          const head = box(card.querySelector('[data-framed-area-head]')), body = box(card.querySelector('.mw-platform-area__body')), foot = card.querySelector('.connection-need-area__foot'), footBox = box(foot), problems = [];
          const buttons = [...foot.querySelectorAll('button')];
          for (const button of buttons) {
            const b = box(button);
            if (b.top < footBox.top - 0.5 || b.bottom > footBox.bottom + 0.5) problems.push(button.textContent + ' leaves the foot');
            if (meet(b, body)) problems.push(button.textContent + ' covers what the card says');
            if (meet(b, head)) problems.push(button.textContent + ' covers the header');
            if (b.height < 43.5) problems.push(button.textContent + ' is under 44px');
          }
          if (footBox.bottom > box(card).bottom + 0.5) problems.push('the foot leaves the card');
          if (card.scrollWidth > card.clientWidth + 0.5 || foot.scrollWidth > foot.clientWidth + 0.5) problems.push('it scrolls sideways');
          return { stage: card.dataset.stage, buttons: buttons.length, problems };
        });
      })()`);
      assert.ok(found.length >= 20, "both sizes of every stage were measured");
      for (const card of found) {
        assert.ok(card.buttons <= 2, `${lang} ${width} ${card.stage}: at most two buttons in the foot (${card.buttons})`);
        assert.deepEqual(card.problems, [], `${lang} ${width} ${card.stage}`);
      }
    }
    await evaluate("document.querySelector('#connection-need').scrollIntoView()");
    await writeFile(new URL(`narrow-400-${lang}.png`, shots), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: true }, sessionId)).data, "base64"));
  }
});
