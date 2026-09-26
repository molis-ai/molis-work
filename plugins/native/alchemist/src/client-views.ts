/** Native stage renderers. Values from models and sources are always escaped. */
export const ALCHEMIST_VIEWS = String.raw`
  const states={planned:'计划已保存',queued:'排队中',running:'进行中',completed:'已完成',partial:'部分完成',failed:'失败',cancelled:'已停止',interrupted:'已中断',not_started:'未开始',candidate:'候选',kept:'已保留',discarded:'已弃牌',exploring:'研究中',build:'去做',hold:'先放着',drop:'不做',active:'启用',archived:'已归档',disabled:'已停用',supported:'已支持',tentative:'暂定',disputed:'有争议',unknown:'未知'};
  const status=value=>'<span class="alc-state" data-state="'+esc(value)+'">'+tx(states[value]||value)+'</span>';
  const paragraphs=value=>'<p>'+esc(value||'')+'</p>';
  const bullets=values=>'<ul>'+values.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>';
  const section=(title,value,block)=>'<section '+(block?'data-alc-block="'+esc(block)+'"':'')+'><h3>'+tx(title)+'</h3>'+(Array.isArray(value)?bullets(value):paragraphs(value))+'</section>';
  const empty=text=>'<div class="alc-empty">'+tx(text)+'</div>';
  const row=(kind,id,title,preview,state,version)=>'<button type="button" class="feed-stage-entry directory-list-row alc-row'+(current?.kind===kind&&current.id===id?' is-selected':'')+'" data-alchemist-id="'+esc(id)+'" data-alc-open="'+kind+'" data-version="'+(version||1)+'" aria-current="'+Boolean(current?.kind===kind&&current.id===id)+'"><span class="alc-row-copy"><strong>'+esc(title)+'</strong><small>'+esc(preview||'')+'</small></span>'+status(state)+'</button>';
  function group(label,items){return items.length?'<details class="goal-collection-fold" data-alc-group="'+esc(label)+'" open><summary><span class="goal-collection-caret"><svg aria-hidden="true"><use href="#icon-chevron-down"></use></svg></span><strong>'+tx(label)+'</strong><span>'+items.length+'</span></summary>'+items.join('')+'</details>':'';}
  function renderList(){
    const q=$('[data-alc-search]').value.trim().toLowerCase(),match=(...v)=>v.join(' ').toLowerCase().includes(q), el=$('[data-alc-rows]'),scroll=$('[data-alchemist=directory]').scrollTop;
    root.querySelectorAll('[data-alc-collection]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.alcCollection===collection)));
    $('[data-alc-list-actions]').innerHTML=collection==='pulse'?button('采集市场信号','pulse-start',true)+button('来源设置','sources')+(pulse.latestRun?status(pulse.latestRun.status):''):collection==='decisions'?button('活动记录','activity'):collection==='directions'?button(showArchived?'隐藏已归档':'查看已归档','archived-toggle'):'';
    let html='';
    if(collection==='directions')for(const [state,label] of [['active','方向'],...(showArchived?[['archived','已归档']]:[])])html+=group(label,data.directions.filter(d=>d.status===state&&match(d.title,d.description)).map(d=>{const run=data.explorations.find(e=>e.directionId===d.id);return row('direction',d.id,d.title,run?.understanding?.summary||d.description,d.status==='archived'?'archived':run?.status||'not_started');}));
    if(collection==='ideas')for(const [value,label] of [['exploring','研究中'],['build','去做'],['hold','先放着'],['drop','不做']])html+=group(label,data.ideas.filter(i=>i.lifecycle===value&&match(i.title)).map(i=>row('idea',i.id,i.title,'v'+i.currentVersion,i.lifecycle,i.currentVersion)));
    if(collection==='decisions')for(const [value,label] of [['pending','待决策'],['decided','已决策'],['old_version','旧版本']])html+=group(label,decisions.cases.filter(c=>c.status===value&&match(c.title,c.decision?.reason)).map(c=>row('idea',c.ideaId,c.title,c.decision?.reason||c.nextAction,c.decision?.outcome||'exploring',c.ideaVersion)));
    if(collection==='pulse')html=group('研究报告',pulse.reports.filter(b=>match(b.report.title,b.report.summary)).map(b=>row('pulse',b.report.id,b.report.title,new Date(b.report.createdAt).toLocaleDateString(),b.report.status)));
    const folded=new Set([...el.querySelectorAll('details:not([open])')].map(d=>d.dataset.alcGroup));el.innerHTML=html||empty(q?'没有匹配的内容。':'当前集合还没有内容。新建方向，或采集一轮市场信号开始。');
    el.querySelectorAll('details[data-alc-group]').forEach(d=>{if(folded.has(d.dataset.alcGroup))d.open=false;});$('[data-alchemist=directory]').scrollTop=scroll;
  }
  function renderDirection(d){
    const runs=data.explorations.filter(e=>e.directionId===d.id),run=runs[0];context={kind:'direction',directionId:d.id,label:d.title};target=null;
    setTitle(d.title); content.innerHTML=paragraphs(d.description)+(run?'<div class="alc-progress">'+status(run.status)+'<span>'+esc(run.runtimeLabel)+'</span></div>':'')+(run?.errorCode?'<p class="alc-warning">'+tx('这次炼化未完成，方向已保存。检查模型后可重新炼化。')+' '+esc(run.errorCode)+'</p>':'')+(run?.understanding?section('对方向的理解',run.understanding.summary)+section('待验证',run.understanding.unknowns):'')+
      runs.map((r,index)=>'<section><h3>'+tx(index?'此前的候选':'候选想法')+' · '+r.cards.length+'</h3><div class="alc-candidates">'+r.cards.map(c=>'<article class="alc-candidate"><h3>'+esc(c.title)+'</h3>'+status(c.status)+paragraphs(c.highlight)+section('给谁',c.targetUser)+section('机制',c.mechanism)+'<div class="alc-actions">'+button(c.status==='kept'?'查看已保留想法':'查看详情','card',false,'data-id="'+esc(c.id)+'"')+'</div></article>').join('')+'</div></section>').join('');
    if(!runtime.configured)content.insertAdjacentHTML('afterbegin','<div class="alc-warning">'+tx('还没有可用模型。连接模型后再炼化，已写的方向不会丢失。')+' '+modelSettingsLink()+'</div>');
    footer.innerHTML=d.status==='archived'?button('恢复方向','restore-direction'):button(run?'重新炼化':'开始炼化','explore',true,active(run?.status)?'disabled':'')+button('编辑方向','edit-direction')+button('归档方向','archive-direction')+button('讨论这个方向','chat');
  }
  function renderBrief(m){
    model=m;setTitle(m.title);context={kind:'idea',label:m.title,ideaId:m.kind==='idea'?m.ideaId:m.cardId,version:m.kind==='idea'?m.version:'draft',panel:'brief'};
    target=m.kind==='idea'?{kind:'idea_brief',objectId:m.ideaId,revision:m.version}:null;
    content.innerHTML=(m.kind==='idea'?ideaTabs('brief'):'<p class="alc-muted">'+tx('候选想法')+' · '+tx(states[m.status])+'</p>')+'<h2>'+esc(m.title)+'</h2>'+paragraphs(m.highlight)+[['给谁',m.targetUser],['场景',m.scenario],['问题',m.problem],['机制',m.mechanism],['价值',m.valueProposition],['为什么可能成立',m.whyItMayWork],['假设',m.assumptions],['未知',m.unknowns],['先做',m.mvp.inScope],['先不做',m.mvp.outOfScope]].map(([label,value],index)=>section(label,value,'brief-'+index)).join('');
    footer.innerHTML=m.kind==='candidate'?button('保留并研究','keep',true)+button(m.status==='discarded'?'恢复候选':'弃牌',m.status==='discarded'?'restore':'discard'):button('研究市场空间','market',true)+button('研究实现成本','cost')+button('记下决定','decision');
  }
  const ideaTabs=panel=>'<nav class="alc-tabs" aria-label="'+tx('想法详情')+'">'+[['brief','想法'],['market','市场空间'],['cost','实现成本'],['decision','决定']].map(([p,label])=>button(label,p,false,'aria-pressed="'+(p===panel)+'"')).join('')+'</nav>';
  const evidence=(e,label)=>'<blockquote class="alc-evidence"><a href="'+safeUrl(e.url)+'" target="_blank" rel="noopener noreferrer">'+esc(e.title)+'</a><small> · '+tx(label)+'</small>'+paragraphs(e.excerpt)+'</blockquote>';
  function renderResearch(workspace){
    research=workspace;const key=current.panel==='market'?'market_space':'build_cost',lens=workspace.lenses[key],report=lens.report;context.panel=current.panel;target=report?{kind:'lens_report',objectId:report.id,revision:report.revision}:null;
    const labels={planning:'规划',collecting:'收集',cross_checking:'交叉验证',synthesizing:'综合结论'};
    content.innerHTML=ideaTabs(current.panel)+'<div class="alc-progress">'+Object.entries(labels).map(([id,label])=>'<span aria-current="'+(lens.run?.stage===id?'step':'false')+'">'+tx(label)+'</span>').join('')+status(lens.status)+'</div>'+
      (lens.run?.errorCode?'<p class="alc-warning">'+tx('研究未完成。已取得的材料保留，可重新确认计划再试。')+' '+esc(lens.run.errorCode)+'</p>':'')+
      (report&&lens.status!=='completed'&&lens.status!=='partial'?'<p class="alc-muted">'+tx('下方保留上一份报告，本次研究尚未生成新结论。')+'</p>':'')+
      (lens.status==='partial'?'<p class="alc-warning">'+tx('预算范围内只完成了部分研究。补充研究后才能正式决策。')+'</p>':'')+
      (report?section('研究摘要',report.summary,'summary')+report.judgments.map(c=>'<section class="alc-claim" data-alc-block="'+esc(c.id)+'"><h3>'+tx(c.label)+status(c.status)+'</h3>'+paragraphs(c.conclusion)+paragraphs(c.rationale)+c.supportingEvidenceIds.map(id=>lens.evidence?.find(e=>e.id===id)).filter(Boolean).map(e=>evidence(e,'支持来源')).join('')+c.counterEvidenceIds.map(id=>lens.evidence?.find(e=>e.id===id)).filter(Boolean).map(e=>evidence(e,'反向来源')).join('')+section('仍然未知',c.unknowns)+section('什么会改变判断',c.changeConditions)+'</section>').join(''):empty(active(lens.status)?'正在研究，可以离开此页，稍后回来查看。':'先确认研究范围、模型和调用预算，再开始。'));
    if(lens.evidence?.length)content.insertAdjacentHTML('beforeend','<details><summary>'+tx('全部来源')+' · '+lens.evidence.length+'</summary>'+lens.evidence.map(e=>evidence(e,'已采集')).join('')+'</details>');
    footer.innerHTML=active(lens.status)?button('停止研究','cancel',false,'data-job="'+esc(lens.run?.jobId)+'"'):button(report?'重新研究':'开始研究','plan',true);
    if(lens.status==='planned'&&lens.plan)footer.innerHTML+=button('继续已确认计划','resume-plan');
    if(report)footer.innerHTML+=button('保存固定版本','reuse-publish',false,'data-report="'+esc(report.id)+'"');
    if(lens.plan)footer.innerHTML+=button('本次采用记录','reuse-receipt',false,'data-plan="'+esc(lens.plan.id)+'"');
    footer.innerHTML+=button('记下决定','decision');
  }
  function renderDecision(value){
    decision=value;target=null;context.panel='decision';content.innerHTML=ideaTabs('decision')+'<div class="alc-candidates">'+[['market_space','市场空间','market'],['build_cost','实现成本','cost']].map(([key,label,action])=>'<section class="alc-candidate"><h3>'+tx(label)+' '+status(value.materials[key].status)+'</h3><p>'+esc((value.materials[key].summary||'').replace(/\s+/g,' ').slice(0,170))+((value.materials[key].summary||'').length>170?'…':'')+'</p>'+button('查看研究',action)+'</section>').join('')+'</div>';
    if(value.decision){content.innerHTML+=section(L('已决定')+' · '+L(states[value.decision.outcome]),value.decision.reason)+section('下一步或回看条件',value.decision.revisitCondition||L('未设置'));footer.innerHTML=button('查看决策列表','decisions');}
    else{content.innerHTML+=value.gate.ready?'<p class="alc-muted">'+tx('两份研究属于当前版本。根据证据和未知，选择下一步。')+'</p>':'<p class="alc-warning">'+esc(value.gate.message)+'</p>';footer.innerHTML=['build','hold','drop'].map((v,index)=>button(states[v],'decide',index===0,'data-outcome="'+v+'" '+(!value.gate.ready?'disabled':''))).join('');}
  }
  function renderPulse(bundle){
    pulseBundle=bundle;const r=bundle.report;setTitle(r.title);context={kind:'pulse',label:r.title,pulseReportId:r.id};target={kind:'pulse_report',objectId:r.id,revision:r.revision};
    content.innerHTML='<p class="alc-muted">'+new Date(r.createdAt).toLocaleString()+' · '+esc(r.runtimeLabel)+'</p>'+status(r.status)+section('本期观察',r.summary,'summary')+(r.coverageGaps.length?section('来源缺口',r.coverageGaps):'')+r.findings.map(f=>section(f.title,f.fact,f.id)+section('需求推断',f.demandInference)+section('反向信号',f.counterSignals)).join('')+'<h3>'+tx('可以探索的机会')+'</h3>'+bundle.opportunities.map(o=>'<section class="alc-claim"><h3>'+esc(o.title)+'</h3>'+paragraphs(o.highlight)+paragraphs(o.rationale)+section('需求推断',o.demandInference)+section('反向信号',o.counterSignals)+section('未知',o.unknowns)+'<div class="alc-actions">'+(o.convertedDirectionId?button('打开方向','converted',false,'data-id="'+esc(o.convertedDirectionId)+'"'):button('转为方向','convert',true,'data-id="'+esc(o.id)+'"')+(o.status==='new'?button('留待以后','save-opportunity',false,'data-id="'+esc(o.id)+'"'):'<span>'+tx('已保存')+'</span>'))+'</div></section>').join('')+'<details><summary>'+tx('原始信号')+' · '+bundle.signals.length+'</summary>'+bundle.signals.map(s=>evidence({title:s.title,url:s.url,excerpt:s.summary},s.sourceId)).join('')+'</details>';
    footer.innerHTML=button('采集市场信号','pulse-start',true)+button('来源设置','sources');
  }
  function renderSettings(){
    target=null;setTitle(L('研究偏好'));context={kind:'surface',label:L('研究偏好'),surface:'ideas'};
    content.innerHTML='<section class="alc-settings-section"><h3>'+tx('模型与预算')+'</h3><p>'+tx('模型凭据由 Molis Work 管理。这里只选择研究模型和调用上限。')+' '+modelSettingsLink()+'</p>'+paragraphs(runtime.models.find(m=>m.id===runtime.modelId)?.label||L('使用可用模型'))+button('修改研究设置','runtime')+'</section>'+
      '<section class="alc-settings-section"><h3>'+tx('个人判断偏好')+'</h3><p class="alc-muted">'+tx('只作为你的偏好，不作为市场证据。')+'</p>'+button('添加偏好','taste',true)+memory.taste.map(r=>'<section class="alc-claim"><h3>'+esc(r.title)+' '+status(r.status)+'</h3>'+paragraphs(r.statement)+section('适用范围',r.appliesTo)+section('例外',r.exceptions)+(r.status==='active'?button('停用','disable-taste',false,'data-id="'+esc(r.id)+'"'):'')+'</section>').join('')+'</section>'+
      '<section class="alc-settings-section"><h3>'+tx('研究方法')+'</h3><p class="alc-muted">'+tx('在研究报告里选择原文、添加注释，再把反馈沉淀为方法。')+'</p>'+button('继续待确认方法','reuse-pending')+memory.playbook.map(r=>'<section class="alc-claim">'+paragraphs(r.methodChange)+status(r.status)+section('作用范围',L(({report:'仅本报告',direction:'当前方向',global_market_space:'所有后续市场研究'})[r.scope.kind]))+section('正例',r.positiveExamples)+section('反例',r.negativeExamples)+'<p class="alc-muted">'+tx('实际使用次数')+' · '+r.applications.length+'</p>'+(r.status==='active'?button('修改方法','revise-playbook',false,'data-id="'+esc(r.id)+'"')+button('停用','disable-playbook',false,'data-id="'+esc(r.id)+'"'):'')+'</section>').join('')+'</section>'+
      '<section><h3>'+tx('本地数据')+'</h3><p>'+tx('导出当前项目的方向、研究、决策和讨论，不含模型凭据。')+'</p><div class="alc-actions">'+button('导出 JSON','export-json')+button('导出 ZIP','export-zip')+'<a class="mw-btn mw-btn--ghost" target="_blank" rel="noopener" href="'+esc(host.route('/api/alchemist/studio/legacy'))+'">'+tx('历史演示记录')+'</a></div></section>';
    footer.innerHTML='';
  }
`;
