/** UIV-01/02/11: one writing surface; the dock reserves space for its growing composer. */
export const UIV_STYLE = `
html body form.uiv-composer[data-uiv-bound] :is(textarea[data-uiv-input], .assistant-composer-input[data-uiv-input]) {
  box-sizing: border-box; flex: none; width: 100%; min-width: 0; max-width: 100%;
  height: 44px; min-height: 44px; max-height: min(160px, 20dvh); margin: 0; padding: 8px 4px;
  font: inherit; font-size: 16px; line-height: 1.45; font-weight: var(--weight-body);
  border: 0; border-radius: 0; background: transparent; color: var(--ink);
  resize: none; field-sizing: fixed; overflow: auto; overflow-wrap: anywhere; box-shadow: none; caret-color: var(--ink);
}
html body form.uiv-composer[data-uiv-bound] [data-uiv-input]:placeholder-shown { white-space: pre; text-overflow: ellipsis; }
html body form.uiv-composer[data-uiv-bound] :is(textarea[data-uiv-input], .assistant-composer-input[data-uiv-input]):focus {
  outline: none; box-shadow: none;
}
html body form.uiv-composer[data-uiv-bound].uiv-writing-surface,
html body form.uiv-composer[data-uiv-bound] .uiv-writing-surface {
  background: var(--paper); border: 0; border-radius: var(--r-composer);
}
html body form.uiv-composer[data-uiv-bound].uiv-writing-surface:has([data-uiv-input]:focus),
html body form.uiv-composer[data-uiv-bound] .uiv-writing-surface:has([data-uiv-input]:focus) {
  outline: var(--focus-stroke); outline-offset: 1px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent);
}
html body form.uiv-composer[data-uiv-bound] [data-uiv-input]:disabled { background: transparent; color: var(--muted); cursor: not-allowed; }
html body form.uiv-composer[data-home-talk-form] { display: flex; flex-wrap: wrap; width: 100%; gap: 6px; padding: 8px 16px; }
html body form.uiv-composer.bar-composer[data-assistant-composer][data-uiv-bound] {
  position: relative; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  box-sizing: border-box; width: 100%; height: auto; min-height: 0; max-height: none; padding: 4px 8px; overflow: visible;
}
html body form.uiv-composer.bar-composer[data-uiv-bound] > [data-uiv-input] { flex: 1 1 64px; width: auto; min-width: 64px; order: 1; }
html body form.uiv-composer.bar-composer[data-uiv-bound] > :is([data-assistant-attach], .uiv-bar, [data-assistant-send]) { order: 2; }
html body form.uiv-composer.bar-composer[data-uiv-bound]:has(.uiv-bar button:not([data-uiv-mic], [hidden])) > [data-uiv-input] { flex-basis: 100%; width: 100%; order: -1; }
html body form.uiv-composer.bar-composer[data-uiv-bound] > [data-assistant-send] { margin-left: auto; }
html body form.uiv-composer.bar-composer[data-uiv-bound] > .uiv-status { order: 3; }

html body form.uiv-composer[data-uiv-bound] .uiv-bar { display: flex; flex: 0 1 auto; flex-wrap: wrap; gap: 6px; align-items: center; min-width: 0; max-width: 100%; }
html body form.uiv-composer[data-uiv-bound] .uiv-bar button {
  flex: none; min-width: 32px; height: 32px; min-height: 32px; padding: 0 10px; border: 0; border-radius: var(--r-control);
  background: transparent; color: var(--ink-soft); font: inherit; font-size: 13px; line-height: 1.4; cursor: pointer;
}
html body form.uiv-composer[data-uiv-bound] .uiv-bar [data-uiv-mic] { display: inline-flex; align-items: center; justify-content: center; width: 32px; padding: 0; }
html body form.uiv-composer[data-uiv-bound] .uiv-bar [data-uiv-mic] svg { width: 18px; height: 18px; }
html body form.uiv-composer[data-uiv-bound] .uiv-bar button:hover { background: var(--nav-hover); }
html body form.uiv-composer[data-uiv-bound] .uiv-bar button:focus-visible { outline: var(--focus-stroke); outline-offset: 1px; }
html body form.uiv-composer[data-uiv-bound] .uiv-bar button[hidden] { display: none; }
html body form.uiv-composer[data-uiv-bound] .uiv-status { display: flex; flex: none; flex-wrap: wrap; width: 100%; min-width: 0; gap: 2px 8px; }
html body form.uiv-composer[data-uiv-bound] .uiv-status > * { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
html body form.uiv-composer[data-uiv-bound] .uiv-status > :empty { display: none; }
html body form.uiv-composer[data-uiv-bound] :is(.uiv-status[hidden], .uiv-status > [hidden]) { display: none; }
html body form.uiv-composer[data-uiv-bound] :is([data-uiv-voice-status], [data-uiv-send-status]) { flex-basis: 100%; color: var(--ink); }
html body :is(.home-talk, .coding-dialogue):has(> form.uiv-composer) { overflow-y: auto; scroll-padding-block: 8px; }
html body form.uiv-composer[data-coding-composer] .coding-composer-leading { flex-basis: 100%; }

html body.immersive-workbench:has(.workbench-bar form.uiv-composer) { --dock-h: var(--uiv-dock-height); }
html body.immersive-workbench .workbench-bar:has(form.uiv-composer) { min-height: 0; }
html body.immersive-workbench .workbench-bar:has(form.uiv-composer) > .bar-center { margin-block: 6px; }
html body.immersive-workbench .workbench-bar:has(form.uiv-composer) > .bar-center[data-assistant-island] { --next-row: 0px; --context-row: 0px; }
/* Material and next-step rows must reserve space, so focused controls in the main area remain visible. */
html body.immersive-workbench .workbench-bar:has(form.uiv-composer) > .bar-center > :is(.assistant-context-strip, .assistant-next-row) { position: relative; inset: auto; margin-bottom: 6px; max-width: 100%; }
html body.immersive-workbench .workbench-bar:has(form.uiv-composer) .plugin-picker-popover { max-height: min(78dvh, calc(100dvh - var(--dock-h) - var(--desktop-titlebar-height, 32px) - 20px)); overflow-y: auto; }
@media (min-width: 601px) {
  html body.immersive-workbench .immersive-workspace:has(> .workbench-bar .uiv-composer) { grid-template-rows: var(--desktop-titlebar-height) minmax(0, 1fr) auto; }
  html body.immersive-workbench.arrival-page .arrival:has(> .workbench-bar .uiv-composer) { grid-template-rows: var(--arrival-titlebar-h) minmax(0, 1fr) auto; }
}
@media (max-width: 600px) {
  html body.immersive-workbench .workbench-bar:has(form.uiv-composer) { grid-template-rows: auto 50px; }
  html body.immersive-workbench .workbench-bar:has(form.uiv-composer) > .bar-center { margin-block: 4px; }
  html body.immersive-workbench .workbench-bar:has(form.uiv-composer) > .bar-center > :is(.assistant-context-strip, .assistant-next-row) { margin-inline: -8px; max-width: none; }
  html body.immersive-workbench .workbench-bar:has(form.uiv-composer) .assistant-panel { position: absolute; left: 2px; right: 2px; bottom: 100%; height: min(70dvh, 560px, calc(100dvh - var(--desktop-titlebar-height, 0px) - var(--dock-h) - var(--next-row, 0px) - var(--context-row, 0px) - 6px - 8px)); }
}
@media (max-width: 600px), (pointer: coarse) {
  html body form.uiv-composer[data-uiv-bound] :is(.uiv-bar button, [data-coding-send], button[type=submit]) { min-height: 44px; min-width: 44px; height: 44px; }
}
`.replaceAll("\n", " ");
