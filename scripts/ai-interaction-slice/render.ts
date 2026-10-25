// Isolated preview consumes the existing public source barrel through tsx.
// No product build/dist or running Home is needed, and no product files are modified.
import { icon, renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  renderIconSprite,
  renderShellTokens,
  renderShapeTokens,
  renderControlMetrics,
  PRIMITIVE_STYLES,
  TYPEFACE_STYLES,
  CRAFT_FINISH_STYLES,
  INTERACTION_STYLES,
} from "../../packages/design-system/src/index.ts";
import { renderDemoControls, renderScene } from "./render-frame.ts";
import { frameStyles } from "./styles.ts";
import { cardStyles } from "./styles-cards.ts";

export function renderPreview(): string {
  // The product's own token layers in their production order; the final layer only contributes :root tokens and
  // browser defaults here, because its rules are scoped to the workbench body classes this page does not use.
  const tokens = `:root{${renderShellTokens("light")}${renderShapeTokens()}${renderControlMetrics()}}:root[data-theme="dark"]{${renderShellTokens("dark")}}`;
  const layout = `<div class="pv-switch" role="group" aria-label="示例场景">${renderButton({ label: "个人助理", variant: "ghost", attrs: { "data-layout": "assistant", "aria-pressed": "true" } })}${renderButton({ label: "Coding", variant: "ghost", attrs: { "data-layout": "coding", "aria-pressed": "false" } })}</div>`;
  return `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>AI 交互 · I0 预览</title>
    <link rel="icon" href="data:,"><style>${tokens}${TYPEFACE_STYLES}${PRIMITIVE_STYLES}${CRAFT_FINISH_STYLES}${INTERACTION_STYLES}${frameStyles}${cardStyles}</style></head><body>${renderIconSprite()}
    <header class="pv-titlebar">
      <p class="pv-brand">${icon("brand")}<strong>Molis Work</strong><span class="pv-caption"><span class="pv-dot" aria-hidden="true"></span>交互预览 I0<span class="pv-caption-more"> · 固定示例，提交与执行均为模拟，不连接 Home</span></span></p>
      <div class="pv-tools">${layout}${renderDemoControls()}${renderButton({ label: "深色", icon: "moon", variant: "ghost", className: "pv-theme", attrs: { "data-theme-toggle": true } })}</div>
    </header>
    <main class="pv-stage">${renderScene("assistant")}${renderScene("coding")}</main>
    <script type="module" src="/slice/client.ts"></script></body></html>`;
}
