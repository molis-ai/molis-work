import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT, UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { renderPluginFrameSurface } from "./plugin-frame.js";

/** Trusted carrier for a standalone embedded view. Its HTML is inert until the common opaque frame mounts it. */
export function renderPluginDocumentShell(input: {
  id: string; plugin_id: string; bundle: string; title: string; html: string; project_id: string; route_prefix: string;
  page: Record<string, unknown>; control_token: string; authorization: { page_id: string; storage_scope: string };
}): string {
  const literal = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
  const pack = { id: input.id, plugin_id: input.plugin_id, bundle: input.bundle, assets: [], authorization: input.authorization };
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="molis-work-control-token" content="' + escapeHtml(input.control_token) + '"><title>' + escapeHtml(input.title) + '</title>'
    + '<script>' + THEME_BOOTSTRAP_SCRIPT + '</script><link rel="stylesheet" href="/assets/molis-work-workbench.css">'
    + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}[data-work-surface]{position:relative;display:block;width:100%;height:100%}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}</style></head><body>'
    + renderIconSprite() + renderPluginFrameSurface(input.html, input.id, input.title, false)
    + '<script>' + UI_REQUEST_CLIENT_SCRIPT + '</script><script src="/assets/molis-work-plugin-frame.js"></script><script>'
    + 'molisPluginFrames.mount(document.querySelector("[data-work-surface]"),{translate:s=>s,mountPluginClient:(' + UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT + ')(),'
    + 'projectId:()=>'+ literal(input.project_id) + ',route:path=>' + literal(input.route_prefix) + '+path,page:()=>('+literal(input.page)+')},'+literal(pack)+')'
    + '.catch(error=>{const note=document.createElement("p");note.setAttribute("role","alert");note.textContent=error.message;document.body.append(note);});'
    + '</script></body></html>';
}
