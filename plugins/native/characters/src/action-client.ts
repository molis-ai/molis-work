/** A view of the common Agent catalog; selected references remain in the original Character draft. */
export const CHARACTER_ACTION_CLIENT = `(host) => {
  const {q,request,changed}=host;
  let rows=[],refs=[],busy=false,reading=false;
  const key=ref=>JSON.stringify([ref.capability_id,ref.version,ref.provider_id]);
  const exact=view=>({capability_id:view.capability_id,version:view.version,provider_id:view.provider.provider_id});
  const controls=value=>{busy=value;q('actions-inherit').disabled=busy;q('actions-refresh').disabled=busy || reading;
    q('actions-list').querySelectorAll('input').forEach(input=>input.disabled=busy || input.dataset.available!=='true' && !input.checked);};
  const list=()=>{
    const container=q('actions-list');container.replaceChildren();q('actions-field').hidden=q('actions-inherit').checked;
    const choices=rows.filter(row=>row.action.audiences.includes('agent')).map(row=>({ref:exact(row),title:row.action.title,source:row.provider.title,
      available:row.availability.available,description:row.availability.available?row.action.description:row.availability.reason}));
    for(const ref of refs)if(!choices.some(row=>key(row.ref)===key(ref)))choices.push({ref,title:ref.capability_id,source:ref.provider_id,available:false,description:'原能力、版本或授权不可用；引用保留，可明确移除。'});
    for(const row of choices){const label=document.createElement('label'),input=document.createElement('input'),copy=document.createElement('span');
      label.className='characters-check';input.type='checkbox';input.className='mw-check';input.checked=refs.some(ref=>key(ref)===key(row.ref));input.dataset.available=String(row.available);
      copy.textContent=row.title+' · '+row.source+' · v'+row.ref.version+' — '+row.description;
      input.onchange=()=>{refs=refs.filter(ref=>key(ref)!==key(row.ref));if(input.checked)refs.push(row.ref);changed();};label.append(input,copy);container.append(label);
    }
    if(!choices.length)container.textContent='还没有可用能力。请先在能力服务中为内置 Agent 授权，再刷新目录。';controls(busy);
  };
  const refresh=async()=>{if(reading)return;reading=true;controls(busy);q('actions-status').textContent='正在读取当前项目的能力…';
    try{const data=await request('GET','/actions');rows=data.actions;list();q('actions-status').textContent='目录已更新；选中能力不会自动授权或执行。';}
    catch(error){q('actions-status').textContent=error.message+'；已有选择保持。';}
    finally{reading=false;controls(busy);}
  };
  q('actions-inherit').onchange=()=>{list();changed();};q('actions-refresh').onclick=()=>void refresh();
  return {controls,refresh,value:()=>q('actions-inherit').checked?null:structuredClone(refs),
    render:value=>{refs=structuredClone(value || []);q('actions-inherit').checked=value==null;list();},
    describe:value=>value==null?'沿用任务选择':value.length?value.map(ref=>{const row=rows.find(row=>key(exact(row))===key(ref));return (row?.action.title || ref.capability_id)+' · v'+ref.version+' · '+(row?.provider.title || ref.provider_id);}).join('、'):'不使用动作能力'};
}`;
