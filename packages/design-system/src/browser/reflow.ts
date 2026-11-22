/**
 * Neighbours make room and close up (specs/visual-ui-experience §drag-split「直接操纵与 FLIP」, §composer-mentions; VUX-16,
 * VUX-18, VUX-21): `window.molisReflow(list, change)` reads where each child of `list` is seen, runs `change`, and moves each
 * child that stayed from there to its new place with an inverted transform (First, Last, Invert, Play). A child that is new
 * grows in; one that went is gone at once and its neighbours close the gap. Children keep their elements, so focus and
 * selection stay. A change made while the last one is still moving starts from where things are seen, not where they were
 * going, so it never jumps or queues. Reduced motion (and still pages) only runs the change.
 */
import "../reflow.js";

const ID = "mw-reflow";
const still = () => document.documentElement.hasAttribute("data-craft-still") || matchMedia("(prefers-reduced-motion: reduce)").matches;
const token = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const parseDurationMs = (raw: string, fallback = 250): number => {
  const trimmed = raw.trim().toLowerCase();
  const value = parseFloat(trimmed);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return trimmed.endsWith("ms") ? value : trimmed.endsWith("s") ? value * 1000 : value;
};

const reflow = (list: Element, change: () => void) => {
  if (still() || !list.isConnected) {
    change();
    return;
  }
  const el = list as HTMLElement;
  const beforeHeight = el.getBoundingClientRect().height;
  // Seen now, with any move still under way.
  const seen = new Map([...list.children].map((child) => [child, child.getBoundingClientRect()]));
  change();
  const afterHeight = el.getBoundingClientRect().height;
  const kids = [...list.children] as HTMLElement[];
  for (const child of kids) {
    for (const motion of child.getAnimations()) {
      if (motion.id === ID) {
        motion.cancel();
      }
    }
  }
  const duration = parseDurationMs(token("--dur-move", "250ms"), 250);
  const easing = token("--ease-quint", "ease-out");
  if (Math.abs(afterHeight - beforeHeight) > 2 && beforeHeight > 0 && afterHeight > 0) {
    for (const motion of el.getAnimations()) {
      if (motion.id === `${ID}-box`) {
        motion.cancel();
      }
    }
    el.animate([{ height: `${beforeHeight}px` }, { height: `${afterHeight}px` }], {
      duration,
      easing,
      id: `${ID}-box`,
    });
  }
  for (const child of kids) {
    const was = seen.get(child);
    const now = child.getBoundingClientRect();
    const frames = !was
      ? [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }]
      : was.left !== now.left || was.top !== now.top
        ? [{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: "none" }]
        : null;
    if (frames) {
      child.animate(frames, { duration, easing, id: ID });
    }
  }
};

window.molisReflow ??= reflow;
window.molisListTransition ??= window.molisReflow;
