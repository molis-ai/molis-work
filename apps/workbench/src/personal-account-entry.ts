import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite, renderWordmark, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { renderWorkbenchDocument } from "./document-shell.js";
import { createWorkbenchLocale } from "./i18n.js";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";

/** The same workbench document and account controls, without opening an anonymous business Home. */
export function renderPersonalAccountEntry(controlToken: string, desktop: boolean, message?: string,
  locale: Pick<ReturnType<typeof createWorkbenchLocale>, "L" | "htmlLang" | "clientI18nScript"> = createWorkbenchLocale(() => "zh"), nativeBootstrap = ""): string {
  const { L } = locale;
  return renderWorkbenchDocument({lang: locale.htmlLang(), title: "Molis Work",
    body_attributes: {class: "arrival-page immersive-workbench", "data-arrival": "welcome", "data-account-entry": true, "data-native-desktop": desktop ? "true" : null},
    head_html: `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}"><script>${THEME_BOOTSTRAP_SCRIPT}${desktop ? nativeBootstrap : ""}</script><link rel="stylesheet" href="/assets/molis-work-arrival.css">`,
    body_html: `${renderIconSprite()}<div class="arrival" data-screen="welcome"><header class="arrival-titlebar"${desktop ? ' data-tauri-drag-region="deep"' : ""}><span class="arrival-brand">${icon("brand")}${renderWordmark()}</span></header>
      <main class="arrival-stage"><section class="mw-empty"><h1>${escapeHtml(L("登录 / 注册 molis AI"))}</h1><p>${escapeHtml(L("登录后可管理你的 molis 账号"))}</p>
      <button class="mw-btn mw-btn--primary" type="button" data-account-link aria-label="${escapeHtml(L("账号管理"))}">${icon("user")}<span data-personal-name>${escapeHtml(L("未登录"))}</span></button>
      <p role="status" data-account-entry-status>${escapeHtml(message ?? "")}</p><button class="mw-btn mw-btn--secondary" type="button" data-personal-action="retry"${message ? "" : " hidden"}>${escapeHtml(L("重试"))}</button></section></main></div>
      <script>${locale.clientI18nScript()}${CONTROL_CLIENT_SCRIPT}</script>`});
}
