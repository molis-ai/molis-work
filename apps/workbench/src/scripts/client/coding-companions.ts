import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";
import { GIT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-git";

/** Host navigation and project-directory operations; file/Git behavior stays in its plugin. */
export const CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  for (const root of (host.root ? host.root.matches('[data-companion]') ? [host.root] : [] : document.querySelectorAll('[data-companion]'))) {
    const lifetime=host.mountPluginClient(root);if(!lifetime)continue;
    const plugin=root.dataset.companion, q=selector=>root.querySelector(selector);
    const openResult=()=>{root.dataset.companionDetail='true';};
    const closeResult=()=>{root.dataset.companionDetail='false';};
    lifetime.listen(root,'click',event=>{
      const button=event.target.closest('[data-companion-open]');
      if(button)host.openPlugin(button.dataset.companionOpen);
    });
    if(plugin==='files') {
      (${FILES_CLIENT_FACTORY_SCRIPT})({...host,root,openResult,closeResult});
      q('[data-files-browser]').hidden=false;
      q('[data-files-close]').textContent='返回文件列表';
    } else if(plugin==='git') {
      const browser=(${GIT_CLIENT_FACTORY_SCRIPT})({...host,root,openResult,closeResult,
        showReviews:host.reviewFactory({mountPluginClient:host.mountPluginClient,route:host.route,headers:host.headers,onDecision:outcome=>browser.afterDecision(outcome)})});
      q('[data-git-browser]').hidden=false;q('[data-git-close]').textContent='返回改动列表';
    } else {
      let reading=0,viewSignal;
      const activate=async()=>{
        if(!lifetime.visible)return;const signal=viewSignal;
        const ticket=++reading,refresh=q('[data-companion-refresh]'),content=q('[data-companion-content]');refresh.disabled=true;refresh.querySelector('.mw-spinner').hidden=false;content.setAttribute('aria-busy','true');q('[data-companion-status]').textContent='正在读取固定内容…';
        try{const state=await host.request(plugin,'/state','GET',undefined,signal);lifetime.assertCurrent(signal);if(ticket!==reading)return;q('[data-companion-content]').innerHTML=state.html || '';q('[data-companion-status]').textContent='';}
        catch(error){if(!signal.aborted && lifetime.visible && ticket===reading){q('[data-companion-content]').replaceChildren();q('[data-companion-status]').textContent=error.message+'。请点击刷新重试。';}}
        finally{if(lifetime.alive && ticket===reading){refresh.disabled=false;refresh.querySelector('.mw-spinner').hidden=true;content.setAttribute('aria-busy','false');}}
      };
      lifetime.listen(q('[data-companion-refresh]'),'click',()=>void activate());
      lifetime.whenVisible(signal=>{viewSignal=signal;void activate();return()=>{reading++;q('[data-companion-refresh]').disabled=false;q('[data-companion-refresh] .mw-spinner').hidden=true;q('[data-companion-content]').setAttribute('aria-busy','false');};});
    }
  }
}`;
