import { connectorMark } from "./connector-marks.js";
import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";
import { CONTEXT_ONBOARDING_CLIENT } from "./scripts/context-onboarding.js";
import { CONTEXT_ONBOARDING_STYLES } from "./styles/context-onboarding.js";
import type { MolisWorkOnboardingRenderOptions, OnboardingRenderPrimitives } from "./onboarding-renderer.js";

/**
 * The real first-run and new-project journey, presented as one horizontal window on a softly lit desk:
 * a question with its choices on the left, a small live preview of what those choices make on the right,
 * short-line progress and the next step in the footer. The client script renders every state inside
 * #cx-app; this shell only carries the brand, the way out and the promise about what is read.
 */
export function renderContextOnboarding(options: MolisWorkOnboardingRenderOptions, p: OnboardingRenderPrimitives): string {
  const href = (path: string) => options.desktopShell ? p.withDesktopQuery(path) : path;
  const exitLabel = p.L(options.mode === "first_run" ? "稍后再说" : "返回项目");
  return `<!doctype html><html lang="${p.htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${p.controlTokenMeta(options.controlToken ?? "")}<title>${p.L("从已有工作开始")} · Molis Work</title><script>${p.nativeDesktopBootstrapScript}${THEME_BOOTSTRAP_SCRIPT}</script><style>${CONTEXT_ONBOARDING_STYLES}</style></head><body class="cx-page" data-onboarding-mode="${options.mode}"${options.desktopShell ? ' data-native-desktop="true"' : ""}>${p.renderIconSprite()}<div class="ob-stage"><header class="ob-outside"><a class="ob-brand" href="${href("/")}">${p.icon("brand")}<span>Molis Work</span></a><div class="ob-outside-actions"><button class="ob-link" type="button" id="cx-theme" aria-label="${p.L("切换主题")}">${p.icon("switch")}<span>${p.L("切换主题")}</span></button><button class="ob-link" type="button" id="cx-exit">${exitLabel}${p.icon("arrow")}</button></div></header><main class="ob-window" aria-labelledby="ob-title"><div class="ob-windowbar" aria-hidden="true"><span>Molis Work</span></div><div id="cx-app" aria-busy="true"><div class="ob-content" data-ob-view="loading"><section class="ob-question"><h1 id="ob-title" tabindex="-1">${p.L("从你正在做的事开始。")}</h1><p role="status">${p.L("正在检查可用的来源…")}</p></section></div></div></main><p class="ob-outside-note">${p.icon("shield")}<span>${p.L("只读取清单中选中的范围。原文件与消息保持原样。")}</span></p></div><template id="cx-gmail-icon">${connectorMark("gmail")?.svg ?? ""}</template><dialog id="cx-dialog" class="cx-dialog" aria-labelledby="cx-dialog-title"></dialog><script>${p.clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${CONTEXT_ONBOARDING_CLIENT}</script></body></html>`;
}
