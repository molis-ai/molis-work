import { WORK_REUSE_CLIENT } from "./work-reuse/client.js";
import { ALCHEMIST_VIEWS } from './client-views.js';
import { ALCHEMIST_FLOWS } from './client-flows.js';
/**
 * Uses the same native Workbench client lifecycle and project routes as Pages.
 *
 * Comments live here, not in the script: the script is served to the page, byte for byte.
 * - `shown` is what is on screen, for the Assistant: the direction or Idea being looked at, under the kinds system
 *   search uses. It is republished whenever the content redraws (every view sets the discussion context as it renders).
 * - A run that stopped for want of a model says so once, with the way to settings (`noModel`): no status, no waiting label,
 *   no internal code. The direction card and the research card share it.
 * - Read worker acceptance before the business snapshot: a worker releases acceptance after committing its terminal state.
 *   The stopping decision must never combine newer acceptance with an older queued drawing (RAC-2752–2755).
 * - The body is written without indentation, like `client-views.ts` and `client-flows.ts`: the served script is measured in
 *   bytes (tooling/gates/page-assets.json), and indentation is the one thing in it that cannot matter.
 * - Private state names and `$`'s data-alc selector shorthand keep the lifecycle fixes within that same byte budget.
 */
export const ALCHEMIST_CLIENT_FACTORY_SCRIPT = String.raw`(host) => {
const root=document.querySelector('[data-alchemist=workbench]');if(!root)return;
const life=host.mountPluginClient(root);if(!life)return;let viewAbort;
const L=host.translate, $=(s,n=root)=>n.querySelector(s[0]==='['?s:'[data-alc-'+s+']'), enc=encodeURIComponent;
const mainEl=$('content'),footer=$('footer'),side=$('side'),sheet=$('dialog'),form=$('form'),bodySlot=$('dialog-body'),submitBtn=$('submit');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),tx=v=>esc(L(v));
const button=(label,action,primary=false,attrs='')=>'<button type="button" class="mw-btn mw-btn--'+(primary?'primary':'ghost')+'" data-alc-action="'+action+'" '+attrs+'>'+tx(label)+'</button>';
const muted=v=>'<p class="alc-muted">'+v+'</p>';
const safeUrl=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?esc(url.href):'#';}catch{return '#';}};
const base=host.route('/api/alchemist/studio/api/v1');
const headers=()=>typeof molisWorkControlHeaders==='function'?molisWorkControlHeaders():{'content-type':'application/json'};
async function api(path,body,method,signal=body===undefined?viewAbort:undefined){const response=await life.fetch(base+path,{signal,method:method||(body===undefined?'GET':'POST'),headers:headers(),...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json().catch(()=>({}));life.assertCurrent(signal);if(!response.ok)throw Object.assign(new Error((body===undefined&&host.readRefusal?.(response.status,result.code))||result.message||result.error||L('炼金术士请求失败')),{status:response.status});return result;}
const modelLink=()=>'<a class="mw-btn mw-btn--ghost" href="/settings/models">'+tx('打开模型设置')+'</a>';
const noRun=run=>/alchemist\.runtime_(not_configured|model_unavailable)/.test(run?.errorCode),noModel=()=>runtime.configured?'':'<div class="alc-warning">'+tx('还没有可用模型。连接模型后再试，已有的内容不会丢失。')+' '+modelLink()+'</div>';
const notice=(text,retry=false)=>{if(!life.alive)return;const el=$('notice');el.hidden=!text;$('action=reload',el).hidden=!retry;el.querySelector('span').textContent=text||'';};
const formError=text=>{if(!life.alive)return;const el=$('form-error');el.hidden=!text;el.textContent=text||'';};
const failed=e=>{if(life.visible&&e.name!=='AbortError')notice(e.message,true);};
const active=status=>['queued','running'].includes(status);
let data={directions:[],explorations:[],ideas:[]},pulse={reports:[]},decisions={cases:[],activities:[],log:[]},runtime={models:[],configured:false},rules={taste:[],playbook:[]};
let view='directions',archived=false,focus=null,model=null,study=null,choice=null,ctx={kind:'surface',label:L('方向'),surface:'ideas'},target=null,quote=null,sideMode='',onSubmit=null,busy=false,returnFocus=null,seq=0,loadSeq=0,wanted=null,ready=false,pollId,detailId='',lastRow=null,wantedQuiet=false;
let shown='',canReuse=false,jobs=[];
const setContext=()=>{const c={plugin_id:'io.molis.work.alchemist',surface_title:L('炼金术士')};
if(ctx.kind==='direction'&&ctx.directionId)c.object={kind:'alchemist-direction',id:ctx.directionId,title:ctx.label||''};
else if(ctx.kind==='idea'&&ctx.ideaId&&ctx.version!=='draft')c.object={kind:'alchemist-idea',id:ctx.ideaId,...(ctx.version?{version:String(ctx.version)}:{}),title:ctx.label||''};
const text=JSON.stringify(c);if(text!==shown){shown=text;root.setAttribute('data-assistant-context',text);}};
if(mainEl)life.observe(new MutationObserver(setContext),mainEl,{childList:true});
setContext();
const stateKey='molis-work:alchemist:'+host.projectId()+':'+(new URLSearchParams(location.search).get('workbenchPane')||'main');
const persist=()=>{try{localStorage.setItem(stateKey,JSON.stringify({collection:view,current:focus}));}catch{}};
const same=v=>JSON.stringify(v)===JSON.stringify(focus);
function setTitle(title){$('title').textContent=title;}
`+WORK_REUSE_CLIENT+ALCHEMIST_VIEWS+ALCHEMIST_FLOWS+String.raw`
async function load(){const n=++loadSeq,j=await api('/runs');const values=await Promise.all([api('/bootstrap'),api('/pulse/reports'),api('/decisions'),api('/settings/runtime')]);if(n!==loadSeq)return false;[data,pulse,decisions,runtime]=values;jobs=j.jobs;ready=true;renderList();schedule();return true;}
life.listen(document,'molis-work:model-ready',()=>{if(ready&&life.visible)void refresh().catch(failed);});
async function refresh(){if(wanted)return selectItem(wanted);const n=seq;await load();if(n===seq&&focus)await open(focus,false);}
function closeDetail(){seq++;wanted=null;focus=null;target=null;quote=null;side.hidden=true;sideMode='';root.dataset.expanded='false';$('workspace').hidden=true;renderList();persist();lastRow?.isConnected&&lastRow.focus();}
async function open(next,save=true){
if(!next)return;const n=++seq;const changed=!same(next);focus={...next};detailId='';quote=null;if(changed){side.hidden=true;sideMode='';target=null;study=null;$('action=annotations').hidden=true;mainEl.scrollTop=0;}
root.dataset.expanded='true';$('workspace').hidden=false;footer.innerHTML='';if(changed)mainEl.innerHTML=empty('正在读取…');
if(next.kind==='direction'){const d=data.directions.find(v=>v.id===next.id);if(!d)throw new Error(L('方向不存在。'));paintDir(d);}
else if(next.kind==='card'){const r=await api('/idea-cards/'+enc(next.id));if(n!==seq)return;if(r.kind==='idea_redirect'){view='ideas';return open({kind:'idea',id:r.ideaId,version:r.version,panel:'brief'},save);}renderBrief(r.model);}
else if(next.kind==='idea'){
focus.version=next.version||1;focus.panel=next.panel||(view==='decisions'?'decision':'brief');
const r=await api('/ideas/'+enc(next.id)+'/versions/'+focus.version);if(n!==seq)return;model=r.model;setTitle(model.title+' · v'+model.version);ctx={kind:'idea',label:model.title,ideaId:next.id,version:model.version,panel:focus.panel};
if(focus.panel==='brief')renderBrief(model);
else if(focus.panel==='decision'){const d=await api('/ideas/'+enc(next.id)+'/versions/'+focus.version+'/decision');if(n!==seq)return;renderDecision(d);}
else{const [d,reuse]=await Promise.all([api('/ideas/'+enc(next.id)+'/versions/'+focus.version+'/research'),api('/reuse/candidates',{intent:model.title},undefined,viewAbort)]);if(n!==seq)return;canReuse=reuse.available;paintStudy(d);detailId=JSON.stringify(d);}
}else if(next.kind==='pulse'){const b=pulse.reports.find(b=>b.report.id===next.id);if(!b)throw new Error(L('报告不存在。'));renderPulse(b);}
else if(next.kind==='settings'){const r=await Promise.all([api('/settings/runtime'),api('/memory')]);if(n!==seq)return;[runtime,rules]=r;renderSettings();}
else if(next.kind==='activity'){target=null;setTitle(L('活动记录'));ctx={kind:'surface',label:L('活动记录'),surface:'decisions'};mainEl.innerHTML=decisions.activities.length?decisions.activities.map(a=>'<div class="alc-message"><small>'+esc(new Date(a.createdAt).toLocaleString())+'</small>'+esc(activityLabel(a.kind))+'</div>').join(''):empty('还没有活动记录。');footer.innerHTML='';}
if(n!==seq)return;renderList();if(save)persist();schedule();
$('action=annotations').hidden=!target;
}
function activityLabel(kind){return ({'idea.kept':'保留了想法','idea_card.discarded':'弃牌','decision.created':'保存了决定','memory.taste_created':'添加了判断偏好','memory.playbook_created':'保存了研究方法','annotation.created':'添加了注释'})[kind]||kind.replaceAll('.',' · ');}
function schedule(){
life.clearTimeout(pollId);const running=jobs.some(j=>j.accepted);if(!running||!life.visible)return;
pollId=life.timeout(async()=>{try{
const selected=focus?{...focus}:null;await load();if(!selected||!same(selected))return;
if(selected.kind==='idea'&&['market','cost'].includes(selected.panel)){
const d=await api('/ideas/'+enc(selected.id)+'/versions/'+selected.version+'/research');if(!same(selected))return;study=d;
if(!sheet.open&&!sideMode&&JSON.stringify(d)!==detailId){const scroll=mainEl.scrollTop;paintStudy(d);mainEl.scrollTop=scroll;detailId=JSON.stringify(d);$('action=annotations').hidden=!target;}
schedule();
}else if(selected.kind==='direction'&&!sheet.open&&!sideMode){const d=data.directions.find(d=>d.id===selected.id);if(d){const scroll=mainEl.scrollTop;paintDir(d);mainEl.scrollTop=scroll;}}
}catch(e){failed(e);schedule();}},1800);
}
life.listen(root,'click',async event=>{
const item=event.target.closest('[data-alc-open]'),tab=event.target.closest('[data-alc-collection]'),el=event.target.closest('[data-alc-action]');
try{if(item){lastRow=item;await open({kind:item.dataset.alcOpen,id:item.dataset.alchemistId,version:Number(item.dataset.version)||1});return;}if(tab){view=tab.dataset.alcCollection;closeDetail();persist();return;}if(el&&!el.disabled){const name=el.dataset.alcAction;el.disabled=true;try{await action(name,el);}finally{if(el.isConnected)el.disabled=false;}}}catch(e){sheet.open?formError(e.message):notice(e.message,true);}
});
life.listen(form,'submit',async event=>{event.preventDefault();if(busy||!onSubmit)return;busy=true;submitBtn.disabled=true;formError('');try{await onSubmit(new FormData(form));}catch(e){formError(e.message);}finally{if(life.alive){busy=false;submitBtn.disabled=false;}}});
life.listen(sheet,'cancel',event=>{event.preventDefault();closeDialog();});
life.listen(root,'submit',async event=>{
const chat=event.target.matches('[data-alc-chat-form]'),annotation=event.target.matches('[data-alc-annotation-form]');if(!chat&&!annotation)return;event.preventDefault();const f=event.target,b=f.querySelector('button[type=submit]');if(b.disabled)return;b.disabled=true;const snapshot=JSON.stringify(ctx);try{if(chat){const r=await api('/conversation/messages',{body:new FormData(f).get('message'),context:{...ctx}});if(r.assistant)notice(r.assistant.message);}else{if(!quote)throw new Error(L('请重新选择原文。'));await api('/annotations',{target:quote.target,quotedSnapshot:quote.text,comment:new FormData(f).get('comment')});quote=null;}if(snapshot===JSON.stringify(ctx))await showSide(chat?'chat':'annotations');}catch(e){notice(e.message,true);}finally{if(b.isConnected)b.disabled=false;}
});
function pickQuote(){if(!target)return;const s=window.getSelection();if(!s||!s.rangeCount)return;const range=s.getRangeAt(0),text=s.toString().trim();if(!text||text.length>2000||!mainEl.contains(range.commonAncestorContainer))return;const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;const block=node.closest('[data-alc-block]');if(block)quote={text,target:{...target,blockId:block.dataset.alcBlock}};}
life.listen(mainEl,'mouseup',pickQuote);life.listen(mainEl,'keyup',pickQuote);
life.listen($('search'),'input',renderList);
life.listen(root,'molis-work:select-item',event=>{const id=event.detail?.itemId;if(!id){closeDetail();return;}wanted=id;wantedQuiet=Boolean(event.detail?.quiet);void selectItem(id).catch(e=>{if(e.status===403)root.dispatchEvent(new CustomEvent('molis-work:item-unreadable',{bubbles:true,detail:{itemId:id}}));failed(e);});});
async function selectItem(id){const n=++seq;await load();if(n!==seq||!ready)return;const d=data.directions.find(d=>d.id===id),i=data.ideas.find(i=>i.id===id);const quiet=wantedQuiet;if(wanted===id)wanted=null;if(!d&&!i){root.dispatchEvent(new CustomEvent('molis-work:item-unreadable',{bubbles:true,detail:{itemId:id}}));if(!quiet)notice(L('这一项已不存在或已删除'));return;}view=d?'directions':'ideas';archived=d?.status==='archived';$('search').value='';await open(d?{kind:'direction',id}:{kind:'idea',id,version:i.currentVersion,panel:'brief'});}
const start=async()=>{if(ready||wanted){await refresh();return;}const n=seq;if(!await load()||n!==seq)return;try{const saved=JSON.parse(localStorage.getItem(stateKey)||'null');if(saved&&['directions','ideas','pulse','decisions'].includes(saved.collection)){view=saved.collection;renderList();if(saved.current)await open(saved.current,false);}}catch{closeDetail();}};
life.whenVisible(signal=>{viewAbort=signal;void start().catch(failed);return()=>{seq++;loadSeq++;life.clearTimeout(pollId);};});
return {refresh:()=>life.visible?refresh().catch(failed):Promise.resolve()};
}`;
