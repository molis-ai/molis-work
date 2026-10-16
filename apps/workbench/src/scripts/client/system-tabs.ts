/** System-owned views share the tab layout without pretending to be installed plugins. */
export const SYSTEM_TABS_FACTORY = String.raw`({getState,ops,apply,persist,close,embedded})=>{
  const roots=new Map();
  const registered=owner=>typeof owner==='string'&&document.querySelector('[data-system-view-owner="'+CSS.escape(owner)+'"]');
  const root=tab=>{
    if(!registered(tab.owner))return null;
    let node=roots.get(tab.id);
    if(!node){node=document.createElement('section');node.className='system-work-surface';node.dataset.systemTab=tab.id;
      node.dataset.systemOwner=tab.owner;node.dataset.systemItem=tab.itemId;
      const focus=document.createElement('button');focus.type='button';focus.className='system-view-focus';focus.textContent=tab.title;
      focus.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('molis-work:system-view-open',{detail:{owner:tab.owner,id:tab.itemId,title:tab.title},cancelable:true})));
      node.append(focus);roots.set(tab.id,node);}
    return node;
  };
  const sync=()=>{
    if(embedded)return;
    const state=getState(),active=state.exclusive?null:ops.activeTab(state);
    if(active?.kind==='system')document.title=active.title+' · Molis Work';
    const tabs=state.panes.flatMap(pane=>pane.tabs).filter(tab=>tab.kind==='system');
    document.dispatchEvent(new CustomEvent('molis-work:system-view-changed',{detail:{
      active:active?.kind==='system'?{owner:active.owner,id:active.itemId,tab_id:active.id}:null,
      open:tabs.map(tab=>({owner:tab.owner,id:tab.itemId,tab_id:tab.id}))}}));
    for(const [id,node] of roots)if(!tabs.some(tab=>tab.id===id)){node.remove();roots.delete(id);}
  };
  document.addEventListener('molis-work:system-view-open',event=>{
    const {owner,id,title}=event.detail||{};
    if(embedded||!registered(owner)||typeof id!=='string'||!id)return;
    const state=getState();state.exclusive=null;
    let pane=state.panes.find(pane=>pane.tabs.some(tab=>tab.kind==='system'&&tab.owner===owner&&tab.itemId===id));
    if(pane){const tab=pane.tabs.find(tab=>tab.owner===owner&&tab.itemId===id);if(title)tab.title=title;ops.activate(state,pane.id,tab.id);}
    else {pane=ops.focused(state);const tab={id:'system:'+crypto.randomUUID(),kind:'system',owner,plugin:'',itemId:id,title:title||id};pane.tabs.push(tab);pane.activeTabId=tab.id;}
    apply();persist();event.preventDefault();
  });
  document.addEventListener('molis-work:system-view-close',event=>{
    const {owner,id}=event.detail||{},state=getState();
    if(embedded||!registered(owner))return;
    const pane=state.panes.find(pane=>pane.tabs.some(tab=>tab.kind==='system'&&tab.owner===owner&&tab.itemId===id));
    const tab=pane?.tabs.find(tab=>tab.owner===owner&&tab.itemId===id);
    if(tab)close(pane.id,tab.id);
  });
  return {root,sync};
}`;

/** Scroll positions belong to the existing view, including when it is pooled between tab visits. */
export const SCROLL_MEMORY_FACTORY = String.raw`()=>{
  const scrollMemory = new WeakMap();
  const rememberScroll = (node) => {
    const offsets = [];
    for (const element of [node, ...node.querySelectorAll("*")]) {
      if (element.scrollTop > 0 || element.scrollLeft > 0) offsets.push([element, element.scrollTop, element.scrollLeft]);
    }
    if (offsets.length) scrollMemory.set(node, offsets); else scrollMemory.delete(node);
  };
  const restoreScroll = (node) => {
    const offsets = scrollMemory.get(node);
    if (!offsets) return;
    scrollMemory.delete(node);
    requestAnimationFrame(() => offsets.forEach(([element, top, left]) => {
      if (!node.contains(element)) return;
      element.scrollTop = top;
      element.scrollLeft = left;
    }));
  };
  return {rememberScroll,restoreScroll};
}`;
