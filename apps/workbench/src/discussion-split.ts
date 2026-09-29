/** Host layout only. Chat facts and drafts belong to im-ui and the shared server. */
export const DISCUSSION_SPLIT_STYLES = String.raw`
html body.immersive-workbench[data-discussion-open=true] [data-plugin-stage]{margin-right:calc(var(--discussion-size,35vw) + 8px)}
html body.immersive-workbench #dock-window-im{position:fixed;display:flex;flex-direction:column;inset:calc(var(--desktop-titlebar-height,32px) + 0px) 8px calc(var(--dock-h,48px) + 8px) auto;width:var(--discussion-size,35vw);height:auto;z-index:10;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--paper);box-shadow:none;animation:none;opacity:0;transform:translateX(24px);transition:opacity 250ms var(--ease-quint), transform 420ms var(--ease-quint);pointer-events:none}
html body.immersive-workbench #dock-window-im[hidden]{display:none}
html body.immersive-workbench[data-discussion-open=true] #dock-window-im{opacity:1;transform:none;pointer-events:auto}
html body.immersive-workbench #dock-window-im>.dock-window-head{display:none}
html body.immersive-workbench #dock-window-im .dock-window-body{flex:1;min-height:0}
html body.immersive-workbench #dock-window-im iframe{border:0;display:block;width:100%;height:100%}
.discussion-divider{position:fixed;right:calc(var(--discussion-size,35vw) + 7px);top:var(--desktop-titlebar-height,32px);bottom:calc(var(--dock-h,48px) + 8px);width:9px;z-index:11;cursor:col-resize;touch-action:none;border:0;padding:0;background:transparent}
.discussion-divider:after{content:"";position:absolute;top:calc(50% - 14px);left:3px;width:3px;height:28px;border-radius:4px;background:var(--line-strong,var(--line))}
.discussion-divider:hover:after,.discussion-divider:focus-visible:after{background:var(--ink)}
.discussion-divider:focus-visible{outline:1px solid var(--ink);outline-offset:-2px}
body:not([data-discussion-open=true]) .discussion-divider{display:none}
html body.is-discussion-resizing :is([data-plugin-stage],#dock-window-im){transition:none!important}
body.is-discussion-resizing iframe{pointer-events:none!important}
body.is-discussion-resizing{cursor:col-resize;user-select:none}
@media(max-width:760px){
 html body.immersive-workbench[data-discussion-open=true] [data-plugin-stage]{margin-right:8px;margin-bottom:calc(52dvh + 8px)}
 html body.immersive-workbench #dock-window-im{inset:auto 8px calc(var(--dock-h,48px) + 8px) 8px;width:auto;height:52dvh;transform:translateY(12px)}
 .discussion-divider{display:none!important}
}
@media(prefers-reduced-motion:reduce){html body.immersive-workbench :is([data-plugin-stage],#dock-window-im){transition:none!important}}
`;

export const DISCUSSION_SPLIT_SCRIPT = String.raw`(() => {
  if(document.body.hasAttribute('data-pane-embedded'))return;
  const panel=document.querySelector('[data-dock-window="im"]'),stage=document.querySelector('[data-plugin-stage]');
  if(!panel||!stage)return;
  document.querySelector('[data-workspace]').append(panel);
  const frame=panel.querySelector('iframe'),projectId=document.body.dataset.projectId;
  const divider=document.createElement('div');divider.className='discussion-divider';divider.tabIndex=0;
  divider.setAttribute('role','separator');divider.setAttribute('aria-orientation','vertical');divider.setAttribute('aria-label','调整讨论区宽度');divider.setAttribute('aria-controls','dock-window-im');
  panel.after(divider);
  let open=false,closing=null,trigger=null,ratio=.35;
  try{const stored=Number(localStorage.getItem('molis:discussion-ratio'));if(stored>=.25&&stored<=.55)ratio=stored;}catch{}
  const size=()=>Math.min(Math.max(innerWidth*ratio,360),innerWidth*.55);
  const paint=()=>{const width=Math.round(size());document.body.style.setProperty('--discussion-size',width+'px');divider.setAttribute('aria-valuenow',String(width));divider.setAttribute('aria-valuemin','360');divider.setAttribute('aria-valuemax',String(Math.floor(innerWidth*.55)));};
  const visible=()=>frame.contentWindow?.postMessage({type:'molis:im-visibility',visible:open,theme:document.documentElement.dataset.resolvedTheme},location.origin);
  const setOpen=(next)=>{
    clearTimeout(closing);open=next;
    if(open){trigger=document.activeElement;panel.hidden=false;panel.inert=false;paint();void panel.offsetWidth;document.body.dataset.discussionOpen='true';if(!frame.getAttribute('src'))frame.src='/im?embedded=1'+(projectId?'&project='+encodeURIComponent(projectId):'');}
    else{delete document.body.dataset.discussionOpen;panel.inert=true;closing=setTimeout(()=>{if(!open)panel.hidden=true;},matchMedia('(prefers-reduced-motion:reduce)').matches?0:340);const focusTarget=trigger?.isConnected&&trigger.getClientRects().length?trigger:document.querySelector('[data-project-menu] summary');focusTarget?.focus({preventScroll:true});}
    document.querySelectorAll('[data-dock-toggle="im"]').forEach(button=>button.setAttribute('aria-expanded',String(open)));visible();
  };
  document.addEventListener('molis:discussion-toggle',()=>setOpen(!open));
  document.addEventListener('molis:discussion-close',()=>setOpen(false));
  frame.addEventListener('load',visible);
  new MutationObserver(visible).observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme']});
  addEventListener('message',async event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow)return;
    if(event.data?.type==='molis:im-close')setOpen(false);
    if(event.data?.type==='molis:im-ready')visible();
    if(event.data?.type==='molis:im-connect'&&projectId){
      try{
        const token=document.querySelector('meta[name="molis-work-control-token"]')?.content;
        const response=await fetch('/projects/'+encodeURIComponent(projectId)+'/api/im/connect',{method:'POST',headers:{'Content-Type':'application/json','x-molis-work-control-token':token||'','x-molis-work-idempotency-key':crypto.randomUUID()},body:'{}'});
        const result=await response.json();frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error:response.ok?null:result.error||'项目连接失败'},location.origin);
      }catch{frame.contentWindow.postMessage({type:'molis:im-connected',requestId:event.data.requestId,error:'项目连接中断，请重试'},location.origin);}
    }
  });
  let drag=null;
  divider.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId};divider.setPointerCapture(event.pointerId);document.body.classList.add('is-discussion-resizing');event.preventDefault();});
  divider.addEventListener('pointermove',event=>{if(!drag)return;ratio=Math.max(.25,Math.min(.55,(innerWidth-event.clientX-8)/innerWidth));paint();});
  const end=()=>{if(!drag)return;drag=null;document.body.classList.remove('is-discussion-resizing');try{localStorage.setItem('molis:discussion-ratio',String(ratio));}catch{}};
  divider.addEventListener('pointerup',end);divider.addEventListener('lostpointercapture',end);divider.addEventListener('pointercancel',end);
  divider.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();ratio=event.key==='Home'?.25:event.key==='End'?.55:Math.max(.25,Math.min(.55,ratio+(event.key==='ArrowLeft'?24:-24)/innerWidth));paint();try{localStorage.setItem('molis:discussion-ratio',String(ratio));}catch{}});
  divider.addEventListener('dblclick',()=>{ratio=.35;paint();});
  addEventListener('resize',paint);paint();
})();`;
