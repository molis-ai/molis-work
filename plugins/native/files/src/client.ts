/** Companion navigation is supplied by the Workbench composition, not imported from another plugin. */
export const FILES_CLIENT_FACTORY_SCRIPT = `(host) => {
  const directory=document.querySelector('[data-files-browser]'), result=document.querySelector('[data-files-results]');
  if(!directory || !result)return null;
  const q=selector=>result.querySelector(selector), choice=directory.querySelector('[data-files-workspace]'), tree=directory.querySelector('[data-files-tree]');
  const notice=message=>{directory.querySelector('[data-files-status]').textContent=message;};
  let workspace='', current=null, generation=0, readTicket=0, captureBusy=false, loaded=false;
  const text=q('[data-files-text]');
  const request=(path,method='GET',body)=>host.request('files',path,method,body);
  const controls=()=>{q('[data-files-copy]').disabled=!current || captureBusy;q('[data-files-capture="before"]').disabled=!current || captureBusy;q('[data-files-capture="after"]').disabled=!current || captureBusy;q('[data-files-capture="selection"]').disabled=!current || captureBusy || text.selectionEnd<=text.selectionStart;};
  const clear=()=>{current=null;readTicket++;text.value='';text.hidden=true;q('[data-files-title]').textContent='选择一个文件';q('[data-files-notice]').textContent='从左侧文件目录选择要读取的文件。';controls();};
  const errors={missing:'文件或目录已不存在，请刷新',denied:'此路径不可读取；请检查目录授权，符号链接不会被跟随',unsupported:'这不是可预览的 UTF-8 普通文本文件',binary:'这是二进制文件，无法作为文本预览',changed:'文件在读取时改变，请刷新后重试'};
  async function companions(ticket=generation){
    const [stats,diff]=await Promise.all([host.request('text-stats','/state'),host.request('diff','/state')]);
    if(ticket!==generation)return;
    q('[data-files-stats]').innerHTML=stats.html || '';q('[data-files-diff]').innerHTML=diff.html || '';
  }
  async function openFile(path){
    const ticket=++readTicket, epoch=generation, id=workspace;
    current=null;controls();text.hidden=true;q('[data-files-title]').textContent=path.join('/');q('[data-files-notice]').textContent='正在读取…';
    try{
      const value=await request('/open','POST',{workspace_id:id,path});
      if(ticket!==readTicket || epoch!==generation)return;
      if(value.result.outcome==='text'){
        current={workspace_id:id,path,fingerprint:value.result.fingerprint};text.value=value.result.text;text.hidden=false;text.scrollTop=0;text.scrollLeft=0;
        q('[data-files-notice]').textContent=text.value.length?'本次读取的内容 · 只读；修改后可刷新':'这个文件是空的；仍可固定快照。';
      }else q('[data-files-notice]').textContent=value.result.outcome==='too-large'?'文件超过预览上限（'+value.result.limit+' 字节）':errors[value.result.outcome] || '读取失败，请重试';
      tree.querySelectorAll('[data-file-path]').forEach(button=>button.setAttribute('aria-current',String(button.dataset.filePath===JSON.stringify(path))));controls();
    }catch(error){if(ticket===readTicket && epoch===generation){q('[data-files-notice]').textContent=error.message;controls();}}
  }
  async function list(path,container,ticket=generation){
    const id=workspace;
    const value=await request('/directory?workspace_id='+encodeURIComponent(id)+'&path='+encodeURIComponent(JSON.stringify(path)));
    if(ticket!==generation)return;
    if(value.result.outcome!=='directory')throw new Error(errors[value.result.outcome] || '无法读取这个目录');
    const ul=document.createElement('ul');
    for(const entry of value.result.entries){
      const li=document.createElement('li'), button=document.createElement('button');button.type='button';button.className='mw-btn mw-btn--ghost';button.textContent=entry.name;button.title=entry.path.join('/');button.dataset.filePath=JSON.stringify(entry.path);li.append(button);
      const label=document.createElement('span');label.textContent=entry.name;button.innerHTML=host.icons?.[entry.kind==='directory'?'folder':'file'] || '';button.append(label);
      if(entry.kind==='directory'){
        button.setAttribute('aria-expanded','false');const children=document.createElement('div');children.hidden=true;li.append(children);
        button.addEventListener('click',async()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));children.hidden=!expanded;if(!expanded || children.querySelector('ul'))return;button.disabled=true;try{await list(entry.path,children,ticket);}catch(error){children.textContent=error.message;}finally{button.disabled=false;}});
      }else if(entry.kind==='file')button.addEventListener('click',()=>{host.openResult();result.hidden=false;void openFile(entry.path);});
      else{button.disabled=true;button.title+=' · 非普通文件';}
      ul.append(li);
    }
    container.replaceChildren(ul);
    if(!value.result.entries.length){const empty=document.createElement('p');empty.textContent='这个目录是空的';container.append(empty);}
    if(value.result.truncated){const hint=document.createElement('p');hint.textContent='目录较大，仅显示前 1000 个可访问条目';container.append(hint);}
  }
  async function choose(id){
    const ticket=++generation;workspace=id;clear();tree.replaceChildren();notice(id?'正在读取目录…':'请选择工作区');choice.disabled=true;
    try{
      if(!id)return;
      await host.request('workspace','/select','POST',{workspace_id:id});
      if(ticket!==generation)return;
      host.onWorkspaceSelected?.(id);
      await list([],tree,ticket);
      if(ticket!==generation)return;
      notice('');const state=await request('/state');
      if(ticket!==generation)return;
      if(state.position?.workspace_id===id)await openFile(state.position.path);
      await companions(ticket);
    }catch(error){if(ticket===generation){clear();tree.replaceChildren();notice(error.message);}}
    finally{if(ticket===generation)choice.disabled=false;}
  }
  async function load(){
    notice('正在读取工作区…');
    try{
      const state=await host.request('workspace','/state');choice.replaceChildren();
      const blank=document.createElement('option');blank.value='';blank.textContent='选择已授权工作区';choice.append(blank);
      for(const item of state.workspaces){const option=document.createElement('option');option.value=item.workspace_id;option.textContent=item.name+(item.available?'':'（不可用）');option.disabled=!item.available;choice.append(option);}
      choice.value=state.selected || '';loaded=true;await choose(choice.value);
      if(!state.workspaces.length)notice('项目还没有工作目录。可从会话上方的“工作区”关联。');
    }catch(error){notice(error.message);}
  }
  choice.addEventListener('change',()=>void choose(choice.value));
  directory.querySelector('[data-files-refresh]').addEventListener('click',()=>void load());
  for(const name of ['select','keyup','mouseup'])text.addEventListener(name,controls);
  q('[data-files-close]').addEventListener('click',()=>{result.hidden=true;host.closeResult();});
  q('[data-files-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);q('[data-files-capture-status]').textContent='文件正文已复制。';}catch{q('[data-files-capture-status]').textContent='复制失败，可在正文中手动选择并复制。';}});
  result.querySelectorAll('[data-files-capture]').forEach(button=>button.addEventListener('click',async()=>{
    if(!current || captureBusy)return;
    const saved={...current},epoch=generation,ticket=readTicket,port=button.dataset.filesCapture;
    const range={start:text.selectionStart,end:text.selectionEnd};captureBusy=true;controls();
    try{
      const value=await request('/capture','POST',{...saved,port,...range});
      if(epoch!==generation || ticket!==readTicket)return;
      q('[data-files-capture-status]').textContent=(port==='before'?'对比前':port==='after'?'对比后':'选区')+'已固定 · v'+value.saved.artifact.version+' · '+saved.path.join('/');
      await companions(epoch);
    }catch(error){if(epoch===generation && ticket===readTicket)q('[data-files-capture-status]').textContent=error.message;}
    finally{captureBusy=false;controls();}
  }));
  return {show(face){
    if(!['files','sessions'].includes(face))return false;
    const visible=face==='files';directory.hidden=!visible;result.hidden=!visible;
    if(visible){host.openResult();if(!loaded)void load();}else host.closeResult();
    return true;
  }};
}`;
