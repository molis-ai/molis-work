import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { TRUNCATION_AUDIT, TRUNCATION_STRESS, type TruncationHeld, type TruncationIssue } from "./fixtures/truncation-audit.js";

// specs/visual-ui-experience §type-optics (VUX-05): a name, path or summary cut short by an ellipsis or a line clamp on the
// board, the project page or a plugin can be read whole without opening it: the page's one tooltip
// (packages/design-system/src/browser/tip.ts) shows it on a pointer's rest, on keyboard focus and on a press and hold.
// Nothing is cut beyond recovery: a button's own label, an error and a status included. Seeded names are short, so every
// text whose style may cut it is lengthened in place first.

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const TIP = "(() => { const tip = document.querySelector('body > .craft-tip[data-shown]'); return tip ? tip.textContent : null; })()";

test("VUX-05: text cut short on the board, the project page and every plugin is shown whole by the tooltip; nothing is cut beyond recovery", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const move = (x: number, y: number) => command("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }, sessionId);
  const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`], ["Home", "/"], ["侧栏 Shelf", `/projects/${projectId}/side/shelf/side`],
    ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
  const found: string[] = [];
  let checked = 0;
  for (const width of [1280, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [name, path] of surfaces) {
      await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(1500);
      const stressed = await evaluate<number>(TRUNCATION_STRESS);
      await pause(200);
      const { found: issues, held } = await evaluate<{ found: TruncationIssue[]; held: TruncationHeld[] }>(TRUNCATION_AUDIT);
      for (const issue of issues) found.push(`${width} ${name}: ${issue.kind} ${issue.at} "${issue.text}"`);
      // One of each kind of cut text per surface: the same row drawn forty times is one check.
      const seen = new Set<string>();
      let skipped = 0;
      for (const item of held) {
        if (seen.has(item.at)) continue;
        seen.add(item.at);
        const point = await evaluate<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-cut-audit="${item.index}"]');
          if (!el) return null; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const box = el.getBoundingClientRect();
          const x = box.x + Math.min(box.width / 2, 24), y = box.y + box.height / 2;
          return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
        if (!point) { skipped++; continue; }
        await move(1, 1);
        await pause(150);
        await move(point.x, point.y);
        await pause(800);
        const shown = await evaluate<string | null>(TIP);
        checked++;
        if (shown?.replace(/\s+/g, " ").trim() !== item.text) found.push(`${width} ${name}: ${item.at} "${item.text.slice(0, 60)}" shows ${shown === null ? "no tooltip" : `"${shown.slice(0, 60)}"`}`);
      }
      t.diagnostic(`${width} ${name}: ${held.length} cut (${seen.size} kinds, ${skipped} covered), ${issues.length} issues, ${stressed} lengthened`);
      await move(1, 1);
    }
  }
  assert.ok(checked >= 30, `the audit reached cut texts (${checked})`);
  assert.deepEqual(found, []);
});

test("VUX-05: the tooltip shows a cut name, a clamped summary and the cut text under the pointer; keyboard focus shows it at once, a press and hold on touch too, and a held-back title comes back", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const key = async (name: string, code: number, modifiers = 0) => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: name, code: name, modifiers, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }, sessionId);
    await pause(100);
  };
  const centre = (selector: string) => evaluate<{ x: number; y: number }>(`(() => { const box = document.querySelector('${selector}').getBoundingClientRect(); return { x: box.x + 20, y: box.y + box.height / 2 }; })()`);
  const hover = async (selector: string) => {
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 600, y: 700 }, sessionId);
    await pause(700);
    await command("Input.dispatchMouseEvent", { type: "mouseMoved", ...await centre(selector) }, sessionId);
    await pause(700);
  };
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  await waitFor("document.readyState === 'complete'", 20_000);
  const long = "一个很长很长的名字，长到这一行放不下，后面还有一段只有提示里才看得到的结尾";
  const summary = "第一行摘要说的是这件事从哪里来；第二行说它现在到了哪一步；第三行说下一步谁来做、什么时候做完，这一行被截掉了";
  await evaluate(`(() => { const box = document.createElement('div'); box.id = 'box';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:40px;font-size:14px;overflow:auto';
    const cut = 'display:block;width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    box.innerHTML = '<ul style="list-style:none;padding:0">'
      + '<li id="row" tabindex="0"><span id="name" title="旧提示" style="' + cut + '">${long}</span><span id="path" style="' + cut + '">/某个/很深的/目录/里面/的/文件.md</span><button id="act">打开</button></li>'
      + '<li><a id="card" href="#card"><span style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;width:200px">${summary}</span></a></li>'
      + '<li><button id="whole">完整的名字</button></li></ul><button id="far" style="margin-top:200px">别处</button>'
      + '<div id="following" style="height:60px;overflow:auto"><div style="height:400px">别处跟着新输出滚动</div></div><div style="height:2000px"></div>';
    document.body.append(box); })()`);

  await hover("#name");
  assert.equal(await evaluate<string | null>(TIP), long, "a pointer's rest on a cut name shows it whole");
  assert.deepEqual(await evaluate("[document.querySelector('#name').hasAttribute('title'), document.querySelector('.craft-tip').hasAttribute('data-cut')]"), [false, true], "its native title is held back while it shows; a cut text may wrap");
  // Before, any scroll on the page put it away, so a cut name could not be read while a conversation or a log elsewhere
  // followed its output (the board's following specimen hid every tip near it).
  await evaluate("document.querySelector('#following').scrollTop += 40"); await pause(100);
  assert.equal(await evaluate<string | null>(TIP), long, "another box scrolling, one following its output, leaves it");
  await evaluate("document.querySelector('#box').scrollTop += 1"); await pause(100);
  assert.equal(await evaluate<string | null>(TIP), null, "a scroll that moves the name puts it away");
  await hover("#name");
  assert.equal(await evaluate<string | null>(TIP), long);
  await hover("#path");
  assert.equal(await evaluate<string | null>(TIP), "/某个/很深的/目录/里面/的/文件.md", "a second cut text in the row is the one under the pointer");
  await hover("#act");
  assert.equal(await evaluate<string | null>(TIP), long, "a button in a row whose name is cut shows the row's name");
  await hover("#card");
  assert.equal(await evaluate<string | null>(TIP), summary, "a clamped summary is shown whole");
  await hover("#whole");
  assert.equal(await evaluate<string | null>(TIP), null, "a text that fits gets no tooltip");
  assert.equal(await evaluate("document.querySelector('#name').getAttribute('title')"), "旧提示", "the title comes back when the tooltip goes");

  await command("Input.dispatchMouseEvent", { type: "mouseMoved", x: 600, y: 700 }, sessionId);
  await evaluate("document.querySelector('#act').focus()");
  await key("Tab", 9, 8);
  await pause(200);
  assert.equal(await evaluate("document.activeElement.id"), "row");
  assert.equal(await evaluate<string | null>(TIP), long, "keyboard focus shows it at once");
  await key("Escape", 27);
  assert.equal(await evaluate<string | null>(TIP), null, "Escape puts it away");

  // A finger, through the browser's own gesture pipeline (a long press is a tap held down). A tab another browser job put
  // behind it runs no frames.
  await command("Page.bringToFront", {}, sessionId);
  const finger = await centre("#path");
  const tap = (duration: number) => command("Input.synthesizeTapGesture", { ...finger, duration, tapCount: 1, gestureSourceType: "touch" }, sessionId, 10_000);
  await tap(80);
  await pause(300);
  assert.equal(await evaluate<string | null>(TIP), null, "a tap is not a hold");
  await tap(700);
  await pause(300);
  assert.equal(await evaluate<string | null>(TIP), "/某个/很深的/目录/里面/的/文件.md", "a press and hold shows the cut text under the finger, and it stays a moment after the finger lifts");
  await pause(1600);
  assert.equal(await evaluate<string | null>(TIP), null, "and then goes");
  await command("Input.synthesizeScrollGesture", { ...finger, yDistance: -60, speed: 120, gestureSourceType: "touch" }, sessionId, 10_000);
  await pause(300);
  assert.equal(await evaluate<string | null>(TIP), null, "a finger that moves is scrolling, not holding");
});
