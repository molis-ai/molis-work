import { SKILL_PACK_BOARD_STYLES } from "@molis-ai/molis-work-design-system";
/** Product use of the reviewed list/detail and stacked-item specimens. */
export const SKILL_SETTINGS_STYLES = SKILL_PACK_BOARD_STYLES + `
.skill-settings { max-width: 1100px; }
.skill-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-block: 16px; }
.skill-toolbar input { flex: 1 1 180px; min-width: 0; width: auto; }
.skill-toolbar select { flex: 0 1 auto; width: auto; max-width: 100%; }
.skill-settings .mw-facts dd { white-space: pre-wrap; }
.skill-full-text { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
.skill-settings .mw-radio-group { display: grid; gap: 10px; border: 0; margin: 0; padding: 0; }
.skill-settings .mw-check-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-height: 32px; }
.skill-settings .mw-check-row small { flex: 1 1 100%; padding-left: 24px; }
.skill-segments { display: flex; flex-wrap: wrap; gap: 4px; border: 0; padding: 0; margin: 8px 0; }
.skill-segments label { display: flex; align-items: center; justify-content: center; gap: 6px; flex: 1; padding: 8px; background: var(--nav-hover); border-radius: 8px; }
.skill-segments label:has(:checked) { background: var(--nav-active); }
.skill-enable-row, .skill-import-row { padding-block: 12px; border-bottom: 1px solid var(--line); }
.skill-sr { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
[data-sk-import-panel] { padding-block: 12px; margin-bottom: 20px; border-bottom: 1px solid var(--line); }
[data-sk-import-panel] > select { margin-right: 8px; }
.skill-settings .mw-items { padding: 0; list-style: none; }
`;
