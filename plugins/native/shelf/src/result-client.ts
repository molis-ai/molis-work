/** Explicit receipt of fixed project results; connected outputs only nominate candidates. */
export const SHELF_RESULT_CLIENT_FACTORY_SCRIPT = `(ports) => {
  const {workbench,projectPrefix,post,L,applySnapshot,flushEdit}=ports;
  const q=selector=>workbench.querySelector(selector),dialog=q('[data-shelf-result-dialog]'),openButton=q('[data-shelf-receive-open]');
  if(!dialog || !openButton)return;
  openButton.hidden=!projectPrefix;
  let ticket=0,choices=[],current=null;
  const select=q('[data-shelf-result-choice]'),body=q('[data-shelf-result-body]'),status=q('[data-shelf-result-status]'),receive=q('[data-shelf-result-receive]');
  const base=projectPrefix+'/api/plugins/io.molis.work.shelf';
  const get=async path=>{const response=await fetch(base+path,{cache:'no-store'});const value=await response.json();if(!response.ok)throw new Error(value.error || L('成果读取失败'));return value;};
  const preview=async()=>{
    const candidate=choices[Number(select.value)],token=++ticket;current=null;receive.disabled=true;body.textContent='';
    if(!candidate){status.textContent=L('没有可接收的固定报告或固定变更。请先在 Coding 保存成果。');return;}
    status.textContent=L('正在读取完整正文…');
    try{
      const value=await get('/project-result?artifact_id='+encodeURIComponent(candidate.reference.artifact_id)+'&version='+candidate.reference.version);
      if(token!==ticket)return;
      current=value;body.textContent=value.text;receive.disabled=false;status.textContent=L('接收后成为个人 Shelf 副本；重复接收同一版本会打开已有副本，保留你的编辑。');
    }catch(error){if(token===ticket)status.textContent=error.message;}
  };
  const load=async()=>{
    const token=++ticket;current=null;receive.disabled=true;select.disabled=true;body.textContent='';status.textContent=L('正在读取项目成果…');
    try{
      await flushEdit();const value=await get('/project-results');if(token!==ticket)return;
      choices=value.results;select.replaceChildren();
      choices.forEach((item,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=item.title+' · v'+item.reference.version+(item.connected?' · '+L('当前输出'):'');select.append(option);});
      select.disabled=!choices.length;await preview();
    }catch(error){if(token===ticket)status.textContent=error.message;}
  };
  openButton.addEventListener('click',()=>{dialog.showModal();void load();});
  q('[data-shelf-result-close]').addEventListener('click',()=>dialog.close());
  q('[data-shelf-result-refresh]').addEventListener('click',()=>{void load();});
  dialog.addEventListener('close',()=>{ticket++;current=null;});
  select.addEventListener('change',()=>{void preview();});
  q('[data-shelf-result-form]').addEventListener('submit',async event=>{
    event.preventDefault();if(!current || receive.disabled)return;
    const value=current,token=ticket;receive.disabled=true;status.textContent=L('正在接收成果…');
    try{
      const result=await post(base+'/project-result',{reference:value.source.reference,expected_fingerprint:value.fingerprint});
      const active=token===ticket;if(active)dialog.close();applySnapshot(result.snapshot,active?result.item.item_id:undefined);
    }catch(error){if(token===ticket){status.textContent=error.message;receive.disabled=false;}}
  });
}`;
