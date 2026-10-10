import { escapeHtml, renderIconSprite, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderWorkbenchDocument } from "./document-shell.js";
import type { BuiltinPluginEntry } from "./builtin-plugins.js";

/** A Home plugin can be opened before any project exists. The same contribution and client also mount in Workbench. */
export function renderHomePluginPage(entry: BuiltinPluginEntry, html: string | null, message: string | null, controlToken: string): string {
  const name = escapeHtml(entry.manifest.name), id = entry.project_plugin_id;
  return renderWorkbenchDocument({ lang: "zh-CN", title: `${entry.manifest.name} · Molis Work`,
    body_attributes: { class: "immersive-workbench home-plugin-page" },
    head_html: `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}">
    <script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-workbench.css"><style>
    .home-plugin-page{height:100dvh;display:flex;flex-direction:column;background:var(--desk);color:var(--ink)}
    .home-plugin-page>header{display:flex;align-items:center;gap:16px;padding:12px 24px;flex:none}.home-plugin-page>header>strong{flex:1}
    .home-plugin-main{position:relative;flex:1;min-height:0;display:flex;margin:0 8px 8px;background:var(--surface);border-radius:12px;overflow:hidden}
    .home-plugin-main>.plugin-stage-shell{position:relative;flex:1;min-width:0;height:100%;--tree-width:320px}
    .home-plugin-main>.plugin-stage-shell[data-expanded="false"]{display:block}
    </style>`, body_html: `${renderIconSprite()}
    <header><a class="mw-btn mw-btn--ghost" href="/">返回个人空间与项目</a><strong>${name}</strong>
      <button class="mw-btn mw-btn--ghost" type="button" data-home-lifecycle="${html ? "disable" : "enable"}">${html ? "停用插件" : "启用插件"}</button></header>
    <main class="home-plugin-main">${html ?? `<div class="mw-empty" role="alert"><h1>${name} 暂不可用</h1><p>${escapeHtml(message ?? "插件已停用")}</p></div>`}</main>
    <p role="status" data-home-status hidden></p>
    <script src="/assets/molis-work-plugins/${encodeURIComponent(id)}.js"></script><script>${CONTROL_CLIENT_SCRIPT}
    document.querySelector('[data-work-surface]')?.removeAttribute('hidden');
    globalThis.molisWorkbenchPluginFactories?.[${JSON.stringify(id)}]?.({translate:text=>text,mountPluginClient:(${UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT})()});
    document.querySelector('[data-home-lifecycle]').addEventListener('click',async(event)=>{
      const button=event.currentTarget;button.disabled=true;
      try{const response=await fetch('/api/plugins/${encodeURIComponent(entry.manifest.plugin_id)}/'+button.dataset.homeLifecycle,{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:'{}'});
        const body=await response.json();if(!response.ok)throw new Error(body.error||'插件状态未能更改');location.reload();
      }catch(error){const note=document.querySelector('[data-home-status]');note.textContent=error.message;note.hidden=false;button.disabled=false;}
    });</script>` });
}
