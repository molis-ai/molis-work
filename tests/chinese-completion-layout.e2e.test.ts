import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { PROJECT } from "./fixtures/chinese-walk.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("a long Chinese project name leaves completion text and both actions on screen", { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId } = browser;
  const pages = await pluginFrameBrowser(t, browser, "pages");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/locale?lang=zh&next=%2F" }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await waitFor("typeof molisWorkControlHeaders === 'function'");
  await evaluate(`(async () => {
    const response = await fetch('/api/settings/projects/${projectId}/rename', {
      method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({display_name: ${JSON.stringify(PROJECT)}, expected_display_name: "目录交互验证"})
    });
    if (!response.ok) throw new Error(await response.text());
  })()`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=pages` }, sessionId));
  await pages.click("[data-pages-new]");
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

test("IUI-21: a long Chinese goal keeps its title and status inside the Home row at both widths", { timeout: 60_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const prefix = "/projects/" + b.projectId;
  const { goal } = await b.web.post<{ goal: { goal_id: string } }>(prefix + "/api/plugins/io.molis.work.goals/goals",
    { title: "一个中文名字很长的实际目标，仍然要看清现在的状态和可以执行的操作", idempotency_key: "long-chinese-home-row" });
  const row = '[data-home-subject-id="' + goal.goal_id + '"]';
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  await b.waitFor(`document.querySelector(${JSON.stringify(row)})?.checkVisibility()`);
  for (const width of [390, 1440]) {
    await b.setViewport(width, 900, width === 390);
    for (const font of ["", "Arial, sans-serif", "sans-serif"]) {
      const fits = await b.evaluate<boolean>(`(() => {
        const row = document.querySelector(${JSON.stringify(row)}); row.style.fontFamily = ${JSON.stringify(font)};
        const outer = row.getBoundingClientRect(), title = row.querySelector('.mw-presentation__row-title'), status = row.querySelector('.mw-status');
        const inside = element => { const box = element.getBoundingClientRect(); return box.width>0 && box.height>0
          && box.left>=outer.left-1 && box.right<=outer.right+1 && box.top>=outer.top-1 && box.bottom<=outer.bottom+1; };
        return inside(title) && inside(status) && status.textContent.includes('进行中') && document.documentElement.scrollWidth<=innerWidth+1;
      })()`);
      assert.equal(fits, true, `${width}px ${font || "system"}: title and status remain in their row`);
    }
  }
});
