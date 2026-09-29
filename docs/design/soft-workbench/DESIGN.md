---
name: Molis Work · Soft Workbench Prototype
description: A quiet work surface with a resident conversation bar and responsive onboarding previews.
colors:
  page: "#eeefef"
  surface: "#fff"
  paper: "#fafaf9"
  wash: "#f5f5f3"
  hover: "#e7e8e7"
  ink: "#292a2c"
  secondary: "#5c5d60"
  muted: "#6c6e72"
  line: "#e9e9e7"
  strong-line: "#d5d6d4"
  action: "#292a2c"
  on-action: "#fff"
  copper: "#95624c"
  copper-wash: "#f6eee8"
  green: "#4f7b63"
  amber: "#976e32"
  ob-ink: "#28272a"
  ob-muted: "#625f61"
  ob-outside: "#60656c"
  ob-surface: "#fff"
  ob-secondary: "#f9f9f9"
  ob-action: "#28272a"
  ob-on: "#fff"
  ob-line: "#e9e9e8"
typography:
  headline:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-.035em"
  onboarding-title:
    fontSize: "31px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.035em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", Inter, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-.012em"
  prose:
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 2
  label:
    fontSize: "12px"
    fontWeight: 500
  onboarding-option:
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.2
rounded:
  control: "8px"
  onboarding-control: "7px"
  row: "10px"
  panel: "12px"
  surface: "14px"
  composer: "15px"
spacing:
  row-comfortable: "20px"
  row-compact: "13px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
  button-soft:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 12px"
  onboarding-option-selected:
    backgroundColor: "{colors.ob-action}"
    textColor: "{colors.ob-on}"
    typography: "{typography.onboarding-option}"
    rounded: "{rounded.onboarding-control}"
    padding: "0 11px"
  input-search:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.onboarding-control}"
    padding: "0 10px"
  focus-work:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.surface}"
    padding: "24px 28px 26px"
---

# Design System: Molis Work · Soft Workbench Prototype

> **Reference prototype, not the production spec.** Production adopted this language on 2026-09-28; the normative spec is the root [DESIGN.md](../../../DESIGN.md) and the rollout record is [specs/soft-workbench-rollout](../../../specs/soft-workbench-rollout/spec.md).

## Overview

**Creative North Star: "A personal work surface with room to think"**

This document records the implemented prototype in this directory. It does not replace the repository design system or authorize production adoption. The user-pinned Orvia Mail onboarding video supplies the visual reference: pearl surfaces, small graphite choices, warm and cool ambient light, and miniature previews that respond immediately to a choice. The exact typeface in the reference video is unknown.

The workbench keeps one continuous content surface above the existing bottom menu and unified conversation bar. Content, status and available actions remain legible; depth identifies temporary or layered surfaces. System sans and PingFang are this prototype's chosen approximation of the reference typography, including for headings; the user requested the reference's appearance rather than naming these font families.

**Key Characteristics:**
- Continuous content, restrained dividers and compact graphite controls.
- A resident three-zone bottom bar, with plugin directories inside the content area.
- A choice visibly changes its adjacent miniature preview.
- Soft lighting and diffuse shadows concentrated around onboarding and raised layers.

## Colors

### Primary

Graphite (`action`, `ob-action`) anchors primary actions and selected choices. Copper marks focus, links and selected-state details; it is not a replacement for the graphite action fill.

### Secondary

Green and amber support status text and icons. Status includes readable labels or symbols, not color alone.

### Neutral

Pearl `page`, white `surface`, and warmer `paper`/`wash` separate workspace, content and local groups. `secondary` and `muted` distinguish supporting text; dividers use `line`. Onboarding has its own scoped neutral tokens. Titlebar and greeting captions use `ob-muted` without an additional opacity reduction; outside captions use `ob-outside`.

Dark mode is an implemented role-preserving override in `style.css` and `onboarding.css`: surfaces darken, text and action contrast invert, and the ambient light becomes subdued. Those selectors remain the source for exact dark values; the frontmatter records the default light palette. Sidecar tonal ramps are synthesized swatch previews, not additional runtime palette tokens.

**The Graphite Choice Rule.** Use a filled graphite control and a visible check for selected onboarding options; do not communicate selection through lighting alone.

## Typography

**Display and body font:** the system sans stack in the frontmatter, with local Inter and PingFang/Chinese fallbacks. Preserve this implementation's approximation without claiming a confirmed reference-video or brand face. The recurring hierarchy is weight 600 for headings, 500 for controls and item titles, and 400 for body copy.

The scale is compact and role-based: page headings are roughly 25–30px as space changes; onboarding titles are 31px on wide screens and 26px at the mobile breakpoint. Reading uses 13px with generous line height, with 15px lead paragraphs. Supporting labels commonly use 10–12px. These values describe this prototype rather than a universal type scale. Miniature preview text and the large greeting have separate illustrative roles.

**The Weight Before Decoration Rule.** Distinguish headings, item titles and explanatory copy through size and 600/500/400 weight before adding a new color or container.

## Layout

The workspace fills `100dvh`, with a flexible content region and a non-overlapping bottom bar. Desktop outer gutters are 16px. The bottom bar is 82px high, with menu/plugins on the left, a centered composer constrained to 400–660px, and conversation/preferences on the right. At 720px and below it becomes a 129px two-row bar: composer first, navigation and preferences below. There is no global sidebar.

Goal and feed directories are local split-view columns. At 850px and below, directory and detail occupy the same region one at a time, with a return control. At 1050px the homepage note margin moves below the main content. Density changes the shared directory row padding using the two recorded spacing tokens.

Onboarding uses a centered window up to 1020px wide. Questions and previews share two columns; progress and continuation stay in the footer. At 600px and below, the preview sits above the question and choices. The implementation also adapts at 1150px, 850px and short desktop heights. Preserve the miniature preview's meaning when scaling it.

**The Resident Bar Rule.** Keep global navigation and the unified conversation entry in the bottom bar; plugin lists belong to the content they navigate.

## Elevation & Depth

Use tonal layering for ordinary content and diffuse shadows for floating sheets, menus, the composer and miniature windows. Onboarding's peach upper-left and cool blue lower-right radial light is part of the chosen reference. Its light must remain behind legible content; it is not a page-wide accent wash.

Exact shared shadow values and motion curves are recorded in the sidecar. The built timing is 130ms for press response, 250ms for shared state movement and 420ms for content arrival. Onboarding step changes use a 140ms exit followed by a 480ms entry; the HTML direction comment is only shorthand. Reduced-motion settings remove nonessential CSS motion and JavaScript step/choice animation.

## Shapes

Controls use gently rounded rectangles, local panels use softer corners, and the large continuous surface remains visually calm. Circles are reserved for dots, avatars and status marks. Inline Lucide SVGs share a restrained stroke. The prototype's lowercase “m” is a placeholder, not an approved product logo.

## Components

- **Buttons:** compact primary, quiet and soft variants share padding and curvature. Press scales to 0.97; hover changes fill or shadow. Keyboard focus uses a visible copper outline. Mobile buttons grow to at least 38px in the implemented general control rules.
- **Choice controls:** small white options become graphite with a check when selected; choices update the neighboring preview. Broad option cards would change the chosen reference.
- **Inputs:** search blends into a washed field; progress text uses a bordered paper surface. Composer focus strengthens its border and shadow. The mobile composer and text fields use 16px input text where implemented.
- **Status:** an unboxed label with a dot or icon. Keep the status word visible; this is not a pill-heavy system.
- **Content and overlays:** ordinary rows use fine dividers, the focused work block uses paper, and menus/Assistant rise above the content. Editing uses an edge sheet; search uses a compact dialog. Escape/return behavior restores focus where implemented.
- **Unified conversation:** plugin context remains beside the input; the panel opens above it. A draft survives plugin switching and refresh. The visible “交互演示 · 未接入模型” label is part of truthful prototype presentation.
- **Onboarding previews:** DOM/CSS miniatures visualize language, appearance, project, Runtime, AI boundary, notifications and density. Appearance includes the same bottom bar used by the workbench. There are no shipping raster assets.

## Do's and Don'ts

### Do:
- **Do** preserve the prototype's system sans/PingFang approximation and deliberate 400/500/600 hierarchy.
- **Do** keep one continuous work surface above the resident bottom menu and conversation bar.
- **Do** show selected states with a check or label and update the miniature preview immediately.
- **Do** preserve visible keyboard focus, readable supporting text and reduced-motion behavior.
- **Do** keep example data, local-only settings and simulated Assistant behavior clearly identified.

### Don't:
- **Don't** introduce a global sidebar or a second global conversation entry.
- **Don't** reduce caption opacity on top of muted onboarding text.
- **Don't** promote miniature illustration text sizes or the placeholder “m” into production typography or identity rules.
- **Don't** treat this prototype as an adopted global design system or evidence of real AI/Runtime integration.

Not canonized: miniature-only type sizes, the placeholder “m”, one-off illustrative colors/weights, and unused sidebar selectors. They do not define reusable product rules. System headings remain an intentional implementation of the user-pinned aesthetic, not a verified font identification.
