import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createArrivalShell } from "./arrival/shell.js";
import { readEventStream } from "./browser/event-stream.js";
import { sceneReviewPage, renderSceneReview } from "./browser/scene-review-view.js";
import { sceneOnboarding } from "./browser/scene-onboarding.js";
import type { MolisWorkOnboardingRenderOptions, OnboardingRenderPrimitives } from "./onboarding-renderer.js";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";

export function renderSceneOnboarding(options: MolisWorkOnboardingRenderOptions, p: OnboardingRenderPrimitives) {
  const shell = createArrivalShell({ ...p, themeBootstrapScript: p.nativeDesktopBootstrapScript + THEME_BOOTSTRAP_SCRIPT,
    visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT });
  const title = t.text("workbench.scene.title"), desktop = Boolean(options.desktopShell);
  const project = options.projectId, exit = project ? "/projects/" + encodeURIComponent(project) + "/settings" : "/onboarding";
  const back = desktop ? p.withDesktopQuery(exit) : exit;
  const stage = `<main class="arrival-stage" data-scene-workspace data-project="${p.escapeHtml(project ?? "")}">
    <div class="stage-single"><div class="stage-sheet scene-sheet" data-scroll><div class="scene-columns">
    <header><p data-scene-context hidden></p><h1>${p.escapeHtml(title)}</h1><p data-scene-purpose hidden></p></header>
    <section class="scene-review"><div data-scene-main></div>
    <p class="cx-error ob-error" data-scene-error role="alert" hidden></p>
    <aside data-scene-aside aria-label="${t("workbench.scene.all")}"></aside></section></div></div></div></main>`;
  const start = `<a class="mw-btn mw-btn--ghost arrival-back" href="${p.escapeHtml(back)}">${p.icon("back")}${t("common.control.back")}</a>`;
  return shell.document({ title: title + " · Molis Work", screen: "onboard", desktopShell: desktop, controlToken: options.controlToken ?? "",
    titlebar: shell.titlebar(desktop, {}), stage, bar: shell.bar({ kind: "onboard", start }),
    scripts: CONTROL_CLIENT_SCRIPT + ";(" + sceneOnboarding.toString() + ")(globalThis.molisWorkRequest," + readEventStream.toString() +
      ",(key,args)=>globalThis.t.text(key,args),ref=>globalThis.say.text(ref)," + sceneReviewPage.toString() + "," + renderSceneReview.toString() + ");" });
}
