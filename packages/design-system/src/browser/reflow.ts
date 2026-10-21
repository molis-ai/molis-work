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

window.molisReflow ??= (list, change) => {
  if (still() || !list.isConnected) { change(); return; }
  // Seen now, with any move still under way.
  const seen = new Map([...list.children].map((child) => [child, child.getBoundingClientRect()]));
  change();
  const kids = [...list.children] as HTMLElement[];
  for (const child of kids) for (const motion of child.getAnimations()) if (motion.id === ID) motion.cancel();
  const duration = parseFloat(token("--dur-move", "250ms")) || 250, easing = token("--ease-quint", "cubic-bezier(.22, 1, .36, 1)");
  for (const child of kids) {
    const was = seen.get(child), now = child.getBoundingClientRect();
    const frames = !was ? [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }]
      : was.left !== now.left || was.top !== now.top ? [{ transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)` }, { transform: "none" }] : null;
    if (frames) child.animate(frames, { duration, easing, id: ID });
  }
};
