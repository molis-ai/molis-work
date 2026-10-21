import { CODING_MCP_SETTINGS_CLIENT_SCRIPT } from "./mcp-settings-client.js";
/** Project-owned method installation, bound in both standalone and embedded settings. */
export const CODING_SETTINGS_CLIENT_SCRIPT = `(() => {
  const L=globalThis.L||(key=>key);
  const bind = (scope) => {
    const root=scope.querySelector('[data-coding-method-library]');
    if(!root || root.dataset.bound) return;root.dataset.bound='true';
    const q=selector=>root.querySelector(selector),prefix=root.dataset.prefix+'api/plugins/io.molis.work.coding';
    const status=(text)=>{const node=q('[data-method-library-status]');delete node.dataset.methodLibraryLoading;node.textContent=text;};
    const api=async(path,body)=>{
      const response=await fetch(prefix+path,{method:body?'POST':'GET',cache:'no-store',...(body?{headers:molisWorkControlHeaders(),body:JSON.stringify(body)}:{})});
      const result=await response.json();if(!response.ok)throw new Error(result.error || L('coding.library.failed'));return result;
    };
    const showBody=(target,name,body,files=[])=>{
      const title=document.createElement('h3');title.textContent=name;
      const source=document.createElement('p');source.textContent=files.length?L('coding.library.files',{files:files.join(L('coding.list.joiner'))}):'';
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
        row.addEventListener('toggle',async()=>{if(!row.open || content.dataset.loaded)return;content.textContent=L('coding.library.reading');try{
          const result=await api('/methods/'+encodeURIComponent(method.skill_id)+'/'+method.version);showBody(content,result.method.name,result.method.body);content.dataset.loaded='true';
        }catch(error){content.textContent=error.message;}});list.append(row);
      }
      if(!list.childElementCount)list.textContent=L('coding.library.none');
      if('methodLibraryLoading' in q('[data-method-library-status]').dataset)status(L('coding.library.read'));
      if(!state.workspaces.length)status(L('coding.library.no-workspace'));
    };
    for(const field of [q('[data-method-workspace]'),q('[data-method-path]')])field.addEventListener('input',()=>{
      if(q('[data-method-candidates]').childElementCount){q('[data-method-candidates]').replaceChildren();status(L('coding.library.source-changed'));}
    });
    q('[data-method-discovery-form]').addEventListener('submit',async(event)=>{
      event.preventDefault();const button=q('[data-method-discover]');if(button.disabled)return;button.disabled=true;
      const list=q('[data-method-candidates]');list.replaceChildren();status(L('coding.library.discovering'));
      try{
        const result=await api('/methods/discover',{workspace_id:q('[data-method-workspace]').value,path:q('[data-method-path]').value});
        for(const candidate of result.candidates){
          const row=document.createElement('details'),heading=document.createElement('summary');heading.textContent=candidate.name+' · '+candidate.source_label;row.append(heading);
          const content=document.createElement('div');showBody(content,candidate.name,candidate.body,candidate.files);row.append(content);
          const install=document.createElement('button');install.type='button';install.className='mw-btn mw-btn--primary';install.textContent=L('coding.library.install');install.setAttribute('aria-label',L('coding.library.install-label',{name:candidate.name}));row.append(install);
          const outcome=document.createElement('p');outcome.setAttribute('role','status');row.append(outcome);
          install.addEventListener('click',async()=>{if(install.disabled)return;install.disabled=true;outcome.textContent=L('coding.library.installing');try{
            const installed=await api('/methods/install',{candidate_id:candidate.candidate_id});
            outcome.textContent=L('coding.library.installed',{name:installed.method.name,version:installed.method.version});install.textContent=L('coding.library.installed-button');
            try{await refresh();}catch(error){outcome.textContent+=L('coding.library.refresh-failed',{reason:error.message});}
          }catch(error){outcome.textContent=error.message;install.disabled=false;}});list.append(row);
        }
        status(result.candidates.length?L('coding.library.candidates'):L('coding.library.no-candidates'));
      }catch(error){status(error.message);}finally{button.disabled=false;}
    });
    void refresh().catch(error=>status(L('coding.library.unreadable',{reason:error.message})));
  };
  bind(document);
  document.addEventListener('molis-work:settings-embed',event=>bind(event.detail.root));
})();` + CODING_MCP_SETTINGS_CLIENT_SCRIPT;
