import type { FollowState as State, ScrollFollower as Follower } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import { FOLLOW_COOLDOWN_MS, FOLLOW_INPUT_WINDOW_MS, FOLLOW_NEAR_PX, followDistance } from "../scroll-follow.js";

/**
 * One owner for a growing conversation's scroll (specs/visual-ui-experience §scroll-ownership, VUX-26):
 * `window.molisFollow(scroller, { onChange })` keeps an explicit `following | detached` state on `data-follow`. The same
 * element always gets the same owner, so another script on the page (restoring a place) talks to the one that follows;
 * only the first caller's `onChange` is kept, a later caller's is not called.
 *
 * - Only the person changes it by scrolling: wheel or keys towards the start, a touch or scrollbar drag that leaves the
 *   end, or selecting text inside detach it; coming back to the end themselves follows again. A scroll the page made
 *   (a pin, a card re-rendering, content shrinking, the trip back to latest) is never read as theirs.
 * - The page says so in words: `toLatest()` after "new messages" or an explicit send (the one smooth scroll), `resume()`
 *   when a fresh conversation opens (the next pin lands), `restore(top)` when it puts back a saved place (judged by where
 *   that is), `release()` before it scrolls to something to look at.
 * - `pin()` puts the end in view at most once a frame, directly, and not within 150ms of the person's input.
 * - While following, the browser's own scroll anchoring is off (the pin owns that shift); while detached it is on, so an
 *   image decoding or a block opening above keeps the paragraph being read where it is. One mechanism per shift.
 * - `dispose()` lets go of every listener, observer and frame, for a view that unmounts.
 */

const owners = new WeakMap<HTMLElement, Follower>();
const FOLLOWING = "following", DETACHED = "detached";

function molisFollow(scroller: HTMLElement, options: { onChange?: (state: State) => void } = {}): Follower {
  const known = owners.get(scroller);
  if (known) return known;
  let state: State = followDistance(scroller) <= FOLLOW_NEAR_PX ? FOLLOWING : DETACHED;
  let lastInput = -Infinity, frame = 0, holding = false, before = followDistance(scroller), top = scroller.scrollTop;
  scroller.dataset.follow = state;
  const set = (next: State) => {
    if (state === next) return;
    state = next;
    scroller.dataset.follow = next;
    options.onChange?.(next);
  };
  const input = () => { lastInput = performance.now(); };
  const leave = () => { input(); set(DETACHED); };
  const listening = new AbortController(), signal = listening.signal, passive = { passive: true, signal };

  scroller.addEventListener("wheel", (event) => { if (event.deltaY < 0) leave(); else input(); }, passive);
  scroller.addEventListener("touchmove", input, passive);
  // A press on the scroller itself is its scrollbar: the drag is the person's for as long as it lasts.
  scroller.addEventListener("pointerdown", (event) => { if (event.target === scroller) { holding = true; input(); } }, { signal });
  addEventListener("pointerup", () => { holding = false; }, { capture: true, signal });
  scroller.addEventListener("keydown", (event) => {
    if (["PageUp", "ArrowUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) leave();
    else if (["PageDown", "ArrowDown", "End", " "].includes(event.key)) input();
  }, { signal });
  document.addEventListener("selectionchange", () => {
    const selection = getSelection();
    if (selection && !selection.isCollapsed && selection.anchorNode && scroller.contains(selection.anchorNode)) leave();
  }, { signal });
  // Under the person's input, reaching the end follows and moving away from it (a touch or scrollbar drag upwards) detaches;
  // moving towards the end, as on the way back to latest, changes nothing until it gets there. Away means upwards: content
  // growing while the person scrolls down also leaves the end further away, and that is not them leaving.
  scroller.addEventListener("scroll", () => {
    const distance = followDistance(scroller), theirs = holding || performance.now() - lastInput <= FOLLOW_INPUT_WINDOW_MS;
    if (theirs && distance <= FOLLOW_NEAR_PX) set(FOLLOWING);
    else if (theirs && distance > before + 1 && scroller.scrollTop < top) set(DETACHED);
    before = distance; top = scroller.scrollTop;
  }, passive);

  const follower: Follower = {
    get state() { return state; },
    pin() {
      if (state !== FOLLOWING || frame) return;
      const land = () => {
        frame = 0;
        if (state !== FOLLOWING) return;
        if (holding || performance.now() - lastInput < FOLLOW_COOLDOWN_MS) frame = requestAnimationFrame(land);
        else scroller.scrollTop = scroller.scrollHeight;
      };
      frame = requestAnimationFrame(land);
    },
    toLatest() {
      follower.resume();
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: still ? "auto" : "smooth" });
    },
    resume() { lastInput = -Infinity; set(FOLLOWING); },
    restore(place) { scroller.scrollTop = place; before = followDistance(scroller); top = scroller.scrollTop; set(before <= FOLLOW_NEAR_PX ? FOLLOWING : DETACHED); },
    release() { set(DETACHED); },
    dispose() {
      listening.abort(); resizing.disconnect(); cancelAnimationFrame(frame);
      owners.delete(scroller); delete scroller.dataset.follow;
    },
  };
  // The input growing or the window changing size moves the end; following, the last line stays in view.
  const resizing = new ResizeObserver(() => follower.pin());
  resizing.observe(scroller);
  owners.set(scroller, follower);
  return follower;
}

window.molisFollow ??= molisFollow;
