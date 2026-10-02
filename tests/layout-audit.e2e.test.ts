import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { layoutFindings } from "./fixtures/layout-audit.js";

// The layout audit is what says a screen of the way in is clean, so it has to be shown to catch each thing it claims to
// and to leave alone what only looks like a problem (a scroller's far end, an ellipsis, text sharing a line).

const page = (body: string, style = "") => `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; height: 100%; overflow: hidden; font: 14px/20px sans-serif; }
  button { box-sizing: border-box; height: 32px; padding: 0 12px; }
  ${style}
</style><body>${body}</body>`;

test("the layout audit finds what overlaps, is cut off, covered or out of reach, and nothing else", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 600, height: 400, deviceScaleFactor: 1, mobile: false }, sessionId);
  const audit = async (body: string, style?: string) => {
    await navigate(() => command("Page.navigate", { url: `data:text/html;charset=utf-8,${encodeURIComponent(page(body, style))}` }, sessionId));
    return (await layoutFindings(evaluate)).map(finding => finding.kind).sort();
  };

  assert.deepEqual(await audit(`<button style="position:absolute;left:20px;top:20px">一</button><button style="position:absolute;left:140px;top:20px">二</button><p style="position:absolute;left:20px;top:80px;margin:0">一行字</p>`), [], "a clean screen has no findings");
  assert.deepEqual(await audit(`<button style="position:absolute;left:20px;top:20px;width:100px">一</button><button style="position:absolute;left:90px;top:30px;width:100px">二</button>`), ["overlap"], "two controls sitting on each other");
  assert.deepEqual(await audit(`<span style="position:absolute;left:20px;top:20px">第一段文字在这里</span><span style="position:absolute;left:60px;top:24px">压在上面的另一段</span>`), ["overlap"], "text over text");
  assert.deepEqual(await audit(`<button style="position:absolute;left:20px;top:20px">一</button><div style="position:absolute;left:0;top:0;width:200px;height:80px"></div>`), ["covered"], "a click on the control would land on the thing above it");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:20px;width:60px;height:32px;overflow:hidden"><button style="width:120px">被裁掉一半的按钮</button></div>`), ["clipped", "silent-clip"], "a control cut by a box that hides what it overflows, and the box that does it without a word");
  assert.deepEqual(await audit(`<button style="position:absolute;left:-40px;top:20px;width:100px">出了窗口</button>`), ["clipped", "offscreen-x"], "out of the window, and so cut by the page that hides what leaves it");
  assert.deepEqual(await audit(`<div style="width:900px;height:20px;background:#ccc"></div>`, "html, body { overflow: visible; }"), ["body-overflow-x", "page-overflow-x"], "the window must not scroll sideways");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:20px;width:60px;overflow:hidden;white-space:nowrap">一行很长很长很长很长的文字被悄悄截掉了</div>`), ["silent-clip"], "text that stops without saying so");
  assert.deepEqual(await audit(`<button style="position:absolute;left:20px;top:20px;height:12px;padding:0">小</button>`), ["tiny-target"], "a target a finger cannot be sure of");

  assert.deepEqual(await audit(`<button style="position:absolute;left:20px;top:20px;width:32px;padding:0"><svg width="16" height="16"></svg><span style="display:none">新建项目</span></button>`), ["unnamed"], "an icon-only control whose label is hidden has no name");
  assert.deepEqual(await audit(`<button aria-label="新建项目" style="position:absolute;left:20px;top:20px;width:32px;padding:0"><svg width="16" height="16"></svg><span style="display:none">新建项目</span></button>`), [], "and a name from aria-label is one");

  // What only looks like a problem: a scroller's far end, an ellipsis, a link in a sentence, a hidden file input.
  assert.deepEqual(await audit(`<div style="position:absolute;left:0;top:0;width:300px;height:100px;overflow:auto"><button style="margin-top:300px">在滚动区远端的按钮</button></div><button style="position:absolute;left:320px;top:20px">旁边</button>`), [], "a control below a scroller's fold is reached by scrolling");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:20px;width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">一行很长很长很长很长的文字</div>`), [], "an ellipsis says it stopped");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:20px;width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">一行很长很长很长很长的文字</div><button style="position:absolute;left:100px;top:14px">旁边的按钮</button>`), [], "the part of a line that an ellipsis hides takes up no room");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:100px;font-size:120px;line-height:.8;white-space:nowrap">Molis</div><span style="position:absolute;left:20px;top:78px">说明的一行字</span>`), [], "display type's box is taller than its ink; only the ink takes up room");
  assert.deepEqual(await audit(`<div style="position:absolute;left:20px;top:100px;font-size:120px;line-height:.8;white-space:nowrap">Molis</div><span style="position:absolute;left:20px;top:140px">压进字里的一行字</span>`), ["overlap"], "a line sitting in the ink of display type is still caught");
  assert.deepEqual(await audit(`<p style="position:absolute;left:20px;top:20px;margin:0">看<a href="#" style="display:inline-block;height:14px">这里</a>吧，<b>粗体</b>和<i>斜体</i>在同一行。</p>`), [], "text and inline links share a line");
  assert.deepEqual(await audit(`<input type="file" style="position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0,0,0,0)"><button style="position:absolute;left:20px;top:20px">选择文件</button>`), [], "a control hidden by the screen-reader-only technique is not on the screen either");
  assert.deepEqual(await audit(`<input type="file" style="position:absolute;width:1px;height:1px;opacity:0"><button style="position:absolute;left:20px;top:20px">选择文件</button>`), [], "a visually hidden input is not on the screen");
});
