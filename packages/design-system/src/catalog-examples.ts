import { renderContextToolbarExample } from './context-toolbar-example.js';
import { renderInputReceiptsExample } from './input-receipts-example.js';
import { renderInteractionExample } from './interaction-example.js';
import { renderPluginPresentationExample } from './plugin-presentation-example.js';
import { resolveCatalogSay, type CatalogSay } from './primitives/catalog-parts.js';

/**
 * The component board's worked examples, composed here so the board's own module does not grow: generated plugin
 * pages, the AI interaction parts, the context toolbar, and the receipt under a supplement. `section` is the board's section renderer, so each one joins its index.
 */
export function renderCatalogExamples(
  section: (id: string, title: string, body: string) => string,
  say: CatalogSay = resolveCatalogSay(),
): string {
  return section('plugin-composition', say('workbench.catalog-board.ex.sec-plugin-composition'), renderPluginPresentationExample(say))
    + section('interaction', say('workbench.catalog-board.ex.sec-interaction'), renderInteractionExample(say))
    + section('context-toolbar', say('workbench.catalog-board.ex.sec-context-toolbar'), renderContextToolbarExample(say))
    + section('input-receipts', say('workbench.catalog-board.ex.sec-input-receipts'), renderInputReceiptsExample(say));
}
