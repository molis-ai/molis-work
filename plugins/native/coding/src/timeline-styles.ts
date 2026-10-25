import { processFold } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Rows of the conversation timeline: tool output, the words on a refused call, what a turn wrote. Part of CODING_STYLES.
 * A round's group and each step fold like the Assistant's process (VUX-13): the same `processFold`, not a copy. */
export const CODING_TIMELINE_STYLES = `
${processFold("", { group: ".coding-activity", groupBody: ".coding-tool-list", step: ".coding-tool", stepBody: ".coding-tool-body" })}
.coding-tool[data-kind=reasoning] .coding-tool-output { font-family:inherit; font-size:13px; line-height:1.7; white-space:pre-wrap; color:var(--muted); background:none; border:0; border-left:2px solid var(--line); border-radius:0; padding:4px 0 4px 12px; max-height:360px; }
.coding-tool-output { margin:4px 0 8px 19px; max-height:280px; overflow:auto; padding:8px 12px; border-radius:8px; background:var(--rail); color:var(--ink); font-size:12px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
.coding-turn-changes { margin:4px 0; }
.coding-turn-changes > details > summary { display:flex; align-items:center; gap:8px; min-height:30px; cursor:pointer; list-style:none; color:var(--ink); font-size:13px; }
.coding-turn-changes > details > summary::-webkit-details-marker { display:none; }
.coding-turn-changes-files { margin:4px 0 0 32px; padding:0; list-style:none; display:grid; gap:4px; }
.coding-turn-changes-files li { display:flex; align-items:center; gap:8px; min-height:28px; }
.coding-turn-changes-files code { font-size:12px; overflow-wrap:anywhere; }
.coding-turn-changes-files small { color:var(--muted); font-size:12px; }
.coding-turn-changes-files .mw-btn { margin-left:auto; }
.coding-turn-changes-note { margin:4px 0 4px 32px; color:var(--muted); font-size:12px; }
.coding-turn-changes > details > .mw-btn { margin-left:32px; }
.coding-tool-hint { margin:4px 0 0 19px; color:var(--ink); font-size:13px; line-height:1.6; }
`;
