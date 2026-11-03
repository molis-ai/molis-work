import { processFold } from "@molis-ai/molis-work-plugin-sdk/ui";

/** The resident Assistant lives in the workbench bar (as in craft-finish.ts). */
const A = "body.immersive-workbench:not([data-pane-embedded])";

/**
 * What a round did between two messages (VUX-13, the page's `assistant-process.ts`): one quiet line per run of steps that
 * opens to each step; a step with something technical behind it (the capability it called, what came back) opens from its
 * own line, its chevron after the words and its detail under the words. The folds are the shared process grammar (`processFold`,
 * disclosure.ts), which the Coding timeline draws with too.
 */
export const ASSISTANT_PROCESS_STYLES = `
${processFold(A, { group: ".assistant-steps", groupBody: ".assistant-steps-body", step: ".assistant-activity-fold", stepBody: ".assistant-activity-detail" })}
${A} .assistant-activity-detail{display:grid;gap:2px;margin:2px 0 4px 19px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}
${A} .assistant-activity-detail>p{margin:0}
${A} .assistant-activity-label{margin-right:6px;color:var(--ink-soft)}
${A} .assistant-activity-raw>summary{width:fit-content;cursor:pointer;color:var(--ink-soft)}
${A} .assistant-activity-raw>p{margin:2px 0 0}
`;
