/**
 * Where one axis of the image goes (specs/visual-ui-experience §media-affine): about the point looked at p, from the
 * translation t at scale `from` to `to`, t′ = p − (p − t)·(to / from); then held inside the viewport, an image smaller than
 * the viewport on this axis centred on it, a larger one never leaving a gap at either edge.
 */
export function mediaAxis(p: number, t: number, from: number, to: number, natural: number, view: number): number {
  const next = p - (p - t) * (to / from), content = natural * to;
  return content <= view ? (view - content) / 2 : Math.min(0, Math.max(view - content, next));
}

/**
 * The viewport clips; the image is placed by one transform from its top-left corner. A settle (a button, a double click, a
 * key) eases on the move token; following a finger or a wheel never eases. Reduced motion only jumps.
 */
export const MEDIA_ZOOM_STYLES = `.mw-media-zoom{position:relative;overflow:hidden;touch-action:none;cursor:zoom-in}.mw-media-zoom[data-zoom=zoomed]{cursor:grab}.mw-media-zoom.is-dragging{cursor:grabbing}.mw-media-zoom>img{position:absolute;left:0;top:0;max-width:none;max-height:none;transform-origin:0 0;user-select:none}.mw-media-zoom.is-settling>img{transition:transform var(--dur-move) var(--ease-quint)}@media (prefers-reduced-motion:reduce){.mw-media-zoom.is-settling>img{transition:none}}`;
