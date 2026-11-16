import { type AttrValue, cx, escapeHtml, renderAttrs } from "./html.js";

/**
 * Where a layer of a "falls back to the layer above" setting stands: the one in use (`on`), one that is set but not in use (`under`:
 * covered by a nearer layer, or passed over when the setting falls past it to a farther one), an empty slot (`empty`) and a layer
 * that is set but switched off (`off`, struck through).
 */
export type MwSourceLayerState = "on" | "under" | "empty" | "off";

/** One layer of a source ladder: its name, the value it holds (or what it says when empty) and where it stands. */
export interface MwSourceLayer {
  readonly name: string;
  /**
   * What the layer holds, in words. Only the layer in use is announced as current; an empty or switched-off layer is drawn as such
   * but not announced, so its value must say it ("Not set", "… (turned off)").
   */
  readonly value: string;
  readonly state: MwSourceLayerState;
}

/**
 * The source ladder (docs/design/role-scope/README.md「组件板新增」): where a setting's value comes from, the layers from nearest
 * to farthest; the one in use is lifted, the ones it covers stay readable but quiet, empty layers are dashed slots and a switched-off
 * one is struck through. Any setting that falls back to a wider layer (roles, memory, runtimes, models) draws it the same way.
 */
export function renderSourceLadder(options: { label: string; layers: readonly MwSourceLayer[]; className?: string; attrs?: Record<string, AttrValue> }): string {
  const items = options.layers.map(layer => `<li class="mw-source-ladder__layer is-${layer.state}"${layer.state === "on" ? ' aria-current="true"' : ""}><span class="mw-source-ladder__name">${escapeHtml(layer.name)}</span><span class="mw-source-ladder__value">${escapeHtml(layer.value)}</span></li>`).join("");
  return `<ol class="${cx("mw-source-ladder", options.className)}" data-slot="source-ladder" aria-label="${escapeHtml(options.label)}"${renderAttrs(options.attrs)}>${items}</ol>`;
}
