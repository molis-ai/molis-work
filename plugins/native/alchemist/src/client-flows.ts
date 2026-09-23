export const ALCHEMIST_FLOWS = String.raw`
  const field=(label,name,options={})=>'<label class="alc-field">'+tx(label)+(options.area?'<textarea class="mw-textarea" name="'+name+'" rows="'+(options.rows||3)+'" '+(options.required?'required':'')+' maxlength="'+(options.max||4000)+'">'+esc(options.value||'')+'</textarea>':'<input class="mw-input" name="'+name+'" type="'+(options.type||'text')+'" '+(options.required?'required':'')+' '+(options.type==='number'?'min="1" max="40" step="1"':'maxlength="1000"')+' value="'+esc(options.value??'')+'">')+'</label>';
  const lines=value=>String(value||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const modelChoices=()=>'<fieldset class="alc-radios"><legend>'+tx('研究模型')+'</legend><label><input class="mw-radio" type="radio" name="model" value="auto" '+(runtime.modelPolicy==='auto'?'checked':'')+'>'+tx('使用可用模型')+'</label>'+runtime.models.map(m=>'<label><input class="mw-radio" type="radio" name="model" required value="'+esc(m.id)+'" '+(runtime.modelPolicy==='fixed'&&runtime.modelId===m.id?'checked':'')+'>'+esc(m.label)+'</label>').join('')+'</fieldset>';
  function show(title,html,label,submit){returnFocus=document.activeElement;dialog.querySelector('h2').textContent=L(title);dialogBody.innerHTML=html;formError('');dialogSubmit.textContent=L(label);dialogSubmit.hidden=false;onSubmit=submit;if(!dialog.open)dialog.showModal();dialogBody.querySelector('textarea,input')?.focus();}
  function closeDialog(){if(formBusy)return;dialog.close();onSubmit=null;returnFocus?.isConnected&&returnFocus.focus();}
  async function plan(){
    runtime=await api('/settings/runtime');const chosen={...current},lens=chosen.panel==='market'?'market_space':'build_cost';
    show('确认研究范围',modelChoices()+field('调用上限','limit',{type:'number',value:runtime.defaultBudgets[lens==='market_space'?'marketSpace':'buildCost'].limit,required:true})+'<p class="alc-muted">'+tx('一次搜索（含最多 3 个网页提取）或一次模型请求，各计 1 次。费用由供应商收取。')+'</p>'+(!runtime.configured?modelSettingsLink():''),'生成研究计划',async f=>{
      if(!runtime.models.length)throw new Error(L('请先在宿主设置里配置模型。'));const selected=f.get('model');if(!selected)throw new Error(L('请选择研究模型。'));
      const r=await api('/ideas/'+enc(chosen.id)+'/lenses/'+lens+'/plans',{ideaVersion:chosen.version,modelPolicy:selected==='auto'?'auto':'fixed',...(selected==='auto'?{}:{modelId:selected}),budget:{kind:'calls',limit:Number(f.get('limit'))}});
      const p=r.plan;show('确认开始研究',paragraphs(p.scopeSummary)+section('研究模型',runtime.models.find(m=>m.id===p.modelId)?.label||L('使用可用模型'))+section('调用上限',String(p.budget.limit))+paragraphs(L('应用研究方法')+' · '+p.appliedPlaybookRuleIds.length),'开始研究',async()=>{await api('/ideas/'+enc(chosen.id)+'/lenses/'+lens+'/runs',{planId:p.id});closeAfterSubmit();await load();if(sameCurrent(chosen))await open(chosen,false);});
    });
  }
  async function sources(){const r=await api('/pulse/sources');show('市场脉搏来源','<fieldset class="alc-radios">'+r.sources.map(s=>'<label><input class="mw-checkbox" type="checkbox" name="'+esc(s.sourceId)+'" '+(s.enabled?'checked':'')+'><span>'+esc(s.label)+'<br><small>'+esc(s.capability)+' '+esc(s.limitation)+'</small></span></label>').join('')+'</fieldset>','保存来源',async f=>{for(const s of r.sources)if(s.enabled!==f.has(s.sourceId))await api('/pulse/sources/'+enc(s.sourceId),{enabled:f.has(s.sourceId)},'PATCH');closeAfterSubmit();notice(L('来源设置已保存。'));});}
  async function runtimeForm(){runtime=await api('/settings/runtime');show('模型与预算',modelChoices()+field('市场空间默认调用上限','market',{type:'number',value:runtime.defaultBudgets.marketSpace.limit,required:true})+field('实现成本默认调用上限','cost',{type:'number',value:runtime.defaultBudgets.buildCost.limit,required:true})+modelSettingsLink(),'保存',async f=>{const m=f.get('model');if(!m)throw new Error(L('请选择研究模型。'));runtime=await api('/settings/runtime',{modelPolicy:m==='auto'?'auto':'fixed',modelId:m==='auto'?'':m,defaultBudgets:{marketSpace:{kind:'calls',limit:Number(f.get('market'))},buildCost:{kind:'calls',limit:Number(f.get('cost'))}}},'PUT');closeAfterSubmit();await open({kind:'settings'},false);});}
  function calibration(id){show('校准研究方法',field('以后具体怎样研究或判断','method',{area:true,required:true,max:2000})+field('正例（每行一条）','positive',{area:true})+field('反例（每行一条）','negative',{area:true})+'<fieldset class="alc-radios"><legend>'+tx('作用范围')+'</legend>'+[['report','仅本报告'],['direction','当前方向'],['global_market_space','所有后续市场研究']].map(([v,label])=>'<label><input class="mw-radio" type="radio" name="scope" value="'+v+'" required>'+tx(label)+'</label>').join('')+'</fieldset>','预览变更',async f=>{const r=await api('/annotations/'+enc(id)+'/playbook-proposals',{methodChange:f.get('method'),positiveExamples:lines(f.get('positive')),negativeExamples:lines(f.get('negative')),scopeKind:f.get('scope')});show('确认研究方法',paragraphs(r.proposal.summary)+r.proposal.diff.map(d=>section(d.field,d.after)).join('')+paragraphs(r.proposal.versionImpact)+paragraphs(r.proposal.costImpact)+paragraphs(r.proposal.memoryImpact),'确认保存方法',async()=>{await api('/action-proposals/'+enc(r.proposal.id)+'/apply',{});closeAfterSubmit();await showSide('annotations');});});}
  async function showSide(mode){
    sideMode=mode;const captured=JSON.stringify(context),capturedTarget=target?{...target}:null;side.hidden=false;$('[data-alc-side-title]').textContent=L(mode==='chat'?'讨论':'注释');const body=$('[data-alc-side-body]');body.innerHTML=empty('正在读取…');
    if(mode==='chat'){
      const r=await api('/conversation/messages');if(captured!==JSON.stringify(context)||sideMode!==mode)return;
      const key=c=>JSON.stringify([c.kind,c.ideaId||c.directionId||c.pulseReportId||c.surface,c.version||'',c.panel||'']);const messages=r.messages.filter(m=>key(m.context)===key(context));
      body.innerHTML='<p class="alc-muted">'+esc(context.label)+'</p>'+messages.map(m=>'<div class="alc-message"><small>'+tx(m.author==='user'?'你':'AI')+(m.responseState==='complete'?'':' · '+tx('未完成'))+'</small>'+esc(m.body)+'</div>').join('')+'<form data-alc-chat-form>'+field('继续讨论','message',{area:true,required:true,max:8000})+'<button class="mw-btn mw-btn--primary" type="submit">'+tx('发送')+'</button></form>';
    }else{
      if(!capturedTarget){body.innerHTML=empty('保留想法或生成报告后，可以选中原文添加注释。');return;}
      const r=await api('/annotations?'+new URLSearchParams({kind:capturedTarget.kind,objectId:capturedTarget.objectId,revision:String(capturedTarget.revision)}));if(captured!==JSON.stringify(context)||JSON.stringify(capturedTarget)!==JSON.stringify(target)||sideMode!==mode)return;
      const quote=selection&&selection.target.objectId===target.objectId?selection:null;
      body.innerHTML=(quote?'<form data-alc-annotation-form><blockquote>'+esc(quote.text)+'</blockquote>'+field('你的意见','comment',{area:true,required:true})+'<button class="mw-btn mw-btn--primary" type="submit">'+tx('保存注释')+'</button></form>':'<p class="alc-muted">'+tx('先在正文中选中一段文字，再打开注释。')+'</p>')+r.annotations.map(a=>'<article class="alc-comment"><blockquote>'+esc(a.quotedSnapshot)+'</blockquote>'+paragraphs(a.comment)+'<small>'+tx(a.status==='open'?'待处理':'已解决')+'</small><div class="alc-actions">'+(a.status==='open'?button('标为已解决','resolve',false,'data-id="'+esc(a.id)+'"')+(target.kind==='lens_report'?button('校准研究方法','calibrate',false,'data-id="'+esc(a.id)+'"'):''):'')+'</div></article>').join('');
    }
  }
  function closeAfterSubmit(){formBusy=false;closeDialog();}
  async function action(name,el){
    if(name==='notice-close'){notice('');return;}
    if(name==='back'){closeDetail();return;}
    if(name==='close'){closeDialog();return;}
    if(name==='side-close'){side.hidden=true;sideMode='';if(current?.kind==='idea'&&['market','cost'].includes(current.panel)&&research&&JSON.stringify(research)!==detailSignature){const scroll=content.scrollTop;renderResearch(research);content.scrollTop=scroll;detailSignature=JSON.stringify(research);$('[data-alc-action=annotations]').hidden=!target;}return;}
    if(name==='reload'){await load();if(current)await open(current,false);notice('');return;}
    if(name==='new'){let created=null;show('新建方向',field('你想探索的问题','description',{area:true,rows:5,required:true,max:4000})+'<p class="alc-muted">'+tx('从一个具体的人和场景开始，AI 会给出不同的候选机制。')+'</p>','保存并炼化',async f=>{const r=created||(created=await api('/directions',{description:f.get('description')}));await api('/directions/'+enc(r.direction.id)+'/explorations',{});closeAfterSubmit();collection='directions';await load();await open({kind:'direction',id:r.direction.id});});return;}
    if(name==='settings'){await open({kind:'settings'});return;}
    if(name==='runtime'){await runtimeForm();return;}
    if(name==='sources'){await sources();return;}
    if(name==='pulse-start'){await api('/pulse/runs',{});collection='pulse';await load();notice(L('正在采集，完成后会出现在报告列表中。'));return;}
    if(name==='explore'){await api('/directions/'+enc(current.id)+'/explorations',{});await load();await open(current,false);return;}
    if(name==='card'){await open({kind:'card',id:el.dataset.id});return;}
    if(name==='keep'){const r=await api('/idea-cards/'+enc(current.id)+'/keep',{});await load();collection='ideas';await open({kind:'idea',id:r.idea.id,version:r.version.revision.version,panel:'brief'});return;}
    if(name==='discard'||name==='restore'){await api('/idea-cards/'+enc(current.id)+'/'+name,{});await load();await open(current,false);return;}
    if(['brief','market','cost','decision'].includes(name)){await open({...current,panel:name});return;}
    if(name==='plan'){await plan();return;}
    if(name==='cancel'){await api('/runs/'+enc(el.dataset.job)+'/cancel',{});await load();await open(current,false);return;}
    if(name==='decide'){const chosen={...current},outcome=el.dataset.outcome;show('记下决定',paragraphs(L(states[outcome]))+field('决策理由','reason',{area:true,required:true,max:1000})+field('下一步或回看条件','revisit',{area:true,max:1000}),'确认决定',async f=>{await api('/ideas/'+enc(chosen.id)+'/versions/'+chosen.version+'/decision',{outcome,reason:f.get('reason'),revisitCondition:f.get('revisit')});closeAfterSubmit();await load();if(sameCurrent(chosen))await open(chosen,false);});return;}
    if(name==='decisions'){collection='decisions';closeDetail();renderList();return;}
    if(name==='convert'){const r=await api('/opportunities/'+enc(el.dataset.id)+'/convert',{});collection='directions';await load();await open({kind:'direction',id:r.direction.id});return;}
    if(name==='converted'){collection='directions';await open({kind:'direction',id:el.dataset.id});return;}
    if(name==='save-opportunity'){await api('/opportunities/'+enc(el.dataset.id)+'/save',{});await load();await open(current,false);return;}
    if(name==='chat'||name==='annotations'){await showSide(name);return;}
    if(name==='calibrate'){calibration(el.dataset.id);return;}
    if(name==='resolve'){await api('/annotations/'+enc(el.dataset.id)+'/resolve',{});await showSide('annotations');return;}
    if(name==='taste'){show('添加判断偏好',field('标题','title',{required:true})+field('偏好内容','statement',{area:true,required:true,max:1000})+field('适用范围','appliesTo',{area:true,required:true,max:500})+field('例外（每行一条）','exceptions',{area:true}),'保存偏好',async f=>{await api('/memory/taste',{title:f.get('title'),statement:f.get('statement'),appliesTo:f.get('appliesTo'),exceptions:lines(f.get('exceptions'))});closeAfterSubmit();await open({kind:'settings'},false);});return;}
    if(name==='disable-taste'||name==='disable-playbook'){await api('/memory/'+(name==='disable-taste'?'taste':'playbook')+'/'+enc(el.dataset.id)+'/disable',{});await open({kind:'settings'},false);return;}
    if(name==='activity'){await open({kind:'activity'});return;}
    if(name==='export-json'||name==='export-zip'){const response=await fetch(base+'/workspace/export?format='+name.slice(7),{method:'POST',headers:headers()});if(!response.ok)throw new Error(L('导出失败，请重试。'));const link=document.createElement('a');link.href=URL.createObjectURL(await response.blob());link.download='alchemist-'+new Date().toISOString().slice(0,10)+'.'+name.slice(7);link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);notice(L('导出已生成。'));return;}
  }
`;
