import { CODING_MCP_SETTINGS_CLIENT_SCRIPT } from "./mcp-settings-client.js";
/** Project-owned method installation, bound in both standalone and embedded settings. */
export const CODING_SETTINGS_CLIENT_SCRIPT = `(() => {
  const bind = (scope) => {
    const root=scope.querySelector('[data-coding-method-library]');
    if(!root || root.dataset.bound) return;root.dataset.bound='true';
    const q=selector=>root.querySelector(selector),prefix=root.dataset.prefix+'api/plugins/io.molis.work.coding';
    const status=(text)=>{q('[data-method-library-status]').textContent=text;};
    const api=async(path,body)=>{
      const response=await fetch(prefix+path,{method:body?'POST':'GET',cache:'no-store',...(body?{headers:molisWorkControlHeaders(),body:JSON.stringify(body)}:{})});
      const result=await response.json();if(!response.ok)throw new Error(result.error || '方法操作失败');return result;
    };
    const showBody=(target,name,body,files=[])=>{
      const title=document.createElement('h3');title.textContent=name;
      const source=document.createElement('p');source.textContent=files.length?'包含文件：'+files.join('、'):'';
      const content=document.createElement('pre');content.className='coding-method-body';content.textContent=body;
      target.replaceChildren(title,source,content);
    };
    const refresh=async()=>{
      const state=await api('/state');
      const choice=q('[data-method-workspace]'),previous=choice.value;choice.replaceChildren();
      for(const workspace of state.workspaces){const option=document.createElement('option');option.value=workspace.workspace_id;option.textContent=workspace.canonical_path;choice.append(option);}
      if(state.workspaces.some(item=>item.workspace_id===previous))choice.value=previous;
      q('[data-method-discover]').disabled=!state.workspaces.length;
      const list=q('[data-installed-methods]');list.replaceChildren();
      for(const method of state.methods.filter(item=>item.source==='installed')){
        const row=document.createElement('details'),heading=document.createElement('summary');heading.textContent=method.name+' · v'+method.version;row.append(heading);
        const content=document.createElement('div');row.append(content);
        row.addEventListener('toggle',async()=>{if(!row.open || content.dataset.loaded)return;content.textContent='正在读取…';try{
          const result=await api('/methods/'+encodeURIComponent(method.skill_id)+'/'+method.version);showBody(content,result.method.name,result.method.body);content.dataset.loaded='true';
        }catch(error){content.textContent=error.message;}});list.append(row);
      }
      if(!list.childElementCount)list.textContent='这个项目还没有安装方法。';
      if(q('[data-method-library-status]').textContent==='正在读取项目方法…')status('项目方法已读取。');
      if(!state.workspaces.length)status('先返回 Coding，为这个项目选择并授权工作区。');
    };
    for(const field of [q('[data-method-workspace]'),q('[data-method-path]')])field.addEventListener('input',()=>{
      if(q('[data-method-candidates]').childElementCount){q('[data-method-candidates]').replaceChildren();status('来源已改变，请重新发现方法。');}
    });
    q('[data-method-discovery-form]').addEventListener('submit',async(event)=>{
      event.preventDefault();const button=q('[data-method-discover]');if(button.disabled)return;button.disabled=true;
      const list=q('[data-method-candidates]');list.replaceChildren();status('正在读取候选方法…');
      try{
        const result=await api('/methods/discover',{workspace_id:q('[data-method-workspace]').value,path:q('[data-method-path]').value});
        for(const candidate of result.candidates){
          const row=document.createElement('details'),heading=document.createElement('summary');heading.textContent=candidate.name+' · '+candidate.source_label;row.append(heading);
          const content=document.createElement('div');showBody(content,candidate.name,candidate.body,candidate.files);row.append(content);
          const install=document.createElement('button');install.type='button';install.className='mw-btn mw-btn--primary';install.textContent='安装此版本';install.setAttribute('aria-label','安装方法：'+candidate.name);row.append(install);
          const outcome=document.createElement('p');outcome.setAttribute('role','status');row.append(outcome);
          install.addEventListener('click',async()=>{if(install.disabled)return;install.disabled=true;outcome.textContent='正在扫描并安装…';try{
            const installed=await api('/methods/install',{candidate_id:candidate.candidate_id});
            outcome.textContent='已安装 '+installed.method.name+' · v'+installed.method.version+'；回到会话后在方法菜单中选择。';install.textContent='已安装';
            try{await refresh();}catch(error){outcome.textContent+='目录刷新失败：'+error.message;}
          }catch(error){outcome.textContent=error.message;install.disabled=false;}});list.append(row);
        }
        status(result.candidates.length?'展开候选并阅读正文，安装当前所见内容；源文件变化后需重新发现。':'目录中没有找到 SKILL.md 方法包。');
      }catch(error){status(error.message);}finally{button.disabled=false;}
    });
    void refresh().catch(error=>status('方法目录暂不可读：'+error.message+'。请确认此项目已启用 Coding。'));
  };
  bind(document);
  document.addEventListener('molis-work:settings-embed',event=>bind(event.detail.root));
})();` + CODING_MCP_SETTINGS_CLIENT_SCRIPT;
