import { CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT } from "./coding-companions.js";
import { GIT_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-git";
import { CODING_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-coding";
import { FILES_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-files";
import { icon } from "@molis-ai/molis-work-design-system";
import { AGENT_REVIEW_CLIENT_FACTORY_SCRIPT } from "./agent-review.js";

/** Original Coding/companion wiring, loaded through their existing catalog entries. */
export const CODING_WORKBENCH_SETUP_SCRIPT = `(host) => {
  const { mountPluginClient, route, translate: L } = host;
  const molisWorkControlHeaders = host.headers;
  const tabWorkspace = { openItem: host.openItem, openBeside: host.openBeside, openPlugin: host.openPlugin };
  const immersiveNavigation = { hideDirectory: host.hideDirectory };
  // Coding and its companions share one copy of each plugin client they call: written once, called where each needs it.
  const reviewFactory = (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT}), gitFactory = (${GIT_CLIENT_FACTORY_SCRIPT}), filesFactory = (${FILES_CLIENT_FACTORY_SCRIPT});
    const companionRequest = (plugin,path,method="GET",body,signal) => molisWorkRequest(route('/api/plugins/io.molis.work.'+plugin+path),{method,body:method==='GET'?undefined:body??{},signal,fallback:'无法读取文件工作区'});
    const codingRoot = host.root.matches("[data-coding-workbench]") ? host.root : null;
    const openCompanionResult = (name) => {
      if(codingRoot){codingRoot.dataset.codingDetail="true";codingRoot.dataset.codingResults="true";}
      codingRoot?.querySelector('[data-coding-tools]')?.setAttribute('data-companion-open','true');
      for(const kind of ['files','git']) { const panel=codingRoot?.querySelector('[data-'+kind+'-results]'); if(panel)panel.hidden=kind!==name; }
    };
    const closeCompanionResult = () => {
      codingRoot?.querySelector('[data-coding-tools]')?.removeAttribute('data-companion-open');
      if(codingRoot){codingRoot.dataset.codingResults='false';if(!codingRoot.querySelector('[data-coding-session][aria-current="true"]'))codingRoot.dataset.codingDetail='false';}
    };
    const gitBrowser = codingRoot ? gitFactory({mountPluginClient,root:codingRoot,request:companionRequest,openResult:()=>openCompanionResult('git'),closeResult:closeCompanionResult,
      showReviews: reviewFactory({mountPluginClient,route,headers:()=>molisWorkControlHeaders(),onDecision:outcome=>gitBrowser?.afterDecision(outcome)})}) : null;
    const filesBrowser = codingRoot ? filesFactory({mountPluginClient,root:codingRoot,
      icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      request: companionRequest,
      onWorkspaceSelected: () => { void gitBrowser?.refresh(); },
      openResult: () => openCompanionResult('files'),
      closeResult: closeCompanionResult,
    }) : null;
    (${CODING_CLIENT_FACTORY_SCRIPT})({ mountPluginClient, interaction: host.interaction, receipts: host.receipts,
      revealTask: () => { if(matchMedia("(max-width: 600px)").matches) immersiveNavigation?.hideDirectory(); closeCompanionResult(); },
      onDirectoryFace: face => { const handled=filesBrowser?.show(face) ?? false; gitBrowser?.show(face); return handled; },
      showReviews: reviewFactory({mountPluginClient,route,headers:()=>molisWorkControlHeaders()}),
      addWorkspace: async (workspace_path) => {
        const result=await molisWorkRequest(route("/api/workspaces"),{body:{workspace_path,user_confirmed:true},fallback:"无法关联工作区"});
        return result.workspace;
      },
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      openBeside: (plugin, id, title) => tabWorkspace?.openBeside(plugin, id, title),
    });
    (${CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT})({
      root: host.root, mountPluginClient,
      request: companionRequest, route, icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      openPlugin: plugin => tabWorkspace?.openPlugin(plugin),
      reviewFactory, gitFactory, filesFactory,
      headers: () => molisWorkControlHeaders(),
    });

}`;
