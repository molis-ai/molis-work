/** Disclosure height (specs/visual-ui-experience §disclosure-segmented, VUX-22). A collapsible opens to its natural height:
 * the details content is a one-row grid that goes 0fr → 1fr and clips, its body is the row (min-height 0, clipped) with its
 * bottom space fixed inside it, so only the row moves (no padding is animated), no max-height is guessed, a body that grows while open just grows, and a reversal midway
 * continues from the height it reached. The chevron turns on the same `[open]`. Closed, the body is skipped and cannot take
 * focus. Without `::details-content` (older engines) it opens at once, as before. Another disclosure whose details hold one
 * body opens the same way through `disclosureHeight(details, body)`. */
export const disclosureHeight = (details: string, body: string) => `${details}::details-content{display:grid;grid-template-rows:0fr;overflow:clip;transition:grid-template-rows var(--dur-move) var(--ease-quint),content-visibility var(--dur-move) allow-discrete}${details}[open]::details-content{grid-template-rows:1fr}${body}{min-height:0;overflow:clip}@media (prefers-reduced-motion:reduce){${details}::details-content,${details}>*{transition:none}}`;
/** A round's process (VUX-13): a quiet line per run of steps (`group`, its steps in one `groupBody`) that opens to each step,
 * and a step with something behind it (`step`, its detail in `stepBody`) that opens from its own line. One grammar wherever a
 * process is shown (the Assistant's, the Coding timeline): the group's chevron before its words and a step's after them, both
 * turning on `[open]`, 12px meta type at the Assistant thread's 1.6 line height, 2px between rows, the shared hover and focus ring, and both opening to their natural height
 * (`disclosureHeight`), at once under reduced motion. Selectors are given within `scope` (a descendant prefix, or ""). */
export const processFold = (scope: string, { group, groupBody, step, stepBody }: { group: string; groupBody: string; step: string; stepBody: string }) => {
  const g = `${scope} ${group}`, s = `${scope} ${step}`, both = `${scope} :is(${group},${step})`;
  return `${disclosureHeight(both, `${scope} :is(${groupBody},${stepBody})`)}${g}{font-size:12px;line-height:1.6;color:var(--muted)}${both}>summary{width:fit-content;max-width:100%;margin-left:-4px;border-radius:6px;list-style:none;cursor:pointer}${both}>summary::-webkit-details-marker{display:none}${g}>summary{padding:2px 4px}${s}>summary{padding:0 4px}${g}>summary::before,${s}>summary::after{content:"›";flex:none;transition:transform var(--dur-hover) var(--ease-quint)}${g}>summary::before{display:inline-block;width:12px}${g}[open]>summary::before,${s}[open]>summary::after{transform:rotate(90deg)}${both}>summary:hover{background:var(--nav-hover)}${g}>summary:hover{color:var(--ink-soft)}${both}>summary:focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,-1px)}${g}[data-state="failed"]>summary{color:var(--danger)}${g}[data-state="unknown"]>summary{color:var(--tone-attention)}${scope} ${groupBody}>*{padding:2px 0 0 12px}`;
};
