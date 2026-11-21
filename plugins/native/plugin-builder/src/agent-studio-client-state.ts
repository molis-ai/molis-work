/** What the studio page holds between paints, and the words it shows for phases, agents, parts and steps. A part of the studio page's client script (`agent-studio-client.ts` joins the parts in order). */
export const STUDIO_CLIENT_STATE = String.raw` const $=s=>root.querySelector(s);
 const feed=$('[data-as-feed]'),input=$('[data-as-input]'),canvas=$('[data-as-canvas]'),scroll=$('[data-as-scroll]'),pluginRoot=$('[data-as-plugin]'),empty=$('[data-as-empty]');
 // The conversation's one scroll owner (VUX-26): it follows at the end and stops when the person reads back.
 const follow=window.molisFollow?.(feed);if(follow)lifetime.own(()=>follow.dispose());
 let state={builds:[],models:[],model:null,components:[],selectionAvailable:false},current=null,versions=[],preview=null,tab='build',target=null,source=null,frame=0,busy=false,notice='',openSteps=null,rendered='',renderedFacts='',seenWired=new Set(),firstPaint=true;
 let revealed=new Set(),queue=[],landing=null,picking=null,playing=false,playToken=0;
 let wiredCaps=new Set(),wires=[],wiring=null,wiringPlay=false;
 const GROUPS=[['版面',"plugin-builder.agent-studio.group-layout"],['展示',"plugin-builder.agent-studio.group-display"],
  ['录入',"plugin-builder.agent-studio.group-input"],['操作',"plugin-builder.agent-studio.group-action"],
  ['浮层',"plugin-builder.agent-studio.group-overlay"],['反馈',"plugin-builder.agent-studio.group-feedback"]];let catalogOpen='';
 const CAP_ICON={platform:'sparkles',plugin:'package',mcp:'network'},CAP_SOURCES=[['platform',"plugin-builder.agent-studio.platform"],['plugin',"plugin-builder.agent-studio.installed-plugins"],['mcp',"plugin-builder.agent-studio.mcp-connectors"]];
 const capabilityOf=id=>(state.capabilities||[]).find(c=>c.id===id&&c.offered!==false)||(state.capabilities||[]).find(c=>c.id===id)||{id,title:id,source:{kind:'platform'}};
 function usedCapabilities(b){const ops=b?.design?.contract.operations||[];return [...new Set(ops.flatMap(o=>o.effects?.capabilities||[]))].map(id=>{const using=ops.filter(o=>(o.effects?.capabilities||[]).includes(id));return {c:capabilityOf(id),done:using.every(o=>b.connected.includes(o.id)),ops:using.map(o=>o.id)};});}
 const plugin=host.components({root:pluginRoot,call:(id,binding,payload)=>current?pluginCall(current.id)(id,binding,payload):Promise.reject(new Error(globalThis.t.text("plugin-builder.agent-studio.there-no-draft-yet"))),inspect:id=>{if(tab!=='build'||!current?.design)return;target=id;schedule();input.focus();},inspectLabel:globalThis.t.text("plugin-builder.agent-studio.inspect-part")});
 lifetime.own(()=>plugin.destroy());
 const PHASE={draft:"plugin-builder.agent-studio.draft",designing:"plugin-builder.agent-studio.designing",clarifying:"plugin-builder.agent-studio.needs-answer",choosing:"plugin-builder.agent-studio.comparing-proposals",building:"plugin-builder.agent-studio.building",paused:"plugin-builder.agent-studio.paused",failed:"plugin-builder.agent-studio.needs-attention",ready:"plugin-builder.agent-studio.ready-try"};
 const phaseName=phase=>PHASE[phase]?globalThis.t.text(PHASE[phase]):phase;
 const phaseOf=b=>!b.active&&(b.pendingPlugins?.length||b.pendingPart)?globalThis.t.text("plugin-builder.agent-studio.needs"):phaseName(b.phase);
 const AGENT={design:"plugin-builder.agent-studio.lead-designer",ui:"plugin-builder.agent-studio.ui-agent",code:"plugin-builder.agent-studio.code-agent",host:"plugin-builder.agent-studio.host-check"};
 const agentName=agent=>AGENT[agent]?globalThis.t.text(AGENT[agent]):agent;
 const componentWord=ref=>typeof ref==="string"?ref:ref?.key?globalThis.t.text(ref.key):ref?.literal||"";
 const componentName=kind=>componentWord(state.components.find(c=>c.kind===kind)?.name)||kind;
 const collaborationCopy=(key,args)=>'<span data-as-collaboration-copy="'+esc(JSON.stringify([key,args]))+'" translate="no">'+esc(globalThis.t.text(key,args))+'</span>';
 const agentCopy=agent=>Object.hasOwn(AGENT,agent)?collaborationCopy(AGENT[agent]):esc(agent);
 const studioWord=ref=>globalThis.say.text({...ref,owner:'io.molis.work.plugin-builder'});
 const componentPlaced='plugin-builder.studio-step.component-placed', repairOperation='plugin-builder.studio-step.repair-operation';
 function stepWord(s){
  const text=studioWord(s.label);
  return s.label.key===componentPlaced&&s.selection?.choice?text+' · '+componentName(s.selection.choice):text;
 }
 function stepLabel(s){return typeof s.label==='string'?'<span translate="no">'+esc(s.label)+'</span>':
  '<span data-as-step-copy="'+esc(s.id)+'" translate="no">'+esc(stepWord(s))+'</span>';}
 const repairRound=s=>s?.label?.key===repairOperation?s.label.args?.find(arg=>arg.name==='round'&&arg.kind==='number')?.number:undefined;
 const active=b=>!!b?.active;
 const examples=()=>[[globalThis.t.text("plugin-builder.agent-studio.reading-notes"),globalThis.t.text("plugin-builder.agent-studio.keep-track-books-i-have-read-rating-one")],[globalThis.t.text("plugin-builder.agent-studio.daily-review"),globalThis.t.text("plugin-builder.agent-studio.each-day-write-down-what-i-got-done")],[globalThis.t.text("plugin-builder.agent-studio.group-sign-up-sheet"),globalThis.t.text("plugin-builder.agent-studio.collect-each-person-s-name-contact-details-time")]];
`;
