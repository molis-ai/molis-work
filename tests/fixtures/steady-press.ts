/**
 * A mouse press that a framed area's steady time must refuse, made provably inside that time.
 *
 * The steady time is `FRAMED_AREA_STEADY_MS` (500 ms) in `apps/workbench/src/browser/plugin-frame/framed-area.ts`. An area that was
 * just shown or just moved does not act on a press until it has held still that long. A test that waits for the area and then presses
 * spends a few browser round trips doing so, and on a loaded CI runner those can take longer than the steady time. The press then
 * legitimately counts, and the test reads that as the guard failing. That happened in the merge queue on 11-24 (ASC-68 C3-4,
 * TGA-03).
 *
 * The guard times a press from its pointerdown, as the browser stamped it, so the release may come later. This helper presses the
 * pointer down, then reads from the page when the area last moved and when the pointerdown landed:
 * - Within `INSIDE_MS` of the move, it releases on the control, so the guard has to refuse it.
 * - Later than that, it releases away from every area. The click then lands outside the area's surface, so nothing is pressed. The
 *   scene is set again and the press retried.
 */

interface Page {
  readonly sessionId?: string;
  command<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  evaluate<T = unknown>(expression: string): Promise<T>;
}

/** Well inside the 500 ms steady time, leaving room for a frame between the guard's measure and the page's own. */
const INSIDE_MS = 300;
/** A point away from every framed area, where a release clicks nothing. */
const AWAY = { x: 1, y: 1 };

/** In the page: note, for each surface matching `surface`, the last moment it moved or was shown (measured every frame). */
const watch = (surface: string) => `(() => {
  window.__steadyPress?.stop();
  const moved = new WeakMap(), boxes = new WeakMap();
  let frame = 0;
  const box = element => { const r = element.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const same = (a, b) => Boolean(a && b) && a.every((value, index) => Math.abs(value - b[index]) < .5);
  // What is there already is the starting place, not a move; an area that appears later moved when it is first seen.
  for (const element of document.querySelectorAll(${JSON.stringify(surface)})) boxes.set(element, box(element));
  const look = () => {
    for (const element of document.querySelectorAll(${JSON.stringify(surface)})) {
      const now = box(element);
      if (!same(now, boxes.get(element))) { boxes.set(element, now); moved.set(element, performance.now()); }
    }
    frame = requestAnimationFrame(look);
  };
  // Becoming not-ready is a move too, even when the box looks the same from here (the guard measured a move this frame did not show).
  const observer = new MutationObserver(records => { for (const record of records) {
    const element = record.target;
    if (element instanceof Element && element.matches(${JSON.stringify(surface)}) && element.hasAttribute("data-unready")) moved.set(element, performance.now());
  } });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-unready"] });
  look();
  window.__steadyPress = { moved, target: null, pressAt: null, stop() { cancelAnimationFrame(frame); observer.disconnect(); } };
  if (!window.__steadyPressListening) {
    window.__steadyPressListening = true;
    addEventListener("pointerdown", event => { if (event.isTrusted && window.__steadyPress && window.__steadyPress.pressAt === null) window.__steadyPress.pressAt = event.timeStamp; }, true);
  }
})()`;

/** In the page: once `locate` finds a control in a surface that is not ready yet, its centre (null after 20 s). */
const settlingControl = (surface: string, locate: string) => `new Promise(resolve => {
  const end = performance.now() + 20000;
  const look = () => {
    const control = (${locate}), area = control?.closest(${JSON.stringify(surface)});
    if (control && area?.hasAttribute("data-unready")) {
      window.__steadyPress.target = area;
      const box = control.getBoundingClientRect();
      resolve({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    } else if (performance.now() > end) resolve(null);
    else requestAnimationFrame(look);
  };
  look();
})`;

/** In the page: whether the pointerdown landed within `INSIDE_MS` of the pressed area's last move. */
const landedInside = `(() => {
  const state = window.__steadyPress, moved = state.target && state.moved.get(state.target);
  state.stop();
  return moved !== undefined && moved !== null && state.pressAt !== null && state.pressAt - moved < ${INSIDE_MS};
})()`;

/**
 * Sets `scene` (shows or moves the area) and presses the control `locate` finds in it while it has not held still. `locate` is a page
 * expression for the control element; `surface` selects the area surfaces (the element that carries `data-unready`). `scene` is told
 * the attempt (from 0), so a move can go somewhere new each time; `reset` undoes a scene before the next attempt.
 */
export async function pressWhileSettling(page: Page, options: {
  surface: string; locate: string; scene: (attempt: number) => Promise<void>; reset?: () => Promise<void>; attempts?: number;
}): Promise<void> {
  const attempts = options.attempts ?? 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await page.evaluate(watch(options.surface));
    await options.scene(attempt);
    const point = await page.evaluate<{ x: number; y: number } | null>(settlingControl(options.surface, options.locate));
    if (!point) throw new Error("the area never showed its control while settling");
    await page.command("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }, page.sessionId);
    const inside = await page.evaluate<boolean>(landedInside);
    await page.command("Input.dispatchMouseEvent", { type: "mouseReleased", ...(inside ? point : AWAY), button: "left", clickCount: 1 }, page.sessionId);
    if (inside) return;
    await options.reset?.();
  }
  throw new Error(`no press landed within ${INSIDE_MS} ms of the area moving in ${attempts} tries: the runner is too slow to prove the steady time`);
}
