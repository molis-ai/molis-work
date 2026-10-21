/** The resident Assistant lives in the workbench bar (as in craft-finish.ts). */
const A = "body.immersive-workbench:not([data-pane-embedded])";

/**
 * What a round did between two messages (VUX-13, the page's `assistant-process.ts`): one quiet line per run of steps that
 * opens to each step; a step with something technical behind it (the capability it called, what came back) opens from its
 * own line, its chevron after the words and its detail under the words.
 */
export const ASSISTANT_PROCESS_STYLES = `
${A} .assistant-steps{margin:0;font-size:12px;color:var(--muted)}
${A} :is(.assistant-steps,.assistant-activity-fold)>summary{width:fit-content;max-width:100%;margin-left:-4px;border-radius:6px;list-style:none;cursor:pointer}
${A} :is(.assistant-steps,.assistant-activity-fold)>summary::-webkit-details-marker{display:none}
${A} .assistant-steps>summary{padding:2px 4px}
${A} .assistant-activity-fold>summary{padding:0 4px}
${A} .assistant-steps>summary::before,${A} .assistant-activity-fold>summary::after{content:"›";flex:none;transition:transform var(--dur-hover) var(--ease-quint)}
${A} .assistant-steps>summary::before{display:inline-block;width:12px}
${A} .assistant-steps[open]>summary::before,${A} .assistant-activity-fold[open]>summary::after{transform:rotate(90deg)}
${A} :is(.assistant-steps,.assistant-activity-fold)>summary:hover{background:var(--nav-hover)}
${A} .assistant-steps>summary:hover{color:var(--ink-soft)}
${A} :is(.assistant-steps,.assistant-activity-fold)>summary:focus-visible{outline:var(--focus-stroke);outline-offset:var(--focus-stroke-inset,-1px)}
${A} .assistant-steps[data-state="failed"]>summary{color:var(--danger)}
${A} .assistant-steps>:is(.assistant-activity,.assistant-activity-fold){padding:2px 0 0 12px}
${A} .assistant-activity-detail{display:grid;gap:2px;margin:2px 0 4px 19px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
${A} .assistant-activity-detail>p{margin:0}
${A} .assistant-activity-label{margin-right:6px;color:var(--ink-soft)}
`;
