# Design handoff

A handoff spec has one job: the implementer should neither have to guess nor keep coming back to ask basic questions. Any decision left to the implementer without clear basis is a gap in the handoff.

This skill works in two modes:

- **Writing a handoff spec:** Start from the design or prototype, fill every item below, and produce one clear document. Read [references/handoff-template.en.md](references/handoff-template.en.md) when drafting.
- **Reviewing a handoff (or design) before coding:** Check it against the same list, report gaps alongside proposed assumptions, and confirm with design before writing code.

## Principles

- **Specify decisions, not vibes.** "More comfortable spacing" is not a handoff; "16px between cards, 12px inside cards" is.
- **Name design tokens and components instead of raw numbers.** Whenever the project has tokens and components, cite them (e.g., "Primary button", `space-md`); give raw values only when no token exists and flag them as new.
- **Cover every state.** A design that only draws the ideal populated state is not ready for handoff.
- **Use realistic content.** Real string lengths, longest titles, largest counts, and longer translated copy.
- **Single source of truth.** State whether the spec or mockup wins if they diverge, and update both together.

## What must be specified

Cover every item below; if one does not apply, write "Not applicable" with a one-sentence reason.

1. **Scope.** Which screens and flows are in this release, what is deferred (and why), entry points, and post-completion destinations.
2. **Structure and layout.** Regions per screen, fixed vs scrolling areas, max width, and alignment.
3. **Components.** Which existing component and variant each element uses; list any new component separately with why existing ones do not fit (new components should go into the design system — see `design-system`).
4. **States.** State table for every screen and key component: default, hover, active, focus, selected, disabled; empty, loading, partial load, error, unauthorized, offline, post-success — showing appearance, copy, and allowed actions.
5. **Interactions.** What happens on click, keypress, or drag; whether confirmation or undo applies; behavior while in progress; where results appear; keyboard shortcuts and focus destinations.
6. **Motion.** Transitions, duration and easing tokens, and behavior under `prefers-reduced-motion` (typically remove travel and fade or snap).
7. **Copy.** Complete UI copy including buttons, empty states, errors, confirmations, hints, and accessible names; localized strings or translation owner; counts and plurals.
8. **Accessibility.** Focus order, modal focus entry/restore, names for icon buttons and images, live status announcements, verified contrast across themes, and target sizes (reference `accessibility-review`).
9. **Data and edge cases.** Source of each field, nullability, max length and truncation (plus where full text is read), sorting and pagination, counts of 0 / 1 / many, and date/time/number formatting with time zones.
10. **Responsive widths and input modes.** Behavior at each breakpoint (what collapses or hides, and where hidden actions move), touch target sizing, and portrait/landscape orientation.
11. **Themes.** Verified in light, dark (and high-contrast when supported) using the same semantic tokens.
12. **Errors and recovery.** Copy and recovery path for each failure mode, whether user input is preserved on save failure, and where retry lives.
13. **Verification and acceptance.** Reference mockups/screenshots, required checks (e.g., accessibility check, multi-width visual diff), and definition of done.
14. **Open questions.** Unresolved decisions, who owns each, and the default assumption engineering will use until decided.

## Reviewing an existing handoff

Score all 14 items as complete, missing, or conflicting, then output:

| Item | What is missing | Impact if left unaddressed | Proposed assumption |
| --- | --- | --- | --- |
| States | List load failure state is not drawn | Engineering would have to invent a one-off error state | Reuse the project's existing "list load failed" state with cause and retry button |

- Order gaps by implementation risk, putting items that could send code in the wrong direction first.
- Where existing design guidelines answer a gap, state the inferred answer explicitly for quick confirmation instead of bouncing everything back.
- Call out contradictions between mockups, written specs, and existing guidelines separately.

## Handing off to Coding

When an engineering agent will implement the design, include three additional items to prevent detours:

- Target files or modules (if known) and an existing similar screen to follow as reference;
- Verification commands and viewport widths to inspect;
- Boundaries that must not be touched (shared components or other modules) without pausing to ask first.
