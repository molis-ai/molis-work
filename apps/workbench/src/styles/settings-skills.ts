import { SKILL_PACK_BOARD_STYLES } from "@molis-ai/molis-work-design-system";
/** Product use of the reviewed list/detail and stacked-item specimens: 08's Skill parts in the plugin install review. The 「能力包」 page's own rules come with its program (browser/kit/styles.ts). */
export const SKILL_SETTINGS_STYLES = SKILL_PACK_BOARD_STYLES + `
.skill-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-block: 16px; }
.skill-segments { display: flex; flex-wrap: wrap; gap: 4px; border: 0; padding: 0; margin: 8px 0; }
.skill-segments label { display: flex; align-items: center; justify-content: center; gap: 6px; flex: 1; padding: 8px; background: var(--nav-hover); border-radius: 8px; }
.skill-segments label:has(:checked) { background: var(--nav-active); }
.skill-enable-row { padding-block: 12px; border-bottom: 1px solid var(--line); }
.skill-sr { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;
