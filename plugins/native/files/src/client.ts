/** Companion navigation is supplied by the Workbench composition, not imported from another plugin. */
export const FILES_CLIENT_FACTORY_SCRIPT = `(host) => {
  const scope=host.root || document;
  const directory=scope.querySelector('[data-files-browser]'), result=scope.querySelector('[data-files-results]');
  if(!directory || !result)return null;
  const lifetime=host.mountPluginClient(directory);if(!lifetime)return null;
  let viewSignal,initialRead=true;
  const q=selector=>result.querySelector(selector), tree=directory.querySelector('[data-files-tree]');
  const notice=message=>{directory.querySelector('[data-files-status]').textContent=message;};
  let opener=null,selectedPath=null;
  const refresh=directory.querySelector('[data-files-refresh]'),reload=q('[data-files-reload]');
  let workspace='', current=null, generation=0, readTicket=0, captureBusy=false, loadingTicket=0;
  const text=q('[data-files-text]');
  const active=epoch=>lifetime.alive && lifetime.visible && !viewSignal?.aborted && epoch===generation;
  const requestPlugin=async(plugin,path,method='GET',body)=>{
    const signal=viewSignal;lifetime.assertCurrent(signal);
    if(!signal || !lifetime.visible)throw new DOMException('View hidden','AbortError');
    const value=await host.request(plugin,path,method,body,method==='GET'?signal:lifetime.signal);
    lifetime.assertCurrent(signal);return value;
  };
  const request=(path,method='GET',body)=>requestPlugin('files',path,method,body);
  const controls=()=>{const length=text.selectionEnd-text.selectionStart;q('[data-files-selection-hint]').textContent=length && current ? '已选择 '+length+' 个字符' : '在正文中选择片段后可保存选区';q('[data-files-copy]').disabled=!current || captureBusy;q('[data-files-capture="before"]').disabled=!current || captureBusy;q('[data-files-capture="after"]').disabled=!current || captureBusy;q('[data-files-capture="selection"]').disabled=!current || captureBusy || text.selectionEnd<=text.selectionStart;};
  const clear=()=>{current=null;selectedPath=null;reload.disabled=true;readTicket++;text.value='';text.hidden=true;q('[data-files-title]').textContent='选择一个文件';q('[data-files-notice]').textContent='从左侧文件目录选择要读取的文件。';controls();};
  const errors={missing:'文件或目录已不存在，请刷新',denied:'此路径不可读取；请检查目录授权，符号链接不会被跟随',unsupported:'这不是可预览的 UTF-8 普通文本文件',binary:'这是二进制文件，无法作为文本预览',changed:'文件在读取时改变，请刷新后重试'};
  async function companions(ticket=generation){
    const [stats,diff]=await Promise.all([requestPlugin('text-stats','/state'),requestPlugin('diff','/state')]);
    if(!active(ticket))return;
    q('[data-files-stats]').innerHTML=stats.html || '';q('[data-files-diff]').innerHTML=diff.html || '';
  }
  async function openFile(path){
    const ticket=++readTicket, epoch=generation, id=workspace;
    current=null;selectedPath=path;reload.disabled=true;result.setAttribute('aria-busy','true');controls();text.hidden=true;q('[data-files-title]').textContent=path.join('/');q('[data-files-notice]').textContent='正在读取…';
    try{
      const value=await request('/open','POST',{workspace_id:id,path});
      if(ticket!==readTicket || !active(epoch))return;
      if(value.result.outcome==='text'){
        current={workspace_id:id,path,fingerprint:value.result.fingerprint};text.value=value.result.text;text.hidden=false;text.scrollTop=0;text.scrollLeft=0;
        q('[data-files-notice]').textContent=text.value.length?'本次读取的内容 · 只读；修改后可刷新':'这个文件是空的；仍可固定快照。';
      }else q('[data-files-notice]').textContent=value.result.outcome==='too-large'?'文件超过预览上限（'+value.result.limit+' 字节）':errors[value.result.outcome] || '读取失败，请重试';
      tree.querySelectorAll('[data-file-path]').forEach(button=>{const active=button.dataset.filePath===JSON.stringify(path);button.setAttribute('aria-current',String(active));button.classList.toggle('is-selected',active);});controls();
    }catch(error){if(ticket===readTicket && active(epoch)){q('[data-files-notice]').textContent=error.message+'。可点击重读重试。';controls();}}
    finally{if(ticket===readTicket && active(epoch)){result.setAttribute('aria-busy','false');reload.disabled=false;}}
  }
  async function list(path,container,ticket=generation){
    const id=workspace;
    const value=await request('/directory?workspace_id='+encodeURIComponent(id)+'&path='+encodeURIComponent(JSON.stringify(path)));
    if(!active(ticket))return;
    if(value.result.outcome!=='directory')throw new Error(errors[value.result.outcome] || '无法读取这个目录');
    const ul=document.createElement('ul');
    for(const entry of value.result.entries){
      const li=document.createElement('li'), button=document.createElement('button');button.type='button';button.className='mw-dir-row mw-dir-row--compact';button.textContent=entry.name;button.title=entry.path.join('/');button.dataset.filePath=JSON.stringify(entry.path);li.append(button);
      const mark=document.createElement('span');mark.className='mw-dir-row__icon';mark.innerHTML=host.icons?.[entry.kind==='directory'?'folder':'file'] || '';
      const copy=document.createElement('span');copy.className='mw-dir-row__copy';const headline=document.createElement('span');headline.className='mw-dir-row__headline';const label=document.createElement('strong');label.textContent=entry.name;headline.append(label);copy.append(headline);button.replaceChildren(mark,copy);
      if(entry.kind==='directory'){
        button.setAttribute('aria-expanded','false');const children=document.createElement('div');children.hidden=true;li.append(children);
        lifetime.listen(button,'click',async()=>{const expanded=button.getAttribute('aria-expanded')!=='true';button.setAttribute('aria-expanded',String(expanded));children.hidden=!expanded;if(!expanded || children.querySelector('ul'))return;button.disabled=true;try{await list(entry.path,children,ticket);}catch(error){if(active(ticket))children.textContent=error.message;}finally{if(lifetime.alive)button.disabled=false;}});
      }else if(entry.kind==='file')lifetime.listen(button,'click',()=>{opener=button;host.openResult();result.hidden=false;result.classList.add('is-arriving');q('[data-files-close]').focus({preventScroll:true});void openFile(entry.path);});
      else{button.disabled=true;button.title+=' · 非普通文件';}
      ul.append(li);
    }
    container.replaceChildren(ul);
    if(!value.result.entries.length){const empty=document.createElement('p');empty.textContent='这个目录是空的';container.append(empty);}
    if(value.result.truncated){const hint=document.createElement('p');hint.textContent='目录较大，仅显示前 1000 个可访问条目';container.append(hint);}
  }
  async function choose(id){
    const ticket=++generation;workspace=id;clear();tree.replaceChildren();notice(id?'正在读取目录…':'请选择工作区');
    try{
      if(!id)return;
      if(!active(ticket))return;
      host.onWorkspaceSelected?.(id);
      await list([],tree,ticket);
      if(!active(ticket))return;
      notice('');const state=await request('/state');
      if(!active(ticket))return;
      if(state.position?.workspace_id===id)await openFile(state.position.path);
      if(!active(ticket))return;await companions(ticket);
    }catch(error){if(active(ticket)){clear();tree.replaceChildren();notice(error.message);}}

  }
  async function load(){
    if(!lifetime.visible || refresh.disabled)return;const serial=++loadingTicket;refresh.disabled=true;refresh.toggleAttribute('data-loading',true);refresh.querySelector('.mw-spinner').hidden=false;tree.setAttribute('aria-busy','true');
    notice('正在读取工作区…');
    try{
      const state=await request('/state');if(serial!==loadingTicket)return;await choose(state.workspace?.workspace_id || '');

    }catch(error){if(lifetime.visible && serial===loadingTicket){workspace="";clear();tree.replaceChildren();notice(error.message);}}
    finally{if(lifetime.alive && serial===loadingTicket)resetLoading();}
  }
  lifetime.listen(reload,'click',()=>{if(selectedPath)void openFile(selectedPath);});
  lifetime.listen(refresh,'click',()=>void load());
  for(const name of ['select','keyup','mouseup'])lifetime.listen(text,name,controls);
  lifetime.listen(q('[data-files-close]'),'click',()=>{result.hidden=true;result.classList.remove('is-arriving');host.closeResult();if(opener?.isConnected)opener.focus({preventScroll:true});});
  lifetime.listen(q('[data-files-copy]'),'click',async()=>{const epoch=generation;try{await navigator.clipboard.writeText(text.value);if(!active(epoch))return;q('[data-files-capture-status]').textContent='文件正文已复制。';q('[data-files-copy]').textContent='已复制';lifetime.timeout(()=>{if(active(epoch))q('[data-files-copy]').textContent='复制全文';},1800);}catch{if(active(epoch))q('[data-files-capture-status]').textContent='复制失败，可在正文中手动选择并复制。';}});
  result.querySelectorAll('[data-files-capture]').forEach(button=>lifetime.listen(button,'click',async()=>{
    if(!current || captureBusy)return;
    const saved={...current},epoch=generation,ticket=readTicket,port=button.dataset.filesCapture;
    const range={start:text.selectionStart,end:text.selectionEnd};captureBusy=true;button.toggleAttribute('data-loading',true);const spinner=document.createElement('span');spinner.className='mw-spinner';spinner.setAttribute('aria-hidden','true');button.prepend(spinner);controls();
    try{
      const value=await request('/capture','POST',{...saved,port,...range});
      if(!active(epoch) || ticket!==readTicket)return;
      q('[data-files-capture-status]').textContent=(port==='before'?'对比前':port==='after'?'对比后':'选区')+'已固定 · v'+value.saved.artifact.version+' · '+saved.path.join('/');
      await companions(epoch);
    }catch(error){if(active(epoch) && ticket===readTicket)q('[data-files-capture-status]').textContent=error.message;}
    finally{captureBusy=false;if(lifetime.alive){button.removeAttribute('data-loading');spinner.remove();controls();}}
  }));
  function resetLoading(){refresh.disabled=false;refresh.removeAttribute('data-loading');refresh.querySelector('.mw-spinner').hidden=true;tree.setAttribute('aria-busy','false');}
  lifetime.whenVisible(signal=>{
    viewSignal=signal;initialRead=true;q('[data-files-copy]').textContent='复制全文';refresh.disabled=true;refresh.toggleAttribute('data-loading',true);refresh.querySelector('.mw-spinner').hidden=false;tree.setAttribute('aria-busy','true');notice('正在读取工作区…');
    return ()=>{generation++;readTicket++;loadingTicket++;result.setAttribute('aria-busy','false');resetLoading();};
  });
  lifetime.watchRevision(signal=>host.request('files','/view-revision','GET',undefined,signal),async()=>{
    if(captureBusy || refresh.disabled && !initialRead)return false;
    initialRead=false;resetLoading();await load();
  });
  return {refresh:load,show(face){
    if(!['files','sessions'].includes(face))return false;
    const visible=face==='files';directory.hidden=!visible;if(!visible)result.hidden=true;
    if(!visible)host.closeResult();
    return true;
  }};
}`;
