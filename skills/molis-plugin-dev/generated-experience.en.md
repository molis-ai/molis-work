# Generated plugins: experience and visual standards

Lead design, whole-page UI and visual review use these standards. The person's explicit task and preferences come first. Molis controls, themes and the current capability catalog determine what can be implemented. Make their work easy enough that they want to keep using it.

## Design for the task

Decide whether the person mainly acts, reads or compares. In mixed work decide what matters now. Quiet notes come from room for text and rhythm; efficient task work from compact rows with nearby actions; clear financial comparisons from consistent units and comparable data. Renaming a heading does not justify reusing one layout for every task. Do not decorate to make designs look different.

Before freeze, the experience stage may reorganize draft parts and give `scenarios` with the task, concrete material and observable results. It does not change operations or permissions. Lead design uses this to bind the parts and write real acceptance: `journey` says where to start, act, see the result and continue or go back; `purpose` says which step a part serves. The first-time journey can start with creation without making the creation form dominate every populated visit. UI uses existing `summary` to identify main content, primary action, layout tradeoff and narrow order. Return only the current stage's requested JSON, no extra report, score or fields.

## Journey and states

- On first open, recognize core content and the next action. Empty states point to a real control. Do not make the person read a feature explanation or configure irrelevant options first.
- Put actions by their content: filters near the affected list, record actions at the record, results near the trigger. Avoid extra selection, disclosure and confirmation steps when an action can be direct; use the catalog's confirmation control for actually risky actions.
- Choose by frequency and input burden. One or two frequent fields can be inline; occasional multi-field edits can use Sheet; consider Dialog only when an interruption and focused judgment are needed. Neither spread every form across the first screen nor hide every form in an overlay.
- Finish each task clearly: saving shows the result; failure gives the reason and next action and preserves input; return restores the original content position. Use existing result, prefill and selection bindings. Explain a missing capability without promising unsupplied autosave, undo or navigation.
- Design necessary empty, loading, failure, success and long-content states. Host controls provide theme, focus, disabled and recovery behavior. The UI stage cannot add operations or change acceptance to fill a functional gap.

## Information and hierarchy

- Give space to what the person most needs: body, current task or comparison. Source, date and explanation are secondary. A visible primary action does not make its form the largest part. Risky and infrequent actions do not compete for attention.
- Use grouping, alignment, spacing and typography; tight within groups, open between them. Prefer a continuous work surface and add separators only where needed. Do not give every field, number or paragraph equal-weight cards. Density serves the task; empty space alone does not improve it.
- Reading needs the complete body, recognizable sections and comfortable line length; source does not dominate. A scanning list keeps fields needed to identify and decide, with internal IDs for bindings only. Compare with aligned rows/columns and common units. Use Table where justified and do not split prose into metric cards.
- A directory's summary helps find a record and its detail body helps read it; both on screen are not necessarily redundant. Remove repetition serving the same purpose in the same place. Choose a separate body or collection detail, not both. A summary is never a full body.
- Reuse Host controls, fonts, colors, corners, states and motion. Express character through layout and content, not a new font, gradient, shadow or icon system. Reading uses `measure: reading`; choose `density` for actions and `gap`/`ratio` for sections. Use the current vocabulary's exact values.

## Copy and responsive layout

- Headings name content, buttons name actions, and labels use familiar words. Command results say what actually happened. Do not expose field names, internal codes or mechanisms. Empty states name a real next step; show explanations when they aid a decision.
- Narrow layout changes task order: keep core content and action first, secondary information after. Connect directory and body with the existing return path. Consider a narrow embedded Workbench pane, not only full-window width. Do not shrink text to fit the desktop layout.
- Long names and bodies, multiple rows and narrow actions stay readable and reachable. Reflow preserves filter, selection and return context. Use actual browser interaction for behavior not visible in a screenshot.

## Motion explains a change

Every motion should confirm an action, explain a state change or preserve spatial continuity. Show a real arrival after saving, completion feedback or opening detail. Existing data is not arriving on first load. Do not animate regions in sequence or delay frequent actions with decorative bouncing.

Host controls motion, timing, easing and reduced-motion preference. Pick supported components; do not output animation config, CSS or scripts. The person need not wait for motion. When movement is reduced, keep readable feedback. Name unsupported behavior rather than claiming it exists.

## Review from evidence

Check core task completion, hierarchy, reading/scanning/comparison, spacing and words. Return up to five useful issues in order of task impact. Do not fill a quota with stylistic preferences or output an overall aesthetic score.

Use “screenshot label · page/part: observable evidence → impact on the task → specific change.” Verify actual part purpose, binding, field mapping and rendered kind. Changes stay within the current catalog and frozen contract; do not remove required parts, add business capabilities or invent configuration. Use the standards as judgment, not a checklist that must find a defect in each item.

Interpret each screenshot's state: preview has no Workbench tab strip; a Sheet opener and its inner submit can serve the same command; unselected, expanded, light and dark are not one simultaneous view. Words shared by summary and body do not prove redundancy. An uncaptured dialog, load or error state is not absent. Static images cannot prove motion timing, reduced motion, focus recovery, keyboard path or touch hit area; leave those unverified when evidence is missing.

Return only the review stage's structured issues JSON. Distinguish adjustable `presentation`, `design` to revisit, `host` capability and `unverified`. Automatically revise only presentation findings tied to an actual screenshot target and a supported property. Keep other findings for confirmation. Make one concentrated revision with at most one confirmation; keep disputed suggestions instead of looping to an empty list.

## Sources and choices

Drawn from Impeccable 4.1.1 Operate/Read, `operate.md`, `animate.md`, `craft-floor.md` and `critique.md`: task priority, cognitive load, hierarchy, continuity, meaningful motion and evidence-led review. Adapted for Molis's continuous work surfaces and declarative renderer and shipped as a standalone standard. Runtime does not depend on local Impeccable. It does not import marketing-page tropes, fixed animation values, full scoring, interviews or subagent flows.
