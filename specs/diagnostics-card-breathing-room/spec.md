# Diagnostics card breathing room

## Background and goal

The Desktop Diagnostics page renders its three information groups as rounded paper surfaces, but their inherited layout still uses the older flat-section spacing (`padding: 25px 0`). Text, status labels, dividers, and service actions therefore sit against the rounded surface edges.

The goal is to make the Diagnostics page comfortable to scan by giving every paper surface a consistent inner inset and a deliberate gap from the next surface, while preserving the existing content, hierarchy, data, actions, dark/light themes, and responsive behavior.

Completion level: **Level 3 — functional**. The real page must render the corrected layout and keep its existing behavior; this task does not include release packaging or installing a new Molis Work release into the user's home directory.

## Current evidence

- The supplied Desktop screenshot shows the headings, fact rows, status labels, and action buttons visually touching the left, right, or bottom edges of their rounded containers.
- `src/web/render.ts` defines the flat base spacing for `.diagnostics-summary` and `.launcher-section`.
- `src/web/visual-foundation.ts` later turns those sections into rounded paper surfaces in the Desktop shell without adding corresponding inner padding or inter-surface rhythm.

## Scope

- Desktop-shell Diagnostics page only.
- The Molis Work install summary, launcher list, persistent Web service summary, and page footnote.
- Wide and intermediate Desktop layouts, in both Light and Dark themes.
- Preserve wrapping for long paths and commands.

## Non-goals

- No copy, status, API, service-action, navigation, or data changes.
- No redesign of Global Settings or other settings sections.
- No new cards, gradients, decoration, or density preference.
- No release build installation or mutation of `~/.molis-work`.

## User scenario

When a user opens Global Settings → Diagnostics, they can scan each group as one coherent surface. Headings and statuses have room from the outer edge, fact rows remain compact inside the group, service controls do not hug the bottom edge, and long filesystem paths wrap without horizontal overflow.

## Spatial decision

Primary reading path: page title and safety note → install health → launchers → Web service → recovery footnote.

Each rounded surface is one semantic group. Use a consistent medium inset inside surfaces, a smaller repeated gap between surfaces, and tight row spacing inside each surface. The page remains an information-dense Operate surface rather than becoming a loose dashboard.

## Implementation boundary

- `src/web/visual-foundation.ts`: add Diagnostics-only Desktop-shell spacing rules using the existing surface, shadow, line, type, and color tokens.
- `tests/visual-foundation.test.ts` and/or `tests/web.test.ts`: assert the page-scoped layout contract without coupling tests to unrelated Settings surfaces.
- `DESIGN.md`: only update if the change introduces a new durable rule not already covered by the existing “soft content section panels” Settings contract. The intended fix should not require a visual-direction change.

## Acceptance criteria

1. All three rounded Diagnostics surfaces have visible left, right, top, and bottom breathing room around their content.
2. The surfaces are separated by a consistent gap and do not visually merge.
3. Internal fact and launcher rows retain compact scanability and their existing dividers.
4. Service action buttons sit inside the Web service surface with clear bottom and side space.
5. Long Home, Release, command, config, and log values wrap without horizontal overflow.
6. The change is scoped to the Desktop-shell Diagnostics page; unrelated Settings surfaces retain their layout.
7. Light and Dark themes use existing semantic tokens; no hard-coded theme color is introduced.

## Verification

- `pnpm typecheck`
- Targeted Node test(s) for the Diagnostics page and visual-foundation stylesheet contract.
- Impeccable layout detector on the changed UI file(s).
- Rendered Desktop inspection of the Diagnostics page at a representative wide/intermediate width, including Dark theme; if the local app cannot be safely run against the current working tree, record that visual verification gap explicitly.

## Assumptions and open questions

- The supplied screenshot is the Desktop-shell Diagnostics page at a Retina-scaled intermediate width.
- Existing narrow-browser flat Settings behavior remains out of scope unless verification reveals overflow introduced by the scoped rule.
- The worktree already contains unrelated user changes, including in `src/web/visual-foundation.ts`; this task will make a small additive edit around the existing Diagnostics surface rule and preserve all other changes.

## Verification result — 2026-09-01

- Acceptance criteria 1–7: **passed** for the scoped Desktop-shell Diagnostics page.
- `pnpm typecheck`: **passed**.
- Diagnostics visual-foundation regression test: **passed**.
- The two existing Web tests covering Settings diagnostics and the managed Web service lifecycle: **passed**.
- Impeccable layout detector on `src/web/render.ts` and `src/web/visual-foundation.ts`: **passed** with no findings (`[]`).
- Rendered Dark Desktop inspection at the available intermediate viewport: **passed**. Computed surface padding is `22px 24px`, both inter-surface gaps are `12px`, long paths wrap, and document horizontal overflow is `0`.
- Full `tests/visual-foundation.test.ts`: **not green because of four pre-existing assertions unrelated to this task** (the current faint token, narrow-companion expectation, desktop shell column expectation, and Goal Graph ID rule). The new Diagnostics test passes independently.
- Release packaging and installation into `~/.molis-work`: **not run**, by scope.
