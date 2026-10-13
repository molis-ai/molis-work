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
      let read=0,view,index=0;
      const reload=q('[data-companion-refresh]'),body=q('[data-companion-content]'),note=q('[data-companion-status]'),spin=reload.querySelector('.mw-spinner');
      const busy=v=>{reload.disabled=v;spin.hidden=!v;body.setAttribute('aria-busy',String(v));};
      const load=async()=>{
        if(!lifetime.visible)return;const signal=view,id=++read;busy(true);note.textContent='正在读取固定内容…';
        try{const state=await host.request(plugin,'/state'+(plugin==='diff'?'?change_index='+index:''),'GET',undefined,signal);lifetime.assertCurrent(signal);if(id!==read)return;body.innerHTML=state.html||'';note.textContent='';
          body.querySelectorAll('[data-change-index]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.changeIndex)===index)));}
        catch(error){if(!signal.aborted&&lifetime.visible&&id===read){body.replaceChildren();molisWorkRequest.show(note,error);note.append(document.createTextNode('。请点击刷新重试。'));}}
        finally{if(lifetime.alive&&id===read)busy(false);}
      };
      lifetime.listen(root,'click',event=>{const file=event.target.closest('[data-action="diff.show-file"]');if(file){index=Number(file.dataset.changeIndex);void load();}else if(event.target.closest('[data-companion-refresh]'))void load();});
      lifetime.whenVisible(signal=>{view=signal;void load();return()=>{read++;busy(false);};});
    }
  }
}`;
