/**
 * The page shell. The product's own token layers in their production order and the design system's styles; the preview
 * adds composition only. The recordings are embedded so the page needs no second request and works offline.
 */
import { PRIMITIVE_STYLES, TYPEFACE_STYLES, CRAFT_FINISH_STYLES, renderIconSprite, renderShellTokens, renderShapeTokens, renderControlMetrics, INTERACTION_STYLES, renderInteractionComposerTarget } from "../../packages/design-system/src/index.ts";
import { COMPOSER_TARGET } from "./labels.ts";
import { frameStyles } from "./styles.ts";
import type { Recording } from "./facts.ts";

/** `</script>` and `<!--` inside embedded JSON would end the script early. */
const embed = (value: unknown): string => JSON.stringify(value).replace(/</g, "\\u003c");

/** The design-system markup the browser side needs, rendered here by the design system's own functions: label -> markup. */
export const composerTargets = (): Record<string, string> =>
  Object.fromEntries(Object.values(COMPOSER_TARGET).map(label => [label, renderInteractionComposerTarget(label)]));

export function renderPage(recordings: { readonly assistant: Recording; readonly coding: Recording }): string {
  const tokens = `:root{${renderShellTokens("light")}${renderShapeTokens()}${renderControlMetrics()}}:root[data-theme="dark"]{${renderShellTokens("dark")}}`;
  return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>输入回执 · R0 预览</title>
<link rel="icon" href="data:,"><style>${tokens}${TYPEFACE_STYLES}${PRIMITIVE_STYLES}${INTERACTION_STYLES}${CRAFT_FINISH_STYLES}${frameStyles}.pv-chrome{display:contents}</style></head>
<body>${renderIconSprite()}
<div id="chrome" class="pv-chrome"></div><main id="stage" class="pv-stage"></main>
<p id="live" class="sr-only" role="status" aria-live="polite"></p>
<noscript><p style="padding:16px">这个预览需要 JavaScript。</p></noscript>
<script type="application/json" id="data-assistant">${embed(recordings.assistant)}</script>
<script type="application/json" id="data-coding">${embed(recordings.coding)}</script>
<script type="application/json" id="data-parts">${embed({ composerTarget: composerTargets() })}</script>
<script type="module" src="/slice/client.ts"></script></body></html>`;
}
