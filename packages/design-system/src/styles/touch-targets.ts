/** Touch sizing of the bottom bar (DESIGN.md → Focus and accessibility). Appended after the rest of the Soft Workbench final layer.
 *
 * It goes by the input, not by the width: a phone, or any window whose pointer is coarse (a tablet, a phone held sideways), has
 * 44px targets in the bar. A fine-pointer window wider than 600px keeps the sizes the exception in DESIGN.md names. The phone's
 * two-row layout stays in craft-finish.ts, which is by width. */
const SHELL = ":is(body.immersive-workbench:not([data-pane-embedded]), .mw-catalog-bar-stage)";

export const TOUCH_TARGET_STYLES = `
  @media (max-width: 600px), (pointer: coarse) {
    ${SHELL} { --dock-btn: 44px; }
    ${SHELL} .bar-composer .assistant-composer-input { height: 44px; font-size: 16px; line-height: 44px; }
    ${SHELL} .bar-composer [data-assistant-send] { width: 44px; height: 44px; min-height: 44px; }
    ${SHELL} .bar-composer .bar-composer-attach { justify-content: center; min-width: 44px; height: 44px; padding: 0; }
    ${SHELL} .plugin-picker-trigger { justify-content: center; min-width: 44px; }
    html ${SHELL} .workbench-bar .bar-end .navigator-project-selector { grid-template-columns: 44px; width: 44px; height: 44px; min-height: 44px; }
    ${SHELL} .bar-composer :is(.assistant-target, .assistant-target-main, .assistant-target-clear, .assistant-executor, .assistant-materials-button, .assistant-attention) { height: 44px; }
    ${SHELL} .bar-composer :is(.assistant-executor, .assistant-materials-button, .assistant-attention, .assistant-target-clear) { min-width: 44px; }
    ${SHELL} .bar-composer[data-fit="narrow"] .assistant-executor:not([data-chosen]) { min-width: 44px; }
    ${SHELL} .bar-composer .assistant-target[data-mode="work"] { min-width: 88px; }
    /* A line still over its edge once every quiet part has narrowed is crowded (the island sets data-crowded): the choosers go,
       since the side pane has who does it, the Character and the mode, so no chip is squeezed under 44px. */
    ${SHELL} .bar-composer[data-crowded] :is([data-assistant-character], [data-assistant-executor], [data-assistant-mode]) { display: none; }
  }
  /* Wider than a phone, the narrow Assistant column keeps an input that is a 44px target too. */
  @media (pointer: coarse) and (min-width: 601px) { @container assistant-bar (max-width: 460px) { ${SHELL} .bar-composer .assistant-composer-input { flex: 1 1 44px; min-width: 44px; } } }
  @media (pointer: coarse) and (max-height: 560px) and (min-width: 601px) { ${SHELL} { --dock-h: 60px; --composer-h: 50px; } }
`;
