import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiContribution } from '@molis-ai/molis-work-contracts/platform/ui';
import { BUILDER_UI_ID } from './manifest.js';
import { renderAgentStudio } from './agent-studio.js';

/** The studio's stage in the workbench (specs/artifact-positioning S4); its client comes with the plugin's workbench pack. */
export function renderStudioStage(text?: Parameters<typeof renderAgentStudio>[0]): string {
  const words = text ?? uiText;
  // The workbench copies the label into the pane's aria-label while the studio is open, so it is in the interface language.
  return '<section class="desktop-work-surface pb-surface" data-work-surface="plugin-builder" data-work-surface-label="' + words("plugin-builder.workbench.plugin-studio") + '" hidden>' + renderAgentStudio(words) + '</section>';
}

/**
 * The composition may give the contribution a word reader. With no override, the SDK uses the active Studio context.
 */
export interface BuilderUiModel { readonly primitives?: { text(value: string, values?: Record<string, string | number>): string } }

/** The studio's place in the workbench: its own entry in the plugin list and its stage. */
export const builderUiContribution: UiContribution<BuilderUiModel | null> = {
  descriptor: { contribution_id: BUILDER_UI_ID, kind: 'primary-page', navigation_id: 'plugin-builder', label: '插件创作工作台',
    surfaces: [{ surface_id: 'directory', target_slot_id: 'workbench.directory', format: 'declarative-html' }, { surface_id: 'workbench', target_slot_id: 'workbench.main', format: 'declarative-html' }], slots: [] },
  render: request => {
    const primitives = request.model?.primitives;
    return request.surface === 'directory' ? '' : renderStudioStage(primitives && ((key, values) => primitives.text(key, values)));
  },
};
