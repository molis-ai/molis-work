# Design handoff specification template

Copy this structure and fill in every section. Keep headings for sections that do not apply and write "Not applicable" with a one-sentence reason so readers know nothing was overlooked.

---

## Overview

- Feature: one sentence stating who accomplishes what and when.
- In scope: screens and flows included in this delivery.
- Out of scope: deferred items with timing or rationale.
- Designs and prototypes: links and which artifact is authoritative.
- Design system reference: location of design guidelines, component catalog, and tokens.

## Entry points and flow

1. Every entry point into the flow.
2. Primary steps, one sentence each.
3. Destination and confirmation after completion.
4. Behavior on leaving mid-flow, returning, or refreshing.

## Screens

Repeat one subsection per screen:

### <Screen name>

- Layout: regions, fixed vs scrolling areas, max width.
- Components:

| Location | Component (existing / new) | Variant | Notes |
| --- | --- | --- | --- |
| Header right | Primary button (existing) | Default size | Sole primary action on screen |

- States:

| State | Appearance | Copy | Available actions |
| --- | --- | --- | --- |
| Empty (first use) | | | |
| Empty (no filter match) | | | |
| Loading | | | |
| Load error | | | Retry |
| Unauthorized | | | |
| Populated | | | |
| Very long / many items | | | |

- Interactions:

| Trigger | Result | Confirm / undo | While in progress | Focus destination |
| --- | --- | --- | --- | --- |
| Click "Delete" | Opens confirmation naming the item and impact | Undo toast after confirmation | Button shows busy state and ignores repeat clicks | Next item in list after close |

## Copy

| Location | Chinese | English | Notes |
| --- | --- | --- | --- |
| Empty state title | | | |
| Delete confirmation | | | Includes item name |

Counts and plurals: list every sentence containing numbers with forms per language.

## Motion

| Moment | Change | Duration token | Easing token | Under reduced motion |
| --- | --- | --- | --- | --- |

## Accessibility

- Focus order:
- Modals/drawers: where focus moves on open and returns on close.
- Accessible names: icon buttons, images, charts.
- Status announcements: which messages screen readers must announce.
- Contrast: elements verified across themes.
- Touch/click targets: minimum dimensions.

## Data and edge cases

| Field | Source | Nullable | Max length | Overflow handling | Format |
| --- | --- | --- | --- | --- | --- |

Sorting, pagination, 0 / 1 / many counts, and date/time zones.

## Responsive widths and themes

| Breakpoint | Layout change | Where collapsed controls move |
| --- | --- | --- |
| Wide | | |
| Medium | | |
| Mobile | | |

Light and dark theme verification screenshots.

## Errors and recovery

| Failure | Message | Recovery path | Input preserved? |
| --- | --- | --- | --- |

## Acceptance

- Reference mockups or screenshots:
- Required checks:
- Definition of done:

## Open questions

| Question | Owner | Interim assumption |
| --- | --- | --- |
