import { filesClient } from "./client.js";
import { filesRequests } from "./request.js";
import type { FilesBrowser, FilesFactoryHost, FilesHost } from "./types.js";

/** The folder and file icons the tree draws. */
export interface Icons { readonly folder: string; readonly file: string }

/** Files on its own page: the root keeps whether a result is open, and a link to another plugin opens that plugin. */
function onOwnPage(host: FilesFactoryHost, icons: Icons, root: HTMLElement): FilesBrowser | null {
  const lifetime = host.mountPluginClient(root);
  if (!lifetime) return null;
  lifetime.listen(root, "click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-companion-open]");
    if (button) host.openPlugin?.(button.dataset.companionOpen ?? "");
  });
  const browser = filesClient({ ...host, root, icons, ...filesRequests(host, false),
    openResult: () => { root.dataset.companionDetail = "true"; }, closeResult: () => { root.dataset.companionDetail = "false"; } });
  const panel = root.querySelector<HTMLElement>("[data-files-browser]"), back = root.querySelector("[data-files-close]");
  if (panel) panel.hidden = false;
  if (back) back.textContent = host.translate("files.directory.back");
  return browser;
}

/** Mounts Files: in the panel of the page that gave its ports (Coding), or else on Files' own page. */
export function mountFiles(host: FilesFactoryHost, icons: Icons): FilesBrowser | null {
  const { openResult, closeResult } = host;
  if (openResult && closeResult) return filesClient({ ...host, icons, ...filesRequests(host, true), openResult, closeResult } satisfies FilesHost);
  const root = host.root;
  return root instanceof HTMLElement && root.matches("[data-companion]") ? onOwnPage(host, icons, root) : null;
}
