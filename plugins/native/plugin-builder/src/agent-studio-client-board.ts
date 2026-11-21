/** The right column: the spec and capability boards, the plugin's canvas, and the staged placing and wiring of its parts. A part of the studio page's client script (`agent-studio-client.ts` joins the parts in order). */
export const STUDIO_CLIENT_BOARD = String.raw` function usedSlots(){const used=new Map();for(const el of pluginRoot.querySelectorAll('[data-slot]')){if(el.closest('[hidden]'))continue;const k=({'directory-row':'directory','button-loading-indicator':'spinner','collapsible':'accordion'})[el.dataset.slot]||el.dataset.slot;used.set(k,(used.get(k)||0)+1);}return used;}
 function renderBoard(){if(!lifetime.alive)return;
  const b=current,board=$('[data-as-board]'),panel=$('[data-as-catalog-panel]');board.hidden=!b?.design;if(board.hidden){tip.hidden=true;panel.hidden=true;return;}
  const placed=b.nodes.filter(n=>revealed.has(n.id)),parts=new Map();for(const n of placed)parts.set(n.kind,(parts.get(n.kind)||0)+1);
  const inside=usedSlots(),legal=new Set((b.pendingPart?.candidates||[])),used=c=>parts.get(c.kind)||(c.use!=='part'&&inside.has(c.kind)?1:0);
  const item=c=>{const n=used(c);return '<button type="button" class="as-part" data-kind="'+esc(c.kind)+'"'+(n?' data-used':'')+(c.use==='catalog'&&!n?' data-catalog':'')+(c.kind===picking?' data-picking':'')+(legal.has(c.kind)?' data-legal data-as-part="'+esc(c.kind)+'"':'')+' aria-label="'+esc(componentWord(c.name)+' '+c.catalog+' · '+componentWord(c.description))+'">'+icon(c.icon||'frame')+'<b>'+esc(componentWord(c.name))+'</b>'+(n?'<i class="as-part-check" aria-hidden="true">'+(n>1&&c.use==='part'?n:'✓')+'</i>':'')+'</button>';};
  const total=state.components.length,inUse=state.components.filter(used).length,caps=usedCapabilities(b),directory=(state.capabilities||[]).filter(c=>c.offered);
  const html='<span class="as-board-label">'+icon('frame')+globalThis.t.text("plugin-builder.agent-studio.spec-board")+'<small>'+globalThis.t.text("plugin-builder.agent-studio.placed-placed-planned-use-used-total",{placed:placed.length,planned:b.design.parts.length,used:inUse,total})+'</small></span>'+state.components.filter(c=>c.use==='part').map(item).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="components" aria-expanded="'+(catalogOpen==='components')+'" title="'+globalThis.t.text("plugin-builder.agent-studio.all-components-ui-catalog-2")+'">'+icon('grid')+'<b>'+globalThis.t.text("plugin-builder.agent-studio.all-n",{n:total})+'</b></button>'
   +'<span class="as-board-label as-board-cap">'+icon('zap')+globalThis.t.text("plugin-builder.agent-studio.capability-board")+'<small>'+globalThis.t.text("plugin-builder.agent-studio.connected-done-total-catalog-n",{done:caps.filter(x=>x.done).length,total:caps.length,n:directory.length})+'</small></span>'
   +caps.map(({c,done,ops})=>{const shown=done&&wiredCaps.has(c.id),busy=wiring===c.id||!done&&active(b)&&b.steps.some(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active'&&ops.includes(s.operationId));
     return '<button type="button" class="as-part as-cap" data-cap="'+esc(c.id)+'"'+(shown?' data-used':'')+(busy?' data-wiring':'')+' aria-label="'+esc(c.title+globalThis.t.text("common.punctuation.label-separator")+(c.description||'')+(busy?globalThis.t.text("plugin-builder.agent-studio.being-connected"):''))+'">'+icon(CAP_ICON[c.source?.kind]||'zap')+'<b>'+esc(c.title)+'</b>'+(shown?'<i class="as-part-check" aria-hidden="true">✓</i>':'')+'</button>';}).join('')
   +'<button type="button" class="as-board-more" data-as-catalog="capabilities" aria-expanded="'+(catalogOpen==='capabilities')+'" title="'+globalThis.t.text("plugin-builder.agent-studio.capability-catalog-platform-installed-plugins-mcp-connectors")+'">'+icon('grid')+'<b>'+globalThis.t.text("plugin-builder.agent-studio.all-n",{n:directory.length})+'</b></button>';
  if(board.dataset.html!==html){board.innerHTML=html;board.dataset.html=html;}
  panel.hidden=!catalogOpen;
  let body='';
  if(catalogOpen==='components')body='<p class="as-catalog-note">'+globalThis.t.text("plugin-builder.agent-studio.spec-board-ui-catalog-ui-catalog-components-use")+'</p>'+GROUPS.map(([g,word])=>{const list=state.components.filter(c=>c.group===g);return '<section><h4><span>'+globalThis.t.text(word)+'</span><span>'+list.filter(used).length+'/'+list.length+'</span></h4><div>'+list.map(item).join('')+'</div></section>';}).join('');
  if(catalogOpen==='capabilities'){const usedIds=new Set(caps.map(x=>x.c.id)),row=c=>'<div class="as-cap-row"'+(usedIds.has(c.id)?' data-used':'')+(c.offered===false?' data-off':'')+' title="'+esc(c.description||'')+'"><b>'+esc(c.title)+'</b><span class="as-chip">'+globalThis.t.text(c.effect==='read'?"plugin-builder.agent-studio.read-2":c.effect==='write'?"plugin-builder.agent-studio.write":"plugin-builder.agent-studio.irreversible")+'</span><small>'+esc(c.offered===false?c.reason||'':(c.source?.title||'')+' · '+c.id)+'</small></div>';
   const all=state.capabilities||[],off=all.filter(c=>c.offered===false);
   body='<p class="as-catalog-note">'+globalThis.t.text("plugin-builder.agent-studio.capability-board-project-s-unified-capability-catalog-read")+'</p>'+CAP_SOURCES.map(([k,name])=>{const list=all.filter(c=>c.offered&&c.installed!==false&&c.source?.kind===k);return '<section><h4><span>'+globalThis.t.text(name)+'</span><span>'+list.length+'</span></h4><div class="as-cap-list">'+(list.map(row).join('')||'<small class="as-muted">'+globalThis.t.text("plugin-builder.agent-studio.none")+'</small>')+'</div></section>';}).join('')
    +(()=>{const idle=all.filter(c=>c.offered&&c.installed===false);return idle.length?'<section><h4><span>'+globalThis.t.text("plugin-builder.agent-studio.plugins-not-enabled-asked-before-one-used")+'</span><span>'+idle.length+'</span></h4><div class="as-cap-list">'+idle.map(row).join('')+'</div></section>':'';})()
    +(off.length?'<section><h4><span>'+globalThis.t.text("plugin-builder.agent-studio.not-offered-plugins")+'</span><span>'+off.length+'</span></h4><div class="as-cap-list">'+off.map(row).join('')+'</div></section>':'');}
  if(catalogOpen&&panel.dataset.html!==body){panel.innerHTML=body;panel.dataset.html=body;}
 }
 const tip=$('[data-as-tip]');
 const partTitle=(node)=>pluginRoot.querySelector('[data-component-id="'+CSS.escape(node.id)+'"] [data-pc-title]')?.textContent||node.purpose;
 function showTip(button){
  if(button.dataset.cap){const cap=capabilityOf(button.dataset.cap),use=usedCapabilities(current).find(x=>x.c.id===cap.id);tip.innerHTML='<b>'+esc(cap.title)+' · '+esc(cap.source?.title||globalThis.t.text("plugin-builder.agent-studio.platform"))+'</b><p>'+esc(cap.description||'')+'</p><p>'+esc(globalThis.t.text(cap.effect==='read'?"plugin-builder.agent-studio.read-only":"plugin-builder.agent-studio.writes-authorise-install-time-stand-used-during-trial"))+'</p>'+(use?'<ul>'+use.ops.map(o=>'<li>'+esc(o)+'</li>').join('')+'</ul>':'')+(()=>{const s=[...(current?.steps||[])].reverse().find(x=>x.agent==='design'&&x.action==='place'&&x.selection?.choice===cap.id)?.selection;return s&&s.candidates.length>1?'<p>'+selection(s)+' '+globalThis.t.text("plugin-builder.agent-studio.chosen-names",{names:s.candidates.map(capabilityTitle).map(esc).join(globalThis.t.text("common.list.separator"))})+'</p>':'';})();
   const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;return;}
  const c=state.components.find(x=>x.kind===button.dataset.kind);if(!c)return;const used=(current?.nodes||[]).filter(n=>n.kind===c.kind&&revealed.has(n.id));
  tip.innerHTML='<b>'+esc(componentWord(c.name))+' · '+esc(c.catalog)+'</b><p>'+esc(componentWord(c.description))+'</p><p>'+esc(globalThis.t.text(c.use==='part'?"plugin-builder.agent-studio.can-be-placed-plugin-component":c.use==='inside'?"plugin-builder.agent-studio.used-inside-components-fields-filters-status-hints":"plugin-builder.agent-studio.ui-catalog-generated-plugins-do-not-use-yet"))+'</p>'+(used.length?'<ul>'+used.map(n=>'<li>'+esc(partTitle(n))+'</li>').join('')+'</ul>':'')+(button.hasAttribute('data-legal')?'<p class="as-tip-legal">'+globalThis.t.text("plugin-builder.agent-studio.click-use-component")+'</p>':'');
  const area=canvas.getBoundingClientRect(),box=button.getBoundingClientRect();tip.style.left=Math.round(Math.max(8,Math.min(area.width-240,box.left-area.left+box.width/2-116)))+'px';tip.hidden=false;}
 let lastView='',comparePrevious=false;
 const previousVisual=b=>b?.design&&b.history.at(-1)?.design?.contract.revision===b.design.contract.revision?b.history.at(-1):null;
 async function renderCanvas(){
  const b=current;let view=null;
  if(b?.design)view={contract:b.design.contract,nodes:b.nodes,connected:b.connected,presentation:b.design.presentation,authoringWords:b.design.localePacks};
  else if(b?.candidates.length&&(b.phase==='choosing'||b.active?.stage==='detail')){const c=b.candidates.find(x=>x.id===(b.chosen||preview||b.candidates[0].id))||b.candidates[0];const kind=p=>(state.components.find(x=>x.use==='part'&&x.intents[0]===p.intent)||state.components.find(x=>x.use==='part'&&x.intents.includes(p.intent))||{}).kind||'card';view={contract:c.preview.contract,nodes:c.preview.parts.map(p=>({...p,kind:kind(p)})),connected:[]};}
  if(comparePrevious&&previousVisual(b)){const before=previousVisual(b);view={contract:before.design.contract,nodes:before.nodes,connected:before.connected,presentation:before.design.presentation,authoringWords:before.design.localePacks};}
  pluginRoot.inert=comparePrevious;pluginRoot.setAttribute('aria-label',globalThis.t.text(comparePrevious?"plugin-builder.agent-studio.previous-interface-read-only-comparison":"plugin-builder.agent-studio.current-interface"));
  empty.hidden=!!view&&view.nodes.length>0;pluginRoot.hidden=!view||!view.nodes.length;
  if(!b)empty.innerHTML='<h2>'+globalThis.t.text("plugin-builder.agent-studio.plugin-will-appear-here")+'</h2><p>'+globalThis.t.text("plugin-builder.agent-studio.once-proposal-chosen-ui-agent-takes-components-one")+'</p>';
  else if(!view)empty.innerHTML='<div class="as-skeleton" aria-label="'+globalThis.t.text("plugin-builder.agent-studio.working-out-need-2")+'"><div style="width:40%"></div><div class="tall"></div><div></div><div style="width:70%"></div></div><p style="margin-top:16px">“'+esc(b.brief.slice(0,120))+'”</p>';
  else if(!view.nodes.length)empty.innerHTML=b.pendingPlugins?.length?'<p>'+globalThis.t.text("plugin-builder.agent-studio.waiting-decide-whether-enable-names-ui-agent-starts",{names:b.pendingPlugins.map(p=>Q(esc(p.title))).join(globalThis.t.text("common.list.separator"))})+'</p>':'<p>'+globalThis.t.text(active(b)?"plugin-builder.agent-studio.ui-agent-picking-first-component-spec-board":"plugin-builder.agent-studio.no-components-have-been-placed-yet")+'</p>';
  if(b?.design)stage(b);
  const key=view?JSON.stringify(view):'';if(view&&key!==lastView){lastView=key;await plugin.update(view);lifetime.assertCurrent();}
  decorate();
 }
 function stage(b){const ids=b.nodes.map(n=>n.id);queue=queue.filter(id=>ids.includes(id));stageWires(b);
  if(tab!=='build'||document.hidden){ids.forEach(id=>revealed.add(id));queue=[];return;}
  for(const id of ids)if(!revealed.has(id)&&!queue.includes(id)&&id!==landing)queue.push(id);
  if(queue.length&&!playing)void play().catch(backgroundError);}
 function stageWires(b){for(const {c,done,ops} of usedCapabilities(b)){if(!done||wiredCaps.has(c.id)||wires.some(w=>w.cap===c.id))continue;
   if(tab!=='build'||document.hidden)wiredCaps.add(c.id);else wires.push({cap:c.id,title:c.title,ops});}
  if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}
 async function playWires(){while(playing)await wait(150);if(wiringPlay)return;wiringPlay=true;const token=playToken,code=$('[data-as-pointer="code"]'),frameEl=$('[data-as-frame]');
  try{while(wires.length&&token===playToken){
   if(tab!=='build'||document.hidden){wires.forEach(w=>wiredCaps.add(w.cap));wires=[];break;}
   const w=wires[0];wiring=w.cap;renderBoard();const chip=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');
   if(chip){chip.scrollIntoView({block:'nearest',inline:'center'});aim(code,chip,globalThis.t.text("plugin-builder.agent-studio.take-capability-name",{name:w.title}),'above');await wait(620);click(code);await wait(240);}
   if(token!==playToken)break;
   const node=current?.nodes.find(n=>revealed.has(n.id)&&w.ops.some(o=>n.read?.operationId===o||n.submit?.operationId===o)),host=node&&Object.values(node.submit?.input||{}).find(v=>v.source==='selection')?.componentId;
   const el=node&&(partEl(node.id)||host&&partEl(host));
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing',agentName("code")+' · '+w.title);aim(code,el,globalThis.t.text("plugin-builder.agent-studio.connect-name",{name:w.title}),'right');await wait(680);click(code);}
   if(token!==playToken)break;
   wires.shift();wiredCaps.add(w.cap);wiring=null;renderBoard();const done=$('[data-as-board] .as-cap[data-cap="'+CSS.escape(w.cap)+'"]');done?.setAttribute('data-as-arrive','');lifetime.timeout(()=>done?.removeAttribute('data-as-arrive'),700);
   if(el)frameAt(el,'placed',agentName("code")+' · '+globalThis.t.text("plugin-builder.agent-studio.connected-name",{name:w.title}));await wait(560);frameEl.hidden=true;
  }}finally{wiringPlay=false;wiring=null;code.hidden=true;if(!playing)frameEl.hidden=true;renderBoard();}}
 const wait=ms=>lifetime.delay(ms);
 const withBuild=id=>{const here=page.address();if(id)here.searchParams.set('build',id);else here.searchParams.delete('build');return here;};
const partEl=id=>{const el=id&&pluginRoot.querySelector('[data-component-id="'+CSS.escape(id)+'"]');if(!el)return null;if(el.hidden)return pluginRoot.querySelector('[data-pc-action="'+CSS.escape(id)+'"]');const box=el.getBoundingClientRect();return box.width&&box.height?el:pluginRoot.querySelector('[data-pc-open="'+CSS.escape(id)+'"]')||el;};
 function click(pointer){pointer.removeAttribute('data-click');void pointer.offsetWidth;pointer.setAttribute('data-click','');}
 async function play(){playing=true;const token=++playToken,ui=$('[data-as-pointer="ui"]'),frameEl=$('[data-as-frame]');
  try{while(wiringPlay)await wait(150);while(queue.length&&token===playToken){
   if(tab!=='build'||document.hidden){queue.forEach(id=>revealed.add(id));queue=[];break;}
   const id=queue[0],node=current?.nodes.find(n=>n.id===id);if(!node){queue.shift();continue;}
   const name=componentName(node.kind),step=[...current.steps].reverse().find(s=>s.agent==='ui'&&s.target===id),by=step?.selection?.source==='jev'?' · Jev '+globalThis.t.text("plugin-builder.agent-studio.value-1-n",{n:step.selection.candidates.length}):step?.selection?.source==='user'?' · '+globalThis.t.text("plugin-builder.agent-studio.pick"):'';
   picking=node.kind;renderBoard();const part=$('[data-as-board] [data-kind="'+CSS.escape(picking)+'"]');
   if(part){part.scrollIntoView({block:'nearest',inline:'center'});aim(ui,part,globalThis.t.text("plugin-builder.agent-studio.take-name",{name})+by,'above');await wait(620);click(ui);await wait(240);}
   if(token!==playToken)break;
   queue.shift();landing=id;decorate();const el=partEl(id);
   if(el){const view=scroll.getBoundingClientRect(),box=el.getBoundingClientRect();if(box.top<view.top+40||box.bottom>view.bottom-90){el.scrollIntoView({block:'center',behavior:'smooth'});await wait(380);}
    frameAt(el,'landing',agentName("ui")+' · '+name);aim(ui,el,globalThis.t.text("plugin-builder.agent-studio.place-name",{name:partTitle(node)||name}),'corner');await wait(680);click(ui);}
   landing=null;picking=null;revealed.add(id);renderBoard();decorate();
   const placed=partEl(id);if(placed){const root=placed.closest('[data-component-id]');root?.setAttribute('data-as-arrive','');lifetime.timeout(()=>root?.removeAttribute('data-as-arrive'),700);frameAt(placed,'placed',agentName("ui")+' · '+name);}
   await wait(560);frameEl.hidden=true;
  }}finally{if(token===playToken){playing=false;landing=null;picking=null;frameEl.hidden=true;renderBoard();decorate();if(wires.length&&!wiringPlay)void playWires().catch(backgroundError);}}}
 function frameAt(el,mode,label){if(!lifetime.alive)return;const f=$('[data-as-frame]'),box=el.getBoundingClientRect(),area=scroll.getBoundingClientRect(),was=f.hidden;f.hidden=false;f.dataset.mode=mode;f.querySelector('span').textContent=label;
  if(was)f.style.transition='none';f.style.transform='translate('+Math.round(box.left-area.left+scroll.scrollLeft-6)+'px,'+Math.round(box.top-area.top+scroll.scrollTop-6)+'px)';f.style.width=Math.round(box.width+12)+'px';f.style.height=Math.round(box.height+12)+'px';if(was){void f.offsetWidth;f.style.transition='';}}
 function decorate(){if(!lifetime.alive)return;
  const b=current;const nodes=[...pluginRoot.querySelectorAll('[data-component-id]')];
  for(const el of nodes){const id=el.dataset.componentId;el.toggleAttribute('data-as-target',id===target);
   el.toggleAttribute('data-as-queued',queue.includes(id));el.toggleAttribute('data-as-landing',landing===id);
   const node=b?.nodes.find(n=>n.id===id),ops=[node?.read?.operationId,node?.submit?.operationId].filter(Boolean),wired=ops.length&&ops.every(o=>b.connected.includes(o));
   if(wired&&!seenWired.has(id)){seenWired.add(id);if(tab==='build'){el.setAttribute('data-as-wired','');lifetime.timeout(()=>el.removeAttribute('data-as-wired'),1700);}}}
  pointers();
 }
 function aim(pointer,el,label,where){const box=el?.getBoundingClientRect();if(!box||!box.width&&!box.height){pointer.hidden=true;return;}const area=scroll.getBoundingClientRect(),em=pointer.querySelector('em');em.textContent=label||'';em.hidden=!label;
  const was=pointer.hidden;pointer.hidden=false;const left=box.left-area.left+scroll.scrollLeft,top=box.top-area.top+scroll.scrollTop,width=Math.max(pointer.offsetWidth,140);
  let x=where==='above'?left+box.width/2-6:where==='right'?left+box.width-28:left+Math.min(box.width*.62,box.width-40),y=where==='above'?top-62:where==='right'?top+Math.min(box.height*.5,44):top+12;
  x=Math.max(scroll.scrollLeft+6,Math.min(x,scroll.scrollLeft+area.width-width-12));
  if(was)pointer.style.transition='none';pointer.style.transform='translate('+Math.round(x)+'px,'+Math.round(y)+'px)';if(was){void pointer.offsetWidth;pointer.style.transition='';}}
 function pointers(){if(!lifetime.alive)return;
  const b=current,ui=$('[data-as-pointer="ui"]'),code=$('[data-as-pointer="code"]');
  if(!b?.design||tab!=='build'){ui.hidden=true;code.hidden=true;$('[data-as-frame]').hidden=true;return;}
  if(!playing){
   const lastUi=[...b.steps].reverse().find(s=>s.agent==='ui');
   if(b.pendingPart)aim(ui,$('[data-as-board] [data-legal]'),globalThis.t.text("plugin-builder.agent-studio.waiting-pick-component"),'above');
   else if(active(b)&&lastUi?.status==='active')aim(ui,$('[data-as-board] .as-board-label'),globalThis.t.text(state.selectionAvailable?"plugin-builder.agent-studio.jev-picking-next-component":"plugin-builder.agent-studio.picking-next-component-spec-board"),'above');
   else if(active(b)&&lastUi?.target&&revealed.has(lastUi.target))aim(ui,partEl(lastUi.target),(typeof lastUi.label==='string'?lastUi.label:stepWord(lastUi)).slice(0,18),'corner');
   else ui.hidden=true;}
  const writing=active(b)&&[...b.steps].reverse().find(s=>s.agent==='code'&&s.action==='implement'&&s.status==='active');
  const bound=writing&&b.nodes.find(n=>revealed.has(n.id)&&(n.read?.operationId===writing.operationId||n.submit?.operationId===writing.operationId));
  if(wiringPlay)return;if(bound)aim(code,partEl(bound.id),globalThis.t.text("plugin-builder.agent-studio.writing-id",{id:writing.operationId}),'right');else code.hidden=true;
 }
 function renderAll(){if(!lifetime.alive)return;renderHead();renderFeed();root.querySelectorAll('[data-mockup-src]').forEach(el=>{const path=el.dataset.mockupSrc;delete el.dataset.mockupSrc;if(host.loadMedia)host.loadMedia(el,path);else el.src=path;});renderBoard();void renderCanvas().catch(backgroundError);
  const s=$('[data-as-status]'),b=current;s.innerHTML='<span>'+(!b?'':active(b)?globalThis.t.text(b.active.stage==='design'?"plugin-builder.agent-studio.lead-designer-working":"plugin-builder.agent-studio.ui-agent-code-agent-working-together"):b.phase==='ready'?globalThis.t.text("plugin-builder.agent-studio.all-features-connected-can-try-publish"):b.phase==='clarifying'?globalThis.t.text("plugin-builder.agent-studio.waiting-answers"):b.phase==='choosing'?globalThis.t.text("plugin-builder.agent-studio.waiting-choose-proposal"):b.pendingPart?globalThis.t.text("plugin-builder.agent-studio.waiting-choose-component"):b.pendingPlugins?.length?globalThis.t.text("plugin-builder.agent-studio.waiting-decide-whether-enable-plugins"):phaseName(b.phase))+'</span><span>'+(b?.connected.length?globalThis.t.text("plugin-builder.agent-studio.connected-done-total-total-input-kept",{done:b.connected.length,total:b.design?.contract.operations.length||0}):'')+'</span>';}
 function schedule(){if(frame||!lifetime.visible)return;const paint=()=>{frame=0;renderAll();};frame=lifetime.frame(paint);}
`;
