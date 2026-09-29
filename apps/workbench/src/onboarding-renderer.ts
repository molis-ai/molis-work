import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT, ONBOARDING_CLIENT_SCRIPT } from "./browser-assets.js";
import { renderContextOnboarding } from "./context-onboarding-renderer.js";
import { CONTEXT_ONBOARDING_STYLES } from "./styles/context-onboarding.js";

type OnboardingIcon = MolisWorkIcon;
export interface OnboardingRenderPrimitives {
  L(text: string): string;
  escapeHtml(value: unknown): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  withDesktopQuery(target: string): string;
  nativeDesktopBootstrapScript: string;
  clientI18nScript(): string;
  icon(name: OnboardingIcon): string;
  renderIconSprite(): string;
}

export interface MolisWorkOnboardingRenderOptions {
  mode: "first_run" | "new_project" | "update";
  currentVersion: string | null;
  controlToken?: string;
  desktopShell?: boolean;
  cliAvailability?: Record<string, boolean>;
}

/** The workbench in miniature: the surface with three rows over the resident bar. Decorative only. */
function miniWorkbench(icon: (name: OnboardingIcon) => string): string {
  const row = (glyph: OnboardingIcon, width: number, sub: number) => `<div class="ob-mini-row"><i>${icon(glyph)}</i><span><b style="width:${width}%"></b><s style="width:${sub}%"></s></span></div>`;
  return `<div class="ob-mini"><div class="ob-mini-surface"><b class="ob-mini-title"></b>${row("target", 62, 40)}${row("rss", 48, 58)}${row("note", 70, 36)}</div><div class="ob-mini-bar"><span class="ob-mini-dock"><i></i><i class="is-on"></i><i></i></span><span class="ob-mini-composer"><i></i><em></em></span><span class="ob-mini-avatar"></span></div></div>`;
}

export function createWorkbenchOnboardingRenderer(primitives: OnboardingRenderPrimitives) {
  const { L, escapeHtml, htmlLang, controlTokenMeta, withDesktopQuery, clientI18nScript,
    nativeDesktopBootstrapScript: NATIVE_DESKTOP_BOOTSTRAP_SCRIPT } = primitives;
  return function renderMolisWorkOnboarding(options: MolisWorkOnboardingRenderOptions): string {
  const desktopShell = Boolean(options.desktopShell);
  const href = (target: string) => desktopShell ? withDesktopQuery(target) : target;
  if (options.mode === "update") {
    const version = options.currentVersion ? ` ${escapeHtml(options.currentVersion)}` : "";
    return `<!doctype html>
<html lang="${htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${controlTokenMeta(options.controlToken ?? "")}
  <title>${L("Molis Work 已更新")}</title>
  <script>${NATIVE_DESKTOP_BOOTSTRAP_SCRIPT}</script>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <style>${CONTEXT_ONBOARDING_STYLES}</style>
</head>
<body class="cx-page onboarding-page onboarding-page--update" data-onboarding-mode="update"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${primitives.renderIconSprite()}
  <div class="ob-stage">
    <header class="ob-outside"><span class="ob-brand">${primitives.icon("brand")}<span>Molis Work</span></span></header>
    <main class="ob-window onboarding-update" aria-labelledby="onboarding-update-title">
      <div class="ob-windowbar" aria-hidden="true"><span>Molis Work</span></div>
      <div class="ob-content">
        <section class="ob-question onboarding-update-copy">
          <div class="ob-mark">${primitives.icon("sparkles")}<b>${primitives.icon("check")}</b></div>
          <h1 id="onboarding-update-title">${L("Molis Work 已更新")}${version}</h1>
          <p>${L("你的项目、资料和工作记录仍保存在本机。")}</p>
          <ul class="ob-update-list">
            <li><strong>${L("从已有资料开始一个项目")}</strong><span>${L("选择文件、网页或工作往来，整理背景、进展与下一步。")}</span></li>
            <li><strong>${L("连接账号后继续整理")}</strong><span>${L("在来源清单中连接账号，确认整理建议后再建立项目。")}</span></li>
          </ul>
          <p class="cx-error onboarding-error" data-onboarding-error role="alert" hidden></p>
        </section>
        <aside class="ob-preview" aria-hidden="true">${miniWorkbench(primitives.icon)}</aside>
      </div>
      <footer class="ob-footer onboarding-update-actions"><a class="ob-link" href="${href("/settings/projects")}">${L("查看项目设置")}</a><div class="ob-footer-actions"><button class="cx-button primary" type="button" data-onboarding-dismiss="update">${L("继续使用 Molis Work")}${primitives.icon("arrow")}</button></div></footer>
    </main>
  </div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
  }

  return renderContextOnboarding(options, primitives);
  };
}
