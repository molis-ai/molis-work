import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { PROJECT } from "./fixtures/chinese-walk.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("a long Chinese project name leaves completion text and both actions on screen", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=%2F" }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("typeof molisWorkControlHeaders === 'function'");
  await evaluate(`(async () => {
    const response = await fetch('/api/settings/projects/${projectId}/rename', {
      method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name: ${JSON.stringify(PROJECT)}})
    });
    if (!response.ok) throw new Error(await response.text());
  })()`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await click("[data-pages-new]");
  await waitFor("document.querySelector('.placement-toast-text small')");
  const findings = await evaluate<string[]>(`(() => {
    const card = document.querySelector('.placement-toast'), found = [];
    for (const element of [card, ...card.querySelectorAll('strong, small, button')]) {
      const box = element.getBoundingClientRect();
      if (!box.width || box.left < 0 || box.right > innerWidth || box.top < 0 || box.bottom > innerHeight) found.push('outside: ' + element.textContent);
      if (element.matches('button')) {
        if (document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button') !== element) found.push('covered: ' + element.textContent);
      } else if (element.matches('strong, small')) {
        const range = document.createRange(); range.selectNodeContents(element);
        for (const text of range.getClientRects()) if (text.left < box.left - 1 || text.right > box.right + 1) found.push('text spills: ' + element.textContent);
      }
    }
    return found;
  })()`);
  assert.deepEqual(findings, []);
  assert.ok((await evaluate<string>("document.querySelector('.placement-toast-text small').textContent")).includes(PROJECT));
  assert.equal(await evaluate("document.querySelectorAll('.placement-toast button').length"), 2);
  const captures = reviewEvidenceUrl("chinese-completion-layout/");
  await mkdir(captures, { recursive: true });
  await writeFile(new URL("completion-390.png", captures), Buffer.from((await command<{data: string}>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  await click(".placement-toast button:last-child");
  await waitFor("!document.querySelector('.placement-toast')");
});

test("the Home date strip reserves a footer for today in narrow and wide layouts", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, origin, projectId } = browser;
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=%2F" }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.body.dataset.desktopSurface === 'home' && document.querySelectorAll('[data-home-day]').length === 7");
  for (const width of [390, 1440]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    for (const font of ["", "Arial, sans-serif", "sans-serif"]) {
      await evaluate(`document.querySelectorAll('.home-day').forEach(day => day.style.fontFamily = ${JSON.stringify(font)})`);
      const geometry = await evaluate<{overlap: number; weekdayOverlap: number; contained: boolean; aligned: boolean}>(`(() => {
        const today = document.querySelector('.home-day__today'), day = today.closest('.home-day');
        const textBox = element => { const range = document.createRange(); range.selectNodeContents(element); return range.getBoundingClientRect(); };
        const box = day.getBoundingClientRect(), number = textBox(day.querySelector('.home-day__n')), label = textBox(today);
        const tops = [...document.querySelectorAll('.home-day__n')].map(element => element.getBoundingClientRect().top);
        return { overlap: number.bottom - label.top, weekdayOverlap: textBox(day.querySelector('.home-day__w')).bottom - number.top,
          contained: [day.querySelector('.home-day__w'), day.querySelector('.home-day__n'), today].every(element => { const text = textBox(element); return text.top >= box.top && text.bottom <= box.bottom; }),
          aligned: Math.max(...tops) - Math.min(...tops) < 1 };
      })()`);
      assert.ok(geometry.overlap <= 0, `${width}px ${font || "system"}: date and today overlap ${geometry.overlap}px`);
      assert.ok(geometry.weekdayOverlap <= 0, `${width}px ${font || "system"}: weekday and date overlap ${geometry.weekdayOverlap}px`);
      assert.ok(geometry.contained, `${width}px ${font || "system"}: every label stays inside its day`);
      assert.ok(geometry.aligned, `${width}px ${font || "system"}: all dates keep the same baseline`);
    }
    await evaluate("document.querySelectorAll('.home-day').forEach(day => day.style.fontFamily = '')");
    const captures = reviewEvidenceUrl("chinese-completion-layout/");
    await mkdir(captures, { recursive: true });
    await writeFile(new URL(`home-${width}.png`, captures), Buffer.from((await command<{data: string}>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  }
});
