# Design system

A design system exists so there is one way to build each thing. Every hardcoded color, almost-identical button, or one-off widget creates another place that breaks during theme, spacing, or accessibility updates. This skill covers three jobs: **use**, **extend**, and **audit**.

## Locate the project's design system first

Inspect before coding — ask if you cannot find it rather than guessing:

- Design guidelines (e.g., `DESIGN.md` or design spec): principles, color roles, type scale, spacing, motion, focus rings.
- Design tokens: colors, spacing, radii, typography, shadows, durations, and easings — usually in a single token stylesheet/data file with light and dark values.
- Component library and specimen catalog (interactive showcase of components and states): real APIs and visuals.
- Existing sibling screens: how comparable pages are composed.

If sources conflict, follow the project's documented precedence; otherwise trust the component catalog and live token definitions used in code, and report the discrepancy.

## Use

Before writing any UI code, walk this ladder in order:

1. **Does an existing component cover it?** Use it with its variants; do not fork a copy for a tiny visual tweak.
2. **Do its existing variants or props cover it?** Use them.
3. **Can existing components compose it?** Compose them.
4. **Only if none of the above works, consider extending** (see "Extend").

When styling:

- Use semantic color tokens (`text-primary`, `text-secondary`, `accent`, `danger`), never raw hex values or palette ramps (`blue-500`) unless the project only exposes raw scales.
- Use tokens for spacing, border radius, font sizes, shadows, and durations too.
- Never ship OS-default controls as product UI: native `<select>` popups, system color/date pickers, or browser `alert`/`confirm`. Use the design system's components; native inputs may sit underneath for form semantics and keyboard handling.
- Pick icons only from the project's chosen icon set at documented sizes.
- Pair status colors (success, warning, danger, active) with text or shape, never color alone.
- Use motion tokens and remove spatial travel under `prefers-reduced-motion`.
- Inspect both light and dark themes; any new color token needs values in every theme.

## Extend

Adding a token or component changes shared infrastructure and carries a higher bar than feature code.

### When to add

- At least two real (or immediate) call sites need it and existing variants/composition cannot cover it; or
- It introduces a genuinely new recurring interaction pattern.

Keep single-use styling inside feature code with a brief note explaining why it stays local.

### Token layers

1. **Primitive values:** color ramps and spacing scales — only inside token files.
2. **Semantic tokens:** named by role (`text-primary`, `surface-raised`, `status-danger`), referencing primitives per theme. Feature code uses this layer only.
3. **Component tokens (when needed):** scoped to one component (`button-primary-bg`), referencing semantic tokens.

Name by role, not appearance: call it `danger`, not `red`, so theme swaps keep making sense.

### Checklist for a new component

- **All states:** default, hover, active, focus, selected, disabled, loading, error; plus empty, overflow, and high-count states for data views.
- **Keyboard and screen reader:** full keyboard operability, visible focus, exposed name/role/state, and modal focus entry/restore.
- **Themes:** light and dark (plus high-contrast if supported) via semantic tokens only.
- **Sizing:** comfortable touch targets, intact at 200% zoom, no overflow with longer localized labels.
- **Docs and specimens:** when to use vs avoid, differences from similar components, and interactive specimens covering every state.
- **Tests:** keyboard paths and key states at minimum, plus visual snapshots when the project uses them.

### Modifying an existing component

- Audit all consumers first to understand blast radius;
- Verify visual changes across all states in the component catalog;
- Treat behavior or prop changes as contract changes: update all call sites in the same change or keep a documented deprecation window.

## Audit

Check a screen, directory, or codebase for design-system drift. Read [references/audit-checklist.en.md](references/audit-checklist.en.md) before starting an audit.

Process:

1. **Define scope.** Which directories or screens.
2. **Search.** Scan for hardcoded values and suspicious patterns (see checklist), then verify manually to filter false positives (such as token definitions themselves).
3. **Categorize.** Hardcoded values, duplicate components, OS-default controls, missing states, accessibility gaps, theme gaps.
4. **Prioritize.** Rank by user-visible inconsistency, accessibility risk, and blast radius per fix.
5. **Report:**

| Category | Location | Current | Should use | Impact | Effort |
| --- | --- | --- | --- | --- | --- |
| Hardcoded color | `settings/panel.css:42` | `#d33` | Semantic `status-danger` token | Low contrast in dark theme | Small |

Finish with a phased migration plan: batches, target files, and verification checks (catalog review, visual diff, keyboard walkthrough).

## Avoid

- Big-bang "unification" sweeps across all pages without batching or verification;
- Adding a near-duplicate component that differs by one minor tweak;
- Overriding a component's internal classes from feature styles (silently breaks on upgrades);
- Promoting single-screen widgets into the shared design system;
- Changing a token value without checking all call sites that consume it.
