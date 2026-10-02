import { ARRIVAL_MOTION_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";
import { CONTEXT_ONBOARDING_CLIENT } from "./scripts/context-onboarding.js";
import { createArrivalShell } from "./arrival/shell.js";
import type { MolisWorkOnboardingRenderOptions, OnboardingRenderPrimitives } from "./onboarding-renderer.js";

/**
 * The real first-run and new-project journey, drawn in the arrival frame (specs/archive/project-arrival-flow): a titlebar,
 * a stage and the resident bar. The shell carries the way out and the quiet first stage; the client script draws
 * every step into `#cx-app` and changes the bar's three blocks.
 */
export function renderContextOnboarding(options: MolisWorkOnboardingRenderOptions, p: OnboardingRenderPrimitives): string {
  const desktopShell = Boolean(options.desktopShell);
  const shell = createArrivalShell({ ...p, themeBootstrapScript: `${p.nativeDesktopBootstrapScript}${THEME_BOOTSTRAP_SCRIPT}`, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT });
  const firstRun = options.mode === "first_run";
  const exit = firstRun
    ? `<button class="mw-btn mw-btn--ghost mw-btn--lg arrival-back" data-slot="button" type="button" id="cx-exit"><span data-slot="button-label">${p.L("稍后再说")}</span></button>`
    : `<button class="mw-btn mw-btn--ghost mw-btn--lg arrival-back" data-slot="button" type="button" id="cx-exit" aria-label="${p.L("返回项目")}">${p.icon("back")}<span data-slot="button-label">${p.L("返回项目")}</span></button>`;
  const stage = `<main class="arrival-stage" id="cx-app" aria-busy="true"><div class="stage-single"><div class="stage-sheet" data-ob-view="loading"><div class="ob-error-page"><h1 id="ob-title" tabindex="-1">${p.L("从你正在做的事开始。")}</h1><p role="status">${p.L("正在检查可用的来源…")}</p></div></div></div></main>`;
  return shell.document({
    title: `${p.L("从已有工作开始")} · Molis Work`, screen: "onboard", desktopShell, controlToken: options.controlToken ?? "",
    bodyAttrs: ` data-onboarding-mode="${options.mode}"`,
    titlebar: shell.titlebar(desktopShell, { theme: true }), stage, bar: shell.bar({ kind: "onboard", start: exit }),
    after: `<template id="cx-caption">${shell.caption()}</template><template id="cx-wordmark">${shell.wordmark()}</template><dialog id="cx-dialog" class="cx-dialog" aria-labelledby="cx-dialog-title"></dialog>`,
    scripts: `${p.clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}${ARRIVAL_MOTION_CLIENT_SCRIPT}${CONTEXT_ONBOARDING_CLIENT}`,
  });
}
