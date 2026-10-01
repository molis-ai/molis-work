import { ARRIVAL_MOTION_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT, ONBOARDING_CLIENT_SCRIPT } from "./browser-assets.js";
import { renderContextOnboarding } from "./context-onboarding-renderer.js";
import { createArrivalShell } from "./arrival/shell.js";

type OnboardingIcon = MolisWorkIcon;
export interface OnboardingRenderPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
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
  const { L, escapeHtml, withDesktopQuery, clientI18nScript } = primitives;
  return function renderMolisWorkOnboarding(options: MolisWorkOnboardingRenderOptions): string {
  const desktopShell = Boolean(options.desktopShell);
  const href = (target: string) => desktopShell ? withDesktopQuery(target) : target;
  if (options.mode === "update") {
    // After an update: what is new, in the arrival frame, with one way on.
    const shell = createArrivalShell({ ...primitives, themeBootstrapScript: `${primitives.nativeDesktopBootstrapScript}${THEME_BOOTSTRAP_SCRIPT}`, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT });
    const version = options.currentVersion ? ` ${escapeHtml(options.currentVersion)}` : "";
    const stage = `<main class="arrival-stage" aria-labelledby="onboarding-update-title"><div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="update">
      <section class="welcome-q onboarding-update-copy"><h1 id="onboarding-update-title" tabindex="-1">${L("Molis Work 已更新")}${version}</h1><p>${L("你的项目、资料和工作记录仍保存在本机。")}</p>
        <ul class="ob-update-list"><li><strong>${L("从已有资料开始一个项目")}</strong><span>${L("选择文件、网页或工作往来，整理背景、进展与下一步。")}</span></li><li><strong>${L("连接账号后继续整理")}</strong><span>${L("在来源清单中连接账号，确认整理建议后再建立项目。")}</span></li></ul>
        <p class="cx-error ob-error onboarding-error" data-onboarding-error role="alert" hidden></p></section>
      <aside class="welcome-scene" aria-hidden="true">${miniWorkbench(primitives.icon)}</aside></div></div></main>`;
    const bar = shell.bar({
      kind: "update",
      start: `<a class="mw-btn mw-btn--ghost mw-btn--lg arrival-back" data-slot="button" href="${href("/settings/projects")}"><span data-slot="button-label">${L("查看项目设置")}</span></a>`,
      end: `<button class="mw-btn mw-btn--primary mw-btn--lg" data-slot="button" type="button" data-onboarding-dismiss="update" aria-keyshortcuts="Enter"><span data-slot="button-label">${L("继续使用 Molis Work")}</span><kbd class="mw-btn__key" aria-hidden="true">↵</kbd></button>`,
    });
    return shell.document({
      title: L("Molis Work 已更新"), screen: "update", desktopShell, controlToken: options.controlToken ?? "",
      bodyAttrs: ` data-onboarding-mode="update"`, titlebar: shell.titlebar(desktopShell, { tools: false }), stage, bar,
      scripts: `${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${ARRIVAL_MOTION_CLIENT_SCRIPT}${ONBOARDING_CLIENT_SCRIPT}
(() => { const mark = document.querySelector('.arrival-titlebar [data-wordmark]'); window.molisArrival?.settleWordmark(mark); })();`,
    });
  }

  return renderContextOnboarding(options, primitives);
  };
}
