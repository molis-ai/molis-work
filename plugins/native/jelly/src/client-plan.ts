/** Plans remain local previews until the user commits the atomic command. */
export const JELLY_PLAN_CLIENT_SCRIPT = String.raw`
  let currentPlan=null;let currentPlanSource=null;let planUi=new Map();
  const planState=(action)=>{
    if(!planUi.has(action.id)){
      const schedule=action.schedule;const duration=action.duration_minutes||(schedule&&schedule.start_time!==null&&schedule.end_time!==null?Math.max(15,Math.round((dayDate(schedule.end_date)-dayDate(schedule.start_date))/86400000)*1440+schedule.end_time-schedule.start_time):30);
      planUi.set(action.id,{create:true,arrange:Boolean(schedule),date:schedule?.start_date||civil(),time:clockLabel(schedule?.start_time),duration,locks:new Set()});
    }
    return planUi.get(action.id);
  };
  const capturePlan=()=>{
    if(!currentPlan)return;
    for(const action of currentPlan.actions){const title=$('[data-jelly-plan-title="'+CSS.escape(action.id)+'"]');if(!title)continue;const ui=planState(action);action.title=title.value;action.notes=$('[data-jelly-plan-notes="'+CSS.escape(action.id)+'"]').value;ui.create=$('[data-jelly-plan-check="'+CSS.escape(action.id)+'"]').checked;ui.arrange=$('[data-jelly-plan-schedule="'+CSS.escape(action.id)+'"]').checked;ui.date=$('[data-jelly-plan-date="'+CSS.escape(action.id)+'"]').value;ui.time=$('[data-jelly-plan-time="'+CSS.escape(action.id)+'"]').value;ui.duration=Number($('[data-jelly-plan-minutes="'+CSS.escape(action.id)+'"]').value);}
  };
  const openPlan=(plan,source,preserve=false)=>{
    if(!preserve)planUi=new Map();currentPlan=plan;currentPlanSource=source;
    const questions=plan.clarification_questions?.length?'<div class="jelly-plan-questions"><p class="jelly-muted">'+tx('还有这些问题需要你确认；可以在下方补充后重新拆解。')+'</p>'+plan.clarification_questions.map((question)=>'<p>'+esc(question)+'</p>').join('')+'</div>':'';
    const html=questions+'<p class="jelly-muted">'+tx('勾选创建任务，再决定是否安排时间。标题、完成要求和时长都可以调整。')+'</p><div class="jelly-plan-refine"><textarea class="mw-textarea" data-jelly-plan-feedback rows="2" placeholder="'+tx('补充背景或回答上面的问题，再重新拆解。')+'"></textarea>'+btn('重新拆解','data-jelly-plan-refresh','refresh')+'</div>'+plan.actions.map((action,index)=>{
      const ui=planState(action);
      return '<div class="jelly-plan-action"><input type="checkbox" class="mw-checkbox" data-jelly-plan-check="'+esc(action.id)+'" '+(ui.create?'checked':'')+' aria-label="'+tx('创建任务')+' '+esc(action.title)+'"><div><div class="jelly-plan-row-tools"><span class="jelly-muted">'+(index+1)+'</span>'+btn('向上移动','data-jelly-plan-up="'+esc(action.id)+'"','chevron-up')+btn('局部重拆','data-jelly-plan-refine="'+esc(action.id)+'"','sparkles')+btn('移除候选','data-jelly-plan-remove="'+esc(action.id)+'"','x')+'</div><input class="mw-input" data-jelly-plan-title="'+esc(action.id)+'" value="'+esc(action.title)+'" aria-label="'+tx('任务标题')+'"><label class="jelly-field" style="margin:8px 0">'+tx('任务备注与完成要求')+'<textarea class="mw-textarea" rows="2" data-jelly-plan-notes="'+esc(action.id)+'">'+esc(action.notes||'')+'</textarea></label><label class="jelly-check"><input type="checkbox" class="mw-checkbox" data-jelly-plan-schedule="'+esc(action.id)+'" '+(ui.arrange?'checked':'')+'>'+tx('安排到日历')+'</label><div class="jelly-form-grid" style="margin-top:8px"><label class="jelly-field">'+tx('开始日期')+'<input class="mw-input" data-jelly-plan-date="'+esc(action.id)+'" value="'+esc(ui.date)+'" placeholder="YYYY-MM-DD"></label><label class="jelly-field">'+tx('开始时间')+'<input class="mw-input" data-jelly-plan-time="'+esc(action.id)+'" value="'+esc(ui.time)+'" placeholder="HH:MM"></label></div><label class="jelly-field" style="margin-top:8px">'+tx('时长（分钟）')+'<input type="number" class="mw-input" min="15" max="720" step="15" data-jelly-plan-minutes="'+esc(action.id)+'" value="'+ui.duration+'"></label><div class="jelly-choice-row" style="margin-top:6px">'+[15,30,45,60,90].map((minutes)=>btn(String(minutes),'data-jelly-plan-duration="'+minutes+'" data-plan-action="'+esc(action.id)+'"')).join('')+'</div><details class="jelly-plan-locks"><summary>'+tx('重新拆解时保留字段')+'</summary><div class="jelly-choice-row">'+[['title','标题'],['notes','完成要求'],['duration','时长'],['schedule','安排时间']].map(([field,label])=>btn(label,'data-jelly-plan-lock="'+field+'" data-plan-action="'+esc(action.id)+'" aria-pressed="'+ui.locks.has(field)+'"')).join('')+'</div></details></div></div>';
    }).join('');
    openGeneric(plan.title||'确认任务计划',html,'确认并安排',async()=>{
      capturePlan();const ids=[];
      for(const action of plan.actions){const ui=planState(action);if(!ui.create)continue;ids.push(action.id);action.title=action.title.trim();if(!action.title)throw new Error(L('请输入任务标题'));
        if(!ui.arrange){action.schedule=null;continue;}
        if(!/^\d{4}-\d{2}-\d{2}$/.test(ui.date))throw new Error(L('日期格式应为 YYYY-MM-DD'));if(ui.time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(ui.time))throw new Error(L('时间格式应为 HH:MM'));if(!Number.isFinite(ui.duration)||ui.duration<15||ui.duration>720)throw new Error(L('时长需要在 15 到 720 分钟之间'));
        const start=parseClock(ui.time);const total=start===null?0:start+ui.duration;action.schedule={start_date:ui.date,end_date:start===null?ui.date:addDays(ui.date,Math.floor(total/1440)),start_time:start,end_time:start===null?null:total%1440};if([15,30,45,60,90].includes(ui.duration))action.duration_minutes=ui.duration;
      }
      if(!ids.length)throw new Error(L('至少选择一项任务'));
      await command({type:'plan.apply',plan,note_id:source.kind==='note'?source.id:undefined,selected_action_ids:ids});
      if(selected?.kind==='note'&&selected.id===source.id)openRecord('note',source.id);currentPlan=null;showNote(L('计划已确认，任务已创建'));
    });
  };
  const refreshPlan=async(targetId)=>{
    if(!currentPlan)return;capturePlan();const original=currentPlan;const source=currentPlanSource;const feedback=$('[data-jelly-plan-feedback]')?.value||'';const target=targetId?original.actions.find((action)=>action.id===targetId):null;
    const instructions=feedback+'\n'+(target?'只重新拆解下面这一个候选，其他候选不在本次生成范围：\n'+target.title+'\n'+target.notes:'请重新审视原文并生成任务。当前候选供参考：\n'+original.actions.map((action)=>action.title+' — '+action.notes).join('\n'));
    const now=new Date();let result;try{result=await extractMaterial('/api/jelly/ai',{kind:'decompose',source_type:original.source_type,source_id:original.source_id,text:original.source_type==='text'?original.source_text:undefined,selection:original.selection,instructions,today:civil(),start_time:now.getHours()*60+now.getMinutes()});}catch(error){openPlan(original,source,true);throw error;}
    if(!result){openPlan(original,source,true);return;}
    const regenerated=result.plan;
    if(target){const index=original.actions.findIndex((action)=>action.id===target.id);const ui=planState(target);const replacements=regenerated.actions;if(replacements[0]){const first=replacements[0];if(ui.locks.has('title'))first.title=target.title;if(ui.locks.has('notes'))first.notes=target.notes;const firstUi=planState(first);if(ui.locks.has('duration'))firstUi.duration=ui.duration;if(ui.locks.has('schedule'))Object.assign(firstUi,{arrange:ui.arrange,date:ui.date,time:ui.time});firstUi.locks=new Set(ui.locks);}original.actions.splice(index,1,...replacements);}
    else{
      const old=original.actions;original.actions=regenerated.actions.map((action,index)=>{const prior=old[index];if(!prior)return action;const priorUi=planState(prior);const nextUi=planState(action);for(const field of ['title','notes'])if(priorUi.locks.has(field))action[field]=prior[field];if(priorUi.locks.has('duration'))nextUi.duration=priorUi.duration;if(priorUi.locks.has('schedule'))Object.assign(nextUi,{arrange:priorUi.arrange,date:priorUi.date,time:priorUi.time});nextUi.locks=new Set(priorUi.locks);nextUi.create=priorUi.create;return action;});
      for(let index=regenerated.actions.length;index<old.length;index++)if(planState(old[index]).locks.size)original.actions.push(old[index]);
    }
    original.clarification_questions=regenerated.clarification_questions||[];openPlan(original,source,true);
  };
  const handlePlanClick=(target)=>{
    if(target.hasAttribute('data-jelly-plan-lock')){capturePlan();const action=currentPlan.actions.find((entry)=>entry.id===target.dataset.planAction);const ui=planState(action);const field=target.dataset.jellyPlanLock;if(ui.locks.has(field))ui.locks.delete(field);else ui.locks.add(field);target.setAttribute('aria-pressed',String(ui.locks.has(field)));return;}
    if(target.hasAttribute('data-jelly-plan-refresh'))return void run(()=>refreshPlan());
    if(target.hasAttribute('data-jelly-plan-refine'))return void run(()=>refreshPlan(target.dataset.jellyPlanRefine));
    if(target.hasAttribute('data-jelly-plan-up')){capturePlan();const index=currentPlan.actions.findIndex((entry)=>entry.id===target.dataset.jellyPlanUp);if(index>0){[currentPlan.actions[index-1],currentPlan.actions[index]]=[currentPlan.actions[index],currentPlan.actions[index-1]];openPlan(currentPlan,currentPlanSource,true);}return;}
    if(target.hasAttribute('data-jelly-plan-remove')){capturePlan();currentPlan.actions=currentPlan.actions.filter((entry)=>entry.id!==target.dataset.jellyPlanRemove);openPlan(currentPlan,currentPlanSource,true);}
  };
`;
