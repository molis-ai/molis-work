import type { UiContribution } from '@molis-ai/molis-work-contracts/platform/ui';
import { BUILDER_PLUGIN_ID, BUILDER_UI_ID } from './manifest.js';
import { renderAgentStudio } from './agent-studio.js';

/** The studio's stage in the workbench (specs/artifact-positioning S4); its client comes with the plugin's workbench pack. */
export function renderStudioStage(text?: Parameters<typeof renderAgentStudio>[0]): string {
  return '<section class="desktop-work-surface pb-surface" data-work-surface="plugin-builder" data-work-surface-label="插件创作工作台" hidden>' + renderAgentStudio(text) + '</section>';
}

/**
 * What a Host passes when it renders the studio through the UI contribution, as the other native plugins' models do: its
 * translator. Without one (a developer fixture renders with no model) the studio is the Chinese text.
 */
export interface BuilderUiModel { readonly primitives?: { text(value: string, values?: Record<string, string | number>): string } }

/** The studio's place in the workbench: its own entry in the plugin list and its stage. */
export const builderUiContribution: UiContribution<BuilderUiModel | null> = {
  descriptor: { contribution_id: BUILDER_UI_ID, plugin_id: BUILDER_PLUGIN_ID, kind: 'primary-page', navigation_id: 'plugin-builder', label: '插件创作工作台',
    surfaces: [{ surface_id: 'directory', target_slot_id: 'workbench.directory', format: 'declarative-html' }, { surface_id: 'workbench', target_slot_id: 'workbench.main', format: 'declarative-html' }], slots: [] },
  render: request => {
    const primitives = request.model?.primitives;
    return request.surface === 'directory' ? '' : renderStudioStage(primitives && ((zh, values) => primitives.text(zh, values)));
  },
};
