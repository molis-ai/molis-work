import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { OVERLAY_AFTER, OVERLAY_BEFORE, OVERLAY_OPEN, OVERLAY_TRIGGERS, type OverlayLayer, type OverlayTrigger } from "./fixtures/overlay-audit.js";

// specs/visual-ui-experience §adaptive-focus (VUX-29): a layer opened from the board, the project page or a plugin stays
// inside the screen at a desktop and a phone width, grows from the side it opened on, and Escape closes it and gives focus
// back to what opened it. A floating <details> closes the shared way (packages/design-system/src/browser/floating-details.ts).

const PLUGINS = ["todo", "pages", "coding", "ppt", "workflows", "feed", "goals", "issues", "im", "shelf", "lingguang", "form"];
const pause = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

test("VUX-29: layers opened on the board, the project page and every plugin stay on screen, grow from their side and give focus back on Escape", { timeout: 1_800_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const escape = async () => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }, sessionId);
    await pause();
  };
  const open = async (path: string) => {
    await navigate(() => command("Page.navigate", { url: origin + path }, sessionId));
    // A hidden tab runs no frames; another browser job on the machine can put this one behind it.
    await command("Page.bringToFront", {}, sessionId);
    await waitFor("document.readyState === 'complete'", 20_000);
    await pause(1500);
    return evaluate<OverlayTrigger[]>(OVERLAY_TRIGGERS);
  };
  const surfaces: [string, string][] = [["组件板", "/__ui/catalog"], ["项目页", `/projects/${projectId}/`],
    ...PLUGINS.map((id): [string, string] => [id, `/projects/${projectId}/?openPlugin=${id}`])];
  const found: string[] = [];
  let opened = 0;
  for (const width of [1280, 390]) {
    // The shell's own triggers (the dock, the tab strip) are the same on every surface: each is tried once per width.
    const seen = new Set<string>();
    await command("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
    for (const [name, path] of surfaces) {
      const triggers = await open(path);
      const url = await evaluate<string>("location.href");
      for (const trigger of triggers) {
        if (seen.has(`${trigger.name} ${trigger.kind}`)) continue;
        seen.add(`${trigger.name} ${trigger.kind}`);
        const label = `${width} ${name} "${trigger.name}"`;
        const point = await evaluate<{ x: number; y: number } | null>(`(() => { const el = document.querySelector('[data-ov-trigger="${trigger.index}"]');
          if (!el || !el.getClientRects().length) return null; document.querySelectorAll('[data-ov-active]').forEach(n => n.removeAttribute('data-ov-active'));
          el.dataset.ovActive = ''; el.scrollIntoView({ block: 'nearest', behavior: 'instant' }); const box = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)) ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null; })()`);
        if (!point) continue;
        await evaluate(OVERLAY_BEFORE);
        for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, sessionId);
        await pause();
        const layer = await evaluate<OverlayLayer | null>(OVERLAY_OPEN);
        if (layer) {
          opened++;
          const out = Math.min(layer.left, layer.top, layer.right, layer.bottom);
          if (out < 0) found.push(`${label}: ${layer.tag} is ${-out}px off screen`);
          if (layer.animated && ((layer.side === "above" && layer.originY < 0.5) || (layer.side === "below" && layer.originY > 0.5))) found.push(`${label}: ${layer.tag} opens ${layer.side} but grows from y ${layer.originY}`);
          if (trigger.kind === "details" && !await evaluate<boolean>("document.querySelector('[data-ov-active]').parentElement.hasAttribute('data-layer-open')")) found.push(`${label}: an open floating details is not marked as a layer`);
          await escape();
          const after = await evaluate<{ open: boolean; back: boolean; on: string }>(OVERLAY_AFTER);
          if (after.open) found.push(`${label}: Escape left ${layer.tag} open`);
          else if (!after.back) found.push(`${label}: focus went to ${after.on}`);
        }
        if (await evaluate<string>("location.href") !== url) await open(path);
        else if ((await evaluate<{ open: boolean }>(OVERLAY_AFTER)).open) await escape();
      }
    }
  }
  assert.ok(opened >= 15, `the audit reached the layers (${opened})`);
  assert.deepEqual(found, []);
});

test("VUX-29: a floating details closes on Escape (innermost only, focus to its summary) and on a press outside; one in the flow is left alone", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const press = async (key: string, code: number) => {
    for (const type of ["rawKeyDown", "keyUp"] as const) await command("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code }, sessionId);
    await pause(100);
  };
  const state = () => evaluate<[boolean, boolean, boolean, string, boolean]>("['#outer', '#inner', '#flow'].map(id => document.querySelector(id).open).concat([document.activeElement?.id ?? '', document.querySelector('#outer').hasAttribute('data-layer-open')])");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.readyState === 'complete'", 20_000);
  await evaluate(`(() => { const box = document.createElement('div'); box.id = 'box';
    box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:white;padding:40px';
    box.innerHTML = '<details id="outer" style="position:relative"><summary id="s1">外</summary><div style="position:absolute;top:100%;left:0;width:240px;padding:8px;background:#eee">'
      + '<details id="inner" style="position:relative"><summary id="s2">内</summary><div style="position:absolute;left:100%;top:0;width:160px;background:#ddd"><button id="deep">深</button></div></details></div></details>'
      + '<details id="flow"><summary id="s3">流</summary><p>在流里展开</p></details><button id="far" style="margin-top:300px">别处</button>';
    document.body.append(box); })()`);
  await evaluate("document.querySelector('#outer').open = true; document.querySelector('#inner').open = true; document.querySelector('#flow').open = true");
  await pause(100);
  await evaluate("document.querySelector('#deep').focus()");
  assert.deepEqual(await state(), [true, true, true, "deep", true], "an open floating details is marked as a layer");
  await press("Escape", 27);
  assert.deepEqual(await state(), [true, false, true, "s2", true], "Escape closes the innermost, focus on its summary");
  await press("Escape", 27);
  assert.deepEqual(await state(), [false, false, true, "s1", false], "the next Escape closes the outer one");
  await evaluate("document.querySelector('#outer').open = true");
  await pause(100);
  const far = await evaluate<{ x: number; y: number }>("(() => { const box = document.querySelector('#far').getBoundingClientRect(); return { x: box.x + 4, y: box.y + 4 }; })()");
  for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...far, button: "left", clickCount: 1 }, sessionId);
  await pause(100);
  const [outer, , flow] = await state();
  assert.equal(outer, false, "a press outside closes the floating one");
  assert.equal(flow, true, "a details in the page's flow is not a layer");
  // A field written in with an input method keeps its Escape.
  await evaluate("document.querySelector('#outer').open = true; const field = document.createElement('input'); field.id = 'ime'; document.querySelector('#outer > div').append(field); field.focus()");
  await pause(100);
  await evaluate("document.querySelector('#ime').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }))");
  assert.equal(await evaluate("document.querySelector('#outer').open"), true);
});
