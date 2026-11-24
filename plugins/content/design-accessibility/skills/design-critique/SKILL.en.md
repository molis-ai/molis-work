# Design critique

A critique helps the maker see blind spots — not redraw the screen to another taste. Every point must answer three questions: where, why it hurts (for whom, at what moment), and how to fix it.

## Align on purpose first

Without purpose you cannot judge quality. Clarify these before critiquing — ask if missing, or state your assumptions explicitly:

- **Who is using it, and when.** First-time visitor vs daily user; searching for an item, making a decision, or tracking progress.
- **Primary task.** The one or two things this screen must help the person accomplish.
- **Stage.** Early sketches focus on structure and flow, not pixels; near-final designs warrant detail checks.
- **Constraints.** Existing design guidelines, component library, technical boundaries, or locked regions. When the project has its own guidelines, treat them as the baseline and flag deviations.

## What to evaluate

Review in order. Do not nitpick polish while earlier structural issues remain unresolved.

### 1. Task flow

- How many steps from entry to completion, and is the next step always clear?
- Any dead ends: no way back mid-flow, no recovery on error, or an empty state with no starting action?
- Are key actions easy to find, and are frequent actions closer than rare ones?
- Any slip hazards: destructive actions sitting next to common controls without undo or confirmation?

### 2. Visual hierarchy

- Squint test (or zoom out): where does the eye land first, and is that the most important element?
- One primary action per screen. Multiple buttons styled with equal primary weight means no clear primary action.
- Build hierarchy with type size, weight, and spacing before adding color or borders. Wrapping everything in cards, shadows, and colored pills flattens hierarchy.
- Group related items close together, separate unrelated groups, and minimize alignment lines.

### 3. Consistency

- Does the same concept look the same, carry the same label, and appear in the same place?
- Do identical controls behave consistently? Flag when the same button opens a confirmation in one place and executes immediately in another.
- Are there near-duplicate custom widgets where an existing component already fits? Reuse before inventing.
- Is color reserved for status and emphasis? Using one color for two unrelated meanings causes confusion.

### 4. States and feedback

Check every state — mockups often show only the happy path with ideal data:

- Empty: first-time use, zero search/filter results, and cleared list — distinct copy and real next actions only.
- Loading: when indicators appear, and avoiding full-screen flashes for local updates.
- Error: clear cause and recovery, preserving user input and offering retry.
- Unavailable: explain why something cannot run instead of hiding it silently or leaving a dead button.
- After an action: visible outcome clearly distinguishing success, failure, and in-progress.
- Extremes: very long names, many items, a single item, huge numbers, and longer translated strings.

### 5. Density and rhythm

- Does information density match usage frequency? Daily power tools can be denser; occasional flows need breathing room.
- Does each row communicate one thing cleanly without wrapping names and statuses awkwardly?
- Is whitespace grouping elements intentionally rather than scattered evenly?
- Does the layout still hold at narrow widths, browser zoom, and longer copy?

### 6. Generic template smell

Rushed or auto-generated UIs share recognizable signals — call them out and explain what they degrade:

- Every block wrapped in identical rounded cards, with cards nested inside cards;
- Everything centered and equal width with no focal weight;
- Decorative gradients, glows, or oversized illustrations crowding out real content;
- An icon on every heading and a tagline under every paragraph;
- Decorative colors that signal no state.

This is not a matter of taste: visual noise dilutes what actually matters.

## Deliverable format

1. **One-sentence verdict.** The single biggest issue hurting usability right now.
2. **What works well.** Two or three specific elements worth keeping intact during revisions.
3. **Prioritized issues.** Ordered from highest to lowest impact:

| Priority | Location | Issue | Why (who, when) | How to fix |
| --- | --- | --- | --- | --- |
| Must fix | List header right | "New", "Import", and "Export" all use the primary button style, hiding the starting action | First-time users scanning for where to start have to read all three equally loud buttons | Keep "New" as the single primary button; move Import and Export into a secondary menu |

   - **Must fix:** Blocks the task, invites errors, or violates project guidelines.
   - **Should fix:** Slows users down, causes hesitation, or clutters the screen.
   - **Consider:** Stronger option, though the current version still works.
4. **Cannot judge yet.** Areas missing states, real data, or context, plus concrete questions for the author.

Writing style:

- Be specific: "Three equal primary buttons dilute the main action", never "feels a bit messy".
- Make fixes concrete — sketch structure in a sentence when helpful (e.g., "filters on the left, list on the right, collapsing into a narrow rail when an item is selected").
- Do not redesign the whole screen unless asked; propose a structural change only when local edits cannot resolve the core flaw, and explain why.
- Merge repeated instances with the same root cause into one row.
- Call out accessibility issues (contrast, keyboard, names) and recommend `accessibility-review`; call out copy issues and recommend `ux-copy`.

## Comparing multiple options

When choosing among proposals, do not merely list pros for each:

- Name the criteria that actually decide this choice (e.g., first-time clarity, daily speed, build cost) and compare each option directly;
- State clearly who pays the trade-off in each option;
- Give a concrete recommendation with reasons and any remaining gaps the chosen option still needs to close.
