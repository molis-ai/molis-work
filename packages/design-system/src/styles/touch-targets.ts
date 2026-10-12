/** Touch sizing of the bottom bar (DESIGN.md → Focus and accessibility). Appended after the rest of the Soft Workbench final layer.
 *
 * It goes by the input, not by the width: a phone, or any window whose pointer is coarse (a tablet, a phone held sideways), has
 * 44px targets in the bar. A fine-pointer window wider than 600px keeps the sizes the exception in DESIGN.md names. The phone's
 * two-row layout stays in craft-finish.ts, which is by width.
 *
 * A line still over its edge once every quiet part has narrowed is crowded, and the island (data-crowded) takes parts off in
 * steps, none squeezed under 44px: the choosers go (the side pane has who does it, the Character and the mode), then the work
 * chip's mark (the panel's tab bar starts a new work too), then the materials and the notice, which the "+" lists in a row of
 * their own and which a dot on it points to.
 *
 * What the bar opens is a 44px target too: a button, a summary or a link in the Assistant's lists and offer, the plugin
 * switcher (its pin and add buttons, and the room its rows leave them), the Dock's "+N" list and the project menu. Wider than
 * a phone, a narrow Assistant column keeps an input that is a 44px target too.
 *
 * The phone's second row is an exact sum of 44px targets that touch: seven need 308px and the eighth (a directory button) 352px,
 * 356px with the tray's own 4px, and the bar's 2 × 8px padding and 4px column gap on top of that (375px for eight). Narrower than
 * 375px the gap and the side padding give way (the row reaches the window's edge; the Assistant line above it keeps its place):
 * eight fit from 356px and seven from 312px. Narrower than eight, the Dock drops its "+N" (navigation-presentation.ts) and keeps
 * 项目首页; the switcher lists the rest.
 *
 * The opened Assistant panel's tab bar is a row of 44px targets on touch too: the work's tab with its close mark, "new work", "all
 * works", the details and minimize, side by side without a gap (it is 50px tall; a 320px panel still leaves the tab a title).
 *
 * So is the rest of the panel. One rule covers every button, summary, link and field inside it (the list of all works, the details
 * of a work, and what a conversation holds), so a control the island makes later needs no entry here; a select is drawn as a picker
 * whose button is the target. Two things sit inside a sentence and cannot be boxes: a link is as wide as its words and its padding
 * (above and below, taking no line room) makes it 44px tall, and an object chip keeps its look while an invisible area around it
 * (44px tall, at least 44px wide) answers to a finger. tests/touch-targets.e2e.test.ts reads the kinds of control from the script
 * the page runs and measures each.
 *
 * The 诊断编号 button the shared request helper puts after an error message (in an error area, or in a toast) is such a link: padding above
 * and below (`--reach`, 16px here) make it 44px tall and an equal negative margin takes the room back, so the line and the toast keep their
 * height. In a toast the same padding gives a fine pointer a 33px target (craft-finish.ts, 10px). tests/request-failure-call-id.e2e.test.ts
 * measures it, with a finger's reach, in a toast and in an error area. */
const SHELL = ":is(body.immersive-workbench:not([data-pane-embedded]), .mw-catalog-bar-stage)";
const ASSIST = "body.immersive-workbench:not([data-pane-embedded])";

export const TOUCH_TARGET_STYLES = `
  @media (max-width: 600px), (pointer: coarse) {
    ${SHELL} { --dock-btn: 44px; --menu-row: 44px; }
    ${SHELL} .bar-composer .assistant-composer-input { height: 44px; font-size: 16px; line-height: 44px; }
    ${SHELL} .bar-composer [data-assistant-send] { width: 44px; height: 44px; min-height: 44px; }
    ${SHELL} .bar-composer .bar-composer-attach { position: relative; justify-content: center; min-width: 44px; height: 44px; padding: 0; }
    ${SHELL} .plugin-picker-trigger { justify-content: center; min-width: 44px; }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-selector { grid-template-columns: 44px; width: 44px; height: 44px; min-height: 44px; }
    ${SHELL} .bar-composer :is(.assistant-target, .assistant-target-main, .assistant-target-clear, .assistant-executor, .assistant-materials-button, .assistant-attention) { height: 44px; }
    ${SHELL} .bar-composer :is(.assistant-executor, .assistant-materials-button, .assistant-attention, .assistant-target-clear) { min-width: 44px; }
    ${SHELL} .bar-composer[data-fit="narrow"] .assistant-executor:not([data-chosen]) { min-width: 44px; }
    ${SHELL} .bar-composer .assistant-target[data-mode="work"] { min-width: 88px; }
    ${SHELL} .bar-composer[data-crowded] :is([data-assistant-character], [data-assistant-executor], [data-assistant-mode]) { display: none; }
    ${SHELL} .bar-composer:is([data-crowded="mark"], [data-crowded="chips"]) .assistant-target-clear { display: none; }
    ${SHELL} .bar-composer:is([data-crowded="mark"], [data-crowded="chips"]) .assistant-target[data-mode="work"] { min-width: 44px; }
    ${SHELL} .bar-composer[data-crowded="chips"] :is(.assistant-materials-button, .assistant-attention) { display: none; }
    ${SHELL} .bar-composer[data-crowded="chips"]:has(.assistant-materials-button:not([hidden]), .assistant-attention:not([hidden])) .bar-composer-attach::after {
      content: ""; position: absolute; top: 9px; right: 9px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); pointer-events: none;
    }
    ${SHELL} :is(.assistant-popover, .assistant-offer, .plugin-picker-popover, .dock-overflow, .navigator-project-menu-popover, .assistant-panel) :is(button:not(.assistant-inline-object), summary, a[href]:not(.assistant-link), input:not([type=checkbox], [type=radio]), select, textarea) { min-width: 44px; min-height: 44px; }
    .plugin-picker-popover { --ops-btn: 44px; }
    ${ASSIST} .assistant-tabbar { height: 50px; gap: 0; }
    ${ASSIST} :is(.assistant-tab, .assistant-tab-new) { height: 44px; margin-bottom: 0; }
    ${ASSIST} .assistant-works { top: 52px; }
    ${ASSIST} :is(.assistant-choice-row, .assistant-code-head) { min-height: 44px; }
    ${ASSIST} .assistant-link { padding-block: 15px; }
    ${ASSIST} .assistant-inline-object { position: relative; min-width: 44px; justify-content: center; }
    ${ASSIST} .assistant-inline-object::after { content: ""; position: absolute; inset: -12px -2px; }
    [data-molis-call-id] {--reach:16px;padding-block:var(--reach);margin-block:calc(-1*var(--reach));}
  }
  @media (max-width: 374px) { ${SHELL} .workbench-bar { column-gap: 0; padding-inline: 0; } ${SHELL} .bar-center { margin-inline: 8px; } }
  @media (pointer: coarse) and (min-width: 601px) { @container assistant-bar (max-width: 460px) { ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 44px; min-width: 44px; } } }
  @media (pointer: coarse) and (max-height: 560px) and (min-width: 601px) { ${SHELL} { --dock-h: 60px; --composer-h: 50px; } }
`;
