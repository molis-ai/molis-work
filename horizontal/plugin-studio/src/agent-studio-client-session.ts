import { cssString } from './agent-studio-view.js';
/** Opening a build, following its event stream, acting on it, and every listener the page owns. A part of the studio page's client script (`agent-studio.ts` joins the parts in order). */
export const STUDIO_CLIENT_SESSION = String.raw` let viewSignal,opening=0,initialized=false;
 const backgroundError=e=>{if(lifetime.alive&&!viewSignal?.aborted){notice=e;schedule();}};
 let draftKey='studio-composer:'+(page.address().searchParams.get('build')||'new'),edited=0;
 function replaceInput(value){input.value=value;window.molisFit?.(input);}
 function saveInput(){edited++;void host.drafts.write(draftKey,input.value||null).catch(backgroundError);}
 async function restoreInput(id,ticket){
  const key='studio-composer:'+(id||'new');
  if(key!==draftKey){draftKey=key;replaceInput('');}
  const revision=edited,value=await host.drafts.read(key);
  if(ticket===opening&&revision===edited&&lifetime.alive)replaceInput(value||'');
 }
 function renderBuilds(){const select=$('[data-as-builds]');select.innerHTML='<option value="">'+(state.builds.length?globalThis.t.text("plugin-builder.agent-studio.my-plugins-n",{n:state.builds.length}):globalThis.t.text("plugin-builder.agent-studio.no-plugins-yet"))+'</option>'+state.builds.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===current?.id?' selected':'')+'>'+esc(b.design?.title||b.title)+' · '+esc(phaseOf(b))+'</option>').join('');
  const model=$('[data-as-model]');model.innerHTML=(state.model?'':'<option value="">'+globalThis.t.text("plugin-builder.agent-studio.choose-model")+'</option>')+state.models.map(m=>'<option value="'+esc(m.provider_id+'\n'+m.model_id)+'"'+(m.provider_id===state.model?.provider_id&&m.model_id===state.model?.model_id?' selected':'')+'>'+esc(m.label.endsWith(m.model_id)&&m.label!==m.model_id?m.model_id+' · '+m.label.slice(0,-m.model_id.length).replace(/\s*·\s*$/,''):m.label)+'</option>').join('');
  const setup=$('[data-as-model-setup]');if(setup)setup.hidden=state.models.length>0;}
 function subscribe(id){source?.close();source=null;if(!id||!lifetime.visible)return;const subscribed=source=new EventSource(host.api('/builds/'+id+'/events'));source.onmessage=e=>{if(source!==subscribed||!lifetime.visible)return;const b=JSON.parse(e.data);if(b.id!==current?.id)return;if(b.design?.contract.revision!==current.design?.contract.revision)seenWired=new Set();current=b;
   const listed=state.builds.find(x=>x.id===b.id);if(listed&&(listed.phase!==b.phase||(listed.design?.title||listed.title)!==(b.design?.title||b.title))){Object.assign(listed,{phase:b.phase,title:b.title,design:b.design});renderBuilds();}
   schedule();};}
 async function open(id,signal){const ticket=++opening;closeSheet();comparePrevious=false;target=null;preview=null;rendered='';lastView='';seenWired=new Set();firstPaint=true;tab='build';playToken++;playing=false;queue=[];landing=null;picking=null;revealed=new Set();wiredCaps=new Set();wires=[];wiring=null;
  if(!id){current=null;versions=[];subscribe(null);page.replace(withBuild(null));schedule();await restoreInput(null,ticket);return;}
  const v=await api('/builds/'+id,'GET',undefined,signal);if(ticket!==opening)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));usedCapabilities(current).forEach(x=>{if(x.done)wiredCaps.add(x.c.id);});subscribe(id);page.replace(withBuild(id));renderBuilds();schedule();await restoreInput(id,ticket);}
 async function refreshState(signal){state=await api('/state','GET',undefined,signal);renderBuilds();}
 async function run(work){if(busy||!lifetime.alive)return;busy=true;notice='';schedule();try{await work();}catch(e){notice=e;}finally{busy=false;schedule();}}
 async function act(action,extra={}){const v=await api('/builds/'+current.id+'/action','POST',{action,revision:current.revision,...extra});if(v.build)current=v.build;if(v.release){versions=(await api('/builds/'+current.id)).versions;notice='';tab='install';}if(v.deleted){await refreshState();await open(null);}}
 lifetime.listen(root,'click',e=>{const el=e.target.closest('button,a');if(!el||!root.contains(el))return;
  if(el.dataset.asOpenPlugin){e.preventDefault();host.openPlugin(el.dataset.asOpenPlugin);return;}
  if(el.matches('[data-as-model-setup]')){e.preventDefault();host.openSettings('/settings/models');return;}
  if(el.dataset.asExample){replaceInput(el.dataset.asExample);saveInput();input.focus();return;}
  if(el.dataset.asOpen){run(()=>open(el.dataset.asOpen));return;}
  if(el.hasAttribute('data-as-catalog')){const which=el.dataset.asCatalog||'components';catalogOpen=catalogOpen===which?'':which;tip.hidden=true;renderBoard();return;}
  if(el.dataset.asCandidate){preview=el.dataset.asCandidate;rendered='';schedule();return;}
  if(el.dataset.asImageServices){run(async()=>{const build=current.id,id=el.dataset.asImageServices,reply=await api('/image-services','GET');if(current?.id===build)imageSelection={build,id,choices:reply.choices};});return;}
  if(el.dataset.asNewImage){run(async()=>{imageSelection=null;await act('redraw',{candidateId:el.dataset.asNewImage,service:el.dataset.asService});});return;}
  if(el.dataset.asRedraw){run(()=>act('redraw',{candidateId:el.dataset.asRedraw}));return;}
  if(el.dataset.asChoose){run(()=>act('choose',{candidateId:el.dataset.asChoose}));return;}
  if(el.dataset.asPart){run(()=>act('part',{kind:el.dataset.asPart}));return;}
  if(el.dataset.asScope){run(()=>act('scope',{scope:el.dataset.asScope}));return;}
  if(el.hasAttribute('data-as-plugin-settings')){host.openSettings('/settings/plugins');return;}
  if(el.dataset.asDownload){run(async()=>{const bundle=await api('/builds/'+current.id+'/download?version='+el.dataset.asDownload);await host.download(new Blob([JSON.stringify(bundle)],{type:'application/json'}),current.design.contract.pluginId+'-v'+el.dataset.asDownload+'.json');});return;}
  if(el.dataset.asAction){run(()=>act(el.dataset.asAction));return;}
  if(el.hasAttribute('data-as-compare')){comparePrevious=!comparePrevious;schedule();return;}
  if(el.dataset.asTab){tab=el.dataset.asTab;target=null;if(tab!=='build'){playToken++;playing=false;queue.forEach(id=>revealed.add(id));queue=[];landing=null;picking=null;wires.forEach(w=>wiredCaps.add(w.cap));wires=[];wiring=null;}schedule();return;}
  if(el.hasAttribute('data-as-untarget')){target=null;schedule();return;}
  if(el.hasAttribute('data-as-install-open')){openSheet();return;}
  if(el.hasAttribute('data-as-new')){run(()=>open(null));input.focus();}
 });
 lifetime.listen(feed,'click',e=>{const summary=e.target.closest?.('[data-as-steps] > summary');if(summary)openSteps=!summary.parentElement.open;});
 lifetime.listen($('[data-as-builds]'),'change',e=>run(()=>open(e.target.value||null)));
 lifetime.listen($('[data-as-model]'),'change',e=>{const[provider_id,model_id]=e.target.value.split('\n');if(!provider_id)return;run(async()=>{await api('/settings','POST',{provider_id,model_id});await refreshState();});});
 lifetime.listen(document,"molis-work:language-changed",()=>{
  const requestNotice=feed.querySelector('[data-as-request-notice]');
  if(requestNotice)requestNotice.textContent=globalThis.t.text(requestNotice.dataset.asRequestNotice);
  const steps=new Map((current?.steps||[]).map(step=>[step.id,step]));
  for(const node of feed.querySelectorAll('[data-as-step-copy]')){const step=steps.get(node.dataset.asStepCopy);if(step&&typeof step.label!=='string')node.textContent=stepWord(step);}
  for(const node of feed.querySelectorAll('[data-as-collaboration-copy]')){const [key,args]=JSON.parse(node.dataset.asCollaborationCopy);node.textContent=globalThis.t.text(key,args||undefined);}
  const title=feed.querySelector('[data-as-failure-title]'),guidance=feed.querySelector('[data-as-failure-guidance]');
  if(title&&current?.error)title.textContent=failureTitle(current);
  if(guidance&&current?.error?.guidance)guidance.textContent=studioWord(current.error.guidance);
  const css=(` + cssString.toString() + String.raw`);
  root.style.setProperty('--as-idle',css(globalThis.t.text("plugin-builder.agent-studio.not-connected-yet")));
  root.style.setProperty('--as-wired',css('✓ '+globalThis.t.text("plugin-builder.agent-studio.connected")));
  for(const button of root.querySelectorAll('.as-part[data-kind]')){
   const component=state.components.find(c=>c.kind===button.dataset.kind);
   if(component)button.setAttribute('aria-label',componentWord(component.name)+' '+component.catalog+' · '+componentWord(component.description));
  }
 });
 lifetime.listen(document,'molis-work:model-ready',()=>{if(lifetime.visible)void refreshState(viewSignal).then(schedule).catch(backgroundError);});
 lifetime.listen(input,'input',saveInput);
 lifetime.listen(input,'keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('[data-as-composer]').requestSubmit();}});
 lifetime.listen($('[data-as-composer]'),'submit',e=>{e.preventDefault();const raw=input.value,text=raw.trim(),key=draftKey;if(!text||busy)return;
  const go=fresh=>run(async()=>{
   if(key!==draftKey||input.value!==raw)return;
   const revision=++edited,stored=host.drafts.write(key,raw).catch(backgroundError);
   const clear=async()=>{
    await stored;
    if(revision!==edited)return;
    if(key===draftKey&&input.value===raw)replaceInput('');
    await host.drafts.compareAndSwap(key,raw,null).catch(backgroundError);
   };
   if(!current||fresh){const v=await api('/builds','POST',{brief:text});await clear();await refreshState();await open(v.build.id);return;}
   const node=target&&current.nodes.find(n=>n.id===target);await act($('[data-as-edit-mode]').value,{message:node?'［'+node.purpose+'］'+text:text});await clear();target=null;});
  if(current?.design&&!target&&/^(?:我|帮我|请)?(?:要|想|需要|来)?(?:做|建|创建|新建|开发|搭)(?:一个|个|一款|款)|^(?:please\s+)?(?:i\s+(?:want|would\s+like|need)\s+to\s+|help\s+me\s+|let['’]?s\s+)?(?:build|create|make|start)\s+(?:a|an|another)\s+(?:new\s+)?(?:plugin|tool|app)\b|(?:新しい|別の)?(?:プラグイン|ツール|アプリ)を?(?:作|つく|作成|新規|開発)/i.test(text))
   ask(globalThis.t.text("plugin-builder.agent-studio.make-new-plugin-change-name",{name:current.design.title}),'“'+text.slice(0,80)+'”',[['new',globalThis.t.text("plugin-builder.agent-studio.make-new-plugin"),true],['modify',globalThis.t.text("plugin-builder.agent-studio.change-name",{name:current.design.title})],['cancel',globalThis.t.text("plugin-builder.agent-studio.cancel")]]).then(choice=>{if(choice==='new')go(true);else if(choice==='modify')go(false);});
  else go(false);});
 lifetime.listen(scroll,'scroll',()=>{if(!playing)pointers();},{passive:true});lifetime.listen(window,'resize',()=>pointers());
 const board=$('[data-as-board]');lifetime.listen(board,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'pointerleave',()=>{tip.hidden=true;});
 lifetime.listen(board,'focusin',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(board,'focusout',()=>{tip.hidden=true;});
 const catalogPanel=$('[data-as-catalog-panel]');lifetime.listen(catalogPanel,'pointerover',e=>{const b=e.target.closest?.('.as-part');if(b)showTip(b);});lifetime.listen(catalogPanel,'pointerleave',()=>{tip.hidden=true;});
 lifetime.observe(new MutationObserver(()=>{if(!frame&&lifetime.visible)lifetime.frame(()=>decorate());}),pluginRoot,{childList:true,subtree:true});
 lifetime.whenVisible(signal=>{
  viewSignal=signal;
  void (async()=>{
   await refreshState(signal);
   if(!initialized){const id=page.address().searchParams.get('build');await open(id&&state.builds.some(b=>b.id===id)?id:null,signal);initialized=true;}
   else if(current){const id=current.id,ticket=opening,v=await api('/builds/'+id,'GET',undefined,signal);if(current?.id!==id||opening!==ticket)return;current=v.build;versions=v.versions;current.nodes.forEach(n=>revealed.add(n.id));subscribe(id);}
   schedule();
  })().catch(backgroundError);
  return()=>{source?.close();source=null;playToken++;playing=false;wiringPlay=false;landing=null;picking=null;queue=[];wires=[];wiring=null;lifetime.cancelFrame(frame);frame=0;};
 });
`;
