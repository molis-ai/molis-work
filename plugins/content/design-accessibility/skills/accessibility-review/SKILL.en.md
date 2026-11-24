# Accessibility review (WCAG 2.1 AA)

Review an interface against WCAG 2.1 Level A and Level AA success criteria and produce concrete, actionable findings. The goal is not to recite criteria, but to uncover what actually blocks people: unreachable keyboard paths, missing screen-reader announcements, unreadable contrast, rushed timers, or confusing interactions.

## Clarify three things first

1. **What is in scope.** Which page or component, and which states: empty, loading, error, success, disabled, expanded, modal open, narrow viewport. Ask if unclear; if you cannot ask, state explicitly which states were covered.
2. **What evidence you have.** Screenshots and mockups only show visual properties; code reveals structure, accessible names, and focus management; a live interactive page lets you test keyboard and screen-reader flows. Your evidence determines what you can conclude (see "What can be judged").
3. **Who uses it.** Check for known assistive or input modes: touch, keyboard-only, 200%+ zoom, screen reader, voice control. If unknown, assume all of them.

If the project has its own design guidelines (design spec, component catalog, color tokens), read them first: their focus styles, colors, and sizes are part of the baseline, and any conflict with WCAG must be called out.

## How to review

Work in this order. Earlier items catch the highest-impact defects; if time is tight, cover at least the first four steps.

1. **Keyboard-only walkthrough of primary tasks.** Tab, Shift+Tab, Enter, Space, Arrow keys, Esc. Every interactive control is reachable (2.1.1); focus is always visible (2.4.7); focus order follows reading and task order (2.4.3); focus can enter and leave without trapping, modals close on Esc and restore focus to their trigger (2.1.2); no single-character shortcuts that cannot be disabled or remapped (2.1.4).
2. **Name, role, and state.** Every control exposes its role and name (4.1.2): icon buttons have accessible names; visible labels appear inside the accessible name (2.5.3); toggle, expanded, selected, and current-page states are programmatically exposed; every input has a label and upfront format guidance (1.3.1, 3.3.2).
3. **Contrast and color.** Normal text is at least 4.5:1, large text at least 3:1 (1.4.3); input borders, switches, checkboxes, focus rings, and meaningful icons are at least 3:1 against adjacent colors (1.4.11); errors, required fields, selection, and links do not rely on color alone (1.4.1). Check both light and dark themes when supported.
4. **Errors and feedback.** Errors identify the field, explain what is wrong, and suggest how to fix it (3.3.1, 3.3.3) while preserving entered input; focus or selection changes do not unexpectedly navigate or submit (3.2.1, 3.2.2); non-focus-moving status updates (saved, loading, result counts) are announced to screen readers (4.1.3); legal, payment, or destructive actions are reversible, reviewable, or confirmed (3.3.4).
5. **Zoom and reflow.** 200% zoom loses no content or functionality and causes no overlap (1.4.4); at 320 CSS px width, content reflows without horizontal scrolling except genuinely 2D content like data tables, maps, or code (1.4.10); increased line/paragraph/letter/word spacing clips nothing (1.4.12).
6. **Structure.** Heading hierarchy matches content structure and labels describe their regions (1.3.1, 2.4.6); lists use list markup and tables have headers; DOM reading order matches visual order (1.3.2); pages have meaningful titles that update across views (2.4.2); repeated blocks can be skipped (2.4.1); page language and foreign-language passages are marked (3.1.1, 3.1.2).
7. **Motion and timing.** Auto-started movement, blinking, or scrolling alongside other content lasting over 5 seconds can be paused, stopped, or hidden; auto-updating content alongside other content can be paused, stopped, hidden, or rate-controlled regardless of duration, unless essential (2.2.2); time limits can be turned off, adjusted, or extended (2.2.1); nothing flashes more than 3 times per second (2.3.1); auto-playing audio over 3 seconds can be stopped or muted (1.4.2).
8. **Pointers, gestures, and overlays.** Multipoint or path gestures have single-pointer alternatives (2.5.1); actions do not commit on down-event or can be aborted/undone (2.5.2); motion-actuated actions have UI controls and can be disabled (2.5.4); hover/focus popovers are dismissible with Esc, hoverable, and persistent until dismissed (1.4.13); orientation is not locked (1.3.4); personal-info inputs declare `autocomplete` purpose (1.3.5).
9. **Images and media.** Meaningful images and icons have text alternatives and decorative ones are ignored (1.1.1); text is not baked into images (1.4.5); prerecorded video has captions and audio description or text alternative for visual-only information (1.2.x).

The complete 50-criterion table, numeric thresholds, and verification checks are in [references/wcag-21-aa-checklist.en.md](references/wcag-21-aa-checklist.en.md). Read it when checking exact criterion numbers or thresholds; do not paste the entire checklist into the reply.

## What can be judged

- **Screenshots or mockups only:** Contrast (note when colors are sampled as estimates), color-only cues, typography scale and hierarchy, missing visual states, and target sizes. Keyboard access, accessible names, live announcements, and focus management cannot be verified — list them under "Needs live verification" instead of guessing pass/fail.
- **With code:** Add semantic structure, names, roles, `aria-*` usage, and focus handling. Valid code does not guarantee runtime behavior (styles can still hide focus rings) — note which conclusions come from static code inspection.
- **Interactive page:** Full conclusions. When testing with a screen reader, state which screen reader and browser were used.

## Severity

- **Blocker:** Some users cannot complete the task at all (e.g., submit unreachable by keyboard, modal trap, missing alt text on critical content, silent form errors).
- **Serious:** Possible but very difficult or error-prone (e.g., invisible focus ring, clearly failing body contrast, erratic focus order).
- **Moderate:** Does not block the task but violates a criterion or adds friction (e.g., skipped heading levels, "click here" links, inconsistent labels for the same action).
- **Suggestion:** Improvements beyond WCAG 2.1 AA (e.g., 44px touch targets, respecting `prefers-reduced-motion`, clearer wording). Label as suggestions, not failures.

## Deliverable format

Open with a 1–2 sentence summary: gap to AA, blocker count, and top fixes. Then list findings from highest to lowest severity:

| Severity | Location | Issue | Criterion | Who is affected | How to fix |
| --- | --- | --- | --- | --- | --- |
| Blocker | Settings · Delete confirmation modal | Focus stays on the background page when opened and Esc does not close it | 2.1.2, 2.4.3 | Keyboard-only and screen-reader users | Move focus to the first control on open; close on Esc and restore focus to the "Delete" button |

Guidelines:

- One issue per row. Make locations findable (page, region, control name; file and line when code is available).
- Make fixes concrete — minimal code/attribute changes such as replacing a clickable `div` with a native `button`.
- Group repeated instances sharing one root cause into a single row listing all locations.
- End with "Not verified" and a brief "Working well" section so the team preserves what already passes.
- Avoid vague remarks like "improve overall accessibility".

## Common mistakes

- Click handlers on `div`/`span` instead of native `button`, `a`, or `input` (no keyboard activation or role).
- Removing focus outlines (`outline: none`) without a visible replacement.
- Using placeholder text as a label (disappears on input and often fails contrast).
- Signalling errors only with red or success only with green.
- Icon-only buttons with no accessible name.
- Modals leaving focus behind or resetting focus to the top of the page on close.
- Custom dropdowns, date pickers, switches, or tabs missing keyboard navigation and exposed state.
- Wrong `aria-*` is worse than none: prefer native HTML first, add ARIA only when native semantics cannot express it, and keep it synchronized with real state.

## Boundary

This review follows WCAG 2.1 AA; it is not legal advice or formal compliance certification. WCAG 2.2 additions (focus not obscured, dragging alternatives, minimum target size, etc.) fall outside 2.1 AA — note obvious issues as "Suggestions" citing WCAG 2.2.
