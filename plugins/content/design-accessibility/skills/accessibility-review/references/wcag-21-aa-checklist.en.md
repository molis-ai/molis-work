# WCAG 2.1 Level A and Level AA Success Criteria Checklist

WCAG 2.1 defines 30 Level A and 20 Level AA criteria (50 total). Each row summarizes the requirement and how to check it; the normative W3C WCAG 2.1 specification remains authoritative. "(New in 2.1)" marks criteria added in WCAG 2.1.

Quick thresholds:

| Item | Threshold |
| --- | --- |
| Normal text contrast (1.4.3) | At least 4.5:1 |
| Large text contrast (1.4.3) | At least 3:1; large text is ≥ 18pt (~24 CSS px) or ≥ 14pt (~18.7 CSS px) bold |
| Non-text contrast (1.4.11) | At least 3:1 against adjacent colors for control boundaries, focus indicators, icons, and essential graphical parts |
| Resize text (1.4.4) | Up to 200% without loss of content or functionality |
| Reflow (1.4.10) | No two-dimensional scrolling at 320 CSS px width (vertical scroll) or 256 CSS px height (horizontal scroll) |
| Text spacing (1.4.12) | No loss of content at 1.5× line height, 2× paragraph spacing, 0.12× letter spacing, and 0.16× word spacing |
| Flashing (2.3.1) | No more than 3 flashes in any 1-second period, or below general and red flash thresholds |
| Moving / auto-updating content (2.2.2) | Auto-started moving, blinking, or scrolling content alongside other content lasting > 5s can be paused, stopped, or hidden; auto-updating content alongside other content (no 5s exemption) can be paused, stopped, hidden, or frequency-controlled unless essential |
| Audio control (1.4.2) | Audio auto-playing > 3s can be paused, stopped, or volume-controlled independently |
| Timing adjustable (2.2.1) | Can be turned off, extended to ≥ 10× default, or warned ≥ 20s beforehand and extended with a simple action |

## 1 Perceivable

| Criterion | Level | Requirement | How to check |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Images, icons, and charts have text alternatives; decorative graphics are ignored by assistive tech | Check `alt` and icon-button names; decorative images use `alt=""` or `aria-hidden`; CAPTCHAs describe purpose and offer alternatives |
| 1.2.1 Audio-only and Video-only (Prerecorded) | A | Prerecorded audio has a transcript; video-only has a transcript or audio track | Inspect every media item for an adjacent alternative |
| 1.2.2 Captions (Prerecorded) | A | Synchronized captions for speech and key sounds in prerecorded video | Enable captions and verify completeness and sync |
| 1.2.3 Audio Description or Media Alternative (Prerecorded) | A | Visual-only information in prerecorded video has audio description or full text alternative | Listen without looking at video to check for missing info |
| 1.2.4 Captions (Live) | AA | Live audio has real-time captions | Verify captioning source if live media exists |
| 1.2.5 Audio Description (Prerecorded) | AA | Prerecorded video provides audio description | Same as 1.2.3, specifically requiring audio description |
| 1.3.1 Info and Relationships | A | Visual structure (headings, lists, tables, groups, label-field pairs) is expressed programmatically | Check semantic markup, table headers, `label` bindings, `fieldset`; disable CSS to verify structure |
| 1.3.2 Meaningful Sequence | A | Reading order preserves meaning | Read in DOM order; verify CSS does not scramble visual vs DOM order |
| 1.3.3 Sensory Characteristics | A | Instructions do not rely solely on shape, color, size, position, direction, or sound | Look for phrases like "click the green button on the right" |
| 1.3.4 Orientation (New in 2.1) | AA | Does not lock portrait or landscape unless essential | Rotate viewport and confirm content adapts and works |
| 1.3.5 Identify Input Purpose (New in 2.1) | AA | Personal-information fields expose programmatic purpose for autofill | Check `autocomplete` attributes on name, email, phone, address fields |
| 1.4.1 Use of Color | A | Color is not the sole cue for information, actions, or distinctions | View in grayscale: check errors, required markers, selected states, and links |
| 1.4.2 Audio Control | A | Auto-playing audio > 3s can be paused, stopped, or independently muted | Load page and check for automatic audio |
| 1.4.3 Contrast (Minimum) | AA | Text and images of text meet contrast thresholds above | Measure foreground/background in light and dark themes across active states (excluding disabled) |
| 1.4.4 Resize Text | AA | Text resizes to 200% without assistive tech and without losing content or function | Zoom browser to 200% and check for clipping, overlap, or off-screen controls |
| 1.4.5 Images of Text | AA | Use real text rather than images of text (except logos/essential cases) | Look for baked-in headings or button text inside images |
| 1.4.10 Reflow (New in 2.1) | AA | Usable at 320 CSS px without horizontal scrolling (2D data tables, maps, charts, code exempt) | Test at 320px width or 400% zoom on a 1280px window |
| 1.4.11 Non-text Contrast (New in 2.1) | AA | Identifiable UI boundaries, states, focus rings, and essential graphics are ≥ 3:1 against adjacent colors | Measure borders, switches, checkboxes, focus rings, icons, and chart lines |
| 1.4.12 Text Spacing (New in 2.1) | AA | No loss of content or function when user overrides text spacing to thresholds above | Inject spacing overrides and inspect for truncation or overlap |
| 1.4.13 Content on Hover or Focus (New in 2.1) | AA | Hover/focus tooltips and popovers are dismissible (Esc), hoverable, and persistent until dismissed | Hover to trigger, press Esc, move pointer onto popover, and wait to verify persistence |

## 2 Operable

| Criterion | Level | Requirement | How to check |
| --- | --- | --- | --- |
| 2.1.1 Keyboard | A | All functionality works via keyboard alone without requiring specific keystroke timing | Complete main tasks without a mouse; check custom controls, drag actions, hover menus |
| 2.1.2 No Keyboard Trap | A | Focus can leave any component via keyboard alone, with instructions if special keys are needed | Tab into editors, modals, and iframes and confirm clean exit |
| 2.1.4 Character Key Shortcuts (New in 2.1) | A | Single-character shortcuts (letters, numbers, punctuation) can be disabled, remapped, or active only on focus | Press single letter keys on the page to see if actions fire unexpectedly |
| 2.2.1 Timing Adjustable | A | Time limits can be turned off, adjusted, or extended (see thresholds) | Check session timeouts, countdowns, and auto-redirects |
| 2.2.2 Pause, Stop, Hide | A | Auto-moving, blinking, scrolling, or updating content can be paused, stopped, or hidden | Check carousels, tickers, and live-refreshing feeds |
| 2.3.1 Three Flashes or Below Threshold | A | Nothing flashes more than 3 times in any 1 second | Inspect animations, videos, and loading effects |
| 2.4.1 Bypass Blocks | A | Mechanism exists to skip blocks repeated across pages | Verify a "Skip to content" link on first Tab, or landmarks and headings |
| 2.4.2 Page Titled | A | Pages have titles describing topic or purpose | Check `<title>` and verify it updates on SPA route changes |
| 2.4.3 Focus Order | A | Focus sequence preserves meaning and operability | Tab through page; confirm focus enters modals and follows visual/task order |
| 2.4.4 Link Purpose (In Context) | A | Link text alone or with context makes destination clear | Flag "click here" or "more"; check screen-reader link list |
| 2.4.5 Multiple Ways | AA | More than one way to locate a page in a set (except process steps) | Check for navigation plus search, table of contents, or sitemap |
| 2.4.6 Headings and Labels | AA | Headings and labels describe topic or purpose | Read headings and labels alone to confirm each section/field is clear |
| 2.4.7 Focus Visible | AA | Keyboard focus indicator is clearly visible | Tab through every control; check for `outline: none` without replacement |
| 2.5.1 Pointer Gestures (New in 2.1) | A | Multipoint or path gestures have single-pointer alternatives | Verify pinch-zoom or swipe interactions have button alternatives |
| 2.5.2 Pointer Cancellation (New in 2.1) | A | Single-pointer actions do not complete on down-event, or can abort/undo on release | Press down on a button, drag off, release, and confirm it does not fire |
| 2.5.3 Label in Name (New in 2.1) | A | Accessible name contains the visible label text | Compare visible text with `aria-label` / computed accessible name |
| 2.5.4 Motion Actuation (New in 2.1) | A | Shake/tilt actions have UI alternatives and can be disabled | Inspect any motion-triggered feature |

## 3 Understandable

| Criterion | Level | Requirement | How to check |
| --- | --- | --- | --- |
| 3.1.1 Language of Page | A | Default page language is programmatically determinable | Check `<html lang>` and verify it updates when switching UI language |
| 3.1.2 Language of Parts | AA | Passages or phrases in another language declare their `lang` | Check foreign-language quotes or paragraphs |
| 3.2.1 On Focus | A | Receiving focus does not initiate a change of context | Tab across all controls and verify no unexpected navigation, submit, or popup |
| 3.2.2 On Input | A | Changing a setting does not change context unless warned beforehand | Change selects and checkboxes; confirm no surprise navigation or submit |
| 3.2.3 Consistent Navigation | AA | Repeated navigation stays in consistent relative order across pages | Compare navigation order across pages |
| 3.2.4 Consistent Identification | AA | Components with identical functionality are identified consistently | Confirm identical actions share names and icons across screens |
| 3.3.1 Error Identification | A | Automatically detected input errors identify the item in text | Submit invalid inputs and verify screen reader announces which field failed |
| 3.3.2 Labels or Instructions | A | Labels or instructions are provided whenever user input is required | Verify visible labels and upfront format hints |
| 3.3.3 Error Suggestion | AA | Known error corrections are suggested unless security/purpose prohibits it | Check whether error copy tells the user how to fix it |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | Legal, financial, or data-modifying/deleting submissions are reversible, checked, or confirmed | Inspect payment, deletion, and submission flows |

## 4 Robust

| Criterion | Level | Requirement | How to check |
| --- | --- | --- | --- |
| 4.1.1 Parsing | A | Complete markup, unique IDs, valid nesting | Listed as Level A in 2.1; W3C later noted it is automatically satisfied for HTML/XML and removed it in WCAG 2.2. Report duplicate-ID or nesting bugs under the 1.3.1 or 4.1.2 issue they cause |
| 4.1.2 Name, Role, Value | A | Every UI component exposes name, role, state, and value programmatically and notifies on change | Inspect custom controls in the accessibility tree or screen reader (e.g., expanded, checked) |
| 4.1.3 Status Messages (New in 2.1) | AA | Non-focus-moving status updates are programmatically announced | Check saved toasts, loading states, result counts, and error summaries for `role="status"`, `alert`, or `aria-live` |

## Frequently asked items outside 2.1 AA

Report these as "Suggestions", not WCAG 2.1 AA failures:

- 2.5.5 Target Size (44×44 CSS px) is Level AAA in 2.1; WCAG 2.2 adds 2.5.8 Target Size (Minimum) at 24×24 CSS px (Level AA).
- WCAG 2.2 new criteria: Level AA 2.4.11 Focus Not Obscured (Minimum), 2.5.7 Dragging Movements, 2.5.8 Target Size (Minimum), 3.3.8 Accessible Authentication (Minimum); Level A 3.2.6 Consistent Help, 3.3.7 Redundant Entry.
- 2.3.3 Animation from Interactions (respecting `prefers-reduced-motion`) is Level AAA.
