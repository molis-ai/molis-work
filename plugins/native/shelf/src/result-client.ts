/**
 * The shelf's exchange with the open project: a shelf copy saved into the project's material after the person checks the whole
 * text, and explicit receipt of fixed project results (connected outputs only nominate candidates).
 */
export const SHELF_RESULT_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const lifetime=ports.lifetime;
  const {workbench:bench,projectPrefix,post,L,applySnapshot,flushEdit,settleEdits,selectedItem,projectTitle}=ports;
  const q=selector=>bench.querySelector(selector),dialog=q('[data-shelf-result-dialog]'),openButton=q('[data-shelf-receive-open]');
  const base=projectPrefix+'/api/plugins/io.molis.work.shelf';
  const get=async(path,fallback)=>{const response=await lifetime.fetch(base+path,{cache:'no-store'});const value=await response.json();lifetime.assertCurrent();if(!response.ok)throw new Error(value.error || fallback);return value;};
  const materialDialog=q('[data-shelf-material-dialog]'),materialStatus=q('[data-shelf-material-status]'),materialSave=q('[data-shelf-material-save]');
  let materialTicket=0,materialPreview=null;
  lifetime.listen(materialDialog,'close',()=>{materialTicket++;materialPreview=null;});
  lifetime.listen(q('[data-shelf-material-close]'),'click',()=>materialDialog.close());
  const openProjectMaterial=async()=>{
    const item=selectedItem();if(!item || !projectPrefix)return;
    const id=item.item_id,token=++materialTicket;materialPreview=null;materialSave.disabled=true;materialStatus.textContent=L('正在读取完整正文…');
    q('[data-shelf-material-body]').textContent='';q('[data-shelf-material-destination]').textContent='';
    if(!materialDialog.open)materialDialog.showModal();
    try{
      await settleEdits();const data=await get('/items/'+encodeURIComponent(id)+'/project-material',L('材料读取失败'));if(token!==materialTicket)return;
      materialPreview={id,fingerprint:data.fingerprint};
      q('[data-shelf-material-destination]').textContent=(projectTitle()?projectTitle()+' / ':'')+data.payload.title;q('[data-shelf-material-body]').textContent=data.payload.text;
      materialStatus.textContent=L('请核对原文后保存。');materialSave.disabled=false;
    }catch(error){if(!lifetime.alive)return;if(token===materialTicket)materialStatus.textContent=error.message;}
  };
  lifetime.listen(q('[data-shelf-project-material]'),'click',openProjectMaterial);
  lifetime.listen(q('[data-shelf-material-refresh]'),'click',openProjectMaterial);
  lifetime.listen(q('[data-shelf-material-form]'),'submit',async event=>{
    event.preventDefault();if(!materialPreview || materialSave.disabled)return;
    const current=materialPreview,token=materialTicket;materialSave.disabled=true;materialStatus.textContent=L('正在保存…');
    try{
      const result=await post(base+'/items/'+encodeURIComponent(current.id)+'/project-material',{expected_fingerprint:current.fingerprint});
      if(token===materialTicket)materialStatus.textContent=L('已存到项目资料')+' · v'+result.reference.version+L('。项目里的 Agent 都能找到它，也可以在输入框的「项目资料」里选它。');
    }catch(error){if(!lifetime.alive)return;if(token===materialTicket){materialStatus.textContent=error.message;materialSave.disabled=false;}}
  });
  if(!dialog || !openButton)return;
  openButton.hidden=!projectPrefix;
  let ticket=0,choices=[],current=null;
  const select=q('[data-shelf-result-choice]'),body=q('[data-shelf-result-body]'),status=q('[data-shelf-result-status]'),receive=q('[data-shelf-result-receive]');
  const preview=async()=>{
    const candidate=choices[Number(select.value)],token=++ticket;current=null;receive.disabled=true;body.textContent='';
    if(!candidate){status.textContent=L('没有可接收的固定报告或固定变更。请先在 Coding 保存成果。');return;}
    status.textContent=L('正在读取完整正文…');
    try{
      const value=await get('/project-result?artifact_id='+encodeURIComponent(candidate.reference.artifact_id)+'&version='+candidate.reference.version,L('成果读取失败'));
      if(token!==ticket)return;
      current=value;body.textContent=value.text;receive.disabled=false;status.textContent=L('接收后成为个人 Shelf 副本；重复接收同一版本会打开已有副本，保留你的编辑。');
    }catch(error){if(!lifetime.alive)return;if(token===ticket)status.textContent=error.message;}
  };
  const load=async()=>{
    const token=++ticket;current=null;receive.disabled=true;select.disabled=true;body.textContent='';status.textContent=L('正在读取项目成果…');
    try{
      await flushEdit();const value=await get('/project-results',L('成果读取失败'));if(token!==ticket)return;
      choices=value.results;select.replaceChildren();
      choices.forEach((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=item.title+' · v'+item.reference.version+(item.connected?' · '+L('当前输出'):'');select.append(option);});
      select.disabled=!choices.length;await preview();
    }catch(error){if(!lifetime.alive)return;if(token===ticket)status.textContent=error.message;}
  };
  lifetime.listen(openButton,'click',()=>{dialog.showModal();void load();});
  lifetime.listen(q('[data-shelf-result-close]'),'click',()=>dialog.close());
  lifetime.listen(q('[data-shelf-result-refresh]'),'click',()=>{void load();});
  lifetime.listen(dialog,'close',()=>{ticket++;current=null;});
  lifetime.listen(select,'change',()=>{void preview();});
  lifetime.listen(q('[data-shelf-result-form]'),'submit',async event=>{
    event.preventDefault();if(!current || receive.disabled)return;
    const value=current,token=ticket;receive.disabled=true;status.textContent=L('正在接收成果…');
    try{
      const result=await post(base+'/project-result',{reference:value.source.reference,expected_fingerprint:value.fingerprint});
      const active=token===ticket;if(active)dialog.close();applySnapshot(result.snapshot,active?result.item.item_id:undefined);
    }catch(error){if(!lifetime.alive)return;if(token===ticket){status.textContent=error.message;receive.disabled=false;}}
  });
}`;
