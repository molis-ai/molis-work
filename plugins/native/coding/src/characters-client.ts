/** Exact published selection for the next Run; never derives history from the current library. */
export const CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const {q,api,current,selections,titles,save,controls,status}=host;
  const dialog=q('[data-coding-character-dialog]'),list=q('[data-coding-character-list]'),error=q('[data-coding-character-error]'),submit=q('[data-coding-character-save]');
  const key=ref=>ref ? JSON.stringify([ref.artifact_id,ref.version]) : '';
  let ticket=0,session='',rows=[],candidate=null,busy=false;
  const close=()=>{if(busy)return;ticket++;dialog.close();};
  const open=async()=>{
    if(!current() || busy)return;
    session=current();const id=session,request=++ticket;
    candidate=structuredClone(selections.get(id) ?? null);rows=[];
    list.textContent='正在读取已发布角色…';error.textContent='';submit.disabled=true;dialog.showModal();
    try{
      const data=await api('/sessions/'+encodeURIComponent(id)+'/characters');
      if(request!==ticket || current()!==id || !dialog.open)return;
      rows=data.characters.map(item=>({...item,available:item.available && data.runtime_id==='prologue',reason:data.runtime_id==='prologue'?item.reason:'当前执行引擎尚不支持角色限制，请选择不使用角色。'}));
      if(candidate && !rows.some(item=>key(item.reference)===key(candidate)))rows.unshift({reference:candidate,title:titles.get(id) || '原角色版本暂不可读',available:false,reason:'原引用不在可读版本中。请明确移除或改选；任务草稿保持。'});
      list.replaceChildren();
      const options=[{reference:null,title:'不使用角色',available:true,instructions:'沿用 Coding 原有身份与任务方式。'},...rows];
      for(const [index,item] of options.entries()){
        const row=document.createElement('section'),label=document.createElement('label'),radio=document.createElement('input'),name=document.createElement('span');
        row.className='coding-material';label.className='mw-check-row';radio.className='mw-radio';radio.type='radio';radio.name='coding-character-choice';radio.value=String(index);
        radio.checked=key(candidate)===key(item.reference);radio.disabled=!item.available;
        name.textContent=item.title+(item.reference?' · v'+item.reference.version:'');label.append(radio,name);row.append(label);
        radio.addEventListener('change',()=>{if(busy)return;candidate=structuredClone(item.reference);submit.disabled=false;error.textContent='';});
        if(!item.available){const reason=document.createElement('p');reason.textContent=item.reason || '此版本不可用';row.append(reason);}
        if(item.reference && typeof item.instructions==='string'){
          const detail=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre'),scope=document.createElement('p');
          summary.textContent='查看固定内容';body.textContent=item.instructions;
          scope.textContent='内置工具：'+(item.host_tools===null?'沿用当前任务方式':item.host_tools.length?item.host_tools.join('、'):'不使用内置工具')+'。MCP 仍由调用方单独选择并审查。';
          detail.append(summary,body,scope);row.append(detail);
        }
        list.append(row);
      }
      if(!rows.length){const note=document.createElement('p');note.textContent='还没有已发布角色。可从左侧 Characters 编辑并发布到当前项目。';list.append(note);}
      submit.disabled=Boolean(candidate && !rows.some(item=>key(item.reference)===key(candidate) && item.available));
    }catch(failure){if(request===ticket && current()===id)error.textContent=failure.message;}
  };
  q('[data-coding-character-open]').addEventListener('click',()=>void open());
  q('[data-coding-character-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  q('[data-coding-character-form]').addEventListener('submit',async event=>{
    event.preventDefault();if(busy || submit.disabled)return;
    if(current()!==session){error.textContent='会话已切换，请关闭后为当前会话重新选择。';return;}
    const id=session,selected=rows.find(item=>key(item.reference)===key(candidate));
    if(candidate && !selected?.available)return;
    selections.set(id,structuredClone(candidate));titles.set(id,selected?.title || '');controls();
    busy=true;submit.disabled=true;q('[data-coding-character-close]').disabled=true;
    const enabled=[...list.querySelectorAll('input:not(:disabled)')];enabled.forEach(radio=>radio.disabled=true);
    try{await save(id);dialog.close();ticket++;status('角色选择已保存，仅用于下一轮；在跑任务保持原角色。');}
    catch(failure){error.textContent=failure.message+'；选择仍保留在此窗口，可重试保存。';}
    finally{busy=false;submit.disabled=false;q('[data-coding-character-close]').disabled=false;enabled.forEach(radio=>radio.disabled=false);}
  });
}`;
