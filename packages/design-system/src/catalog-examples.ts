import { renderInteractionExample } from './interaction-example.js';
import { renderPluginPresentationExample } from './plugin-presentation-example.js';

/**
 * The component board's worked examples, composed here so the board's own module does not grow: generated plugin
 * pages, and the AI interaction parts. `section` is the board's section renderer, so each one joins its index.
 */
export function renderCatalogExamples(section: (id: string, title: string, body: string) => string): string {
  return section('plugin-composition', '插件页面组合', renderPluginPresentationExample()) + section('interaction', 'AI 交互 / Interaction', renderInteractionExample());
}
