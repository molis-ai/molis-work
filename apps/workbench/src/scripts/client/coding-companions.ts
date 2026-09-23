import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";
import { GIT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-git";

/** Host navigation and project-directory operations; file/Git behavior stays in its plugin. */
export const CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  for (const root of document.querySelectorAll('[data-companion]')) {
    const plugin=root.dataset.companion, q=selector=>root.querySelector(selector);
    const request=(path,method='GET',body)=>host.request(plugin,path,method,body);
    const openResult=()=>{root.dataset.companionDetail='true';};
    const closeResult=()=>{root.dataset.companionDetail='false';};
    let activate=async()=>{};
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-companion-open]');
      if(button)host.openPlugin(button.dataset.companionOpen);
    });
    if(plugin==='workspace') {
      const status=q('[data-workspace-status]'),list=q('[data-workspace-list]'),form=q('[data-workspace-add]');
      let reading=0, selecting=false;
      activate=async()=>{
        const ticket=++reading,refresh=q('[data-workspace-refresh]');refresh.disabled=true;refresh.querySelector('.mw-spinner').hidden=false;list.setAttribute('aria-busy','true');status.textContent='正在读取工作目录…';
        try {
          const state=await request('/state');if(ticket!==reading)return;
          list.replaceChildren();
          for(const item of state.workspaces){
            const row=document.createElement('button');row.type='button';row.className='mw-dir-row mw-dir-row--meta workspace-choice';row.classList.toggle('is-selected',state.selected===item.workspace_id);
            row.dataset.workspaceChoice=item.workspace_id;row.disabled=!item.available;
            row.setAttribute('aria-pressed',String(state.selected===item.workspace_id));
            const copy=document.createElement('span');copy.className='mw-dir-row__copy';const headline=document.createElement('span');headline.className='mw-dir-row__headline';const name=document.createElement('strong');name.textContent=item.name;const caption=document.createElement('small');caption.textContent=item.available?(state.selected===item.workspace_id?'当前浏览目录':'可用于 Files 与 Git'):'路径不可用';headline.append(name);copy.append(headline,caption);row.append(copy);
            row.addEventListener('click',async()=>{
              if(selecting)return;selecting=true;row.disabled=true;
              try{await request('/select','POST',{workspace_id:item.workspace_id});await activate();}
              catch(error){status.textContent=error.message;}finally{selecting=false;row.disabled=false;}
            });list.append(row);
          }
          status.textContent=state.workspaces.length ? '从列表选择浏览目录，或在下方关联新目录。' : '项目还没有工作目录。关联后即可浏览文件和 Git 改动。';
        }catch(error){if(ticket===reading)status.textContent=error.message+'。请点击刷新重试。';}
        finally{if(ticket===reading){refresh.disabled=false;refresh.querySelector('.mw-spinner').hidden=true;list.setAttribute('aria-busy','false');}}
      };
      q('[data-workspace-refresh]').addEventListener('click',()=>void activate());
      const pick=q('[data-workspace-pick]'),picked=q('[data-workspace-picked]');
      const showPicked=path=>{const input=form.elements.path;input.value=path;picked.textContent=path||'尚未选择';picked.classList.toggle('is-picked',Boolean(path));pick.textContent=path?'重新选择':'选择目录';};
      pick.addEventListener('click',async()=>{
        if(pick.disabled)return;const status=q('[data-workspace-add-status]');
        pick.disabled=true;status.textContent='正在打开目录选择窗口…';
        try{
          const response=await fetch(host.route('/api/workspaces/pick'),{method:'POST',headers:host.headers(),body:'{}'});
          const data=await response.json();if(!response.ok)throw new Error(data.error||'无法打开目录选择窗口');
          if(data.cancelled){status.textContent=form.elements.path.value?'':'未选择目录';return;}
          showPicked(data.path);status.textContent='';
        }catch(error){status.textContent=error.message;}
        finally{pick.disabled=false;}
      });
      form.addEventListener('submit',async event=>{
        event.preventDefault();const button=form.querySelector('button[type=submit]');if(button.disabled)return;
        const input=form.elements.path,confirmed=form.elements.confirmed,status=q('[data-workspace-add-status]');
        if(!input.value.trim()){status.textContent='请先选择目录';return;}
        if(!confirmed.checked){status.textContent='请确认将此目录关联到当前项目';return;}button.disabled=true;status.textContent='正在关联目录…';
        let linked=false;
        try{
          const response=await fetch(host.route('/api/workspaces'),{method:'POST',headers:host.headers(),body:JSON.stringify({workspace_path:input.value.trim(),user_confirmed:true})});
          const data=await response.json();if(!response.ok)throw new Error(data.error || '无法关联工作目录');
          linked=true;showPicked('');confirmed.checked=false;
          await request('/select','POST',{workspace_id:data.workspace.workspace_id});
          status.textContent='目录已关联，可在 Files 和 Git 中浏览。';await activate();
        }catch(error){status.textContent=(linked?'目录已关联，选择浏览目录未完成；请刷新后从列表选择。':'关联未完成，已选目录已保留。')+' '+error.message;}
        finally{button.disabled=false;}
      });
    } else if(plugin==='files') {
      const browser=(${FILES_CLIENT_FACTORY_SCRIPT})({...host,root,standalone:true,openResult,closeResult});
      q('[data-files-browser]').hidden=false;
      q('[data-files-close]').textContent='返回文件列表';
      activate=()=>browser.refresh();
    } else if(plugin==='git') {
      const browser=(${GIT_CLIENT_FACTORY_SCRIPT})({...host,root,openResult,closeResult,refreshWorkspace:()=>activate(),
        showReviews:host.reviewFactory({route:host.route,headers:host.headers,onDecision:outcome=>browser.afterDecision(outcome)})});
      q('[data-git-browser]').hidden=false;q('[data-git-close]').textContent='返回改动列表';
      const choice=q('[data-companion-workspace]');let reading=0;
      const choose=async()=>{
        const ticket=++reading;choice.disabled=true;
        try{if(choice.value)await host.request('workspace','/select','POST',{workspace_id:choice.value});if(ticket===reading)await browser.refresh();}
        catch(error){if(ticket===reading)q('[data-git-status]').textContent=error.message;}
        finally{if(ticket===reading)choice.disabled=false;}
      };
      activate=async()=>{
        const ticket=++reading;
        try{
          const state=await host.request('workspace','/state');if(ticket!==reading)return;
          choice.replaceChildren(new Option('选择已授权工作区',''));
          for(const item of state.workspaces){const option=new Option(item.name+(item.available?'':'（不可用）'),item.workspace_id);option.disabled=!item.available;choice.append(option);}
          choice.value=state.selected || '';await choose();
        }catch(error){if(ticket===reading)q('[data-git-status]').textContent=error.message+'。请刷新重试。';}
      };
      choice.addEventListener('change',()=>void choose());
    } else {
      let reading=0;
      activate=async()=>{
        const ticket=++reading,refresh=q('[data-companion-refresh]'),content=q('[data-companion-content]');refresh.disabled=true;refresh.querySelector('.mw-spinner').hidden=false;content.setAttribute('aria-busy','true');q('[data-companion-status]').textContent='正在读取固定内容…';
        try{const state=await request('/state');if(ticket!==reading)return;q('[data-companion-content]').innerHTML=state.html || '';q('[data-companion-status]').textContent='';}
        catch(error){if(ticket===reading){q('[data-companion-content]').replaceChildren();q('[data-companion-status]').textContent=error.message+'。请点击刷新重试。';}}
        finally{if(ticket===reading){refresh.disabled=false;refresh.querySelector('.mw-spinner').hidden=true;content.setAttribute('aria-busy','false');}}
      };
      q('[data-companion-refresh]').addEventListener('click',()=>void activate());
    }
    let visible=false;
    const sync=()=>{const next=!root.hidden;if(next&&!visible)void activate();visible=next;};
    new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['hidden']});sync();
  }
}`;
