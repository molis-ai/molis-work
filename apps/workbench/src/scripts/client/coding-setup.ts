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
    const companionRequest = async (plugin, path, method = "GET", body, signal) => {
        const response = await fetch(route('/api/plugins/io.molis.work.' + plugin + path), {method,cache:'no-store',signal,
          ...(method==='GET'?{}:{headers:molisWorkControlHeaders(),body:JSON.stringify(body ?? {})})});
        const result = await response.json();signal?.throwIfAborted();
        if(!response.ok)throw new Error(result.error || '无法读取文件工作区');
        return result;
      };
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
    const gitBrowser = codingRoot ? (${GIT_CLIENT_FACTORY_SCRIPT})({mountPluginClient,root:codingRoot,request:companionRequest,openResult:()=>openCompanionResult('git'),closeResult:closeCompanionResult,
      showReviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({mountPluginClient,route,headers:()=>molisWorkControlHeaders(),onDecision:outcome=>gitBrowser?.afterDecision(outcome)})}) : null;
    const filesBrowser = codingRoot ? (${FILES_CLIENT_FACTORY_SCRIPT})({mountPluginClient,root:codingRoot,
      icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      request: companionRequest,
      onWorkspaceSelected: () => { void gitBrowser?.refresh(); },
      openResult: () => openCompanionResult('files'),
      closeResult: closeCompanionResult,
    }) : null;
    (${CODING_CLIENT_FACTORY_SCRIPT})({ mountPluginClient,
      revealTask: () => { if(matchMedia("(max-width: 600px)").matches) immersiveNavigation?.hideDirectory(); closeCompanionResult(); },
      onDirectoryFace: face => { const handled=filesBrowser?.show(face) ?? false; gitBrowser?.show(face); return handled; },
      showReviews: (${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT})({mountPluginClient,route,headers:()=>molisWorkControlHeaders()}),
      addWorkspace: async (workspace_path) => {
        const response = await fetch(route("/api/workspaces"), { method:"POST", headers:molisWorkControlHeaders(), body:JSON.stringify({workspace_path,user_confirmed:true}) });
        const result = await response.json();
        if(!response.ok) throw new Error(result.error || "无法关联工作区");
        return result.workspace;
      },
      openItem: (plugin, id, title) => tabWorkspace?.openItem(plugin, id, title),
      openBeside: (plugin, id, title) => tabWorkspace?.openBeside(plugin, id, title),
    });
    (${CODING_COMPANIONS_CLIENT_FACTORY_SCRIPT})({
      root: host.root, mountPluginClient,
      request: companionRequest, route, icons: ${JSON.stringify({ folder: icon("folder"), file: icon("file") })},
      openPlugin: plugin => tabWorkspace?.openPlugin(plugin),
      reviewFactory: ${AGENT_REVIEW_CLIENT_FACTORY_SCRIPT},
      headers: () => molisWorkControlHeaders(),
    });

}`;
