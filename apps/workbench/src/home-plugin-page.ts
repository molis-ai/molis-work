import { escapeHtml, renderIconSprite, SELECT_MENU_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderWorkbenchDocument } from "./document-shell.js";
import type { BuiltinPluginEntry } from "./builtin-plugins.js";
import { HOME_MODEL_SETTINGS_CLIENT_SCRIPT } from "./scripts/home-model-settings.js";

/** A Home plugin can be opened before any project exists. The same contribution and client also mount in Workbench. */
export function renderHomePluginPage(entry: BuiltinPluginEntry, html: string | null, message: string | null, controlToken: string, retry = false, side = false): string {
  const name = escapeHtml(entry.manifest.name), id = entry.project_plugin_id;
  return renderWorkbenchDocument({ lang: "zh-CN", title: `${entry.manifest.name} · Molis Work`,
    body_attributes: { class: "immersive-workbench home-plugin-page", "data-home-side": side ? "true" : null },
    head_html: `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}">
    <script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-workbench.css"><style>
    .home-plugin-page{height:100dvh;display:flex;flex-direction:column;background:var(--desk);color:var(--ink)}
    .home-plugin-page>header{display:flex;align-items:center;gap:16px;padding:12px 24px;flex:none}.home-plugin-page>header>strong{flex:1}
    .home-plugin-main{position:relative;flex:1;min-height:0;display:flex;margin:0 8px 8px;background:var(--surface);border-radius:12px;overflow:hidden}
    .home-plugin-main>.plugin-stage-shell{position:relative;flex:1;min-width:0;height:100%;--tree-width:320px}
    .home-plugin-main>.plugin-stage-shell[data-expanded="false"]{display:block}
    [data-home-side] .home-plugin-main{margin:0;border-radius:0}
    [data-home-side] .plugin-stage-shell[data-expanded="true"]{display:block}
    [data-home-side] .plugin-stage-shell[data-expanded="true"] .plugin-stage-list{display:none!important}
    [data-home-side] .plugin-stage-workspace{position:absolute;inset:0;display:flex;flex-direction:column}
    body.home-plugin-page dialog.home-model-settings{width:min(960px,calc(100vw - 32px));max-height:calc(100dvh - 32px)}
    .home-model-settings .mw-dialog__shell{max-height:calc(100dvh - 36px)}
    .home-model-settings .mw-form__header{display:flex;align-items:center;justify-content:space-between;gap:16px}
    .home-model-settings .mw-form__body{overflow:auto;min-height:0}
    .home-model-settings .settings-heading-title{display:none}
    body.home-plugin-page .home-model-settings select{background-repeat:no-repeat;background-position:right 8px center;background-size:14px 14px}
    </style>`, body_html: `${renderIconSprite()}
    ${side && html ? "" : `<header>${side ? "" : '<a class="mw-btn mw-btn--ghost" href="/">返回个人空间与项目</a>'}<strong>${name}</strong>
      <button class="mw-btn mw-btn--ghost" type="button" data-home-lifecycle="${retry ? "retry" : html ? "disable" : "enable"}">${retry ? "重试启动" : html ? "停用插件" : "启用插件"}</button></header>`}
    <main class="home-plugin-main">${html ?? `<div class="mw-empty" role="alert"><h1>${name} 暂不可用</h1><p>${escapeHtml(message ?? "插件已停用")}</p></div>`}</main>
    <p role="status" data-home-status hidden></p>
    <dialog class="mw-dialog home-model-settings" data-home-model-settings aria-labelledby="home-model-title">
      <div class="mw-dialog__shell mw-form"><header class="mw-form__header"><h2 id="home-model-title">模型设置</h2><button class="mw-btn mw-btn--ghost" type="button" data-home-model-back hidden>返回模型设置</button><button class="mw-btn mw-btn--ghost" type="button" data-home-model-close autofocus>关闭</button></header>
        <div class="mw-form__body"><p role="status" data-home-model-status></p><button class="mw-btn mw-btn--secondary" type="button" data-home-model-retry hidden>重试</button><div data-home-model-content></div></div>
      </div>
    </dialog>
    <script src="/assets/molis-work-plugins/${encodeURIComponent(id)}.js"></script><script>${CONTROL_CLIENT_SCRIPT}
    document.querySelector('[data-work-surface]')?.removeAttribute('hidden');
    globalThis.molisWorkbenchPluginFactories?.[${JSON.stringify(id)}]?.({side:${side},translate:text=>text,mountPluginClient:(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()});
    document.querySelector('[data-home-lifecycle]')?.addEventListener('click',async(event)=>{
      const button=event.currentTarget;button.disabled=true;
      try{const response=await fetch('/api/plugins/${encodeURIComponent(entry.manifest.plugin_id)}/'+button.dataset.homeLifecycle,{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:'{}'});
        const body=await response.json();if(!response.ok)throw new Error(body.error||'插件状态未能更改');location.reload();
      }catch(error){const note=document.querySelector('[data-home-status]');note.textContent=error.message;note.hidden=false;button.disabled=false;}
    });${SELECT_MENU_CLIENT_SCRIPT}${HOME_MODEL_SETTINGS_CLIENT_SCRIPT}
    ${side ? `addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open],:popover-open'))parent.postMessage({type:'molis:side-close'},location.origin);});` : ""}</script>` });
}
