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
    if(plugin==='files') {
      const browser=(${FILES_CLIENT_FACTORY_SCRIPT})({...host,root,standalone:true,openResult,closeResult});
      q('[data-files-browser]').hidden=false;
      q('[data-files-close]').textContent='返回文件列表';
      activate=()=>browser.refresh();
    } else if(plugin==='git') {
      const browser=(${GIT_CLIENT_FACTORY_SCRIPT})({...host,root,openResult,closeResult,refreshWorkspace:()=>activate(),
        showReviews:host.reviewFactory({route:host.route,headers:host.headers,onDecision:outcome=>browser.afterDecision(outcome)})});
      q('[data-git-browser]').hidden=false;q('[data-git-close]').textContent='返回改动列表';
      activate=()=>browser.refresh();
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
