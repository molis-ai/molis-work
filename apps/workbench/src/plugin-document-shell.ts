import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import { UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { CONTROL_CLIENT_SCRIPT } from "./scripts/control.js";
import { renderLanguageHead } from "./language-resource.js";
import { ACCOUNT_REGISTRATION_BODY } from "./document-shell.js";
import { renderPluginFrameSurface } from "./plugin-frame.js";

/** Trusted carrier for a standalone embedded view. Its HTML is inert until the common opaque frame mounts it. */
export function renderPluginDocumentShell(input: {
  id: string; plugin_id: string; bundle: string; title: string; html: string; lang: string; project_id: string; route_prefix: string;
  page: Record<string, unknown>; control_token: string; authorization: { page_id: string; storage_scope: string };
  accountRegistration?: boolean;
}): string {
  const literal = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c");
  const pack = { id: input.id, plugin_id: input.plugin_id, bundle: input.bundle, assets: [], authorization: input.authorization };
  return '<!doctype html><html lang="' + escapeHtml(input.lang) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="molis-work-page-session" content="' + escapeHtml(input.control_token) + '"><title>' + escapeHtml(input.title) + '</title>' + renderLanguageHead(input.lang)
    + '<script>' + THEME_BOOTSTRAP_SCRIPT + '</script><link rel="stylesheet" href="/assets/molis-work-workbench.css">'
    + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}[data-work-surface]{position:relative;display:block;width:100%;height:100%}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}</style></head><body' + (input.accountRegistration ? ACCOUNT_REGISTRATION_BODY : '') + '>'
    + renderIconSprite() + renderPluginFrameSurface(input.html, input.id, input.title, false, false, input.bundle)
    + '<script>' + CONTROL_CLIENT_SCRIPT + '</script><script src="/assets/molis-work-plugin-frame.js"></script><script>'
    + 'const root=document.querySelector("[data-work-surface]"),holder=frameElement;'
    + 'const owned=holder?.parentElement?.dataset.installedPlugin===' + literal(input.plugin_id) + ',position=()=>owned?parent.molisWorkbenchPositionFrom?.(holder):null;'
    + 'const mounted=molisPluginFrames.mount(root,{translate:s=>s,positionNavigationFrom:()=>position()?.navigationFrom(),positionChanged:()=>position()?.changed(),mountPluginClient:(' + UI_CLIENT_LIFECYCLE_FACTORY_SCRIPT + ')(),'
    + 'projectId:()=>'+ literal(input.project_id) + ',route:path=>' + literal(input.route_prefix) + '+path,page:()=>('+literal(input.page)+')},'+literal(pack)+')'
    + '.catch(error=>{const note=document.createElement("p");note.setAttribute("role","alert");note.textContent=error.message;document.body.append(note);return null;});'
    // Only the owning shell can select a panel, and only in this same carrier's still-current opaque frame.
    + 'if(holder?.parentElement?.dataset.installedPlugin===' + literal(input.plugin_id) + ')window.addEventListener("message",event=>{'
    + 'if(event.source!==parent||event.origin!==location.origin||event.data?.type!=="workbench-view"||event.data.intent!=="open")return;'
    + 'const {panel,itemId}=event.data,text=(value,max)=>typeof value==="string"&&value.length>0&&value.length<=max;'
    + 'const detail=text(panel,100)&&itemId===undefined?{panel}:text(itemId,1000)&&panel===undefined?{itemId}:null;if(!detail)return;'
    + 'void mounted.then(value=>{if(value?.scope.alive&&root.isConnected&&holder===frameElement&&holder.isConnected&&!holder.closest("[hidden]"))root.dispatchEvent(new CustomEvent("molis-work:select-item",{detail:{...detail,intent:"open"}}));});});'
    + 'if(owned){const refresh=()=>root.dispatchEvent(new CustomEvent("molis-work:select-item",{detail:{invalidate:true}}));'
    + 'parent.document.addEventListener("molis-work:plugins-changed",refresh);window.addEventListener("pagehide",()=>parent.document.removeEventListener("molis-work:plugins-changed",refresh),{once:true});}'
    + '</script></body></html>';
}
