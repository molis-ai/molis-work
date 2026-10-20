import type { SidePanelPrimitives } from "./side-panel.js";
import { FILE_PREVIEW_CLIENT_SCRIPT } from "@molis-ai/molis-work-design-system";

/**
 * The 资料 tab of the side panel (specs/archive/side-panel P3, P8; specs/project-knowledge §8.1, formerly 文件). Lists the file
 * sources plugins declare here with how far each piece's card is organized, finds pieces by their content through
 * `knowledge.search` while filtering, shows a piece's card above its preview, and imports files and online documents. Previews
 * one file; "open in its plugin" goes through the same open target system search uses. Other surfaces (the
 * Assistant's work, a plugin page) open a preview here with `molis:side-open { tab: "files", target }`, where the
 * target names a declared source and subject, or carries a preview of its own (`{ preview: { title, media_type, text | url } }`).
 */
export function renderSideFiles({ L, icon }: SidePanelPrimitives): string {
  return `<div class="side-files" data-side-files-root>
      <section class="side-files-browse" data-side-files-browse aria-label="${L("文件列表")}">
        <div class="side-files-head">
          <label class="side-files-filter">${icon("search")}<input type="search" data-side-files-filter placeholder="${L("查找资料")}" aria-label="${L("查找资料")}" autocomplete="off"></label>
          <button class="side-files-tool" type="button" data-knowledge-import-open aria-label="${L("导入资料")}" title="${L("导入资料")}">${icon("upload")}</button>
          <button class="side-files-tool" type="button" data-side-files-action="refresh" aria-label="${L("刷新资料列表")}" title="${L("刷新资料列表")}">${icon("refresh")}</button>
        </div>
        <div class="side-files-list" data-side-files-list aria-busy="true"><p class="side-files-note">${L("正在读取资料…")}</p></div>
      </section>
      ${renderKnowledgeImportDialog(L)}
      <template data-side-files-icon>${icon("file")}</template>
      <section class="side-files-preview" data-side-files-preview aria-label="${L("文件预览")}" hidden>
        <header class="side-files-preview-head">
          <button class="side-files-tool side-files-back" type="button" data-side-files-action="back" aria-label="${L("返回文件列表")}" title="${L("返回文件列表")}">${icon("chevron-left")}</button>
          <div class="side-files-preview-title"><strong data-side-files-title></strong><small data-side-files-meta></small></div>
          <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-side-files-action="open" hidden>${icon("external")}<span>${L("在插件中打开")}</span></button>
        </header>
        <section class="side-files-card" data-side-files-card aria-label="${L("资料卡片")}" hidden></section>
        <div class="side-files-body" data-side-files-body tabindex="0"></div>
      </section>
    </div>`;
}

/**
 * Importing into project knowledge from the side panel (specs/project-knowledge PMAT-14): files (several, a folder, or dropped
 * on the list) and online documents, each saved through the 成果库's import (`/api/artifacts/import`) and organized after.
 * Bound by the knowledge bundle (`src/browser/knowledge/import.ts`).
 */
function renderKnowledgeImportDialog(L: SidePanelPrimitives["L"]): string {
  return `<dialog class="mw-dialog mw-dialog--form knowledge-import" data-knowledge-import-dialog aria-labelledby="knowledge-import-title">
        <form method="dialog" class="knowledge-import-form" data-knowledge-import-form>
          <header><h2 id="knowledge-import-title">${L("导入资料")}</h2><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-knowledge-import-close>${L("关闭")}</button></header>
          <p class="knowledge-import-intro">${L("导入的文件和文档存进项目，项目里的 Agent 都能找到；PDF、Office 文档和电子书读出正文，图片识别文字，音视频转成文字。原文后续修改不会自动同步。")}</p>
          <div class="knowledge-import-kinds" role="radiogroup" aria-label="${L("来源")}">
            <label><input type="radio" name="kind" value="files" checked> ${L("本地文件")}</label>
            <label><input type="radio" name="kind" value="online"> ${L("在线文档")}</label>
          </div>
          <div class="knowledge-import-files" data-knowledge-import-local>
            <div class="knowledge-import-drop" data-knowledge-import-drop>
              <span>${L("把文件或文件夹拖到这里，或者")}</span>
              <label class="mw-btn mw-btn--secondary mw-btn--sm">${L("选择文件")}<input type="file" multiple hidden data-knowledge-import-pick></label>
              <label class="mw-btn mw-btn--secondary mw-btn--sm">${L("选择文件夹")}<input type="file" multiple webkitdirectory hidden data-knowledge-import-folder></label>
            </div>
            <p class="knowledge-import-help">${L("单个文件不超过 6 MB，一次最多 200 个；文件夹里以点开头的文件和 node_modules 一类的目录会跳过。")}</p>
            <ul class="knowledge-import-picked" data-knowledge-import-picked></ul>
          </div>
          <div class="knowledge-import-online" data-knowledge-import-online hidden>
            <label>${L("文档来源")}<select class="mw-select" name="source" data-knowledge-import-source>
              <option value="notion">Notion</option><option value="feishu">${L("飞书")}</option><option value="lark">Lark</option><option value="google-docs">Google Docs</option></select></label>
            <label>${L("账号连接")}<select class="mw-select" name="connection_id" data-knowledge-import-connection></select></label>
            <p class="knowledge-import-help" data-knowledge-import-connection-note></p>
            <label>${L("文档链接")}<input class="mw-input" name="url" type="url" autocomplete="off" spellcheck="false" placeholder="https://" data-knowledge-import-url></label>
          </div>
          <p class="knowledge-import-status" data-knowledge-import-status role="status" aria-live="polite"></p>
          <div class="knowledge-import-model" data-knowledge-import-model hidden>
            <p data-knowledge-import-model-text role="status" aria-live="polite"></p>
            <progress max="1" data-knowledge-import-model-progress hidden></progress>
            <div class="knowledge-import-model-choices" data-knowledge-import-model-choices>
              <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-knowledge-import-model-no>${L("先不转写")}</button>
              <button class="mw-btn mw-btn--primary mw-btn--sm" type="button" data-knowledge-import-model-yes>${L("下载并继续")}</button>
            </div>
          </div>
          <footer><button class="mw-btn mw-btn--secondary mw-btn--md" type="button" data-knowledge-import-close>${L("取消")}</button>
            <button class="mw-btn mw-btn--primary mw-btn--md" type="button" data-knowledge-import-submit>${L("导入")}</button></footer>
        </form>
      </dialog>`;
}

export const SIDE_FILES_STYLES = String.raw`
.side-files{display:grid;grid-template-columns:minmax(0,1fr);flex:1;min-height:0}
.side-files-browse,.side-files-preview{display:flex;flex-direction:column;min-height:0;min-width:0}
.side-files-browse[hidden],.side-files-preview[hidden]{display:none}
.side-files-head{display:flex;align-items:center;gap:4px;flex:none;padding:8px;border-bottom:1px solid var(--line)}
.side-files-filter{display:flex;align-items:center;gap:6px;flex:1;min-width:0;height:32px;padding:0 10px;border-radius:8px;background:var(--wash,var(--nav-hover));color:var(--muted)}
.side-files-filter svg{width:14px;height:14px;flex:none}
.side-files-filter input{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;outline:none}
.side-files-filter:focus-within{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-files-tool{display:inline-grid;place-items:center;flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint),color var(--dur-hover) var(--ease-quint)}
.side-files-tool svg{width:16px;height:16px}
.side-files-tool:hover{background:var(--nav-hover);color:var(--ink)}
.side-files-tool:focus-visible,.side-files-row:focus-visible,.side-files-body:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:-2px}
.side-files-list{flex:1;min-height:0;overflow:auto;padding:4px 0 12px}
.side-files-note{margin:16px;color:var(--muted);font-size:13px;line-height:1.6}
.side-files-group{margin:8px 0 0}
.side-files-group>h3{display:flex;align-items:center;gap:6px;margin:0;padding:8px 14px 4px;color:var(--muted);font-size:12px;font-weight:500}
.side-files-folder{margin:0;padding:6px 14px 2px 22px;color:var(--faint,var(--muted));font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-files-row{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 14px 4px 22px;border:0;background:transparent;color:var(--ink);font:inherit;font-size:13px;text-align:left;cursor:pointer;transition:background-color var(--dur-hover) var(--ease-quint)}
.side-files-row:hover{background:var(--nav-hover)}
.side-files-row[aria-current=true]{background:var(--nav-active)}
.side-files-row svg{width:15px;height:15px;flex:none;color:var(--muted)}
.side-files-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.side-files-row small{flex:none;color:var(--faint,var(--muted));font-size:11px}
.side-files-more{margin:4px 14px;font-size:12px}
.side-files-preview-head{display:flex;align-items:center;gap:6px;flex:none;padding:6px 8px;border-bottom:1px solid var(--line)}
.side-files-preview-title{display:grid;flex:1;min-width:0}
.side-files-preview-title strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500}
.side-files-preview-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px}
.side-files-preview-head .mw-btn[hidden]{display:none}
.side-files-body{position:relative;flex:1;min-height:0;overflow:auto;padding:16px 20px 32px;font-size:13px;line-height:1.7;color:var(--ink)}
.side-files-body pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 var(--font-mono,ui-monospace,SFMono-Regular,Menlo,monospace)}
.side-files-body img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:8px}
.side-files-body iframe{display:block;width:100%;height:100%;min-height:480px;border:0;border-radius:8px}
.side-files-body.is-frame{padding:0;overflow:hidden}
.side-files-body.is-frame iframe{border-radius:0;min-height:0}
.side-files-body h1,.side-files-body h2,.side-files-body h3{margin:1.2em 0 .5em;line-height:1.35;font-weight:600}
.side-files-body h1{font-size:20px}.side-files-body h2{font-size:17px}.side-files-body h3{font-size:15px}
.side-files-body :is(p,ul,ol,blockquote){margin:0 0 .8em}
.side-files-body blockquote{padding-left:12px;border-left:3px solid var(--line);color:var(--ink-soft,var(--ink))}
.side-files-body code{padding:1px 4px;border-radius:4px;background:var(--wash,var(--nav-hover));font:12px var(--font-mono,ui-monospace,monospace)}
.side-files-body a{color:var(--accent)}
.side-files-body .file-preview-table{overflow:auto;border:1px solid var(--line);border-radius:8px}
.side-files-body .file-preview-table table{border-collapse:collapse;min-width:100%;font-size:12px}
.side-files-body .file-preview-table :is(th,td){border-width:0 0 1px;padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.side-files-body .file-preview-table th{position:sticky;top:0;background:var(--paper);font-weight:600}
.side-files-truncated,.side-files-problem{margin:0 0 12px;padding:8px 12px;border-radius:8px;background:var(--wash,var(--nav-hover));color:var(--ink-soft,var(--ink));font-size:12px}
.side-files-source{margin:0 0 12px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.side-files-link{padding:0;border:0;background:none;color:var(--accent);font:inherit;text-align:left;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.side-files-link:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:2px}
.side-files-state{flex:none;padding:0 6px;border-radius:4px;background:color-mix(in srgb,var(--tone-attention,var(--amber)) 12%,transparent);color:var(--ink-soft,var(--ink));font-size:11px}
.side-files-hit span{display:grid;gap:1px}
.side-files-hit strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.side-files-hit em{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:12px;font-style:normal}
.side-files-card{flex:none;display:grid;gap:6px;padding:10px 20px;border-bottom:1px solid var(--line);font-size:12px}
.side-files-card[hidden]{display:none}
.side-files-card p{margin:0;overflow-wrap:anywhere}
.side-files-card-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.side-files-card-error{color:var(--tone-blocked,var(--red))}
.side-files-card-brief{color:var(--ink);line-height:1.6}
.side-files-card-words{color:var(--muted)}
.side-files-card-actions{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.side-files-card-keep{display:inline-flex;align-items:center;gap:6px;margin-left:auto;color:var(--ink-soft,var(--ink))}
.side-files-card-form{display:grid;gap:8px}
.side-files-card-form label{display:grid;gap:4px;color:var(--ink-soft,var(--ink))}
.side-files-card-form :is(.mw-input,.mw-textarea){width:100%;font-size:13px}
dialog.mw-dialog.knowledge-import{width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:20px}
.knowledge-import-form{display:grid;gap:14px}
.knowledge-import-form header{display:flex;align-items:center;justify-content:space-between;gap:12px}
.knowledge-import-form h2{margin:0;font-size:15px;font-weight:var(--weight-title,600)}
.knowledge-import-intro,.knowledge-import-help{margin:0;color:var(--muted);font-size:12px;line-height:1.6}
.knowledge-import-kinds{display:flex;gap:16px;font-size:13px}
.knowledge-import-files,.knowledge-import-online{display:grid;gap:10px}
.knowledge-import-files[hidden],.knowledge-import-online[hidden]{display:none}
.knowledge-import-drop{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:20px 12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:13px;text-align:center}
.knowledge-import-drop.is-over{border-color:var(--action,var(--accent));background:var(--nav-hover)}
.knowledge-import-picked{display:grid;gap:2px;max-height:180px;margin:0;padding:0;overflow:auto;list-style:none;font-size:12px}
.knowledge-import-picked li{display:flex;justify-content:space-between;gap:8px;padding:3px 0}
.knowledge-import-picked li span{flex:none;max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.knowledge-import-picked li small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)}
.knowledge-import-picked li.is-failed small{color:var(--tone-blocked,var(--red))}
.knowledge-import-picked li.is-done small{color:var(--tone-done,var(--green))}
.knowledge-import-online label{display:grid;gap:6px;font-size:13px}
.knowledge-import-online :is(.mw-select,.mw-input){width:100%}
.knowledge-import-status{margin:0;min-height:1em;color:var(--muted);font-size:12px}
.knowledge-import-model{display:grid;gap:10px;padding:12px;border-radius:10px;background:var(--wash,var(--nav-hover));font-size:13px;line-height:1.6}
.knowledge-import-model[hidden],.knowledge-import-model [hidden]{display:none}
.knowledge-import-model p{margin:0}
.knowledge-import-model progress{width:100%;height:4px;accent-color:var(--action,var(--accent))}
.knowledge-import-model-choices{display:flex;justify-content:flex-end;gap:8px}
.knowledge-import-form footer{display:flex;justify-content:flex-end;gap:8px}
@container side-panel (min-width:720px){
 .side-files{grid-template-columns:minmax(220px,300px) minmax(0,1fr)}
 .side-files-browse{border-right:1px solid var(--line)}
 .side-files-browse[hidden]{display:flex}
 .side-files-back{display:none}
}
`;

/** Factory: the Workbench passes `route`, `translate` and `openRecord(surface, id)` (the search open target). */
// Shipped without its full-line comments (they stay in this source).
export const SIDE_FILES_FACTORY_SCRIPT = String.raw`(host) => {
  const root=document.querySelector('[data-side-files-root]');
  if(!root||document.body.hasAttribute('data-pane-embedded'))return;
  const L=host.translate||((text)=>text);
  const $=(selector)=>root.querySelector(selector);
  const list=$('[data-side-files-list]'),filter=$('[data-side-files-filter]'),browse=$('[data-side-files-browse]'),preview=$('[data-side-files-preview]');
  const body=$('[data-side-files-body]'),title=$('[data-side-files-title]'),meta=$('[data-side-files-meta]'),openButton=$('[data-side-files-action="open"]');
  const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const icons={file:root.querySelector('[data-side-files-icon]')?.innerHTML||''};
  const cardBox=$('[data-side-files-card]');
  let sources=[],entries=new Map(),loadedAt=0,loading=null,current=null,wide=false,states=new Map(),modelReady=true,found=null,searchTimer=0;
  const get=(path)=>molisWorkRequest(host.route(path),{fallback:L('文件没有读到')});
  const post=(path,body)=>molisWorkRequest(host.route(path),{body,fallback:L('操作没有完成')});
  // How far each piece's card is organized (project knowledge): only what needs the person's eye is shown on a row.
  const stateText=(item)=>!item?'':item.excluded?L('不给 Agent 用'):item.state==='pending'?(modelReady?L('整理中'):L('等待整理')):item.state==='failed'?L('整理失败'):item.state==='over_quota'?L('等额度'):item.changed?L('有新建议'):'';
  const stateOf=(kind,id)=>states.get(kind+'\u0000'+id);
  const sizeText=(bytes)=>bytes==null?'':bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(bytes<10240?1:0)+' KB':(bytes/1048576).toFixed(1)+' MB';
  // While the project's sources are still being listed for the first time, the labels are read again shortly after.
  let statesTimer=0;
  const loadStates=async()=>{
    clearTimeout(statesTimer);
    const result=await get('/api/knowledge/states').catch(()=>null);
    modelReady=result?.model_ready!==false;
    states=new Map((result?.states||[]).map(item=>[item.kind+'\u0000'+item.id,item]));
    if(result?.listing)statesTimer=setTimeout(()=>{if(list.isConnected)void loadStates().then(paint);},3000);
  };
  const load=async(force)=>{
    if(loading)return loading;
    if(!force&&Date.now()-loadedAt<30000&&sources.length)return;
    loading=(async()=>{
      list.setAttribute('aria-busy','true');
      try{
        sources=(await get('/api/side/files/sources')).sources||[];
        await loadStates();
        entries=new Map();
        await Promise.all(sources.map(async source=>{
          try{const page=(await get('/api/side/files/entries?source='+encodeURIComponent(source.id))).page;entries.set(source.id,{items:page.entries,next:page.next_cursor,error:null});}
          catch(error){entries.set(source.id,{items:[],next:null,error:error.message});}
        }));
        loadedAt=Date.now();
      }catch(error){sources=[];list.innerHTML='<p class="side-files-note">'+esc(error.message)+'</p>';return;}
      finally{list.setAttribute('aria-busy','false');loading=null;}
      paint();
    })();
    return loading;
  };
  const more=async(sourceId)=>{
    const held=entries.get(sourceId);if(!held?.next)return;
    const page=(await get('/api/side/files/entries?source='+encodeURIComponent(sourceId)+'&cursor='+encodeURIComponent(held.next))).page;
    entries.set(sourceId,{items:[...held.items,...page.entries],next:page.next_cursor,error:null});paint();
  };
  const paint=()=>{
    const query=filter.value.trim().toLowerCase();
    const groups=sources.map(source=>{
      const held=entries.get(source.id)||{items:[],next:null,error:null};
      const items=held.items.filter(item=>!query||(item.title+' '+item.folder.join('/')).toLowerCase().includes(query));
      if(!items.length&&!held.error)return '';
      const byFolder=new Map();for(const item of items){const key=item.folder.join(' / ');if(!byFolder.has(key))byFolder.set(key,[]);byFolder.get(key).push(item);}
      const rows=[...byFolder.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([folder,rows])=>(folder?'<p class="side-files-folder">'+esc(folder)+'</p>':'')+rows.map(item=>{
        const on=current&&current.source===source.id&&current.kind===item.subject.kind&&current.id===item.subject.id;
        const state=stateText(stateOf(item.subject.kind,item.subject.id));
        return '<button class="side-files-row" type="button" data-side-file data-source="'+esc(source.id)+'" data-kind="'+esc(item.subject.kind)+'" data-id="'+esc(item.subject.id)+'" aria-current="'+(on?'true':'false')+'">'+icons.file+'<span>'+esc(item.title)+'</span>'+(state?'<small class="side-files-state">'+esc(state)+'</small>':'')+'<small>'+esc(sizeText(item.size))+'</small></button>';
      }).join('')).join('');
      return '<section class="side-files-group"><h3>'+esc(source.title)+'</h3>'+(held.error?'<p class="side-files-note">'+esc(held.error)+'</p>':'')+rows+(held.next&&!query?'<button class="mw-btn mw-btn--ghost mw-btn--sm side-files-more" type="button" data-side-files-more="'+esc(source.id)+'">'+esc(L('加载更多'))+'</button>':'')+'</section>';
    }).join('');
    // Pieces found by their content and cards (knowledge.search: what an agent asking the same words finds), above the names that match.
    const hits=query&&found&&found.query===query?found.cards.map(card=>'<button class="side-files-row side-files-hit" type="button" data-knowledge-hit data-kind="'+esc(card.subject.kind)+'" data-id="'+esc(card.subject.id)+'" data-surface="'+esc(card.open?.surface||'')+'" data-open="'+esc(card.open?.id||'')+'">'+icons.file+'<span><strong>'+esc(card.title)+'</strong><em>'+esc(card.hint||card.brief||'')+'</em></span><small>'+esc(card.plugin_title)+'</small></button>').join(''):'';
    const hitGroup=hits?'<section class="side-files-group"><h3>'+esc(L('按内容找到'))+'</h3>'+hits+'</section>':'';
    const searching=query&&query.length>=2&&(!found||found.query!==query);
    list.innerHTML=(hitGroup+groups)||'<p class="side-files-note">'+esc(searching?L('正在按内容查找…'):query?L('没有找到相关的资料'):sources.length?L('这些插件里还没有资料'):L('这个项目里还没有提供资料的插件。Files、Pages、成果等插件启用后，它们的资料会出现在这里；也可以点上面的导入。'))+'</p>';
  };
  const find=(source,kind,id)=>(entries.get(source)?.items||[]).find(item=>item.subject.kind===kind&&item.subject.id===id);
  const show=(on)=>{preview.hidden=!on;browse.hidden=on&&!wide;};
  const setOpen=(target)=>{openButton.hidden=!target;openButton.dataset.surface=target?.surface||'';openButton.dataset.id=target?.id||'';};
  // The shared preview renderer (design system), the same one the 成果库 uses: Markdown, CSV as a table, plain text.
  ${FILE_PREVIEW_CLIENT_SCRIPT}
  const render=(file,note)=>{
    body.classList.remove('is-frame');
    // Where a handed-over page came from: the page itself opens again in the side panel's browser.
    const source=/^https?:\/\//.test(file.source_url||'')?'<p class="side-files-source">'+esc(L('原页面'))+'：<button class="side-files-link" type="button" data-side-files-action="source" data-url="'+esc(file.source_url)+'">'+esc(file.source_url)+'</button></p>':'';
    const head=source+(note?'<p class="side-files-problem">'+esc(note)+'</p>':'')+(file.truncated?'<p class="side-files-truncated">'+esc(L('只显示了开头一部分。完整内容请在插件中打开。'))+'</p>':'');
    const type=file.media_type||'text/plain';
    if(file.url&&type==='application/pdf'){body.classList.add('is-frame');body.innerHTML=head+'<iframe title="'+esc(file.title)+'" src="'+esc(file.url)+'"></iframe>';return;}
    if(file.url&&/^image\//.test(type)){body.innerHTML=head+'<img alt="'+esc(file.title)+'" src="'+esc(file.url)+'">';return;}
    if(file.encoding==='base64'&&/^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(type)){body.innerHTML=head+'<img alt="'+esc(file.title)+'" src="data:'+type+';base64,'+file.data+'">';return;}
    if(file.encoding==='base64'&&type==='application/pdf'&&file.raw){body.classList.add('is-frame');body.innerHTML=head+'<iframe title="'+esc(file.title)+'" src="'+esc(file.raw)+'"></iframe>';return;}
    if(file.encoding==='base64'){body.innerHTML=head+'<p class="side-files-note">'+esc(L('这种文件（{type}）不能在侧栏里预览，可以在插件中打开。',{type}))+'</p>';return;}
    body.innerHTML=head+renderFilePreview({...file,truncated:false},{escape:esc,text:L});
  };
  // The piece's card above its preview: how far it is organized, its brief and keywords, and what the person can do with it.
  const showCard=async(kind,id,request)=>{
    cardBox.hidden=true;cardBox.replaceChildren();
    let card=null;try{card=(await get('/api/knowledge/card?kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id))).card;}catch{return;}
    if(!card||current!==request)return;
    paintCard(card,false);
  };
  const paintCard=(card,editing)=>{
    const state=stateText({state:card.state,excluded:card.excluded,changed:!!card.suggestion})||(card.state==='listed'?L('只列标题'):L('已整理'));
    const words=(card.keywords||[]).join('、');
    cardBox.innerHTML=editing
      ?'<form class="side-files-card-form" data-side-card-form><label>'+esc(L('标题'))+'<input class="mw-input" name="title" value="'+esc(card.title)+'" required maxlength="120"></label><label>'+esc(L('简介'))+'<textarea class="mw-textarea" name="brief" rows="3" maxlength="300">'+esc(card.brief)+'</textarea></label><label>'+esc(L('关键词'))+'<input class="mw-input" name="keywords" value="'+esc(words)+'"></label><div class="side-files-card-actions"><button class="mw-btn mw-btn--primary mw-btn--sm" type="submit">'+esc(L('保存卡片'))+'</button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-side-card="cancel">'+esc(L('取消'))+'</button></div></form>'
      :'<p class="side-files-card-head"><span class="mw-badge mw-badge--neutral">'+esc(state)+'</span>'+(card.state==='failed'&&card.error?'<span class="side-files-card-error">'+esc(card.error)+'</span>':'')+'</p>'+(card.brief?'<p class="side-files-card-brief">'+esc(card.brief)+'</p>':'')+(words?'<p class="side-files-card-words">'+esc(words)+'</p>':'')
        +'<div class="side-files-card-actions"><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-side-card="edit">'+esc(L('编辑卡片'))+'</button><button class="mw-btn mw-btn--ghost mw-btn--sm" type="button" data-side-card="organize">'+esc(L('重新整理'))+'</button><label class="side-files-card-keep"><input type="checkbox" data-side-card="exclude"'+(card.excluded?' checked':'')+'> '+esc(L('不给 Agent 用'))+'</label></div>';
    cardBox.hidden=false;cardBox.dataset.kind=card.subject.kind;cardBox.dataset.id=card.subject.id;cardBox.cardRecord=card;
  };
  const cardAction=async(action,control)=>{
    const card=cardBox.cardRecord;if(!card)return;
    try{
      if(action==='edit'){paintCard(card,true);cardBox.querySelector('input')?.focus();return;}
      if(action==='cancel'){paintCard(card,false);return;}
      if(action==='organize'){await post('/api/knowledge/organize',{subjects:[card.subject]});paintCard({...card,state:'pending',error:null},false);return;}
      if(action==='exclude'){const next=await post('/api/knowledge/exclude',{subject:card.subject,excluded:control.checked});paintCard(next,false);}
    }catch(error){if(control&&action==='exclude')control.checked=!control.checked;molisWorkRequest.show(cardBox.querySelector('.side-files-card-head')||cardBox,error);}
    const held=stateOf(card.subject.kind,card.subject.id);if(held&&cardBox.cardRecord){const next=cardBox.cardRecord;Object.assign(held,{state:next.state,excluded:next.excluded,changed:!!next.suggestion});paint();}
  };
  cardBox.addEventListener('click',event=>{const control=event.target?.closest?.('[data-side-card]');if(control&&control.type!=='checkbox')void cardAction(control.dataset.sideCard,control);});
  cardBox.addEventListener('change',event=>{const control=event.target?.closest?.('[data-side-card="exclude"]');if(control)void cardAction('exclude',control);});
  cardBox.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,card=cardBox.cardRecord;if(!card)return;
    const keywords=form.elements.keywords.value.split(/[,，、;；]/).map(word=>word.trim()).filter(Boolean);
    const change={};if(form.elements.title.value.trim()!==card.title)change.title=form.elements.title.value.trim();if(form.elements.brief.value.trim()!==card.brief)change.brief=form.elements.brief.value.trim();if(keywords.join('、')!==(card.keywords||[]).join('、'))change.keywords=keywords;
    if(!Object.keys(change).length){paintCard(card,false);return;}
    try{paintCard(await post('/api/knowledge/edit',{subject:card.subject,...change}),false);}catch(error){molisWorkRequest.show(form.querySelector('.side-files-card-actions'),error);}
  });
  const openFile=async(sourceId,kind,id,fallback)=>{
    const source=sources.find(item=>item.id===sourceId),item=find(sourceId,kind,id)||fallback||null;
    const request=current={source:sourceId,kind,id};paint();show(true);
    // The file shown is the object a selection in it is about: what is in hand on the right (context-landing.ts).
    if(source?.plugin_id)body.dataset.assistantContext=JSON.stringify({plugin_id:source.plugin_id,object:{kind,id,title:item?.title||''}});else delete body.dataset.assistantContext;
    title.textContent=item?.title||L('文件');
    meta.textContent=[source?.title,item?.updated_at?new Date(item.updated_at).toLocaleString():'',sizeText(item?.size)].filter(Boolean).join(' · ');
    setOpen(item?.open||null);body.innerHTML='<p class="side-files-note">'+esc(L('正在读取…'))+'</p>';body.scrollTop=0;
    void showCard(kind,id,request);
    try{
      const result=await get('/api/side/files/content?source='+encodeURIComponent(sourceId)+'&kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id)+'&media_type='+encodeURIComponent(item?.media_type||''));
      if(current!==request)return;
      if(!result.content){body.innerHTML='<p class="side-files-note">'+esc(L('这个插件没有提供预览，可以在插件中打开。'))+'</p>';return;}
      const raw=host.route('/api/side/files/raw?source='+encodeURIComponent(sourceId)+'&kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id));
      render({...result.content,raw});
    }catch(error){if(current===request)body.innerHTML='<p class="side-files-problem">'+esc(error.message)+'</p>';}
  };
  // A preview another surface hands over (the Assistant's attachment, a result it made): shown as given.
  // Only same-origin paths and inline images: a preview never loads another site or a script-bearing data URL.
  const safeUrl=(url)=>typeof url==='string'&&(/^\/(?!\/)/.test(url)||/^data:image\/(png|jpeg|gif|webp);base64,/.test(url))?url:'';
  const openGiven=(given)=>{
    current={source:'',kind:'',id:given.id||given.title||''};paint();show(true);delete body.dataset.assistantContext;cardBox.hidden=true;
    title.textContent=given.title||L('文件');meta.textContent=given.meta||'';setOpen(given.open||null);body.scrollTop=0;
    render({title:given.title||'',media_type:given.media_type||'text/plain',encoding:'utf8',data:given.text||'',url:safeUrl(given.url),truncated:!!given.truncated,source_url:given.source_url||''},given.problem||'');
  };
  root.addEventListener('click',event=>{
    const target=event.target?.nodeType===1?event.target:null;if(!target)return;
    const row=target.closest('[data-side-file]');if(row){void openFile(row.dataset.source,row.dataset.kind,row.dataset.id);return;}
    const hit=target.closest('[data-knowledge-hit]');
    if(hit){const source=sources.find(item=>item.kinds.some(kind=>kind.kind===hit.dataset.kind))?.id;const name=hit.querySelector('strong')?.textContent||'';
      if(source)void openFile(source,hit.dataset.kind,hit.dataset.id,{title:name,subject:{kind:hit.dataset.kind,id:hit.dataset.id},open:hit.dataset.surface?{surface:hit.dataset.surface,id:hit.dataset.open}:null});
      else if(hit.dataset.surface)host.openRecord?.(hit.dataset.surface,hit.dataset.open,name);return;}
    const moreButton=target.closest('[data-side-files-more]');if(moreButton){void more(moreButton.dataset.sideFilesMore);return;}
    const action=target.closest('[data-side-files-action]')?.dataset.sideFilesAction;
    if(action==='refresh'){void load(true);return;}
    if(action==='back'){show(false);current=null;paint();list.querySelector('[data-side-file]')?.focus();return;}
    if(action==='open'&&openButton.dataset.surface){host.openRecord?.(openButton.dataset.surface,openButton.dataset.id,title.textContent||'');return;}
    if(action==='source'){const url=target.closest('[data-url]')?.dataset.url;if(url)document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'browser',target:{url},focus:true}}));return;}
  });
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!preview.hidden&&!wide&&!event.target.closest?.('dialog')){event.preventDefault();show(false);current=null;paint();}});
  filter.addEventListener('input',()=>{
    paint();clearTimeout(searchTimer);const query=filter.value.trim().toLowerCase();
    if(query.length<2){found=null;return;}
    searchTimer=setTimeout(async()=>{try{const result=await get('/api/knowledge/search?q='+encodeURIComponent(query));if(filter.value.trim().toLowerCase()===query){found={query,cards:result.cards||[]};paint();}}catch{if(filter.value.trim().toLowerCase()===query){found={query,cards:[]};paint();}}},300);
  });
  new ResizeObserver(()=>{wide=root.clientWidth>=720;if(!preview.hidden)browse.hidden=!wide;}).observe(root);
  document.addEventListener('molis:side-shown',async event=>{
    if(event.detail?.tab!=='files'||event.detail?.open===false)return;
    const target=event.detail?.target;
    if(target?.preview){openGiven(target.preview);void load(false);return;}
    if(target?.subject){
      const request=current={source:target.source||'',kind:target.subject.kind,id:target.subject.id};await load(false);if(current!==request)return;
      const source=target.source||sources.find(item=>item.kinds.some(kind=>kind.kind===target.subject.kind))?.id;
      if(source)void openFile(source,target.subject.kind,target.subject.id,target.entry);
      else openGiven({title:target.title||L('文件'),problem:L('这个文件所在的插件没有向侧栏提供文件，或当前没有读取权限。'),open:target.open});
    }else await load(false);
  });
}`.replace(/^[ \t]*\/\/.*\n/gm, "");
