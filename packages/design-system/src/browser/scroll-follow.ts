import { FOLLOW_COOLDOWN_MS, FOLLOW_INPUT_WINDOW_MS, FOLLOW_NEAR_PX, followDistance } from "../scroll-follow.js";

/**
 * One owner for a growing conversation's scroll (specs/visual-ui-experience §scroll-ownership, VUX-26):
 * `window.molisFollow(scroller, { onChange })` keeps an explicit `following | detached` state on `data-follow`.
 *
 * - The person detaches it: wheel or keys towards the start, a touch or scrollbar drag that leaves the end, or selecting
 *   text inside. A scroll the page made is never read as theirs: one that leaves the reader away from the end (a restored
 *   place) detaches it, one that ends at the end (pinning, content shrinking) changes nothing.
 * - It follows again only when the person comes back to the end themselves, or the page says so (`toLatest()` after
 *   "new messages" or an explicit send). The cooldown only keeps a pin from landing in the middle of a gesture.
 * - `pin()` puts the end in view at most once a frame, directly; `toLatest()` is the one smooth scroll.
 * - While following, the browser's own scroll anchoring is off (the pin owns that shift); while detached it is on, so an
 *   image decoding or a block opening above keeps the paragraph being read where it is. One mechanism per shift.
 */
type State = "following" | "detached";
type Follower = { readonly state: State; pin(): void; toLatest(): void; release(): void };

function molisFollow(scroller: HTMLElement, options: { onChange?: (state: State) => void } = {}): Follower {
  let state: State = followDistance(scroller) <= FOLLOW_NEAR_PX ? "following" : "detached";
  let lastInput = -Infinity, frame = 0, holding = false, travelling = false;
  scroller.dataset.follow = state;
  const set = (next: State) => {
    if (state === next) return;
    state = next;
    scroller.dataset.follow = next;
    options.onChange?.(next);
  };
  const input = () => { lastInput = performance.now(); };
  const leave = () => { input(); set("detached"); };

  scroller.addEventListener("wheel", (event) => { if (event.deltaY < 0) leave(); else input(); }, { passive: true });
  scroller.addEventListener("touchmove", input, { passive: true });
  // A press on the scroller itself is its scrollbar: the drag is the person's for as long as it lasts.
  scroller.addEventListener("pointerdown", (event) => { if (event.target === scroller) { holding = true; input(); } });
  addEventListener("pointerup", () => { holding = false; }, true);
  scroller.addEventListener("keydown", (event) => {
    if (["PageUp", "ArrowUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) leave();
    else if (["PageDown", "ArrowDown", "End", " "].includes(event.key)) input();
  });
  document.addEventListener("selectionchange", () => {
    const selection = getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && scroller.contains(selection.anchorNode)) leave();
  });
  // The person's scroll decides both ways. Any other scroll can only take following away: a pin, a shrink clamping at the end
  // and the trip back to latest all end at the end, so a scroll that stops elsewhere was the page putting the reader there.
  scroller.addEventListener("scroll", () => {
    const near = followDistance(scroller) <= FOLLOW_NEAR_PX;
    if (holding || performance.now() - lastInput <= FOLLOW_INPUT_WINDOW_MS) { travelling = false; set(near ? "following" : "detached"); }
    else if (travelling) travelling = !near;
    else if (!near) set("detached");
  }, { passive: true });

  const follower: Follower = {
    get state() { return state; },
    pin() {
      if (state !== "following" || frame) return;
      const land = () => {
        frame = 0;
        if (state !== "following") return;
        if (holding || performance.now() - lastInput < FOLLOW_COOLDOWN_MS) frame = requestAnimationFrame(land);
        else scroller.scrollTop = scroller.scrollHeight;
      };
      frame = requestAnimationFrame(land);
    },
    toLatest() {
      set("following");
      lastInput = -Infinity; travelling = followDistance(scroller) > FOLLOW_NEAR_PX;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: still ? "auto" : "smooth" });
    },
    release() { set("detached"); },
  };
  // The input growing or the window changing size moves the end; following, the last line stays in view.
  new ResizeObserver(() => follower.pin()).observe(scroller);
  return follower;
}

declare global { interface Window { molisFollow?: typeof molisFollow } }
window.molisFollow ??= molisFollow;
