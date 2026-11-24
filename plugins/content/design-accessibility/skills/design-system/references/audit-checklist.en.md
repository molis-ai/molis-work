# Design system audit checklist

Check category by category. "What to search" gives a starting point — verify every hit manually because token files themselves, third-party code, and test fixtures are not violations.

## Hardcoded values

| Check | What to search | Should use |
| --- | --- | --- |
| Colors | 3/4/6/8-digit `#` hex; `rgb(`, `rgba(`, `hsl(`; named colors like `white`, `black`, `red` | Semantic color tokens |
| Opacity for dimmed text | `opacity` applied to text to make it "lighter" | Secondary or muted text tokens (opacity frequently breaks contrast) |
| Spacing | Off-scale pixel values in `margin`, `padding`, `gap` (e.g., `13px`, `7px`) | Spacing tokens |
| Border radius | Raw pixel `border-radius` values | Radius tokens |
| Typography | Raw `font-size`, `font-weight`, `line-height` numbers | Type scale tokens |
| Shadows | Raw `box-shadow` declarations | Elevation/shadow tokens |
| Motion | Millisecond durations or `cubic-bezier(` in `transition`/`animation` | Motion tokens |
| Stacking order | Arbitrary large `z-index` (e.g., `9999`) | Project layer scale |

## Duplicate components

- Overlapping names: `Button`, `Btn`, `ActionButton`, `PrimaryButton` coexisting;
- Hand-rolled buttons, inputs, tabs, switches, tooltips, or modals when the library provides them;
- Copy-pasted component implementations with minor edits;
- Feature stylesheets overriding internal component class names.

## OS-default controls as product UI

- Visible native `<select>` dropdown menus;
- System `<input type="color">`, `type="date"`, or `type="time"` popups;
- `window.alert`, `window.confirm`, `window.prompt`;
- Unstyled native `type="range"`, checkboxes, or radio inputs.

Keeping a native control underneath for form values and keyboard behavior is fine; the visible UI should come from the component library.

## Missing states

- Only default styling — no hover, active, focus, or disabled states;
- Lists missing empty, loading, or load-error views;
- Errors clearing user input;
- Unavailable features hidden silently or rendered as unresponsive buttons.

## Accessibility gaps

- `outline: none` without a replacement focus indicator;
- Click handlers on `div` or `span` without keyboard support or ARIA role;
- Icon buttons without accessible names;
- Form inputs without linked labels;
- Status indicated by color alone;
- Custom widgets missing keyboard interactions or state announcements.

Use `accessibility-review` for a full WCAG 2.1 AA audit.

## Theme gaps

- Colors defined only for light theme (missing or unchanged in dark theme);
- Images or icons disappearing on dark surfaces;
- Primitive color ramps used directly instead of semantic tokens, breaking theme switches.

## Consistency

- The same action carrying different labels or icons in different places;
- Dates, numbers, or statuses formatted differently across screens;
- Comparable pages diverging in header layout, action placement, or back navigation.
