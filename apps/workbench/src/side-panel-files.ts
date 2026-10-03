import type { SidePanelPrimitives } from "./side-panel.js";

/**
 * The file tab of the side panel (specs/archive/side-panel P3, P8). Lists the file sources plugins declare here and previews
 * one file; "open in its plugin" goes through the same open target system search uses. Other surfaces (the
 * Assistant's work, a plugin page) open a preview here with `molis:side-open { tab: "files", target }`, where the
 * target names a declared source and subject, or carries a preview of its own (`{ preview: { title, media_type, text | url } }`).
 */
export function renderSideFiles({ L, icon }: SidePanelPrimitives): string {
  return `<div class="side-files" data-side-files-root>
      <section class="side-files-browse" data-side-files-browse aria-label="${L("文件列表")}">
        <div class="side-files-head">
          <label class="side-files-filter">${icon("search")}<input type="search" data-side-files-filter placeholder="${L("筛选文件")}" aria-label="${L("筛选文件")}" autocomplete="off"></label>
          <button class="side-files-tool" type="button" data-side-files-action="refresh" aria-label="${L("刷新文件列表")}" title="${L("刷新文件列表")}">${icon("refresh")}</button>
        </div>
        <div class="side-files-list" data-side-files-list aria-busy="true"><p class="side-files-note">${L("正在读取文件…")}</p></div>
      </section>
      <section class="side-files-preview" data-side-files-preview aria-label="${L("文件预览")}" hidden>
        <header class="side-files-preview-head">
          <button class="side-files-tool side-files-back" type="button" data-side-files-action="back" aria-label="${L("返回文件列表")}" title="${L("返回文件列表")}">${icon("chevron-left")}</button>
          <div class="side-files-preview-title"><strong data-side-files-title></strong><small data-side-files-meta></small></div>
          <button class="mw-btn mw-btn--secondary mw-btn--sm" type="button" data-side-files-action="open" hidden>${icon("external")}<span>${L("在插件中打开")}</span></button>
        </header>
        <div class="side-files-body" data-side-files-body tabindex="0"></div>
      </section>
    </div>`;
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
.side-files-table{overflow:auto;border:1px solid var(--line);border-radius:8px}
.side-files-table table{border-collapse:collapse;min-width:100%;font-size:12px}
.side-files-table :is(th,td){padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis}
.side-files-table th{position:sticky;top:0;background:var(--paper);font-weight:600}
.side-files-truncated,.side-files-problem{margin:0 0 12px;padding:8px 12px;border-radius:8px;background:var(--wash,var(--nav-hover));color:var(--ink-soft,var(--ink));font-size:12px}
.side-files-source{margin:0 0 12px;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.side-files-link{padding:0;border:0;background:none;color:var(--accent);font:inherit;text-align:left;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.side-files-link:focus-visible{outline:2px solid var(--focus,var(--accent));outline-offset:2px}
@container side-panel (min-width:720px){
 .side-files{grid-template-columns:minmax(220px,300px) minmax(0,1fr)}
 .side-files-browse{border-right:1px solid var(--line)}
 .side-files-browse[hidden]{display:flex}
 .side-files-back{display:none}
}
`;

/** Factory: the Workbench passes `route`, `translate` and `openRecord(surface, id)` (the search open target). */
export const SIDE_FILES_FACTORY_SCRIPT = String.raw`(host) => {
  const root=document.querySelector('[data-side-files-root]');
  if(!root||document.body.hasAttribute('data-pane-embedded'))return;
  const L=host.translate||((text)=>text);
  const $=(selector)=>root.querySelector(selector);
  const list=$('[data-side-files-list]'),filter=$('[data-side-files-filter]'),browse=$('[data-side-files-browse]'),preview=$('[data-side-files-preview]');
  const body=$('[data-side-files-body]'),title=$('[data-side-files-title]'),meta=$('[data-side-files-meta]'),openButton=$('[data-side-files-action="open"]');
  const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const icons={file:document.querySelector('[data-side-tab="files"] svg')?.outerHTML||''};
  let sources=[],entries=new Map(),loadedAt=0,loading=null,current=null,wide=false;
  const get=async(path)=>{const response=await fetch(host.route(path),{headers:{accept:'application/json'}});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||L('文件没有读到'));return result;};
  const sizeText=(bytes)=>bytes==null?'':bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(bytes<10240?1:0)+' KB':(bytes/1048576).toFixed(1)+' MB';
  const load=async(force)=>{
    if(loading)return loading;
    if(!force&&Date.now()-loadedAt<30000&&sources.length)return;
    loading=(async()=>{
      list.setAttribute('aria-busy','true');
      try{
        sources=(await get('/api/side/files/sources')).sources||[];
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
        return '<button class="side-files-row" type="button" data-side-file data-source="'+esc(source.id)+'" data-kind="'+esc(item.subject.kind)+'" data-id="'+esc(item.subject.id)+'" aria-current="'+(on?'true':'false')+'">'+icons.file+'<span>'+esc(item.title)+'</span><small>'+esc(sizeText(item.size))+'</small></button>';
      }).join('')).join('');
      return '<section class="side-files-group"><h3>'+esc(source.title)+'</h3>'+(held.error?'<p class="side-files-note">'+esc(held.error)+'</p>':'')+rows+(held.next&&!query?'<button class="mw-btn mw-btn--ghost mw-btn--sm side-files-more" type="button" data-side-files-more="'+esc(source.id)+'">'+esc(L('加载更多'))+'</button>':'')+'</section>';
    }).join('');
    list.innerHTML=groups||'<p class="side-files-note">'+esc(query?L('没有符合条件的文件'):sources.length?L('这些插件里还没有文件'):L('这个项目里还没有提供文件的插件。Files、Pages、成果等插件启用后，它们的文件会出现在这里。'))+'</p>';
  };
  const find=(source,kind,id)=>(entries.get(source)?.items||[]).find(item=>item.subject.kind===kind&&item.subject.id===id);
  const show=(on)=>{preview.hidden=!on;browse.hidden=on&&!wide;};
  const setOpen=(target)=>{openButton.hidden=!target;openButton.dataset.surface=target?.surface||'';openButton.dataset.id=target?.id||'';};
  const markdown=(text)=>{
    const inline=(line)=>esc(line).replace(/\x60([^\x60]+)\x60/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*]+)\*/g,'$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
    const out=[];let fence=null,listKind=null;
    const closeList=()=>{if(listKind){out.push('</'+listKind+'>');listKind=null;}};
    for(const line of String(text).split('\n')){
      if(/^\x60\x60\x60/.test(line)){if(fence===null){closeList();fence=[];}else{out.push('<pre>'+esc(fence.join('\n'))+'</pre>');fence=null;}continue;}
      if(fence!==null){fence.push(line);continue;}
      const heading=/^(#{1,3})\s+(.*)$/.exec(line);if(heading){closeList();out.push('<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>');continue;}
      const bullet=/^\s*[-*+]\s+(.*)$/.exec(line),ordered=/^\s*\d+[.)]\s+(.*)$/.exec(line);
      if(bullet||ordered){const kind=bullet?'ul':'ol';if(listKind!==kind){closeList();out.push('<'+kind+'>');listKind=kind;}out.push('<li>'+inline((bullet||ordered)[1])+'</li>');continue;}
      closeList();
      if(/^>\s?/.test(line)){out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');continue;}
      if(line.trim())out.push('<p>'+inline(line)+'</p>');
    }
    if(fence!==null)out.push('<pre>'+esc(fence.join('\n'))+'</pre>');closeList();
    return out.join('');
  };
  // A CSV reads as a table (first 500 rows); quoted cells may hold commas and line breaks.
  const table=(text)=>{
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length&&rows.length<501;i++){
      const c=text[i];
      if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;continue;}
      if(c==='"')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;
    }
    if(cell||row.length){row.push(cell);rows.push(row);}
    const [header=[],...rest]=rows;
    return '<div class="side-files-table"><table><thead><tr>'+header.map(value=>'<th>'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rest.slice(0,500).map(cells=>'<tr>'+cells.map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rest.length>500?'<p class="side-files-truncated">'+esc(L('只显示前 500 行。'))+'</p>':'');
  };
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
    body.innerHTML=head+(/markdown/.test(type)?markdown(file.data):type==='text/csv'?table(file.data):'<pre>'+esc(file.data)+'</pre>');
  };
  const openFile=async(sourceId,kind,id,fallback)=>{
    const source=sources.find(item=>item.id===sourceId),item=find(sourceId,kind,id)||fallback||null;
    current={source:sourceId,kind,id};paint();show(true);
    title.textContent=item?.title||L('文件');
    meta.textContent=[source?.title,item?.updated_at?new Date(item.updated_at).toLocaleString():'',sizeText(item?.size)].filter(Boolean).join(' · ');
    setOpen(item?.open||null);body.innerHTML='<p class="side-files-note">'+esc(L('正在读取…'))+'</p>';body.scrollTop=0;
    try{
      const result=await get('/api/side/files/content?source='+encodeURIComponent(sourceId)+'&kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id)+'&media_type='+encodeURIComponent(item?.media_type||''));
      if(!current||current.id!==id)return;
      if(!result.content){body.innerHTML='<p class="side-files-note">'+esc(L('这个插件没有提供预览，可以在插件中打开。'))+'</p>';return;}
      const raw=host.route('/api/side/files/raw?source='+encodeURIComponent(sourceId)+'&kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id));
      render({...result.content,raw});
    }catch(error){if(current?.id===id)body.innerHTML='<p class="side-files-problem">'+esc(error.message)+'</p>';}
  };
  // A preview another surface hands over (the Assistant's attachment, a result it made): shown as given.
  // Only same-origin paths and inline images: a preview never loads another site or a script-bearing data URL.
  const safeUrl=(url)=>typeof url==='string'&&(/^\/(?!\/)/.test(url)||/^data:image\/(png|jpeg|gif|webp);base64,/.test(url))?url:'';
  const openGiven=(given)=>{
    current={source:'',kind:'',id:given.id||given.title||''};paint();show(true);
    title.textContent=given.title||L('文件');meta.textContent=given.meta||'';setOpen(given.open||null);body.scrollTop=0;
    render({title:given.title||'',media_type:given.media_type||'text/plain',encoding:'utf8',data:given.text||'',url:safeUrl(given.url),truncated:!!given.truncated,source_url:given.source_url||''},given.problem||'');
  };
  root.addEventListener('click',event=>{
    const target=event.target?.nodeType===1?event.target:null;if(!target)return;
    const row=target.closest('[data-side-file]');if(row){void openFile(row.dataset.source,row.dataset.kind,row.dataset.id);return;}
    const moreButton=target.closest('[data-side-files-more]');if(moreButton){void more(moreButton.dataset.sideFilesMore);return;}
    const action=target.closest('[data-side-files-action]')?.dataset.sideFilesAction;
    if(action==='refresh'){void load(true);return;}
    if(action==='back'){show(false);current=null;paint();list.querySelector('[data-side-file]')?.focus();return;}
    if(action==='open'&&openButton.dataset.surface){host.openRecord?.(openButton.dataset.surface,openButton.dataset.id);return;}
    if(action==='source'){const url=target.closest('[data-url]')?.dataset.url;if(url)document.dispatchEvent(new CustomEvent('molis:side-open',{detail:{tab:'browser',target:{url},focus:true}}));return;}
  });
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&!preview.hidden&&!wide){event.preventDefault();show(false);current=null;paint();}});
  filter.addEventListener('input',paint);
  new ResizeObserver(()=>{wide=root.clientWidth>=720;if(!preview.hidden)browse.hidden=!wide;}).observe(root);
  document.addEventListener('molis:side-shown',async event=>{
    if(event.detail?.tab!=='files'||event.detail?.open===false)return;
    const target=event.detail?.target;
    if(target?.preview){openGiven(target.preview);void load(false);return;}
    await load(false);
    if(target?.subject){
      const source=target.source||sources.find(item=>item.kinds.some(kind=>kind.kind===target.subject.kind))?.id;
      if(source)void openFile(source,target.subject.kind,target.subject.id,target.entry);
      else openGiven({title:target.title||L('文件'),problem:L('这个文件所在的插件没有向侧栏提供文件，或当前没有读取权限。'),open:target.open});
    }
  });
}`;
