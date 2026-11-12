import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export { RUNTIME_PANEL_CLIENT_SCRIPT } from "./scripts/runtime-panel.js";

/**
 * Where what runs on its own here is shown (specs/proactive-assistant/resident-runtime-design.md §4): the 「运行」 section of the menu-bar
 * capsule, and the notice of what was missed at the top of the project chooser when Molis Work opens again. The page's program
 * (`RUNTIME_PANEL_CLIENT_SCRIPT`) fills it from `/api/runtime/overview`. The Home's notice stays hidden until there is something to say; the
 * capsule's section always says at least whether it is running (it is a row of the capsule's grid, which a hidden item would shift).
 */
export function renderRuntimePanel(mode: "capsule" | "home"): string {
  return `<section class="runtime-panel" data-runtime-panel data-mode="${mode}" aria-label="${uiText("workbench.runtime-panel.label")}"${mode === "home" ? " hidden" : ""}><div data-runtime-body aria-live="polite"></div></section>`;
}

/** The capsule's 「运行」 section, drawn on the capsule's own tokens (the capsule does not load the workbench sheet). Arrangement only. */
export const RUNTIME_PANEL_CAPSULE_STYLES = `
  .runtime-panel { min-width: 0; max-height: 232px; overflow-y: auto; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--paper); overscroll-behavior: contain; }
  .runtime-panel[hidden] { display: none; }
  .runtime-panel [data-runtime-body] { display: grid; gap: 8px; }
  .runtime-panel__status { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ink-soft); font-size: 12px; }
  .runtime-panel__status i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
  .runtime-panel__status[data-tone="waiting"] i { background: var(--amber); }
  .runtime-panel__notice { display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .runtime-panel__notice[data-tone="warning"] { border-color: color-mix(in srgb, var(--amber) 45%, var(--line)); background: color-mix(in srgb, var(--amber) 8%, var(--paper)); }
  .runtime-panel__notice[data-tone="success"] { border-color: color-mix(in srgb, var(--green) 40%, var(--line)); background: color-mix(in srgb, var(--green) 8%, var(--paper)); }
  .runtime-panel__notice > strong { color: var(--ink); font-size: 12px; font-weight: var(--weight-control, 500); }
  .runtime-panel__rows { display: grid; margin: 0; padding: 0; list-style: none; }
  .runtime-panel__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-height: 34px; }
  .runtime-panel__copy { display: grid; min-width: 0; }
  .runtime-panel__copy strong, .runtime-panel__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .runtime-panel__copy strong { color: var(--ink); font-size: 12px; font-weight: 400; }
  .runtime-panel__copy small { color: var(--muted); font-size: 11px; }
  .runtime-panel__end { display: flex; align-items: center; gap: 6px; }
  .runtime-panel__button { height: 26px; padding: 0 10px; }
  .runtime-panel__time, .runtime-panel__more { color: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .runtime-panel__more { margin: 0; }
  .runtime-panel__waiting { display: inline-flex; align-items: center; gap: 4px; color: var(--ink-soft); font-size: 11px; }
  .runtime-panel__waiting::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--amber); }
  .runtime-panel__next h3 { margin: 0 0 2px; color: var(--muted); font-size: 11px; font-weight: var(--weight-control, 500); }
  .runtime-panel__actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
  .runtime-panel .runtime-failed { grid-column: 1 / -1; color: var(--red); font-size: 11px; }
  .runtime-panel__link { justify-self: start; color: var(--accent); font-size: 12px; }
`;
