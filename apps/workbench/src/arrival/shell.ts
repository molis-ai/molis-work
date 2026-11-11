import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { ACCOUNT_CLIENT_SCRIPT } from "../scripts/account.js";
import { escapeHtml, icon, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderCaption, renderIconSprite, renderWordmark, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { homePluginSideTabs } from "../home-plugin-navigation.js";
import { renderSidePanel, renderSideStrip, SIDE_PANEL_SCRIPT, SIDE_PANEL_STYLES } from "../side-panel.js";
import { ACCOUNT_REGISTRATION_BODY, NO_FAVICON_LINK, renderWorkbenchDocument } from "../document-shell.js";
import { createWorkbenchLocale } from "../i18n.js";

/**
 * The frame every arrival screen shares: a titlebar, a stage and the resident bottom bar on the desk. A screen is
 * what goes inside the stage and the bar's three blocks; the frame itself never moves (specs/archive/project-arrival-flow).
 */
export interface ArrivalShellPrimitives {
  accountRegistration?: boolean;
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: PluginIconName): string;
  withDesktopQuery(path: string): string;
  htmlLang(): string;
  renderIconSprite(): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  /** The theme preference, and the native window's safe insets. Runs before the first paint. */
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
}

/** What the chooser needs besides the frame: dates in the person's language. */
export interface ArrivalPrimitives extends ArrivalShellPrimitives {
  dateTimeLocale(): string;
}

type ArrivalScreen = "chooser" | "opening" | "welcome" | "onboard" | "update";

interface ArrivalTitlebarOptions {
  /** The chooser keeps the account/space switcher available before opening a project. */
  account?: boolean;
  /** The AI caption sits beside the wordmark on the chooser only. */
  caption?: boolean;
  /** The account, capabilities, settings and the right side's tabs; the opening has none of them. */
  tools?: boolean;
  /** The background tasks as a tab of the right side, where the screen reads them (the chooser). */
  tasks?: boolean;
  /** Welcome's way to switch the theme before anything else is set. */
  theme?: boolean;
}

interface ArrivalDocumentOptions {
  title: string;
  screen: ArrivalScreen;
  /** What the body carries for tests and styles (`data-arrival`, `data-onboarding-mode`, …). */
  bodyAttrs?: string;
  desktopShell: boolean;
  controlToken: string;
  /** Rendered into the titlebar, stage and bar by the screen. */
  titlebar: string;
  stage: string;
  bar: string;
  /** Rendered after the frame: templates, dialogs. */
  after?: string;
  /** The scripts of this screen, in order, already joined. */
  scripts: string;
}

export function createArrivalShell(p: ArrivalShellPrimitives) {
  const { L, escapeHtml, icon } = p;
  const href = (desktopShell: boolean, path: string) => desktopShell ? p.withDesktopQuery(path) : path;

  const caption = () => renderCaption({ label: L("暂停标题动画"), playLabel: L("播放标题动画"), title: L("点按暂停或播放") });

  function tools(desktopShell: boolean, options: ArrivalTitlebarOptions): string {
    const link = (path: string, glyph: PluginIconName, label: string, aria: string) =>
      `<a class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" href="${href(desktopShell, path)}" aria-label="${escapeHtml(aria)}">${icon(glyph)}<span data-slot="button-label">${escapeHtml(label)}</span></a>`;
    const theme = options.theme
      ? `<span class="arrival-theme"><button class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" type="button" id="cx-theme" aria-label="${L("切换主题")}">${icon("switch")}<span data-slot="button-label">${L("切换主题")}</span></button></span>` : "";
    // The right side's tabs end the bar, as on a project page: the Home's side views, and the background tasks where they are read.
    const side = renderSideStrip(p, homePluginSideTabs(), { projectTools: false, tasks: options.tasks === true });
    const unifiedAccount = options.account ? `<button class="mw-btn mw-btn--ghost mw-btn--md" type="button" data-slot="button" data-unified-account-link aria-label="${L("Molis 账号")}">${icon("user")}<span data-slot="button-label" data-unified-account-name>${L("Molis 账号")}</span></button>` : "";
    const global = options.tools === false ? "" : `<span class="arrival-global">${unifiedAccount}${link("/capabilities/library", "sparkles", L("能力"), L("打开能力服务"))}${link("/settings/appearance", "settings", L("设置"), L("打开系统设置"))}${side.includes("data-side-tab=") ? side : ""}</span>`;
    const account = options.account ? `<button class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" type="button" data-account-link aria-label="${L("账号管理")}">${icon("user")}<span data-slot="button-label" data-personal-name>${L("未登录")}</span></button>` : "";
    return `<nav class="arrival-tools" aria-label="${L("全局")}">${theme}${account}${global}</nav>`;
  }

  /** The titlebar: the mark and its wordmark, the caption on the chooser, and what is within reach on the right. */
  function titlebar(desktopShell: boolean, options: ArrivalTitlebarOptions = {}): string {
    const drag = desktopShell ? ' data-tauri-drag-region="deep"' : "";
    return `<header class="arrival-titlebar" data-region="titlebar"${drag}><span class="arrival-brand"${drag}>${icon("brand")}${renderWordmark()}</span>${options.caption ? caption() : ""}<span class="arrival-spacer"${drag}></span>${tools(desktopShell, options)}</header>`;
  }

  /** The bar: three blocks on the desk. The center is a whole element (the Assistant's island, or a status). */
  function bar(options: { kind: string; start?: string; center?: string; end?: string }): string {
    return `<div class="workbench-bar arrival-bar" data-dock data-bar="${escapeHtml(options.kind)}" aria-label="${L("底栏")}"><div class="bar-start">${options.start ?? ""}</div>${options.center ?? '<div class="bar-center"></div>'}<div class="bar-end">${options.end ?? ""}</div></div>`;
  }

  function document(options: ArrivalDocumentOptions): string {
    const side = options.titlebar.includes("data-side-tab=") ? renderSidePanel(p, homePluginSideTabs(), { projectTools: false, tasks: options.titlebar.includes('data-side-tab="tasks"') }) : "";
    return `<!doctype html>
<html lang="${p.htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${NO_FAVICON_LINK}
  ${p.controlTokenMeta(options.controlToken)}
  <title>${escapeHtml(options.title)}</title>
  <script>${p.themeBootstrapScript}</script>
  <link rel="stylesheet" href="/assets/molis-work-arrival.css">
  ${side ? `<style>${SIDE_PANEL_STYLES}body.immersive-workbench.arrival-page{--desktop-titlebar-height:var(--arrival-titlebar-h)}</style>` : ""}
</head>
<body${p.accountRegistration ? ACCOUNT_REGISTRATION_BODY : ''} class="arrival-page immersive-workbench" data-arrival="${options.screen}"${options.desktopShell ? ' data-native-desktop="true"' : ""}${options.bodyAttrs ?? ""}>
  ${p.renderIconSprite()}
  <div class="arrival" data-workspace data-screen="${options.screen}">
    ${options.titlebar}
    ${options.stage}
    ${options.bar}
    ${side}
  </div>
  ${options.after ?? ""}
  <script>${options.scripts}${options.screen === "chooser" ? ACCOUNT_CLIENT_SCRIPT : ""}${side ? SIDE_PANEL_SCRIPT : ""}</script>
</body>
</html>`;
  }

  return { href, titlebar, bar, document, caption, wordmark: () => renderWordmark() };
}

/** The same workbench document and account controls, without opening an anonymous business Home. */
export function renderPersonalAccountEntry(controlToken: string, desktop: boolean, message?: string,
  locale: Pick<ReturnType<typeof createWorkbenchLocale>, "L" | "htmlLang" | "clientI18nScript"> = createWorkbenchLocale(() => "zh"), nativeBootstrap = "", installationLogin = false): string {
  const { L } = locale;
  return renderWorkbenchDocument({lang: locale.htmlLang(), title: "Molis Work",
    body_attributes: {class: "arrival-page immersive-workbench", "data-arrival": "welcome", "data-account-entry": true, "data-native-desktop": desktop ? "true" : null},
    head_html: `<meta name="molis-work-page-session" content="${escapeHtml(controlToken)}"><script>${THEME_BOOTSTRAP_SCRIPT}${desktop ? nativeBootstrap : ""}</script><link rel="stylesheet" href="/assets/molis-work-arrival.css">`,
    body_html: `${renderIconSprite()}<div class="arrival" data-screen="welcome"><header class="arrival-titlebar"${desktop ? ' data-tauri-drag-region="deep"' : ""}><span class="arrival-brand">${icon("brand")}${renderWordmark()}</span></header>
      <main class="arrival-stage"><section class="mw-empty">
      <button type="button" data-unified-account-link hidden></button>
      <p role="status" data-account-entry-status>${escapeHtml(message ? L(message) : (installationLogin ? "" : L("正在打开登录页面…")))}</p><button class="mw-btn mw-btn--secondary" type="button" data-account-entry-retry${message ? "" : " hidden"}>${escapeHtml(L("重试"))}</button></section></main></div>
      <script>${locale.clientI18nScript()}${UI_REQUEST_CLIENT_SCRIPT}${message ? `document.querySelector('[data-account-entry-retry]').onclick=()=>location.reload();` : installationLogin ? ACCOUNT_CLIENT_SCRIPT : `
      (() => {
        const status=document.querySelector('[data-account-entry-status]'),retry=document.querySelector('[data-account-entry-retry]');
        const start=async()=>{
          retry.hidden=true;
          try {
            if(document.body.dataset.nativeDesktop==='true'){
              const state=await molisWorkRequest('/api/personal/status');
              if(state.identity && state.ready && state.browserSessionTicket){
                await molisWorkRequest('/api/personal/native-attach?ticket='+encodeURIComponent(state.browserSessionTicket),{method:'POST',body:{}});
                location.replace('/?desktop=1');
                return;
              }
            }
            const result=await molisWorkRequest('/api/personal/login',{control:true,body:{}});
            const url=new URL(result.loginUrl,location.origin);
            url.searchParams.set('accountEntry','1');
            if(document.body.dataset.nativeDesktop==='true')url.searchParams.set('desktop','1');
            location.replace(url.href);
          } catch(error) { molisWorkRequest.show(status,error);retry.hidden=false; }
        };
        const open=()=>navigator.locks?navigator.locks.request('molis-account-entry',start):start();
        retry.onclick=()=>void open();void open();
      })();`}</script>`});
}

/** Credential-free document for external entry; the next navigation uses the normal session rules. */
export function renderAccountSameOriginEntry(): string {
  return '<!doctype html><meta charset="utf-8"><title>Molis Work</title><script>location.replace(location.href)</script><noscript><a href="/">Molis Work</a></noscript>';
}
