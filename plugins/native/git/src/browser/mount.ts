import { gitClient } from "./client.js";
import { gitRequests } from "./request.js";
import type { GitSentenceTable } from "../say.js";
import type { GitBrowser, GitFactoryHost, GitHost } from "./types.js";

/** The ports Git needs from the page that holds it, whichever page that is. */
function ports(host: GitFactoryHost, embedded: boolean, openResult: () => void, closeResult: () => void, browser: () => GitBrowser | null): GitHost {
  return { ...host, ...gitRequests(host, embedded), openResult, closeResult,
    showReviews: (element, refs, sessionId, workspaceId, _query, control) => host.reviews.show(element, { runIds: refs.map(ref => ref.run_id), sessionId, workspaceId },
      { signal: control.signal, onDecision: state => browser()?.afterDecision?.({ workspaceId, sessionId, state }) }) };
}

/** Git on its own page: the root keeps whether a result is open, and a link to another plugin opens that plugin. */
function onOwnPage(host: GitFactoryHost, sentences: GitSentenceTable, root: HTMLElement): GitBrowser | null {
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return null;
  lifetime.listen(root, "click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-companion-open]");
    if (button) host.openPlugin?.(button.dataset.companionOpen ?? "");
  });
  const browser: GitBrowser | null = gitClient({ ...ports(host, false, () => { root.dataset.companionDetail = "true"; }, () => { root.dataset.companionDetail = "false"; }, () => browser), root }, sentences);
  const panel = root.querySelector<HTMLElement>("[data-git-browser]"), back = root.querySelector("[data-git-close]");
  if (panel) panel.hidden = false;
  if (back) back.textContent = host.translate("git.list.back");
  return browser;
}

/** Mounts Git: in the panel of the page that gave its ports (Coding), or else on Git's own page. */
export function mountGit(host: GitFactoryHost, sentences: GitSentenceTable): GitBrowser | null {
  const { openResult, closeResult } = host;
  if (openResult && closeResult) {
    const browser: GitBrowser | null = gitClient(ports(host, true, openResult, closeResult, () => browser), sentences);
    return browser;
  }
  const root = host.root;
  return root instanceof HTMLElement && root.matches("[data-companion]") ? onOwnPage(host, sentences, root) : null;
}
