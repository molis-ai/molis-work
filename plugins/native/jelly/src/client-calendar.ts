/** Calendar and item editor share the workspace command queue with notes. */
export const JELLY_CALENDAR_CLIENT_SCRIPT = String.raw`
  let editingItem=null;
  let itemOptions={kind:'task',category_id:'uncategorized',priority:'none',weekdays:[],scope:'onlyThis'};
  let linkedTask=null;
  let relationRole='reference';
  let relationScope='instance';
  let calendarSelected=new Set();
  let reviewTab='completed';
  let reviewPeriod='month';
  const paintDatePicker=(picker,date)=>{
    const calendar=$('.mw-calendar',picker);const first=dayDate(date);first.setDate(1);const month=first.getMonth();const year=first.getFullYear();const start=addDays(civil(first),-((first.getDay()+6)%7));
    calendar.dataset.calendarYear=String(year);calendar.dataset.calendarMonth=String(month);$('[data-calendar-title]',calendar).textContent=first.toLocaleDateString(document.documentElement.lang||undefined,{year:'numeric',month:'long'});
    let html='';for(let row=0;row<6;row++){html+='<tr>';for(let col=0;col<7;col++){const day=addDays(start,row*7+col);html+='<td data-date="'+day+'" class="'+(dayDate(day).getMonth()!==month?'mw-calendar__outside ':'')+(day===$('[data-date-picker-input]',picker).value?'is-selected':'')+'"><button type="button" class="mw-calendar__day" aria-label="'+esc(dateLabel(day))+'">'+Number(day.slice(8))+'</button></td>';}html+='</tr>';}$('tbody',calendar).innerHTML=html;
  };
  const openDatePicker=(picker)=>{const input=$('[data-date-picker-input]',picker);const date=/^\d{4}-\d{2}-\d{2}$/.test(input.value)?input.value:civil();$$('.jelly-date-picker .mw-calendar').forEach((node)=>node.classList.remove('is-open'));paintDatePicker(picker,date);$('.mw-calendar',picker).classList.add('is-open');};
  root.addEventListener('focusin',(event)=>{if(event.target.matches('[data-date-picker-input]'))openDatePicker(event.target.closest('.jelly-date-picker'));});
  root.addEventListener('click',(event)=>{if(!event.target.closest('.jelly-date-picker'))$$('.jelly-date-picker .mw-calendar').forEach((node)=>node.classList.remove('is-open'));});
  const range=()=>{
    const date=dayDate(anchor);
    if(mode==='week'&&view==='calendar'){const start=addDays(anchor,-((date.getDay()+6)%7));return {start,end:addDays(start,6)};}
    date.setDate(1);const first=civil(date);date.setMonth(date.getMonth()+1);date.setDate(0);const last=civil(date);
    if(mode==='month'&&view==='calendar'){const start=addDays(first,-((dayDate(first).getDay()+6)%7));const tail=(7-((dayDate(last).getDay()+6)%7)-1)%7;return{start,end:addDays(last,tail)};}
    return{start:first,end:last};
  };
  const occurrenceKey=(item)=>item.series_id ? item.series_id+'@'+item.original_date : item.id;
  const findOccurrence=(key)=>occurrences.find((item)=>occurrenceKey(item)===key);
  const occurrenceHtml=(item)=>'<button type="button" aria-label="'+esc(item.title+' · '+dateLabel(item.start_date)+' '+clockLabel(item.start_time)+(item.completed_at?' · '+L('已完成'):''))+'" class="jelly-occurrence'+(item.completed_at?' is-done':'')+'" draggable="true" data-jelly-occurrence="'+esc(occurrenceKey(item))+'" title="'+esc(item.title+' · '+dateLabel(item.start_date)+(item.end_date!==item.start_date?' — '+dateLabel(item.end_date):''))+'">'+categoryDot(item.category_id)+(item.start_time!==null?'<time>'+clockLabel(item.start_time)+'</time>':'')+(item.pinned?glyph('pin'):'')+(item.priority!=='none'?'<span class="jelly-priority" data-priority="'+item.priority+'">'+item.priority+'</span>':'')+'<span class="jelly-item-title">'+esc(item.title)+'</span>'+(item.series_id?glyph('refresh'):'')+(item.completed_at?glyph('check'):'')+'</button>';
  const visibleOccurrences=()=>occurrences.filter((item)=>matches(item,item.notes)&&(!hideCompleted||!item.completed_at));
  const agendaHtml=(items,selectable=false)=>{
    const dates=[...new Set(items.map((item)=>item.start_date))].sort();
    return '<div class="jelly-agenda">'+dates.map((date)=>'<section class="jelly-agenda-group"><h2>'+esc(dateLabel(date))+'</h2>'+items.filter((item)=>item.start_date===date).map((item)=>'<div class="jelly-agenda-row">'+(selectable&&!item.series_id&&!item.completed_at?'<input type="checkbox" class="mw-check" data-jelly-select-item="'+esc(item.id)+'" aria-label="'+tx('选择事项')+' '+esc(item.title)+'" '+(calendarSelected.has(item.id)?'checked':'')+'>':'')+btn(item.completed_at?'恢复事项':'完成事项','data-jelly-toggle-item="'+esc(occurrenceKey(item))+'"',item.completed_at?'completed':'circle')+occurrenceHtml(item)+(!item.series_id&&item.start_date===item.end_date&&item.start_time===null?btn('向上移动','data-jelly-reorder-item="'+esc(item.id)+'"','chevron-up'):'')+'</div>').join('')+'</section>').join('')+'</div>';
  };
  const bulkBar=()=>'<div class="jelly-bulk-bar"><span class="jelly-muted" data-jelly-selection-count>'+calendarSelected.size+' '+tx('项已选择')+'</span>'+btn('移动所选','data-jelly-move-selected','calendar')+(view==='progress'?btn('搬到下周','data-jelly-review-move="week"')+btn('搬到下月','data-jelly-review-move="month"'):'')+btn('清空选择','data-jelly-clear-selected')+'</div>';
  const renderCalendar=async()=>{
    const seq=++calendarSeq;const {start,end}=range();const result=await request('GET','/api/jelly/calendar?start='+start+'&end='+end);
    if(seq!==calendarSeq||view!=='calendar')return;occurrences=result.occurrences||[];
    $('[data-jelly-period-title]').textContent=mode==='week'?dateLabel(start,true)+' — '+dateLabel(end,true):dayDate(anchor).toLocaleDateString(document.documentElement.lang||undefined,{year:'numeric',month:'long'});
    const items=visibleOccurrences();
    if(mode==='list'){keepListScroll(()=>{content.innerHTML=items.length?bulkBar()+agendaHtml(items,true):empty(query?'没有匹配的事项':'这段时间还没有安排','点“新建事项”记下任务，或切到月历选择一天。','新建事项');});return;}
    const days=[];for(let date=start;date<=end;date=addDays(date,1))days.push(date);
    const weekdays=['一','二','三','四','五','六','日'];
    if(mode==='week'){
      const ruler='<div class="jelly-week-ruler"><div class="jelly-week-ruler-head">'+tx('全天')+'</div><div class="jelly-week-hours">'+Array.from({length:24},(_,hour)=>'<span style="top:'+hour*44+'px">'+String(hour).padStart(2,'0')+':00</span>').join('')+'</div></div>';
      const columns=days.map((date)=>{
        const dayItems=items.filter((item)=>item.start_date<=date&&item.end_date>=date);const allDay=dayItems.filter((item)=>item.start_time===null);const timed=dayItems.filter((item)=>item.start_time!==null).map((item)=>({item,start:item.start_date<date?0:item.start_time,end:item.end_date>date?1440:item.end_time,lane:0})).sort((a,b)=>a.start-b.start||a.end-b.end);
        const lanes=[];for(const timedItem of timed){let lane=lanes.findIndex((end)=>end<=timedItem.start);if(lane<0)lane=lanes.length;lanes[lane]=timedItem.end;timedItem.lane=lane;}
        const count=Math.max(1,lanes.length);
        return '<section class="jelly-week-column jelly-day'+(date===civil()?' is-today':'')+'" data-jelly-day="'+date+'"><header class="jelly-week-column-head"><span class="jelly-muted">'+tx(weekdays[(dayDate(date).getDay()+6)%7])+'</span><button type="button" class="jelly-day-number" aria-label="'+esc(dateLabel(date)+' · '+L('新建事项'))+'" data-jelly-add-date="'+date+'">'+Number(date.slice(8))+'</button></header><div class="jelly-week-all-day">'+allDay.map(occurrenceHtml).join('')+btn('新建全天事项','data-jelly-add-date="'+date+'" class="jelly-day-add"','plus')+'</div><div class="jelly-week-time" data-jelly-week-time="'+date+'">'+timed.map((entry)=>'<div class="jelly-week-event" style="top:'+entry.start/60*44+'px;height:'+Math.max(24,(entry.end-entry.start)/60*44)+'px;left:'+entry.lane/count*100+'%;width:'+100/count+'%">'+occurrenceHtml(entry.item)+'</div>').join('')+'</div></section>';
      }).join('');
      keepListScroll(()=>{content.innerHTML='<div class="jelly-week-timeline">'+ruler+columns+'</div>';});return;
    }
    const html='<div class="'+(mode==='week'?'jelly-week':'jelly-month')+'">'+(mode==='month'?weekdays.map((day)=>'<div class="jelly-week-label">'+tx(day)+'</div>').join(''):'')+days.map((date)=>{
      const dayItems=items.filter((item)=>item.start_date<=date&&item.end_date>=date);
      return '<section class="jelly-day'+(date===civil()?' is-today':'')+(date.slice(0,7)!==anchor.slice(0,7)?' is-outside':'')+'" data-jelly-day="'+date+'" aria-label="'+esc(dateLabel(date))+'"><div class="jelly-day-head">'+(mode==='week'?'<span class="jelly-muted">'+tx(weekdays[(dayDate(date).getDay()+6)%7])+'</span>':'')+'<button type="button" class="jelly-day-number" aria-label="'+esc(dateLabel(date)+' · '+L('新建事项'))+'" data-jelly-add-date="'+date+'" title="'+tx('在这天添加事项')+'">'+Number(date.slice(8))+'</button>'+btn('新建事项','data-jelly-add-date="'+date+'" class="jelly-day-add"','plus')+'</div>'+dayItems.map(occurrenceHtml).join('')+'</section>';
    }).join('')+'</div>';
    keepListScroll(()=>{content.innerHTML=html;});
  };
  const itemField=(name)=>$('[data-jelly-field="'+name+'"]');
  const paintItemChoices=()=>{
    $('[data-jelly-kind]').innerHTML=['task','event'].map((kind)=>btn(kind==='task'?'任务':'日程','data-jelly-item-kind="'+kind+'" aria-pressed="'+(itemOptions.kind===kind)+'"',kind==='task'?'check':'calendar')).join('');
    $('[data-jelly-item-categories]').innerHTML=state.categories.map((entry)=>'<button type="button" class="mw-btn mw-btn--ghost" data-jelly-item-category="'+esc(entry.id)+'" aria-pressed="'+(itemOptions.category_id===entry.id)+'">'+categoryDot(entry.id)+esc(entry.name)+'</button>').join('');
    $('[data-jelly-priority]').innerHTML=['none','P0','P1','P2'].map((priority)=>btn(priority==='none'?'无':priority,'data-jelly-item-priority="'+priority+'" aria-pressed="'+(itemOptions.priority===priority)+'"')).join('');
    $('[data-jelly-weekdays]').innerHTML=['一','二','三','四','五','六','日'].map((label,i)=>btn(label,'data-jelly-item-weekday="'+(i+1)+'" aria-pressed="'+itemOptions.weekdays.includes(i+1)+'"')).join('');
    $('[data-jelly-scope-options]').innerHTML=btn('仅这一次','data-jelly-item-scope="onlyThis" aria-pressed="'+(itemOptions.scope==='onlyThis')+'"')+btn('这次及以后','data-jelly-item-scope="thisAndFuture" aria-pressed="'+(itemOptions.scope==='thisAndFuture')+'"');
    $('[data-jelly-recurrence]').hidden=Boolean(linkedTask)||Boolean(editingItem&&!editingItem.series_id)||Boolean(editingItem?.series_id&&itemOptions.scope==='onlyThis');
  };
  const openItem=(item,date=anchor,task=null)=>{
    editingItem=item;linkedTask=task;relationScope='instance';relationRole='reference';
    const series=item?.series_id?state.series.find((entry)=>entry.id===item.series_id):null;
    itemOptions={kind:item?.kind||'task',category_id:item?.category_id||filterCategory||'uncategorized',priority:item?.priority||'none',weekdays:series?[...series.weekdays]:[],scope:'onlyThis'};
    for(const field of ['title','notes','completion_description','start_date','end_date','start_time','end_time','until'])itemField(field).value=field==='start_date'||field==='end_date'?(item?.[field]||date):field==='start_time'||field==='end_time'?clockLabel(item?.[field]):field==='until'?(series?.until||''):(item?.[field]||'');
    if(task)itemField('title').value=task.title;
    itemField('pinned').checked=Boolean(item?.pinned);
    $('[data-jelly-item-heading]').textContent=L(task?'安排笔记任务':item?'编辑事项':'新建事项');
    $('[data-jelly-delete-item]').hidden=!item;$('[data-jelly-complete-item]').hidden=!item;
    $('[data-jelly-complete-item] span').textContent=L(item?.completed_at?'恢复事项':'完成事项');
    $('[data-jelly-complete-item]').setAttribute('aria-label',L(item?.completed_at?'恢复事项':'完成事项'));
    $('[data-jelly-series-scope]').hidden=!series;$('[data-jelly-recurrence]').hidden=Boolean(task)||(Boolean(item)&&!series)||Boolean(series);
    $('[data-jelly-item-error]').hidden=true;paintItemChoices();renderItemRelations();
    $$('[data-jelly-item-copy]').forEach((node)=>node.remove());if(item)$('[data-jelly-item-form] footer > div').insertAdjacentHTML('beforeend',btn('复制事项','data-jelly-item-copy','copy'));
    $('[data-jelly-item-dialog]').showModal();itemField('title').focus();if(!item)itemField('title').select();
  };
  const relationDate=()=>editingItem?.series_id&&relationScope==='instance'?editingItem.original_date:null;
  const effectiveRelations=(item)=>{
    const owner=item.series_id||item.id;let relations=state.relations.filter((entry)=>entry.owner_id===owner&&entry.original_date===null);
    if(item.series_id&&relationScope==='instance'){
      relations=[...relations,...state.relations.filter((entry)=>entry.owner_id===owner&&entry.original_date===item.original_date)];
      const override=state.relation_overrides?.find((entry)=>entry.owner_id===owner&&entry.original_date===item.original_date);
      if(override){if(override.primary!=='inherit'){relations=relations.filter((entry)=>entry.role!=='primary');if(override.primary!=='clear')relations.push({owner_id:owner,original_date:item.original_date,note_id:override.primary,role:'primary'});}relations=relations.filter((entry)=>entry.role==='primary'||!override.removed_reference_ids.includes(entry.note_id));for(const id of override.added_reference_ids)if(!relations.some((entry)=>entry.note_id===id))relations.push({owner_id:owner,original_date:item.original_date,note_id:id,role:'reference'});}
    }
    return relations;
  };
  const renderItemRelations=()=>{
    const item=editingItem;const relationEl=$('[data-jelly-item-relations]');if(!item){relationEl.innerHTML='';return;}
    const relations=effectiveRelations(item);const taskLinks=state.task_links.filter((entry)=>entry.item_id===item.id&&!relations.some((relation)=>relation.note_id===entry.note_id));
    const hasOverride=state.relation_overrides?.some((entry)=>entry.owner_id===item.series_id&&entry.original_date===item.original_date);
    relationEl.innerHTML='<span class="jelly-muted">'+tx('关联笔记')+'</span>'+(item.series_id?'<div class="jelly-choice-row">'+btn('仅这一次','data-jelly-relation-scope="instance" aria-pressed="'+(relationScope==='instance')+'"')+btn('整个系列','data-jelly-relation-scope="series" aria-pressed="'+(relationScope==='series')+'"')+'</div>':'')+relations.map((entry)=>{const note=state.notes.find((n)=>n.id===entry.note_id);return note?'<div><span class="jelly-muted">'+tx(entry.role==='primary'?'主笔记':'参考')+'</span>'+btn(note.title||'无标题','data-jelly-linked-note="'+esc(note.id)+'"','note')+btn('移除关联','data-jelly-detach-note="'+esc(note.id)+'" data-role="'+entry.role+'"','x')+'</div>':'';}).join('')+taskLinks.map((entry)=>{const note=state.notes.find((n)=>n.id===entry.note_id);return note?btn(note.title||'无标题','data-jelly-linked-note="'+esc(note.id)+'"','check'):'';}).join('')+btn('关联已有笔记','data-jelly-attach-note','link')+(hasOverride&&relationScope==='instance'?btn('恢复继承系列笔记','data-jelly-reset-relations','undo'):'')+(item.notes?.trim()?btn('将随记整理为笔记','data-jelly-migrate-notes','note'):'');
  };
  $('[data-jelly-item-form]').addEventListener('submit',async(event)=>{
    event.preventDefault();const submit=event.submitter;if(submit)submit.disabled=true;
    const patch={title:itemField('title').value.trim(),kind:itemOptions.kind,category_id:itemOptions.category_id,priority:itemOptions.priority,pinned:itemField('pinned').checked,start_date:itemField('start_date').value,end_date:itemField('end_date').value,start_time:parseClock(itemField('start_time').value),end_time:parseClock(itemField('end_time').value),notes:itemField('notes').value,completion_description:itemField('completion_description').value};
    try{
      if(!patch.title)throw new Error(L('请输入标题'));
      if(patch.end_date<patch.start_date)throw new Error(L('结束日期不能早于开始日期'));
      if(linkedTask)await command({type:'task.schedule',note_id:linkedTask.note_id,block_id:linkedTask.block_id,schedule:{start_date:patch.start_date,end_date:patch.end_date,start_time:patch.start_time,end_time:patch.end_time},category_id:patch.category_id,priority:patch.priority});
      else if(editingItem?.series_id)await command({type:'series.update',id:editingItem.series_id,original_date:editingItem.original_date,scope:itemOptions.scope,patch:itemOptions.scope==='thisAndFuture'?{...patch,weekdays:itemOptions.weekdays,until:itemField('until').value||null}:patch});
      else if(editingItem)await command({type:'item.update',id:editingItem.id,patch});
      else if(itemOptions.weekdays.length)await command({type:'series.create',series:{...patch,weekdays:itemOptions.weekdays,until:itemField('until').value||null}});
      else await command({type:'item.create',item:patch});
      $('[data-jelly-item-dialog]').close();showNote(L('事项已保存'));if(selected)syncTaskIndicators();
    }catch(error){$('[data-jelly-item-error]').textContent=error.message;$('[data-jelly-item-error]').hidden=false;}
    finally{if(submit)submit.disabled=false;}
  });
  const completeItem=async(item,description)=>{if(!item)return;await command(item.series_id?{type:'series.complete',id:item.series_id,original_date:item.original_date,completed:!item.completed_at,...(description===undefined?{}:{completion_description:description})}:{type:'item.complete',id:item.id,completed:!item.completed_at,...(description===undefined?{}:{completion_description:description})});syncTaskIndicators();};
  const deleteItem=async()=>{if(!editingItem)return;const item=editingItem;if(!await confirm('删除事项',L(item.series_id&&itemOptions.scope==='thisAndFuture'?'将删除这次及以后的重复事项。':'删除这条事项？关联笔记会保留。'),'删除'))return;await command(item.series_id?{type:'series.delete',id:item.series_id,original_date:item.original_date,scope:itemOptions.scope}:{type:'item.delete',id:item.id});$('[data-jelly-item-dialog]').close();await loadList();};
  const handleCalendarClick=(target,event)=>{
    if(target.hasAttribute('data-jelly-clear-selected')){calendarSelected.clear();void run(renderView);return;}
    if(target.hasAttribute('data-jelly-move-selected')){if(!calendarSelected.size){showNote(L('先选择要移动的一次性事项'));return;}openGeneric('移动所选事项','<label class="jelly-field">'+tx('移动到日期')+'<input class="mw-input" data-jelly-bulk-date value="'+civil()+'" placeholder="YYYY-MM-DD"></label>','移动',async()=>{await command({type:'item.move_many',ids:[...calendarSelected],date:$('[data-jelly-bulk-date]').value});calendarSelected.clear();await renderView();});return;}
    if(target.hasAttribute('data-jelly-review-move'))return void run(async()=>{if(!calendarSelected.size){showNote(L('先选择要移动的一次性事项'));return;}let date;if(target.dataset.jellyReviewMove==='week')date=addDays(civil(),7-((new Date().getDay()+6)%7));else{const next=new Date();next.setDate(1);next.setMonth(next.getMonth()+1);date=civil(next);}await command({type:'item.move_many',ids:[...calendarSelected],date});calendarSelected.clear();await renderView();showNote(L('所选事项已移动'));});
    if(target.hasAttribute('data-jelly-reorder-item'))return void run(async()=>{const item=state.items.find((entry)=>entry.id===target.dataset.jellyReorderItem);const ids=state.items.filter((entry)=>entry.start_date===item.start_date&&entry.end_date===item.start_date&&entry.start_time===null).sort((a,b)=>a.untimed_rank-b.untimed_rank||a.created_at.localeCompare(b.created_at)).map((entry)=>entry.id);const index=ids.indexOf(item.id);if(index>0){[ids[index-1],ids[index]]=[ids[index],ids[index-1]];await command({type:'item.reorder',date:item.start_date,ids});}});
    if(target.hasAttribute('data-jelly-item-copy'))return void run(async()=>{if(!editingItem)return;const {id:originalId,created_at,updated_at,series_id,original_date,...fields}=editingItem;const copy={...fields,completed_at:null,completion_description:''};await command({type:'item.create',item:copy});$('[data-jelly-item-dialog]').close();showNote(L('已复制为独立事项'));});
    if(target.hasAttribute('data-jelly-review-tab')){reviewTab=target.dataset.jellyReviewTab;void run(renderView);return;}
    if(target.hasAttribute('data-jelly-review-period')){reviewPeriod=target.dataset.jellyReviewPeriod;anchor=civil();void run(renderView);return;}
    if(target.hasAttribute('data-date-picker-open')){openDatePicker(target.closest('.jelly-date-picker'));return;}
    if(target.matches('.mw-calendar__day')&&target.closest('.jelly-date-picker')){const picker=target.closest('.jelly-date-picker');const input=$('[data-date-picker-input]',picker);input.value=target.closest('[data-date]').dataset.date;$('.mw-calendar',picker).classList.remove('is-open');if(input.dataset.jellyField==='start_date'&&itemField('end_date').value<input.value)itemField('end_date').value=input.value;return;}
    if(target.hasAttribute('data-calendar-step')&&target.closest('.jelly-date-picker')){const picker=target.closest('.jelly-date-picker');const calendar=$('.mw-calendar',picker);const date=new Date(Number(calendar.dataset.calendarYear),Number(calendar.dataset.calendarMonth)+Number(target.dataset.calendarStep),1,12);paintDatePicker(picker,civil(date));return;}
    if(target.hasAttribute('data-jelly-add-date')){openItem(null,target.dataset.jellyAddDate);return;}
    if(target.hasAttribute('data-jelly-occurrence')){const item=findOccurrence(target.dataset.jellyOccurrence);if(item)openItem(item);return;}
    if(target.hasAttribute('data-jelly-toggle-item'))return void run(()=>completeItem(findOccurrence(target.dataset.jellyToggleItem)));
    if(target.hasAttribute('data-jelly-item-kind')){itemOptions.kind=target.dataset.jellyItemKind;paintItemChoices();return;}
    if(target.hasAttribute('data-jelly-item-category')){itemOptions.category_id=target.dataset.jellyItemCategory;paintItemChoices();return;}
    if(target.hasAttribute('data-jelly-item-priority')){itemOptions.priority=target.dataset.jellyItemPriority;paintItemChoices();return;}
    if(target.hasAttribute('data-jelly-item-weekday')){const value=Number(target.dataset.jellyItemWeekday);itemOptions.weekdays=itemOptions.weekdays.includes(value)?itemOptions.weekdays.filter((n)=>n!==value):[...itemOptions.weekdays,value];paintItemChoices();return;}
    if(target.hasAttribute('data-jelly-item-scope')){itemOptions.scope=target.dataset.jellyItemScope;paintItemChoices();return;}
    if(target.hasAttribute('data-jelly-complete-item'))return void run(async()=>{await completeItem(editingItem,itemField('completion_description').value);$('[data-jelly-item-dialog]').close();});
    if(target.hasAttribute('data-jelly-delete-item'))return void run(deleteItem);
    if(target.hasAttribute('data-jelly-linked-note'))return void run(async()=>{await flushEditor();$('[data-jelly-item-dialog]').close();view='notes';archived=false;await renderView();openRecord('note',target.dataset.jellyLinkedNote);});
    if(target.hasAttribute('data-jelly-detach-note'))return void run(async()=>{await command({type:'relation.detach',owner_id:editingItem.series_id||editingItem.id,original_date:relationDate(),note_id:target.dataset.jellyDetachNote,role:target.dataset.role});renderItemRelations();});
    if(target.hasAttribute('data-jelly-relation-role')){relationRole=target.dataset.jellyRelationRole;$$('[data-jelly-relation-role]').forEach((node)=>node.setAttribute('aria-pressed',String(node.dataset.jellyRelationRole===relationRole)));return;}
    if(target.hasAttribute('data-jelly-relation-scope')){relationScope=target.dataset.jellyRelationScope;renderItemRelations();return;}
    if(target.hasAttribute('data-jelly-reset-relations'))return void run(async()=>{await command({type:'relation.reset',owner_id:editingItem.series_id,original_date:editingItem.original_date});renderItemRelations();});
    if(target.hasAttribute('data-jelly-migrate-notes')){
      const notes=state.notes.filter((note)=>!note.archived_at);openGeneric('将随记整理为笔记','<p class="jelly-muted">'+tx('选择新建笔记，或追加到已有笔记。成功后清空此事项的旧随记，并关联为主笔记。')+'</p><pre class="jelly-import-preview">'+esc(editingItem.notes)+'</pre>'+btn('新建主笔记','data-jelly-migrate-new','plus')+notes.map((note)=>btn(note.title||'无标题','data-jelly-migrate-append="'+esc(note.id)+'"','note')).join(''),'',null);return;
    }
    if(target.hasAttribute('data-jelly-migrate-new')||target.hasAttribute('data-jelly-migrate-append'))return void run(async()=>{await command({type:'item.notes_to_note',owner_id:editingItem.series_id||editingItem.id,original_date:editingItem.original_date||null,mode:target.hasAttribute('data-jelly-migrate-new')?'new':'append',note_id:target.dataset.jellyMigrateAppend});editingItem.notes='';itemField('notes').value='';$('[data-jelly-dialog]').close();renderItemRelations();showNote(L('随记已整理为笔记'));});
    if(target.hasAttribute('data-jelly-attach-note')){
      const notes=state.notes.filter((note)=>!note.archived_at);
      relationRole='reference';openGeneric('关联笔记','<div class="jelly-choice-row">'+btn('参考笔记','data-jelly-relation-role="reference" aria-pressed="true"')+btn('主笔记','data-jelly-relation-role="primary" aria-pressed="false"')+'</div><p class="jelly-muted">'+tx('每个事项有一篇主笔记。替换主笔记会解除原主笔记关系，正文仍保留。')+'</p>'+(notes.length?notes.map((note)=>btn(note.title||'无标题','data-jelly-choose-note="'+esc(note.id)+'"','note')).join(''):'<p class="jelly-muted">'+tx('先在笔记中新建一篇。')+'</p>'),' ',null);return;
    }
    if(target.hasAttribute('data-jelly-choose-note'))return void run(async()=>{await command({type:'relation.attach',owner_id:editingItem.series_id||editingItem.id,original_date:relationDate(),note_id:target.dataset.jellyChooseNote,role:relationRole});$('[data-jelly-dialog]').close();renderItemRelations();});
  };
  content.addEventListener('dragstart',(event)=>{const target=event.target.closest('[data-jelly-occurrence]');if(!target)return;event.dataTransfer.setData('application/x-jelly-item',target.dataset.jellyOccurrence);event.dataTransfer.effectAllowed='move';});
  content.addEventListener('change',(event)=>{const node=event.target.closest('[data-jelly-select-item]');if(!node)return;if(node.checked)calendarSelected.add(node.dataset.jellySelectItem);else calendarSelected.delete(node.dataset.jellySelectItem);const count=$('[data-jelly-selection-count]');if(count)count.textContent=calendarSelected.size+' '+L('项已选择');});
  content.addEventListener('dblclick',(event)=>{const timeline=event.target.closest('[data-jelly-week-time]');if(!timeline||event.target.closest('[data-jelly-occurrence]'))return;const minutes=Math.max(0,Math.min(1410,Math.round((event.clientY-timeline.getBoundingClientRect().top)/44*4)*15));openItem(null,timeline.dataset.jellyWeekTime);itemField('start_time').value=clockLabel(minutes);itemField('end_time').value=clockLabel(minutes+30);});
  content.addEventListener('dragover',(event)=>{if(event.target.closest('[data-jelly-day]')&&event.dataTransfer.types.includes('application/x-jelly-item')){event.preventDefault();event.dataTransfer.dropEffect='move';event.target.closest('[data-jelly-day]').classList.add('is-drop');}});
  content.addEventListener('dragleave',(event)=>event.target.closest('[data-jelly-day]')?.classList.remove('is-drop'));
  content.addEventListener('drop',(event)=>{const day=event.target.closest('[data-jelly-day]');if(!day)return;day.classList.remove('is-drop');const item=findOccurrence(event.dataTransfer.getData('application/x-jelly-item'));if(!item)return;event.preventDefault();void run(async()=>{if(item.series_id){const shift=Math.round((dayDate(day.dataset.jellyDay)-dayDate(item.start_date))/86400000);await command({type:'series.update',id:item.series_id,original_date:item.original_date,scope:'onlyThis',patch:{start_date:day.dataset.jellyDay,end_date:addDays(item.end_date,shift)}});}else await command({type:'item.move',id:item.id,date:day.dataset.jellyDay});showNote(L('事项已移动'));});});
  const openCategories=async()=>{
    await flushEditor();
    const paint=()=>state.categories.map((entry,index)=>'<div class="jelly-category-row" data-jelly-category-row="'+esc(entry.id)+'">'+categoryDot(entry.id)+'<input class="mw-input" data-jelly-category-name="'+esc(entry.id)+'" value="'+esc(entry.name)+'" aria-label="'+tx('分类名称')+'" '+(entry.id==='uncategorized'?'disabled':'')+'>'+btn('保存','data-jelly-category-save="'+esc(entry.id)+'"','check')+'<div class="jelly-category-palette">'+tones.map((tone)=>'<button type="button" class="mw-btn mw-btn--ghost" data-jelly-category-color="'+tone+'" data-id="'+esc(entry.id)+'" aria-label="'+tx(tone)+'" aria-pressed="'+(categoryTone(entry)===tone)+'"><span class="jelly-color" data-tone="'+tone+'"></span></button>').join('')+'</div>'+btn('向上','data-jelly-category-up="'+esc(entry.id)+'"','chevron-up')+(entry.id!=='uncategorized'?btn('删除','data-jelly-category-delete="'+esc(entry.id)+'"','trash'):'')+'</div>').join('')+'<div class="jelly-category-row"><input class="mw-input" data-jelly-category-new placeholder="'+tx('新分类名称')+'">'+btn('添加','data-jelly-category-add','plus')+'</div><p class="jelly-muted">'+tx('删除分类后，内容移到“未分类”，不会删除事项或笔记。')+'</p>';
    openGeneric('管理分类',paint(),'完成',async()=>{});
    const body=$('[data-jelly-dialog-body]');
    body.onclick=(event)=>void run(async()=>{
      const target=event.target.closest('button');if(!target)return;
      if(target.hasAttribute('data-jelly-category-save')){const id=target.dataset.jellyCategorySave;await command({type:'category.update',id,patch:{name:$('[data-jelly-category-name="'+CSS.escape(id)+'"]',body).value}});}
      else if(target.hasAttribute('data-jelly-category-color'))await command({type:'category.update',id:target.dataset.id,patch:{color:toneColors[target.dataset.jellyCategoryColor]}});
      else if(target.hasAttribute('data-jelly-category-delete'))await command({type:'category.delete',id:target.dataset.jellyCategoryDelete});
      else if(target.hasAttribute('data-jelly-category-up')){const ids=state.categories.map((entry)=>entry.id);const index=ids.indexOf(target.dataset.jellyCategoryUp);if(index>0){[ids[index-1],ids[index]]=[ids[index],ids[index-1]];await command({type:'category.reorder',ids});}}
      else if(target.hasAttribute('data-jelly-category-add')){const name=$('[data-jelly-category-new]',body).value.trim();if(!name)return;await command({type:'category.create',category:{name,color:toneColors.blue}});}
      else return;
      body.innerHTML=paint();
    });
    genericCleanup=()=>{body.onclick=null;};
  };
  const renderProgress=async()=>{
    const seq=++calendarSeq;const selectedDay=dayDate(anchor);let start,end;
    if(reviewPeriod==='week'){start=addDays(anchor,-((selectedDay.getDay()+6)%7));end=addDays(start,6);}else{selectedDay.setDate(1);start=civil(selectedDay);selectedDay.setMonth(selectedDay.getMonth()+1);selectedDay.setDate(0);end=civil(selectedDay);}
    if(start<=civil()&&end>=civil())end=civil();
    $('[data-jelly-period-title]').textContent=dateLabel(start,true)+' — '+dateLabel(end,true);
    const [{progress},calendar]=await Promise.all([request('GET','/api/jelly/progress?start='+start+'&end='+end+'&today='+civil()+(filterCategory?'&category_id='+encodeURIComponent(filterCategory):'')),request('GET','/api/jelly/calendar?start='+start+'&end='+end)]);
    if(seq!==calendarSeq||view!=='progress')return;occurrences=calendar.occurrences||[];const items=occurrences.filter((item)=>matches(item,item.notes));const done=items.filter((item)=>item.completed_at);const open=items.filter((item)=>!item.completed_at);const due=open.filter((item)=>item.end_date<civil());
    const ratio=items.length?Math.round(done.length/items.length*100):0;const displayed=reviewTab==='completed'?done:reviewTab==='overdue'?due:reviewTab==='priority'?open.filter((item)=>['P0','P1'].includes(item.priority)):open;
    const categories=state.categories.map((entry)=>{const all=items.filter((item)=>item.category_id===entry.id);const completed=all.filter((item)=>item.completed_at).length;return all.length?'<div class="jelly-agenda-row">'+categoryDot(entry.id)+'<span>'+esc(entry.name)+'</span><span class="jelly-muted">'+completed+' / '+all.length+' '+tx('已完成')+'</span></div>':'';}).join('');
    keepListScroll(()=>{content.innerHTML='<div class="jelly-choice-row">'+btn('本周','data-jelly-review-period="week" aria-pressed="'+(reviewPeriod==='week')+'"')+btn('本月','data-jelly-review-period="month" aria-pressed="'+(reviewPeriod==='month')+'"')+'</div><div class="jelly-review-summary"><div><strong>'+items.length+'</strong> <span>'+tx('项安排')+'</span></div><div><strong>'+done.length+'</strong> <span>'+tx('已完成')+'</span></div><div><strong>'+due.length+'</strong> <span>'+tx('待补做')+'</span></div><div><strong>'+ratio+'%</strong> <span>'+tx('完成比例')+'</span></div></div><div class="jelly-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+ratio+'"><span style="width:'+ratio+'%"></span></div><p class="jelly-muted">'+tx('重复事项按每次发生统计；跨日事项只计一次。')+'</p><div class="jelly-review-tabs">'+[['completed','已完成'],['open','未完成'],['overdue','延期'],['priority','高优先级'],['categories','分类分布']].map(([tab,label])=>btn(label,'data-jelly-review-tab="'+tab+'" aria-pressed="'+(reviewTab===tab)+'"')).join('')+'</div>'+(reviewTab==='categories'?categories:(reviewTab!=='completed'?bulkBar():'')+(displayed.length?agendaHtml(displayed,reviewTab!=='completed'):'<p class="jelly-muted">'+tx('这个时间段没有对应记录。')+'</p>'));});
  };
`;
