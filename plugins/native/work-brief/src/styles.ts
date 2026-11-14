/** The brief page's style sheet; the client bundle carries it minified (tooling/minify-styles.mjs). Only the design system's semantic variables. */
export const WORK_BRIEF_STYLES = `
[data-work-brief=workbench] [hidden]{display:none!important}
.wb{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;padding:12px 16px 72px;background:var(--paper);color:var(--ink)}
.wb-muted{color:var(--muted);font-size:var(--type-body-size,13px);margin:4px 0}
`;
