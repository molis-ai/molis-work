import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT, ONBOARDING_CLIENT_SCRIPT } from "./browser-assets.js";
import { renderContextOnboarding } from "./context-onboarding-renderer.js";

type OnboardingIcon = "clock" | "terminal" | "target" | "brand" | "workflow" | "settings" | "search" | "switch" | "activity" | "book" | "back" | "arrow" | "chevron-down" | "refresh";
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

const ONBOARDING_ATMOSPHERE = `<div class="onboarding-atmosphere" aria-hidden="true"></div>`;

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
  <link rel="stylesheet" href="/assets/molis-work-onboarding.css">
</head>
<body class="onboarding-page onboarding-page--update"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${ONBOARDING_ATMOSPHERE}
  <main class="onboarding-update" aria-labelledby="onboarding-update-title">
    <span class="onboarding-brand">Molis Work</span>
    <div class="onboarding-update-copy">
      <h1 id="onboarding-update-title">${L("Molis Work 已更新")}${version}</h1>
      <p>${L("你的项目、资料和工作记录仍保存在本机。")}</p>
      <ul>
        <li><strong>${L("从已有资料开始一个项目")}</strong><span>${L("选择文件、网页或工作往来，整理背景、进展与下一步。")}</span></li>
        <li><strong>${L("连接账号后继续整理")}</strong><span>${L("在来源清单中连接账号，确认整理建议后再建立项目。")}</span></li>
      </ul>
    </div>
    <div class="onboarding-update-actions">
      <button class="mw-btn mw-btn--primary" type="button" data-onboarding-dismiss="update">${L("继续使用 Molis Work")}</button>
      <a href="${href("/settings/projects")}">${L("查看项目设置")}</a>
    </div>
    <p class="onboarding-error" data-onboarding-error role="alert" hidden></p>
  </main>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ONBOARDING_CLIENT_SCRIPT}</script>
</body>
</html>`;
  }

  return renderContextOnboarding(options, primitives);
  };
}
