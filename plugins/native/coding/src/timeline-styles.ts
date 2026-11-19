import { processFold } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Rows of the conversation timeline: tool output, the words on a refused call, what a turn wrote. Part of CODING_STYLES.
 * A round's group and each step fold like the Assistant's process (VUX-13): the same `processFold`, not a copy. */
export const CODING_TIMELINE_STYLES = `
${processFold("", { group: ".coding-activity", groupBody: ".coding-tool-list", step: ".coding-tool", stepBody: ".coding-tool-body" })}
.coding-tool[data-kind=reasoning] .coding-tool-output { font-family:inherit; font-size:13px; line-height:1.7; white-space:pre-wrap; color:var(--muted); background:none; border:0; border-left:2px solid var(--line); border-radius:0; padding:4px 0 4px 12px; max-height:360px; }
.coding-tool-output { margin:4px 0 8px 19px; max-height:280px; overflow:auto; padding:8px 12px; border-radius:8px; background:var(--rail); color:var(--ink); font-size:12px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
/* A round's pictures under the person's words (A3): thumbnails that open larger; a row that scrolls sideways when narrow. */
.coding-turn__pictures { display:flex; gap:8px; margin:8px 0 0; padding:0; list-style:none; overflow-x:auto; overscroll-behavior-x:contain; }
.coding-turn__picture { display:grid; place-items:center; width:120px; height:82px; padding:0; overflow:hidden; border:0; border-radius:var(--r-row); background:var(--wash); box-shadow:0 0 0 1px var(--line); color:var(--muted); font:inherit; font-size:12px; cursor:zoom-in; }
.coding-turn__picture img { width:100%; height:100%; object-fit:cover; }
.coding-turn__picture:hover { box-shadow:0 0 0 1px var(--line-strong); }
.coding-turn__picture:focus-visible { outline:var(--focus-stroke) solid var(--accent); outline-offset:2px; }
.coding-turn__picture:disabled { cursor:default; padding:6px; text-align:center; }
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
