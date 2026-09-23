import { ALCHEMIST_VIEWS } from './client-views.js';
import { ALCHEMIST_FLOWS } from './client-flows.js';
/** Uses the same native Workbench client lifecycle and project routes as Pages. */
export const ALCHEMIST_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
  const root=document.querySelector('[data-alchemist=workbench]');if(!root)return;
  const L=host.translate, $=s=>root.querySelector(s), enc=encodeURIComponent;
  const content=$('[data-alc-content]'),footer=$('[data-alc-footer]'),side=$('[data-alc-side]'),dialog=$('[data-alc-dialog]'),form=$('[data-alc-form]'),dialogBody=$('[data-alc-dialog-body]'),dialogSubmit=$('[data-alc-submit]');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),tx=v=>esc(L(v));
  const button=(label,action,primary=false,attrs='')=>'<button type="button" class="mw-btn mw-btn--'+(primary?'primary':'ghost')+'" data-alc-action="'+action+'" '+attrs+'>'+tx(label)+'</button>';
  const safeUrl=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?esc(url.href):'#';}catch{return '#';}};
  const base=host.route('/api/alchemist/studio/api/v1');
  const headers=()=>typeof molisWorkControlHeaders==='function'?molisWorkControlHeaders():{'content-type':'application/json'};
  async function api(path,body,method){const response=await fetch(base+path,{method:method||(body===undefined?'GET':'POST'),headers:headers(),...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.message||result.error||L('炼金术士请求失败'));return result;}
  const modelSettingsLink=()=>'<a class="mw-btn mw-btn--ghost" href="/settings/models">'+tx('打开模型设置')+'</a>';
  const notice=(text,retry=false)=>{const el=$('[data-alc-notice]');el.hidden=!text;el.querySelector('[data-alc-action=reload]').hidden=!retry;el.querySelector('span').textContent=text||'';};
  const formError=text=>{const el=$('[data-alc-form-error]');el.hidden=!text;el.textContent=text||'';};
  const active=status=>['queued','running'].includes(status);
  let data={directions:[],explorations:[],ideas:[]},pulse={reports:[]},decisions={cases:[],activities:[],log:[]},runtime={models:[],configured:false},memory={taste:[],playbook:[]};
  let collection='directions',current=null,model=null,research=null,decision=null,pulseBundle=null,context={kind:'surface',label:L('方向'),surface:'ideas'},target=null,selection=null,sideMode='',onSubmit=null,formBusy=false,returnFocus=null,seq=0,loadSeq=0,loaded=false,pollTimer,detailSignature='',lastRow=null;
  const persistenceKey='molis-work:alchemist:'+host.projectId()+':'+(new URLSearchParams(location.search).get('workbenchPane')||'main');
  const persist=()=>{try{localStorage.setItem(persistenceKey,JSON.stringify({collection,current}));}catch{}};
  const sameCurrent=v=>JSON.stringify(v)===JSON.stringify(current);
  function setTitle(title){$('[data-alc-title]').textContent=title;}
`+ALCHEMIST_VIEWS+ALCHEMIST_FLOWS+String.raw`
  async function load(){const n=++loadSeq;const values=await Promise.all([api('/bootstrap'),api('/pulse/reports'),api('/decisions'),api('/settings/runtime')]);if(n!==loadSeq)return;[data,pulse,decisions,runtime]=values;loaded=true;renderList();schedule();}
  function closeDetail(){seq++;current=null;target=null;selection=null;side.hidden=true;sideMode='';root.dataset.expanded='false';$('[data-alc-workspace]').hidden=true;renderList();persist();lastRow?.isConnected&&lastRow.focus();}
  async function open(next,save=true){
    if(!next)return;const n=++seq;const changed=!sameCurrent(next);current={...next};detailSignature='';selection=null;if(changed){side.hidden=true;sideMode='';target=null;research=null;$('[data-alc-action=annotations]').hidden=true;content.scrollTop=0;}
    root.dataset.expanded='true';$('[data-alc-workspace]').hidden=false;footer.innerHTML='';if(changed)content.innerHTML=empty('正在读取…');
    if(next.kind==='direction'){const d=data.directions.find(v=>v.id===next.id);if(!d)throw new Error(L('方向不存在。'));renderDirection(d);}
    else if(next.kind==='card'){const r=await api('/idea-cards/'+enc(next.id));if(n!==seq)return;if(r.kind==='idea_redirect'){collection='ideas';return open({kind:'idea',id:r.ideaId,version:r.version,panel:'brief'},save);}renderBrief(r.model);}
    else if(next.kind==='idea'){
      current.version=next.version||1;current.panel=next.panel||(collection==='decisions'?'decision':'brief');
      const r=await api('/ideas/'+enc(next.id)+'/versions/'+current.version);if(n!==seq)return;model=r.model;setTitle(model.title+' · v'+model.version);context={kind:'idea',label:model.title,ideaId:next.id,version:model.version,panel:current.panel};
      if(current.panel==='brief')renderBrief(model);
      else if(current.panel==='decision'){const d=await api('/ideas/'+enc(next.id)+'/versions/'+current.version+'/decision');if(n!==seq)return;renderDecision(d);}
      else{const d=await api('/ideas/'+enc(next.id)+'/versions/'+current.version+'/research');if(n!==seq)return;renderResearch(d);detailSignature=JSON.stringify(d);}
    }else if(next.kind==='pulse'){const b=pulse.reports.find(b=>b.report.id===next.id);if(!b)throw new Error(L('报告不存在。'));renderPulse(b);}
    else if(next.kind==='settings'){const r=await Promise.all([api('/settings/runtime'),api('/memory')]);if(n!==seq)return;[runtime,memory]=r;renderSettings();}
    else if(next.kind==='activity'){target=null;setTitle(L('活动记录'));context={kind:'surface',label:L('活动记录'),surface:'decisions'};content.innerHTML=decisions.activities.length?decisions.activities.map(a=>'<div class="alc-message"><small>'+esc(new Date(a.createdAt).toLocaleString())+'</small>'+esc(activityLabel(a.kind))+'</div>').join(''):empty('还没有活动记录。');footer.innerHTML='';}
    if(n!==seq)return;renderList();if(save)persist();schedule();
    $('[data-alc-action=annotations]').hidden=!target;
  }
  function activityLabel(kind){return ({'idea.kept':'保留了想法','idea_card.discarded':'弃牌','decision.created':'保存了决定','memory.taste_created':'添加了判断偏好','memory.playbook_created':'保存了研究方法','annotation.created':'添加了注释'})[kind]||kind.replaceAll('.',' · ');}
  function schedule(){
    clearTimeout(pollTimer);const running=data.explorations.some(e=>active(e.status))||active(pulse.latestRun?.status)||Object.values(research?.lenses||{}).some(l=>active(l.status));if(!running)return;
    pollTimer=setTimeout(async()=>{try{
      const selected=current?{...current}:null;await load();if(!selected||!sameCurrent(selected))return;
      if(selected.kind==='idea'&&['market','cost'].includes(selected.panel)){
        const d=await api('/ideas/'+enc(selected.id)+'/versions/'+selected.version+'/research');if(!sameCurrent(selected))return;research=d;
        if(!dialog.open&&!sideMode&&JSON.stringify(d)!==detailSignature){const scroll=content.scrollTop;renderResearch(d);content.scrollTop=scroll;detailSignature=JSON.stringify(d);$('[data-alc-action=annotations]').hidden=!target;}
        schedule();
      }else if(selected.kind==='direction'&&!dialog.open&&!sideMode){const d=data.directions.find(d=>d.id===selected.id);if(d){const scroll=content.scrollTop;renderDirection(d);content.scrollTop=scroll;}}
    }catch(e){notice(e.message,true);schedule();}},1800);
  }
  root.addEventListener('click',async event=>{
    const item=event.target.closest('[data-alc-open]'),tab=event.target.closest('[data-alc-collection]'),el=event.target.closest('[data-alc-action]');
    try{if(item){lastRow=item;await open({kind:item.dataset.alcOpen,id:item.dataset.alchemistId,version:Number(item.dataset.version)||1});return;}if(tab){collection=tab.dataset.alcCollection;closeDetail();persist();return;}if(el&&!el.disabled){const name=el.dataset.alcAction;el.disabled=true;try{await action(name,el);}finally{if(el.isConnected)el.disabled=false;}}}catch(e){dialog.open?formError(e.message):notice(e.message,true);}
  });
  form.addEventListener('submit',async event=>{event.preventDefault();if(formBusy||!onSubmit)return;formBusy=true;dialogSubmit.disabled=true;formError('');try{await onSubmit(new FormData(form));}catch(e){formError(e.message);}finally{formBusy=false;dialogSubmit.disabled=false;}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  root.addEventListener('submit',async event=>{
    const chat=event.target.matches('[data-alc-chat-form]'),annotation=event.target.matches('[data-alc-annotation-form]');if(!chat&&!annotation)return;event.preventDefault();const f=event.target,b=f.querySelector('button[type=submit]');if(b.disabled)return;b.disabled=true;const snapshot=JSON.stringify(context);try{if(chat){const r=await api('/conversation/messages',{body:new FormData(f).get('message'),context:{...context}});if(r.assistant)notice(r.assistant.message);}else{if(!selection)throw new Error(L('请重新选择原文。'));await api('/annotations',{target:selection.target,quotedSnapshot:selection.text,comment:new FormData(f).get('comment')});selection=null;}if(snapshot===JSON.stringify(context))await showSide(chat?'chat':'annotations');}catch(e){notice(e.message,true);}finally{if(b.isConnected)b.disabled=false;}
  });
  function captureSelection(){if(!target)return;const s=window.getSelection();if(!s||!s.rangeCount)return;const range=s.getRangeAt(0),text=s.toString().trim();if(!text||text.length>2000||!content.contains(range.commonAncestorContainer))return;const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;const block=node.closest('[data-alc-block]');if(block)selection={text,target:{...target,blockId:block.dataset.alcBlock}};}
  content.addEventListener('mouseup',captureSelection);content.addEventListener('keyup',captureSelection);
  $('[data-alc-search]').addEventListener('input',renderList);
  const start=async()=>{if(loaded)return;await load();try{const saved=JSON.parse(localStorage.getItem(persistenceKey)||'null');if(saved&&['directions','ideas','pulse','decisions'].includes(saved.collection)){collection=saved.collection;renderList();if(saved.current)await open(saved.current,false);}}catch{closeDetail();}};
  const observer=new MutationObserver(()=>{if(!root.hidden)void start().catch(e=>notice(e.message,true));});observer.observe(root,{attributes:true,attributeFilter:['hidden']});
  if(!root.hidden)void start().catch(e=>notice(e.message,true));
  return {refresh:()=>load().catch(e=>notice(e.message,true))};
}`;
