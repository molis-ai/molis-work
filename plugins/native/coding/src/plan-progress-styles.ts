export const CODING_PLAN_PROGRESS_STYLES = `/* Running plan: the round's own step graph under the task, with the person's controls while it runs. */
.coding-plan-progress { max-width:76ch; margin:0 auto 24px; padding:12px 16px; border:1px solid var(--line); border-radius:12px; background:var(--paper); font-size:13px; animation:craft-rise var(--dur-move) var(--ease-quint); }
.coding-plan-head { display:flex; align-items:center; gap:8px; margin-bottom:8px; color:var(--ink); }
.coding-plan-head svg { width:14px; height:14px; color:var(--muted); flex:none; }
.coding-plan-head strong { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
.coding-plan-count { flex:none; font-size:12px; color:var(--muted); font-variant-numeric:tabular-nums; }
.coding-plan-revision { flex:none; font-size:11px; color:var(--faint); }
/* The plan card in the conversation uses the TaskBoard's rows, without the progress column. */
.coding-plan-steps { margin:4px 0 0; }
.coding-board--compact .coding-board-entry { grid-template-columns:minmax(0,1fr) 7.5rem 7rem auto; padding:0 8px; }
.coding-plan-step[data-state=running] .coding-board-node strong { font-weight:500; }
.coding-plan-step:is([data-state=skipped],[data-state=cancelled]) .coding-board-node strong { color:var(--faint); text-decoration:line-through; }
.coding-plan-step[data-inserted=true] .coding-board-node strong::after { content:attr(data-inserted-label); margin-left:8px; padding:0 8px; border-radius:999px; background:color-mix(in srgb,var(--blue) 12%,transparent); color:var(--blue); font-size:11px; text-decoration:none; }
.coding-plan-offer { display:flex; align-items:center; gap:8px; margin:4px 0; padding:4px 8px; border:1px dashed var(--line); border-radius:8px; }
.coding-plan-form { display:grid; gap:8px; margin:4px 0 8px 32px; padding:8px; border:1px solid var(--line); border-radius:8px; }
.coding-plan-form .mw-input { height:30px; font-size:13px; }
.coding-plan-form-actions { display:flex; justify-content:flex-end; gap:8px; }
.coding-plan-form-actions .mw-btn { height:26px; min-height:26px; font-size:12px; }
.coding-plan-foot { margin:8px 0 0; font-size:12px; color:var(--faint); }`;
