/** Presentation binding only. The owner still authorizes every object read and write. */
export const SIDE_CONTEXT_FACTORY = String.raw`({panel,select,current})=>{
  let entries=[...panel.querySelectorAll('[data-side-context-owner]')];
  let epoch=0,signature='',context=null,source=null,lastTool=null,queued=false,target=null;
  const watched=new WeakMap();
  const visible=node=>!!node&&!node.hidden&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
  const send=()=>{
    for(const entry of entries){
      const frame=panel.querySelector('[data-side-body="'+entry.dataset.sideTab+'"] iframe');
      frame?.contentWindow?.postMessage({type:'molis:side-context',context_epoch:epoch,
        context:context?.plugin_id===entry.dataset.sideContextOwner?context:null},location.origin);
      if(target?.tab===entry.dataset.sideTab)frame?.contentWindow?.postMessage({type:'molis:side-shown',target:target.value},location.origin);
    }
  };
  const watch=doc=>{
    if(watched.has(doc))return;
    const observer=new MutationObserver(schedule);
    observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-assistant-context','hidden','class','data-expanded']});
    watched.set(doc,observer);
  };
  const inspect=(doc,paneId,tabId)=>{
    for(const entry of entries){
      const surface=[...doc.querySelectorAll('[data-work-surface]')].find(node=>node.dataset.workSurface===entry.dataset.sideContextSurface&&visible(node));
      if(!surface)continue;
      const holder=surface.matches('[data-assistant-context]')?surface:surface.querySelector('[data-assistant-context]');
      let value;try{value=JSON.parse(holder?.getAttribute('data-assistant-context')||'null');}catch{continue;}
      if(value?.plugin_id!==entry.dataset.sideContextOwner||typeof value.object?.id!=='string'||typeof value.object.kind!=='string')continue;
      return {plugin_id:value.plugin_id,pane_id:paneId,tab_id:tabId,view_id:entry.dataset.sideContextSurface,
        object_ref:{kind:value.object.kind,id:value.object.id,title:value.object.title,version:value.object.version},
        revision:value.object.version??null,unsaved:value.unsaved===true};
    }
    return null;
  };
  const update=()=>{
    queued=false;
    const pane=document.querySelector('[data-tab-pane].is-focused');
    const paneId=pane?.dataset.tabPane||'';
    const frame=[...document.querySelectorAll('iframe[data-pane-owner]')].find(node=>node.dataset.paneOwner===paneId&&visible(node));
    let next=null,owner=null;
    if(frame){
      try{const doc=frame.contentDocument;if(doc?.body){watch(doc);next=inspect(doc,paneId,frame.dataset.paneTab);owner=frame;}}catch{/* A foreign document is never a context source. */}
    }else if(pane&&visible(pane)){
      next=inspect(pane,paneId,document.querySelector('[data-tab-id][aria-current="page"]')?.dataset.tabId||'');
    }
    const key=JSON.stringify(next);
    if(key===signature&&owner===source)return;
    signature=key;context=next;source=owner;epoch++;
    if(next?.object_ref.id!==target?.value?.page_id)target=null;
    const active=current();
    if(active&&!entries.some(entry=>entry.dataset.sideTab===active))lastTool=active;
    for(const entry of entries)entry.hidden=entry.dataset.sideContextOwner!==context?.plugin_id;
    if(entries.some(entry=>entry.dataset.sideTab===active&&entry.hidden)){
      const tool=[...panel.querySelectorAll('[data-side-tab]')].find(entry=>!entry.hidden&&(entry.dataset.sideTab===lastTool));
      select(tool?.dataset.sideTab);
    }
    send();
  };
  function schedule(){if(!queued){queued=true;queueMicrotask(update);}}
  document.addEventListener('molis-work:plugins-changed',event=>{
    const next=event.detail?.next;if(!next)return;
    const all=[...next.querySelectorAll('[data-side-tab]')],theirs=all.filter(tab=>tab.hasAttribute('data-side-context-owner'));
    const body=(root,id)=>[...root.querySelectorAll('[data-side-body]')].find(node=>node.dataset.sideBody===id);
    for(const entry of entries)if(!theirs.some(tab=>tab.dataset.sideTab===entry.dataset.sideTab)){body(panel,entry.dataset.sideTab)?.remove();entry.remove();}
    for(const tab of theirs)if(!entries.some(entry=>entry.isConnected&&entry.dataset.sideTab===tab.dataset.sideTab)){
      const following=all.slice(all.indexOf(tab)+1).map(node=>[...panel.querySelectorAll('[data-side-tab]')].find(live=>live.dataset.sideTab===node.dataset.sideTab)).find(Boolean);
      panel.querySelector('[data-side-tabs]').insertBefore(document.importNode(tab,true),following||null);
      const view=body(next,tab.dataset.sideTab);if(view)panel.append(document.importNode(view,true));
    }
    entries=[...panel.querySelectorAll('[data-side-context-owner]')];signature='';
    if(![...panel.querySelectorAll('[data-side-tab]')].some(tab=>tab.dataset.sideTab===current()))select(lastTool);
    update();
  });
  document.addEventListener('molis-work:place-changed',schedule);
  document.addEventListener('molis:side-shown',event=>{
    if(!entries.some(entry=>entry.dataset.sideTab===event.detail?.tab))lastTool=event.detail?.tab;
    if(event.detail?.target)target={tab:event.detail.tab,value:event.detail.target};
    send();
  });
  document.addEventListener('load',event=>{if(event.target instanceof HTMLIFrameElement)schedule();},true);
  const result=(data)=>{
    if(data?.type!=='molis:side-context-result'||data.object_id!==context?.object_ref.id)return;
    for(const entry of entries)if(!entry.hidden)panel.querySelector('[data-side-body="'+entry.dataset.sideTab+'"] iframe')?.contentWindow?.postMessage(data,location.origin);
  };
  document.addEventListener('molis:side-context-result',event=>{if(!source)result(event.detail);});
  addEventListener('message',event=>{
    if(event.origin!==location.origin)return;
    if(source?.contentWindow===event.source){result(event.data);return;}
    const entry=entries.find(entry=>panel.querySelector('[data-side-body="'+entry.dataset.sideTab+'"] iframe')?.contentWindow===event.source);
    if(!entry)return;
    if(event.data?.type==='molis:side-ready')send();
    if(event.data?.type!=='molis:side-context-command'||entry.hidden||event.data.context_epoch!==epoch||!context)return;
    const message={type:'molis:side-context-command',context_epoch:epoch,context,command:event.data.command};
    if(source&&visible(source))source.contentWindow.postMessage(message,location.origin);
    else document.dispatchEvent(new CustomEvent('molis:side-context-command',{detail:message}));
  });
  watch(document);schedule();
}`;
