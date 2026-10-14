/** Reparents the one Assistant controller; tabs own presentation, never execution. */
export const ASSISTANT_STAGE_FACTORY = String.raw`({island,panel,input,current,switchTo,showProblem,L})=>{
  if(document.body.hasAttribute('data-pane-embedded'))return null;
  const home=document.createComment('assistant-home');island.before(home);
  const launcher=document.createElement('button');launcher.type='button';launcher.className='mw-btn mw-btn--secondary assistant-stage-launcher';
  launcher.textContent=L('助理');launcher.hidden=true;home.after(launcher);
  const expand=island.querySelector('[data-assistant-expand]');
  const retract=island.querySelector('[data-assistant-retract]');
  const footer=document.createElement('div');footer.className='assistant-stage-footer';
  const footerHomes=[...island.querySelectorAll(':scope > .assistant-popover,:scope > .assistant-context-actions,:scope > .assistant-offer,:scope > .assistant-composer')].map(node=>{const marker=document.createComment('assistant-footer-home');node.before(marker);return {node,marker};});
  const offsets=new Map();
  let staged=false,open=[],active=null,mounting=false,shownId=null,returning=false,dockedTab=null;
  const request=(type,id,title)=>{const options={detail:{owner:'assistant',id,title},cancelable:true};return document.dispatchEvent(type==='molis-work:system-view-open'?new CustomEvent('molis-work:system-view-open',options):new CustomEvent('molis-work:system-view-close',options));};
  const focus=()=>{const work=current();if(work)request('molis-work:system-view-open',work.work_id,work.title);};
  const returnHome=()=>{
    if(island.parentNode!==home.parentNode)home.after(island);
    for(const {node,marker} of footerHomes)marker.after(node);footer.remove();
    delete island.dataset.assistantStage;staged=false;shownId=null;launcher.hidden=true;
    if(retract)retract.hidden=true;
    if(expand)expand.hidden=false;
  };
  const syncWork=work=>{
    if(expand)expand.disabled=!work;
    if(mounting||!staged||!work||work.work_id===shownId)return;
    focus();
  };
  document.addEventListener('molis-work:system-view-changed',event=>{
    open=(event.detail?.open||[]).filter(tab=>tab.owner==='assistant');
    active=event.detail?.active?.owner==='assistant'?event.detail.active:null;
    if(returning){dockedTab=active?.tab_id||null;return;}
    if(!active)dockedTab=null;
    if(active?.tab_id===dockedTab)return;
    if(shownId)offsets.set(shownId,panel.querySelector('[data-assistant-thread]')?.scrollTop||0);
    if(active){
      const destination=document.querySelector('[data-system-tab="'+CSS.escape(active.tab_id)+'"]');
      if(!destination)return;
      const scroll=panel.querySelector('[data-assistant-thread]')?.scrollTop||0;
      if(island.parentNode!==destination)destination.append(island);
      for(const {node} of footerHomes)footer.append(node);panel.querySelector('.assistant-main').append(footer);
      staged=true;shownId=active.id;island.dataset.assistantStage='';launcher.hidden=false;
      launcher.textContent=L('返回助理');if(expand)expand.hidden=true;if(retract)retract.hidden=false;
      panel.hidden=false;
      const thread=panel.querySelector('[data-assistant-thread]');if(thread)thread.scrollTop=scroll;
      const id=active.id;mounting=true;Promise.resolve(switchTo(id)).then(()=>{if(shownId===id)requestAnimationFrame(()=>{if(thread)thread.scrollTop=offsets.get(id)||0;});},error=>showProblem({message:error.message})).finally(()=>{mounting=false;});
    }else if(staged&&!open.some(tab=>tab.id===shownId)){
      returnHome();panel.hidden=true;
    }
  });
  document.addEventListener('molis-work:system-view-open',event=>{if(event.detail?.owner==='assistant')dockedTab=null;},true);
  document.addEventListener('click',event=>{if(event.target.closest?.('[data-tab-id]')?.dataset.tabId===dockedTab)dockedTab=null;},true);
  const closeToHome=()=>{const id=shownId;returnHome();returning=true;try{request('molis-work:system-view-close',id);}finally{returning=false;}};
  launcher.addEventListener('click',focus);
  expand?.addEventListener('click',focus);
  retract?.addEventListener('click',()=>{
    closeToHome();panel.hidden=false;input.focus();
  });
  queueMicrotask(()=>{
    const restored=document.querySelector('[data-tab-pane].is-focused [data-system-owner="assistant"]');
    if(restored?.getClientRects().length)request('molis-work:system-view-open',restored.dataset.systemItem);
  });
  return {syncWork,show:show=>{
    if(!staged)return false;
    if(show){if(!active||active.id!==current()?.work_id)focus();panel.hidden=false;}
    else {closeToHome();panel.hidden=true;}
    return true;
  }};
}`;

/** A stored instant as the value of a local date-and-time picker. */
export function localMoment(iso: string): string {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  const two = (part: number) => String(part).padStart(2, "0");
  return at.getFullYear() + "-" + two(at.getMonth() + 1) + "-" + two(at.getDate()) + "T" + two(at.getHours()) + ":" + two(at.getMinutes());
}
