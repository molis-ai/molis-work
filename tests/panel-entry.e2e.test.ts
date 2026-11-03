import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-25 (the engineering part of [人工]): a panel comes and goes from the edge or the control it
// belongs to, and opening it does not take the page. With motion on, every panel toggle on the project page (the
// Assistant, its works drawer and list, the side column and the plugins opened into it) is pressed at 1440, 1024 and 820;
// each animation that starts on a panel-sized box (200 px wide, a third of the screen tall) is read at its first frame:
// a panel against its container's left edge starts left of where it rests, one against the right edge right of it, one
// against the bottom below it — never from the far side. The menus that grow from their trigger are read by
// tests/overlay-placement. At 1440 and 1024, an open side panel leaves the plugin's own page at least half the width.

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TOGGLES = "[data-assistant-toggle], [data-assistant-side-toggle], [data-assistant-works-toggle], [data-side-toggle], [data-side-plugin-open]";

/** Records the first frame of every animation that starts from now on. */
const RECORD = String.raw`(() => { window.__entries = [];
  document.addEventListener('animationstart', (event) => { const el = event.target; if (!(el instanceof HTMLElement)) return;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform);
    window.__entries.push({ el, name: event.animationName, tx: m.m41, ty: m.m42 }); }, true); })()`;

/** The panels among the recorded entries, once they rest, against the edge of the box they sit in. */
const READ = String.raw`(() => {
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = [], entries = window.__entries.splice(0);
  for (const { el, name: animation, tx, ty } of entries) {
    if (!el.isConnected || !el.checkVisibility()) continue;
    const r = el.getBoundingClientRect(); if (r.width < 200 || r.height < innerHeight / 3) continue;
    let box = el.parentElement; while (box && box !== document.body && box.getBoundingClientRect().width <= r.width + 1 && box.getBoundingClientRect().height <= r.height + 1) box = box.parentElement;
    const p = (box || document.body).getBoundingClientRect();
    const left = r.left - p.left < 4, right = p.right - r.right < 4, bottom = p.bottom - r.bottom < 4, top = r.top - p.top < 4;
    const wrong = (left && !right && tx > 1) || (right && !left && tx < -1) || (bottom && !top && ty < -1) || (top && !bottom && ty > 1);
    out.push({ at: name(el), animation, tx: Math.round(tx), ty: Math.round(ty), edge: [left && 'left', right && 'right', top && 'top', bottom && 'bottom'].filter(Boolean).join('+') || 'none', wrong });
  }
  return out; })()`;

test("VUX-25: panels enter from their edge, and a side panel leaves the page its width", { timeout: 600_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return;
  const { evaluate, waitFor, command, sessionId, navigate, origin, projectId } = browser;
  const found: string[] = [];
  let panels = 0;
  for (const width of [1440, 1024, 820]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
    for (const plugin of ["goals", "todo", "pages"]) {
      await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=${plugin}` }, sessionId));
      await command("Page.bringToFront", {}, sessionId);
      await waitFor("document.readyState === 'complete'", 20_000);
      await pause(1200);
      await evaluate(RECORD);
      // Each toggle on screen, pressed open and then shut, the new ones a press reveals too.
      const pressed = new Set<string>();
      for (let round = 0; round < 3; round++) {
        const keys = await evaluate<string[]>(`[...document.querySelectorAll(${JSON.stringify(TOGGLES)})].filter((el) => el.checkVisibility() && !el.matches(':disabled'))
          .map((el, i) => { const key = [...el.attributes].filter((a) => a.name.startsWith('data-')).map((a) => a.name + '=' + a.value).sort().join(' ') + '|' + (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
            el.dataset.peKey = key; return key; })`);
        const fresh = [...new Set(keys)].filter((key) => !pressed.has(key));
        if (!fresh.length) break;
        for (const key of fresh) {
          pressed.add(key);
          const point = await evaluate<{ x: number; y: number } | null>(`(() => { const el = [...document.querySelectorAll('[data-pe-key]')].find((n) => n.dataset.peKey === ${JSON.stringify(key)});
            if (!el || !el.checkVisibility()) return null; const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
            return el.contains(document.elementFromPoint(x, y)) ? { x, y } : null; })()`);
          if (!point) continue;
          for (const type of ["mousePressed", "mouseReleased"] as const) await command("Input.dispatchMouseEvent", { type, ...point, button: "left", clickCount: 1 }, sessionId);
          await pause(900);
          for (const entry of await evaluate<Array<Record<string, unknown>>>(READ)) {
            panels++;
            if (entry.wrong) found.push(`${width} ${plugin} 「${key}」: ${JSON.stringify(entry)}`);
          }
          if (width >= 1024) {
            const room = await evaluate<{ stage: number; side: number } | null>(`(() => { const stage = document.querySelector('[data-plugin-stage]'), side = [...document.querySelectorAll('.side-panel, [data-side-panel], .assistant-panel')].find((n) => n.checkVisibility());
              return stage && side && stage.checkVisibility() ? { stage: Math.round(stage.getBoundingClientRect().width), side: Math.round(side.getBoundingClientRect().width) } : null; })()`);
            if (room && room.stage < width / 2 && room.side > 0) found.push(`${width} ${plugin} 「${key}」: the page is left ${room.stage} px beside a ${room.side} px panel`);
          }
        }
      }
    }
  }
  t.diagnostic(`panel entries read: ${panels}`);
  assert.ok(panels >= 10, `panels were opened and read (${panels})`);
  assert.deepEqual(found, [], "a panel enters from the far side, or takes the page");
});
