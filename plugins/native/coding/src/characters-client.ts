/** Exact published selection for the next Run; never derives history from the current library. */
export const CODING_CHARACTERS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const lifetime=host.lifetime;
  const {q,api,current,selections,titles,skillSelections,save,controls,status}=host;
  const dialog=q('[data-coding-character-dialog]'),list=q('[data-coding-character-list]'),error=q('[data-coding-character-error]'),submit=q('[data-coding-character-save]');
  const key=ref=>ref ? JSON.stringify([ref.artifact_id,ref.version]) : '';
  let ticket=0,session='',rows=[],candidate=null,busy=false,selectedSkills=[];
  const close=()=>{if(busy)return;ticket++;dialog.close();};
  const open=async()=>{
    if(!current() || busy)return;
    session=current();const id=session,request=++ticket;
    candidate=structuredClone(selections.get(id) ?? null);selectedSkills=[...(skillSelections.get(id) || [])];rows=[];
    list.textContent=L('coding.character.reading');error.textContent='';submit.disabled=true;dialog.showModal();
    try{
      const data=await api('/sessions/'+encodeURIComponent(id)+'/characters');
      if(request!==ticket || current()!==id || !dialog.open)return;
      rows=data.characters.map(item=>({...item,available:item.available && data.limits_verified,reason:data.limits_verified?item.reason:L('coding.character.runtime')}));
      if(candidate && !rows.some(item=>key(item.reference)===key(candidate)))rows.unshift({reference:candidate,title:titles.get(id) || L('coding.character.gone-title'),available:false,reason:L('coding.character.gone')});
      list.replaceChildren();
      const options=[{reference:null,title:L('coding.character.no-character'),available:true,instructions:L('coding.character.no-character-note')},...rows];
      for(const [index,item] of options.entries()){
        const row=document.createElement('section'),label=document.createElement('label'),radio=document.createElement('input'),name=document.createElement('span');
        row.className='coding-material';label.className='mw-check-row';radio.className='mw-radio';radio.type='radio';radio.name='coding-character-choice';radio.value=String(index);
        radio.checked=key(candidate)===key(item.reference);radio.disabled=!item.available;
        name.textContent=item.title+(item.reference?' · v'+item.reference.version:'');label.append(radio,name);row.append(label);
        lifetime.listen(radio,'change',()=>{if(busy)return;candidate=structuredClone(item.reference);selectedSkills=[];list.querySelectorAll('[data-character-skill]').forEach(input=>{input.checked=false;input.disabled=input.dataset.owner!==key(candidate) || input.dataset.compatible!=='true';});submit.disabled=false;error.textContent='';});
        if(!item.available){const reason=document.createElement('p');reason.textContent=item.reason || L('coding.character.unavailable');row.append(reason);}
        if(item.reference && typeof item.instructions==='string'){
          const detail=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('pre'),scope=document.createElement('p');
          summary.textContent=L('coding.character.content');body.textContent=item.instructions;
          scope.textContent=L('coding.character.tools',{tools:item.host_tools===null?L('coding.character.tools-inherit'):item.host_tools.length?item.host_tools.join(L('coding.list.joiner')):L('coding.character.tools-none')});
          detail.append(summary,body,scope);row.append(detail);
        }
        if(item.imported_skills?.length){
          const skills=document.createElement('details'),summary=document.createElement('summary');summary.textContent=L('coding.character.skills');skills.append(summary);
          for(const skill of item.imported_skills){const label=document.createElement('label'),check=document.createElement('input'),title=document.createElement('span');label.className='mw-check-row';check.type='checkbox';check.className='mw-check';check.dataset.characterSkill=skill.id;check.dataset.owner=key(item.reference);check.dataset.compatible=String(skill.compatibility==='portable');check.disabled=key(candidate)!==key(item.reference) || skill.compatibility!=='portable';check.checked=key(candidate)===key(item.reference) && selectedSkills.includes(skill.id);title.textContent=skill.name+(skill.compatibility!=='portable'?L('coding.character.native'):'');label.append(check,title);skills.append(label);check.onchange=()=>{selectedSkills=check.checked?[...selectedSkills,skill.id]:selectedSkills.filter(id=>id!==skill.id);};}
          row.append(skills);
        }
        list.append(row);
      }
      if(!rows.length){const note=document.createElement('p');note.textContent=L('coding.character.none');list.append(note);}
      submit.disabled=Boolean(candidate && !rows.some(item=>key(item.reference)===key(candidate) && item.available));
    }catch(failure){if(request===ticket && current()===id)error.textContent=failure.message;}
  };
  lifetime.listen(q('[data-coding-character-open]'),'click',()=>void open());
  lifetime.listen(q('[data-coding-character-close]'),'click',close);
  lifetime.listen(dialog,'cancel',event=>{event.preventDefault();close();});
  lifetime.listen(q('[data-coding-character-form]'),'submit',async event=>{
    event.preventDefault();if(busy || submit.disabled)return;
    if(current()!==session){error.textContent=L('coding.character.session-changed');return;}
    const id=session,selected=rows.find(item=>key(item.reference)===key(candidate));
    if(candidate && !selected?.available)return;
    selections.set(id,structuredClone(candidate));skillSelections.set(id,candidate?selectedSkills:[]);titles.set(id,selected?.title || '');controls();
    busy=true;submit.disabled=true;q('[data-coding-character-close]').disabled=true;
    const enabled=[...list.querySelectorAll('input:not(:disabled)')];enabled.forEach(radio=>radio.disabled=true);
    try{await save(id);dialog.close();ticket++;status(L('coding.character.saved'));}
    catch(failure){error.textContent=L('coding.choice.save-failed',{reason:failure.message});}
    finally{busy=false;submit.disabled=false;q('[data-coding-character-close]').disabled=false;enabled.forEach(radio=>radio.disabled=false);}
  });
}`;
