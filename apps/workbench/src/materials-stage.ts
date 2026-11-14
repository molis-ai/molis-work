import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderMaterialsTools } from "./materials-reader-client.js";

/**
 * The main area's reader of the project's folders (design A「展开到主区」, specs/batch-06-shared-tools/materials-ui-contract §4, §5):
 * a file the side panel lists opens here, in a tab of its own, when the person asks for room to read. It is the side panel's reader
 * with the width of the main area: quote, pin, read on, add to the task. The side panel's 「在主区打开」 is the person's explicit open
 * (`materials.open`: where they were reading is kept and the folder's port is handed on); this tab, shown or shown again, only reads.
 */
export function renderMaterialsStage(): string {
  return `<section class="desktop-work-surface materials-stage" data-work-surface="materials" data-work-surface-label="${uiText("workbench.settings-agent-diagnostics.materials")}" hidden>
        <header class="materials-stage-head"><div class="side-files-preview-title"><strong data-materials-stage-title></strong><small data-materials-stage-meta></small></div></header>
        ${renderMaterialsTools("stage-materials")}
        <div class="side-files-body materials-stage-body" data-materials-stage-body tabindex="0"></div>
      </section>`;
}

export const MATERIALS_STAGE_STYLES = String.raw`
.materials-stage{display:flex;flex-direction:column;min-height:0;min-width:0;background:var(--paper)}
.materials-stage[hidden]{display:none}
.materials-stage-head{display:flex;align-items:center;gap:8px;flex:none;padding:10px 20px;border-bottom:1px solid var(--line)}
.materials-stage .side-materials-tools{padding:6px 20px}
.materials-stage-body{width:100%;max-width:960px;margin:0 auto}
`;

/** Factory: the Workbench passes `route` and the shared `kit` (the file preview and `materialsReader`, built once in initialization). */
// Shipped without its full-line comments and indentation (they stay in this source).
export const MATERIALS_STAGE_FACTORY_SCRIPT = String.raw`(host) => {
  const root=document.querySelector('[data-work-surface="materials"]');
  if(!root)return;
  const readText=globalThis.t.text;
  const $=(selector)=>root.querySelector(selector);
  const body=$('[data-materials-stage-body]'),title=$('[data-materials-stage-title]'),meta=$('[data-materials-stage-meta]');
  const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const post=(path,body)=>molisWorkRequest(host.route(path),{body,fallback:readText("workbench.settings-page.that-did-not-finish")});
  const {renderFilePreview,materialsReader}=host.kit;
  const render=(file)=>{
    const type=file.media_type||'text/plain';
    if(file.encoding==='base64'&&/^image\/(png|jpeg|gif|webp|avif)$/.test(type)){body.innerHTML='<img alt="'+esc(file.title)+'" src="data:'+type+';base64,'+file.data+'">';return;}
    if(file.encoding==='base64'){body.innerHTML='<p class="side-files-note">'+esc(readText("workbench.materials-stage.no-preview",{type}))+'</p>';return;}
    body.innerHTML=renderFilePreview({...file,truncated:false},{escape:esc,text:readText});
  };
  const reader=materialsReader({name:'stage-materials',ports:true,esc,body,tools:$('[data-stage-materials-tools]'),held:$('[data-stage-materials-held]'),problem:$('[data-stage-materials-problem]'),post,renderFile:render});
  let current='';
  const show=async(id)=>{
    const at=id.indexOf(':'),request=current=id;
    if(at<1){reader.close();delete root.dataset.assistantContext;body.innerHTML='<p class="side-files-problem">'+esc(readText("workbench.materials-stage.outside"))+'</p>';return;}
    const path=id.slice(at+1).split('/'),subject={kind:'workspace_file',id};
    title.textContent=path.at(-1)||readText("workbench.settings-agent-diagnostics.file");meta.textContent=path.slice(0,-1).join(' / ');
    reader.close();body.innerHTML='<p class="side-files-note">'+esc(readText("workbench.assistant-tabs.loading"))+'</p>';body.scrollTop=0;
    try{
      const file=await molisWorkRequest(host.route('/api/materials/content?id='+encodeURIComponent(id)),{fallback:readText("workbench.side-panel-files.file-could-not-be-read")});
      if(current!==request)return;
      // What the person is looking at, for the Assistant and for the tab workspace's check that the file is shown.
      root.dataset.assistantContext=JSON.stringify({plugin_id:'system.materials',object:{kind:subject.kind,id,title:file.title||title.textContent}});
      if(await reader.open({item:{subject,title:file.title},file,isCurrent:()=>current===request}))return;
      if(current===request)render(file);
    }catch(error){
      if(current!==request)return;
      delete root.dataset.assistantContext;body.innerHTML='<p class="side-files-problem">'+esc(error.message)+'</p>';
      root.dispatchEvent(new CustomEvent('molis-work:item-unreadable',{bubbles:true,detail:{itemId:id}}));
    }
  };
  root.addEventListener('molis-work:select-item',event=>{
    const detail=event.detail||{};
    if(!detail.itemId||detail.itemId===current)return;
    void show(detail.itemId);
  });
}`.replace(/^[ \t]*\/\/.*\n/gm, "").replace(/^[ \t]+/gm, "");
