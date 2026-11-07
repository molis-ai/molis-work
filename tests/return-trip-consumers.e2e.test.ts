// The two plugins that send a person to the model settings with what they were doing, and offer it back with the platform's
// 接着做 prompt (specs/draft-and-return/spec.md §4, U1 ② and U2; DRT-20, DRT-21's engineering half). Each page is opened with no
// text model, its own 打开模型设置 is pressed, the model is saved the way a person saves one against the stand-in provider on
// 127.0.0.1, and the settings close onto the page: the prompt shows once, nothing is done until the person presses it. Screenshots
// at three widths go to the ignored review folder (draft-and-return/).
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openCoding } from "./fixtures/coding-browser.js";
import { saveFirstModel, standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

type Owner = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
const WIDTHS = [[1440, 960], [1024, 768], [375, 812]] as const;

/** The window at each width, into the ignored review folder (`draft-and-return/<name>-<width>.png`). */
async function shootWidths(owner: Owner, name: string, settle: () => Promise<void>): Promise<void> {
  const directory = join(process.cwd(), REVIEW_EVIDENCE, "draft-and-return");
  await mkdir(directory, { recursive: true });
  for (const [width, height] of WIDTHS) {
    await owner.setViewport(width, height);
    await settle();
    const shot = await owner.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, owner.sessionId);
    await writeFile(join(directory, `${name}-${width}.png`), Buffer.from(shot.data, "base64"));
  }
}

test("DRT-20 Coding: back from the model settings, the prompt is the composer's first row at the input's width, and sends only when pressed", { timeout: 240_000 }, async t => {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const coding = await openCoding(t);
  if (!coding) return;
  const { owner, waitFor, evaluate, click, start, sentWith } = coding;
  const words = "回程之后再发的这段话";
  await start(words);
  await waitFor("document.querySelector('[data-coding-model-setup]')?.hidden === false", 15_000);
  await click("[data-coding-model-setup]");
  await owner.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 15_000);
  assert.equal(await owner.evaluate("document.querySelector('[data-return-bar-body]').textContent"), "配好模型后自动回去，你写的都还在。", "the draft went with the trip");
  await saveFirstModel(owner, standIn.baseUrl);
  await owner.waitFor("document.body.dataset.desktopSurface === 'coding'", 20_000);
  await waitFor("document.querySelectorAll('[data-coding-resume]').length === 1", 20_000);
  /** The prompt against the input under it: the composer's first row, the same left edge and width. */
  const place = () => evaluate<{ first: boolean; left: number; width: number }>(`(() => {
    const prompt = document.querySelector('[data-coding-resume]').getBoundingClientRect(), input = document.querySelector('.coding-composer-shell').getBoundingClientRect();
    return { first: document.querySelector('[data-coding-composer]').firstElementChild?.matches('[data-coding-resume]') === true,
      left: Math.round(prompt.left - input.left), width: Math.round(prompt.width - input.width) };
  })()`);
  await shootWidths(owner, "coding-resume", async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.deepEqual(await place(), { first: true, left: 0, width: 0 });
  });
  await owner.setViewport(1440, 960);
  assert.deepEqual(await sentWith(words), [], "nothing is sent before the person says so");
  assert.match(await evaluate<string>("document.querySelector('[data-coding-resume]').textContent"), /刚才去配了模型，已经好了.*接着发送.*先不用/su);
  await click("[data-coding-resume] [data-resume-prompt=resume]");
  await waitFor("!document.querySelector('[data-coding-resume]')", 10_000);
  await waitFor(`posts.some(one => one.body.includes(${JSON.stringify(words)}))`, 20_000);
});

test("DRT-20 Cognia: back from the model settings, the prompt shows once the list reads the model, and opens the ask only when pressed", { timeout: 180_000 }, async t => {
  const standIn = await startModelStandIn(standInKey);
  t.after(() => standIn.close());
  const owner = await openGoalBrowser(t, "seeded");
  if (!owner) return;
  const page = await pluginFrameBrowser(t, owner, "cognia");
  await owner.setViewport(1440, 960);
  await owner.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, owner.sessionId);
  await owner.navigate(() => owner.command("Page.navigate", { url: `${owner.origin}/projects/${owner.projectId}/?desktop=1&openPlugin=cognia` }, owner.sessionId));
  await owner.surfaceReady("cognia");
  await page.waitFor("document.querySelector('[data-cognia-action=model-settings]')?.hidden === false", 15_000);
  await page.click("[data-cognia-action=model-settings]");
  await owner.waitFor("document.querySelector('[data-settings-return-bar]')?.dataset.returnBarState === 'waiting'", 15_000);
  assert.equal(await owner.evaluate("document.querySelector('[data-return-bar-body]').textContent"), "配好模型后自动回去。", "Cognia carries no draft, so the bar says none is kept");
  await saveFirstModel(owner, standIn.baseUrl);
  await owner.waitFor("document.body.dataset.desktopSurface === 'cognia'", 20_000);
  await page.waitFor("document.querySelectorAll('[data-cognia-resume]').length === 1", 20_000);
  assert.equal(await page.evaluate("document.querySelector('[data-cognia-action=synthesize]').disabled"), false, "the list reads the model as it is");
  assert.equal(await page.evaluate("document.querySelector('[data-cognia-dialog]').open"), false, "nothing is opened before the person says so");
  await shootWidths(owner, "cognia-resume", async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    // The prompt keeps the list's inset: its edges are the model line's text edges (that line is padded 24px).
    assert.deepEqual(await page.evaluate(`(() => { const prompt = document.querySelector('[data-cognia-resume]').getBoundingClientRect(), line = document.querySelector('[data-cognia-model]').getBoundingClientRect();
      return [Math.round(prompt.left - line.left), Math.round(line.right - prompt.right)]; })()`), [24, 24]);
  });
  await owner.setViewport(1440, 960);
  await page.click("[data-cognia-resume] [data-resume-prompt=resume]");
  await page.waitFor("document.querySelector('[data-cognia-dialog]').open && !document.querySelector('[data-cognia-resume]')", 10_000);
});
