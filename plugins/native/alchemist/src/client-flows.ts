/** Statements of the client factory's body, written without any indentation: the served script is measured in bytes (tooling/gates/page-assets.json), and indentation is the one thing in it that cannot matter. */
export const ALCHEMIST_FLOWS = String.raw`
const field=(label,name,options={})=>'<label class="alc-field">'+tx(label)+(options.area?'<textarea class="mw-textarea" name="'+name+'" rows="'+(options.rows||3)+'" '+(options.required?'required':'')+' maxlength="'+(options.max||4000)+'">'+esc(options.value||'')+'</textarea>':'<input class="mw-input" name="'+name+'" type="'+(options.type||'text')+'" '+(options.required?'required':'')+' '+(options.type==='number'?'min="1" max="40" step="1"':'maxlength="1000"')+' value="'+esc(options.value??'')+'">')+'</label>';
const reopen=async()=>{await load();await open(focus,false);};
const formEnd=label=>'<button class="mw-btn mw-btn--primary" type="submit">'+tx(label)+'</button></form>';
const lines=value=>String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
const modelChoices=()=>'<fieldset class="alc-radios"><legend>'+tx("alchemist.client-flows.research-model")+'</legend><label><input class="mw-radio" type="radio" name="model" value="auto" '+(runtime.modelPolicy==='auto'?'checked':'')+'>'+tx("alchemist.client-flows.use-available-model")+'</label>'+runtime.models.map(m=>'<label><input class="mw-radio" type="radio" name="model" required value="'+esc(m.id)+'" '+(runtime.modelPolicy==='fixed'&&runtime.modelId===m.id?'checked':'')+'>'+esc(m.label)+'</label>').join('')+'</fieldset>';
function show(title,html,label,submit){returnFocus=document.activeElement;sheet.querySelector('h2').textContent=globalThis.t.text(title);bodySlot.innerHTML=html;formError('');submitBtn.textContent=globalThis.t.text(label);submitBtn.hidden=false;onSubmit=submit;if(!sheet.open)sheet.showModal();bodySlot.querySelector('textarea,input')?.focus();}
function closeDialog(){if(busy)return;sheet.close();onSubmit=null;returnFocus?.isConnected&&returnFocus.focus();}
async function resumeJob(id){
const r=await api('/runs/'+enc(id)+'/continuation'),b=r.budget,reasons={'alchemist.research_budget_exhausted':"alchemist.client-flows.original-budget-exhausted-no-further-calls-can-run",'alchemist.job_lease_active':"alchemist.client-flows.previous-execution-lease-still-active-check-again-after",'alchemist.job_not_resumable':"alchemist.client-flows.task-cannot-continue-return-its-original-content"};
show("alchemist.client-flows.continue-previous-task",paraHtml(r.reason?globalThis.t.text(reasons[r.reason]||"alchemist.client-flows.cannot-continue-yet-check-model-task-record"):globalThis.t.text("alchemist.client-flows.continue-original-task-completed-stages"))+(b?paraHtml([['原预算',b.limit],['已预约',b.reserved],['剩余',b.remaining]].map(([label,count])=>L(label)+'：'+count+' '+globalThis.t.text("alchemist.client-flows.calls")).join(' · ')):'')+(r.unknownCall?paraHtml(globalThis.t.text("alchemist.client-flows.previous-call-has-unknown-result-may-have-been"))+(b?paraHtml(globalThis.t.text("alchemist.client-flows.its-reservation-counts-against-original-budget-budget-will")):''):'')+(r.modelId?section("alchemist.client-flows.research-model",runtime.models.find(m=>m.id===r.modelId)?.label||r.modelId):'')+(r.tasteTitles?section("alchemist.client-flows.personal-preferences",r.tasteTitles):''),"alchemist.client-flows.confirm-continue",async()=>{await api('/runs/'+enc(id)+'/continue',{confirmation:r.confirmation});closeAfterSubmit();await refresh();});submitBtn.hidden=!r.canContinue;
}
async function plan(){
const chosen={...focus},lens=chosen.panel==='market'?'market_space':'build_cost';
show("alchemist.client-flows.confirm-research-scope",paraHtml(globalThis.t.text("alchemist.client-flows.loading-results-methods-can-reuse")),"alchemist.client-flows.create-research-plan",null);submitBtn.hidden=true;
runtime=await api('/settings/runtime');
reuseCtx={intent:(model.title+' '+(model.problem||'')).slice(0,2000),directionId:data.ideas.find(i=>i.id===chosen.id)?.directionId,...(study?.lenses[lens]?.report?{reportId:study.lenses[lens].report.id}:{})};
reuseChoices=await api('/reuse/candidates',reuseCtx);if(!sheet.open||!same(chosen))return;if(lens!=='market_space')reuseChoices.methods=[];
reuseKey=stateKey+':reuse:'+chosen.id+':'+chosen.version+':'+lens;
show("alchemist.client-flows.confirm-research-scope",modelChoices()+field("alchemist.client-flows.call-limit",'limit',{type:'number',value:runtime.defaultBudgets[lens==='market_space'?'marketSpace':'buildCost'].limit,required:true})+muted(tx("alchemist.client-flows.one-search-including-up-3-page-extractions-one"))+renderReuseChoices(reuseChoices,esc,L)+(!runtime.configured?modelLink():''),"alchemist.client-flows.create-research-plan",async f=>{
if(!runtime.models.length)throw new Error(globalThis.t.text("alchemist.client-flows.configure-model-host-settings-first"));const selected=f.get('model');if(!selected)throw new Error(globalThis.t.text("alchemist.client-flows.choose-research-model"));
const reuse=selectedReuse(f);if(reuse.artifacts.some(a=>!a.reason))throw new Error(globalThis.t.text("alchemist.client-flows.explain-why-re-reusing-them-what-still-needs"));
const r=await api('/ideas/'+enc(chosen.id)+'/lenses/'+lens+'/plans',{ideaVersion:chosen.version,modelPolicy:selected==='auto'?'auto':'fixed',...(selected==='auto'?{}:{modelId:selected}),budget:{kind:'calls',limit:Number(f.get('limit'))},reuse});
try{sessionStorage.removeItem(reuseKey)}catch{}await startPrepared(r.plan,chosen);
});restoreReuseDraft();
}
async function sources(){const [r,g]=await Promise.all([api('/pulse/sources'),api('/pulse/github')]);show("alchemist.client-flows.market-pulse-sources",'<fieldset class="alc-radios">'+r.sources.map(s=>'<label><input class="mw-check" type="checkbox" name="'+esc(s.sourceId)+'" '+(s.enabled?'checked':'')+'><span>'+esc(s.label)+'<br><small>'+esc(s.capability)+' '+esc(s.limitation)+'</small></span></label>').join('')+'</fieldset>',"alchemist.client-flows.save-sources",async f=>{const account=f.get('githubAccount')||null;if(account!==g.selectedConnectionId)await api('/pulse/github',{connectionId:account},'PUT');for(const s of r.sources)if(s.enabled!==f.has(s.sourceId))await api('/pulse/sources/'+enc(s.sourceId),{enabled:f.has(s.sourceId)},'PATCH');closeAfterSubmit();notice(globalThis.t.text("alchemist.client-flows.sources-saved"));});
const box=$('github').content.cloneNode(true),pick=box.querySelector('select');for(const a of g.accounts){const on=a.connectionId===g.selectedConnectionId,ok=a.state==='connected',o=new Option(a.displayName+(ok?'':' · '+globalThis.t.text("alchemist.client-flows.connection-unavailable")),a.connectionId,false,on);o.disabled=!ok&&!on;pick.add(o);}bodySlot.append(box);}
async function runtimeForm(){runtime=await api('/settings/runtime');show("alchemist.client-flows.model-budget",modelChoices()+field("alchemist.client-flows.default-market-space-call-limit",'market',{type:'number',value:runtime.defaultBudgets.marketSpace.limit,required:true})+field("alchemist.client-flows.default-build-cost-call-limit",'cost',{type:'number',value:runtime.defaultBudgets.buildCost.limit,required:true})+modelLink(),"alchemist.client-flows.save",async f=>{const m=f.get('model');if(!m)throw new Error(globalThis.t.text("alchemist.client-flows.choose-research-model"));runtime=await api('/settings/runtime',{modelPolicy:m==='auto'?'auto':'fixed',modelId:m==='auto'?'':m,defaultBudgets:{marketSpace:{kind:'calls',limit:Number(f.get('market'))},buildCost:{kind:'calls',limit:Number(f.get('cost'))}}},'PUT');closeAfterSubmit();await open({kind:'settings'},false);});}
function calibration(id){show("alchemist.client-flows.calibrate-research-method",field("alchemist.client-flows.how-should-future-research-judgment-change",'method',{area:true,required:true,max:2000})+field("alchemist.client-flows.positive-examples-one-per-line",'positive',{area:true})+field("alchemist.client-flows.negative-examples-one-per-line",'negative',{area:true})+'<fieldset class="alc-radios"><legend>'+tx("alchemist.client-flows.scope")+'</legend>'+[['report','仅本报告'],['direction','当前方向'],['global_market_space','所有后续市场研究']].map(([v,label])=>'<label><input class="mw-radio" type="radio" name="scope" value="'+v+'" required>'+tx(label)+'</label>').join('')+'</fieldset>',"alchemist.client-flows.preview-changes",async f=>{const r=await api('/annotations/'+enc(id)+'/playbook-proposals',{methodChange:f.get('method'),positiveExamples:lines(f.get('positive')),negativeExamples:lines(f.get('negative')),scopeKind:f.get('scope')});show("alchemist.client-flows.confirm-method",paraHtml(r.proposal.summary)+r.proposal.diff.map(d=>section(d.field,d.after)).join('')+paraHtml(r.proposal.versionImpact)+paraHtml(r.proposal.costImpact)+paraHtml(r.proposal.memoryImpact),"alchemist.client-flows.save-method",async()=>{await api('/action-proposals/'+enc(r.proposal.id)+'/apply',{});closeAfterSubmit();await showSide('annotations');});});}
async function showSide(mode){
sideMode=mode;const captured=JSON.stringify(ctx),oldTarget=target?{...target}:null;side.hidden=false;$('side-title').textContent=globalThis.t.text(mode==='chat'?"alchemist.client-flows.discuss":"alchemist.client-flows.annotations");const body=$('side-body');body.innerHTML=empty("alchemist.client-flows.loading");
if(mode==='chat'){
const r=await api('/conversation/messages');if(captured!==JSON.stringify(ctx)||sideMode!==mode)return;
const key=c=>JSON.stringify([c.kind,c.ideaId||c.directionId||c.pulseReportId||c.surface,c.version||'',c.panel||'']);const messages=r.messages.filter(m=>key(m.context)===key(ctx));
body.innerHTML=muted(esc(ctx.label))+messages.map(m=>'<div class="alc-message"><small>'+tx(m.author==='user'?"alchemist.client-flows.label":'AI')+(m.responseState==='complete'?'':' · '+tx("alchemist.client-flows.incomplete"))+'</small>'+esc(m.body)+'</div>').join('')+'<form data-alc-chat-form>'+field("alchemist.client-flows.continue-discussion",'message',{area:true,required:true,max:8000})+formEnd("alchemist.client-flows.send");
}else{
if(!oldTarget){body.innerHTML=empty("alchemist.client-flows.keep-idea-generate-report-then-select-text-annotate");return;}
const r=await api('/annotations?'+new URLSearchParams({kind:oldTarget.kind,objectId:oldTarget.objectId,revision:String(oldTarget.revision)}));if(captured!==JSON.stringify(ctx)||JSON.stringify(oldTarget)!==JSON.stringify(target)||sideMode!==mode)return;
const quoted=quote&&quote.target.objectId===target.objectId?quote:null;
body.innerHTML=(quoted?'<form data-alc-annotation-form><blockquote>'+esc(quoted.text)+'</blockquote>'+field("alchemist.client-flows.feedback",'comment',{area:true,required:true})+formEnd("alchemist.client-flows.save-annotation"):muted(tx("alchemist.client-flows.select-passage-document-then-open-annotations")))+r.annotations.map(a=>'<article class="alc-comment"><blockquote>'+esc(a.quotedSnapshot)+'</blockquote>'+paraHtml(a.comment)+'<small>'+tx(a.status==='open'?"alchemist.client-flows.open":"alchemist.client-flows.resolved")+'</small><div class="alc-actions">'+(a.status==='open'?button("alchemist.client-flows.mark-resolved",'resolve',false,dataId(a.id))+(target.kind==='lens_report'?button("alchemist.client-flows.calibrate-research-method",'calibrate',false,dataId(a.id)):''):'')+'</div></article>').join('');
}
}
function closeAfterSubmit(){busy=false;closeDialog();}
async function action(name,el){
if(name==='to-goal'&&model){const nl='\n\n',made=choice&&choice.decision;window.dispatchEvent(new CustomEvent('molis:placement-convert',{detail:{source:{kind:'alchemist-idea',id:model.ideaId||model.cardId},goal:true,payload:{title:model.title,body:[model.highlight||'',made&&made.reason?tx("alchemist.client-flows.decision-go-ahead")+made.reason:'',made&&made.revisitCondition?tx("alchemist.client-flows.next")+made.revisitCondition:''].filter(Boolean).join(nl)||model.title},note:tx("alchemist.client-flows.idea-decision-its-source-alchemist-record-stays")}}));return;}
if(name==='notice-close'){notice('');return;}
if(name==='back'){closeDetail();return;}
if(name==='close'){closeDialog();return;}
if(name==='side-close'){side.hidden=true;sideMode='';if(focus?.kind==='idea'&&['market','cost'].includes(focus.panel)&&study&&JSON.stringify(study)!==detailId){const scroll=mainEl.scrollTop;paintStudy(study);mainEl.scrollTop=scroll;detailId=JSON.stringify(study);$('action=annotations').hidden=!target;}return;}
if(name==='reload'){await load();if(focus)await open(focus,false);notice('');return;}
if(name==='archived-toggle'){archived=!archived;renderList();return;}
if(name==='continue-job'){await resumeJob(el.dataset.job);return;}
if(name==='new'){let created=null;show("alchemist.client-flows.new-direction",field("alchemist.client-flows.what-do-want-explore",'description',{area:true,rows:5,required:true,max:4000})+muted(tx("alchemist.client-flows.start-specific-person-situation-ai-will-suggest-different")),"alchemist.client-flows.save-refine",async f=>{const r=created||(created=await api('/directions',{description:f.get('description')}));await api('/directions/'+enc(r.direction.id)+'/explorations',{});closeAfterSubmit();view='directions';await load();await open({kind:'direction',id:r.direction.id});});return;}
if(name==='settings'){await open({kind:'settings'});return;}
if(name==='runtime'){await runtimeForm();return;}
if(name==='sources'){await sources();return;}
if(name==='pulse-start'){await api('/pulse/runs',{});view='pulse';await load();notice(globalThis.t.text("alchemist.client-flows.collecting-signals-report-will-appear-here-when-ready"));return;}
if(name==='explore'){await api('/directions/'+enc(focus.id)+'/explorations',{});await reopen();return;}
if(name==='edit-direction'){
if(!focus?.id)return;const path='/directions/'+enc(focus.id),{direction:d,etag}=await api(path+'/editing');
show("alchemist.client-flows.edit-direction",field("alchemist.client-flows.title",'title',{required:true,value:d.title})+field("alchemist.client-flows.exploration-description",'description',{area:true,rows:5,required:true,max:4000,value:d.description}),"alchemist.client-flows.save",async f=>{
await api(path,{title:f.get('title'),description:f.get('description'),expectedEtag:etag},'PATCH');closeAfterSubmit();await reopen();
});return;
}
if(name==='archive-direction'||name==='restore-direction'){
const archived=name==='archive-direction';
if(archived&&!await host.confirm(globalThis.t.text("alchemist.client-flows.archive-direction-its-related-ideas-research-records-kept")))return;
await api('/directions/'+enc(focus.id)+'/status',{status:archived?'archived':'active'},'PATCH');
await load();closeDetail();return;
}
if(name==='card'){await open({kind:'card',id:el.dataset.id});return;}
if(name==='keep'){const r=await api('/idea-cards/'+enc(focus.id)+'/keep',{});await load();view='ideas';await open({kind:'idea',id:r.idea.id,version:r.version.revision.version,panel:'brief'});return;}
if(name==='discard'||name==='restore'){await api('/idea-cards/'+enc(focus.id)+'/'+name,{});await reopen();return;}
if(['brief','market','cost','decision'].includes(name)){await open({...focus,panel:name});return;}
if(name==='reuse-pending'){await pendingMethods();return;}
if(name==='reuse-apply-proposal'||name==='reuse-reject-proposal'){await api('/action-proposals/'+enc(el.dataset.id)+(name==='reuse-apply-proposal'?'/apply':'/reject'),{});await pendingMethods();return;}
if(name==='reuse-assess'){await assessReuse();return;}
if(name==='reuse-publish'){if(!canReuse)return;const r=await api('/reuse/publish',{reportId:el.dataset.report});notice(globalThis.t.text("alchemist.client-flows.fixed-version-saved")+' · v'+r.reference.version);return;}
if(name==='reuse-receipt'){await reuseReceipt(el.dataset.plan);return;}
if(name==='reuse-reconcile'){await api('/reuse/receipts/'+enc(el.dataset.plan)+'/reconcile',{});await reuseReceipt(el.dataset.plan);return;}
if(name==='revise-playbook'){await revisePlaybook(el.dataset.id);return;}
if(name==='resume-plan'){await startPrepared(study.lenses[focus.panel==='market'?'market_space':'build_cost'].plan,{...focus});return;}
if(name==='plan'){await plan();return;}
if(name==='cancel'){await api('/runs/'+enc(el.dataset.job)+'/cancel',{});await reopen();return;}
if(name==='decide'){const chosen={...focus},outcome=el.dataset.outcome;show("alchemist.client-flows.record-decision",paraHtml(L(states[outcome]))+field("alchemist.client-flows.reason",'reason',{area:true,required:true,max:1000})+field("alchemist.client-flows.next-step-revisit-condition",'revisit',{area:true,max:1000}),"alchemist.client-flows.confirm-decision",async f=>{await api('/ideas/'+enc(chosen.id)+'/versions/'+chosen.version+'/decision',{outcome,reason:f.get('reason'),revisitCondition:f.get('revisit')});closeAfterSubmit();await load();if(same(chosen))await open(chosen,false);});return;}
if(name==='decisions'){view='decisions';closeDetail();renderList();return;}
if(name==='convert'){const r=await api('/opportunities/'+enc(el.dataset.id)+'/convert',{});view='directions';await load();await open({kind:'direction',id:r.direction.id});return;}
if(name==='converted'){view='directions';await open({kind:'direction',id:el.dataset.id});return;}
if(name==='save-opportunity'){await api('/opportunities/'+enc(el.dataset.id)+'/save',{});await reopen();return;}
if(name==='chat'||name==='annotations'){await showSide(name);return;}
if(name==='calibrate'){calibration(el.dataset.id);return;}
if(name==='resolve'){await api('/annotations/'+enc(el.dataset.id)+'/resolve',{});await showSide('annotations');return;}
if(name==='taste'){show("alchemist.client-flows.add-preference",field("alchemist.client-flows.title",'title',{required:true})+field("alchemist.client-flows.preference",'statement',{area:true,required:true,max:1000})+field("alchemist.client-flows.applies",'appliesTo',{area:true,required:true,max:500})+field("alchemist.client-flows.exceptions-one-per-line",'exceptions',{area:true}),"alchemist.client-flows.save-preference",async f=>{await api('/memory/taste',{title:f.get('title'),statement:f.get('statement'),appliesTo:f.get('appliesTo'),exceptions:lines(f.get('exceptions'))});closeAfterSubmit();await open({kind:'settings'},false);});return;}
if(name==='disable-taste'||name==='disable-playbook'){await api('/memory/'+(name==='disable-taste'?'taste':'playbook')+'/'+enc(el.dataset.id)+'/disable',{});await open({kind:'settings'},false);return;}
if(name==='activity'){await open({kind:'activity'});return;}
if(name==='export-json'||name==='export-zip'){const response=await life.fetch(base+'/workspace/export?format='+name.slice(7),{method:'POST',headers:headers()});if(!response.ok)throw new Error(globalThis.t.text("alchemist.client-flows.export-failed-please-retry"));const bytes=await response.blob();life.assertCurrent();await host.download(bytes,'alchemist-'+new Date().toISOString().slice(0,10)+'.'+name.slice(7));notice(globalThis.t.text("alchemist.client-flows.export-ready"));return;}
}
`;
