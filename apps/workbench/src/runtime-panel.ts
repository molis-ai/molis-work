import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";

export { RUNTIME_PANEL_CLIENT_SCRIPT } from "./scripts/runtime-panel.js";

/**
 * Where what runs on its own here is shown (specs/proactive-assistant/resident-runtime-design.md §4): the notice of what was missed at
 * the top of the project chooser when Molis Work opens again. The page's program (`RUNTIME_PANEL_CLIENT_SCRIPT`) fills it from
 * `/api/runtime/overview`; it stays hidden until there is something to say. The menu-bar capsule's 「运行」 section went with the
 * capsule (batch 44, PEQ-13) and comes back with its redo (BL-capsule-redo).
 */
export function renderRuntimePanel(): string {
  return `<section class="runtime-panel" data-runtime-panel aria-label="${uiText("workbench.runtime-panel.label")}" hidden><div data-runtime-body aria-live="polite"></div></section>`;
}
