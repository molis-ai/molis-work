/**
 * A drop zone's feedback (specs/visual-ui-experience §composer-mentions「附件形态与接收区」, VUX-18): `window.molisDropZone(zone,
 * mark, accepts)` keeps `mark(true)` while a drag the zone accepts is over it, and calls `mark(false)` once it really leaves.
 * One program per document follows the element the drag last entered. Moving between two elements enters the new one before
 * it leaves the old, so a leave from the element last entered is a leave from everything: the drag went out of the window
 * or Escape cancelled it. Crossing a child inside the zone does not flicker, and nothing needs `relatedTarget`, which
 * WebKit leaves empty on drag events. A drop, the end of a drag started here, and the window losing focus clear it too.
 * A zone is an element, or a selector for zones a page draws again (matched against where the drag is; registering the same
 * selector again replaces it). Zones given the same `mark` are one place (a plugin's directory and its page): it stays on
 * while the drag is in either.
 * The zone still takes the drop itself (`dragover` and `drop`); this only says where it is.
 */
import type { DropMark as Mark } from "../drop-zone.js";

const zones = new Map<Element | string, { mark: Mark; accepts: (types: readonly string[]) => boolean }>();
const shown = new Map<Mark, boolean>();
let entered: EventTarget | null = null;

const paint = (target: EventTarget | null, types: readonly string[]) => {
  const next = new Map<Mark, boolean>();
  for (const [zone, { mark, accepts }] of zones) {
    if (typeof zone !== "string" && !zone.isConnected) { zones.delete(zone); continue; }
    const over = typeof zone === "string" ? target instanceof Element && !!target.closest(zone) : target instanceof Node && zone.contains(target);
    next.set(mark, next.get(mark) || (over && accepts(types)));
  }
  for (const [mark, on] of shown) if (!next.has(mark)) { shown.delete(mark); if (on) mark(false); }
  for (const [mark, on] of next) { if ((shown.get(mark) ?? false) !== on) mark(on); shown.set(mark, on); }
};
const clear = () => { entered = null; paint(null, []); };

addEventListener("dragenter", (event) => { entered = event.target; paint(entered, [...(event.dataTransfer?.types ?? [])]); }, true);
addEventListener("dragleave", (event) => { if (event.target === entered) clear(); }, true);
for (const type of ["drop", "dragend"]) addEventListener(type, clear, true);
// Not caught on the way down: that would be every field's blur. The window's own blur reaches it as it happens.
addEventListener("blur", clear);

window.molisDropZone ??= (zone, mark, accepts = (types) => types.includes("Files")) => { zones.set(zone, { mark, accepts }); };
