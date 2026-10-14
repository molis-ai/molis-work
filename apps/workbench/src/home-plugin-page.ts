import { escapeHtml, renderIconSprite, SELECT_MENU_CLIENT_SCRIPT, STATE_RING_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT, UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderWorkbenchDocument } from "./document-shell.js";
import type { BuiltinPluginEntry } from "./builtin-plugins.js";
import { HOME_MODEL_SETTINGS_CLIENT_SCRIPT } from "./scripts/home-model-settings.js";
import { homeToolKeysScript } from "./home-plugin-navigation.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

/**
 * Where the person is beside this side view, read from the shell around it: the place the work area names and the
 * project. A report for the record ("written on …"), never proof of what was on screen.
 */
const SIDE_PAGE_SCRIPT = String.raw`() => {
  const top = window.top; if (top === window) return null;
  const doc = top.document, place = doc.querySelector('[data-plugin-picker-current] .is-focused') || doc.querySelector('[data-plugin-picker-current]');
  const name = doc.body.dataset.arrival ? globalThis.L('首页') : (place?.textContent || doc.title.replace(/ · Molis Work$/, '')).trim();
  return { url: (top.location.pathname + top.location.search).slice(0, 500),
    title: [name, doc.querySelector('.navigator-project-selector strong')?.textContent.trim()].filter(Boolean).join(' · ').slice(0, 200) || null };
}`;

/** A Home plugin can be opened before any project exists. The same contribution and client also mount in Workbench. */
export function renderHomePluginPage(entry: BuiltinPluginEntry, html: string | null, message: string | null, controlToken: string,
  locale: Pick<WorkbenchRendererPorts["locale"], "L" | "htmlLang" | "clientI18nScript">, retry = false, side = false): string {
  const { L, htmlLang, clientI18nScript } = locale;
  const name = escapeHtml(entry.manifest.name), id = entry.project_plugin_id;
  return renderWorkbenchDocument({ lang: htmlLang(), title: `${entry.manifest.name} · Molis Work`,
    body_attributes: { class: "immersive-workbench home-plugin-page", "data-home-side": side ? "true" : null },
    head_html: `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}">
    <script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-workbench.css"><style>
    .home-plugin-page{height:100dvh;display:flex;flex-direction:column;background:var(--desk);color:var(--ink)}
    .home-plugin-page>header{display:flex;align-items:center;gap:16px;padding:12px 24px;flex:none}.home-plugin-page>header>strong{flex:1}
    .home-plugin-main{position:relative;flex:1;min-height:0;display:flex;margin:0 8px 8px;background:var(--surface);border-radius:12px;overflow:hidden}
    .home-plugin-main>.plugin-stage-shell{position:relative;flex:1;min-width:0;height:100%;--tree-width:320px}
    [data-home-side] .home-plugin-main{margin:0;border-radius:0}
    body.home-plugin-page dialog.home-model-settings{width:min(960px,calc(100vw - 32px));max-height:calc(100dvh - 32px)}
    .home-model-settings .mw-dialog__shell{max-height:calc(100dvh - 36px)}
    .home-model-settings .mw-form__header{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .home-model-settings .mw-form__body{overflow:auto;min-height:0}
    .home-model-settings .settings-heading-title{display:none}
    body.home-plugin-page .home-model-settings select{background-repeat:no-repeat;background-position:right 8px center;background-size:14px 14px}
    </style>`, body_html: `${renderIconSprite()}
    ${side && html ? "" : `<header>${side ? "" : `<a class="mw-btn mw-btn--ghost" href="/">${escapeHtml(L("返回个人空间与项目"))}</a>`}<strong>${name}</strong>
      <button class="mw-btn mw-btn--ghost" type="button" data-home-lifecycle="${retry ? "retry" : html ? "disable" : "enable"}">${escapeHtml(L(retry ? "重试启动" : html ? "停用插件" : "启用插件"))}</button></header>`}
    <main class="home-plugin-main">${html ?? `<div class="mw-empty" role="alert"><h1 data-mw-state="${retry ? "unavailable" : "disabled"}">${name} ${escapeHtml(L("暂不可用"))}</h1><p>${escapeHtml(L(message ?? "插件已停用"))}</p></div>`}</main>
    <p role="status" data-home-status hidden></p>
    <dialog class="mw-dialog home-model-settings" data-home-model-settings aria-labelledby="home-model-title">
      <div class="mw-dialog__shell mw-form"><header class="mw-form__header"><h2 id="home-model-title">${escapeHtml(L("模型设置"))}</h2><button class="mw-btn mw-btn--ghost" type="button" data-home-model-back hidden>${escapeHtml(L("返回模型设置"))}</button><button class="mw-btn mw-btn--ghost" type="button" data-home-model-close autofocus>${escapeHtml(L("关闭"))}</button></header>
        <div class="mw-form__body"><p role="status" data-home-model-status></p><button class="mw-btn mw-btn--secondary" type="button" data-home-model-retry hidden>${escapeHtml(L("重试"))}</button><div data-home-model-content></div></div>
      </div>
    </dialog>
    <script>${clientI18nScript()}${UI_REQUEST_CLIENT_SCRIPT}</script><script src="/assets/molis-work-plugins/${encodeURIComponent(id)}.js"></script><script>
    document.querySelector('[data-work-surface]')?.removeAttribute('hidden');
    globalThis.molisWorkbenchPluginFactories?.[${JSON.stringify(id)}]?.({side:${side},translate:globalThis.L,mountPluginClient:(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()${side ? `,page:(${SIDE_PAGE_SCRIPT}),status:status=>parent.postMessage({type:'molis:side-status',status},location.origin)` : ""}});
    document.querySelector('[data-home-lifecycle]')?.addEventListener('click',async(event)=>{
      const button=event.currentTarget;button.disabled=true;
      try{await molisWorkRequest('/api/plugins/${encodeURIComponent(entry.manifest.plugin_id)}/'+button.dataset.homeLifecycle,{body:{},fallback:L('插件状态未能更改')});location.reload();
      }catch(error){const note=document.querySelector('[data-home-status]');molisWorkRequest.show(note,error);note.hidden=false;button.disabled=false;}
    });${SELECT_MENU_CLIENT_SCRIPT}${HOME_MODEL_SETTINGS_CLIENT_SCRIPT}
    ${homeToolKeysScript()}${side ? `addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open],:popover-open'))parent.postMessage({type:'molis:side-close'},location.origin);});` : ""}</script>` });
}
