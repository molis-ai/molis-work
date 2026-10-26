import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiPageWorkspaces, UiPageReviews } from "@molis-ai/molis-work-contracts/platform/ui";
import type { CodingHost } from "./main/host.js";
import { mountCoding } from "./main/mount.js";

/** What Files' and Git's clients hand back; each reads through its own plugin's routes. */
interface CompanionBrowser {
  refresh?(): Promise<void> | void;
  show?(face: string): boolean | void;
}

/** A companion plugin's client, as the workbench lends it (`clientUses`): it mounts on the ports of the panel it is given. */
type CompanionClient = (ports: { readonly root: Element; readonly openResult: () => void; readonly closeResult: () => void; readonly onWorkspaceSelected?: () => void }) => CompanionBrowser | null;

/**
 * What the workbench hands Coding's bundle when it mounts a root: the shell's ports, the Files and Git clients Coding's
 * registration names in `clientUses` (`clients`), and the Host's review actions (`reviews`).
 */
export interface CodingWorkbenchHost {
  readonly root: Element;
  readonly mountPluginClient: CodingHost["mountPluginClient"];
  /** The page's words. */
  readonly translate: CodingHost["translate"];
  /** What a page says when the router refused a read for who-may-read reasons; empty for any other failure. */
  readonly readRefusal?: CodingHost["readRefusal"];
  /** The Manifest identity this page runs under, and a path under it in the current project. */
  readonly pluginId: string;
  readonly pluginRoute: CodingHost["pluginRoute"];
  readonly confirm: CodingHost["confirm"];
  readonly interaction: CodingHost["interaction"];
  readonly receipts: CodingHost["receipts"];
  readonly openItem?: (plugin: string, id: string, title?: string) => void;
  readonly openBeside?: (plugin: string, id: string, title?: string) => void;
  readonly openPlugin?: (plugin: string) => void;
  readonly hideDirectory?: () => void;
  readonly workspaces: UiPageWorkspaces;
  readonly clients: Readonly<Record<string, CompanionClient | undefined>>;
  readonly reviews: UiPageReviews<Element>;
}

/**
 * Mounts Coding's page: its own client (src/browser/main) with the Files and Git panels, which the workbench lends as `host.clients`
 * (their own bundles, loaded beside this one). Built with esbuild into `dist/workbench-bundle.js` (src/workbench-client.ts reads it).
 */
export function codingWorkbench(host: CodingWorkbenchHost): void {
  const { mountPluginClient, translate, readRefusal, pluginId, pluginRoute, confirm, clients } = host;
  // What every client mounted here gets besides its own ports.
  const lent = { mountPluginClient, translate, readRefusal, pluginId, pluginRoute, confirm };
  const showReviews = (element: Element, refs: readonly { readonly run_id: string }[], sessionId?: string | null, workspaceId?: string | null,
    query?: { runSession?: string; limit?: number }, control?: { signal?: AbortSignal }) => host.reviews.show(element,
    { runIds: refs.map(ref => ref.run_id), sessionId, workspaceId, ...query }, { signal: control?.signal });
  const codingRoot = host.root.matches("[data-coding-workbench]") ? host.root as HTMLElement : null;
  const openCompanionResult = (name: string) => {
    if (codingRoot) { codingRoot.dataset.codingDetail = "true"; codingRoot.dataset.codingResults = "true"; }
    codingRoot?.querySelector("[data-coding-tools]")?.setAttribute("data-companion-open", "true");
    for (const kind of ["files", "git"]) { const panel = codingRoot?.querySelector<HTMLElement>(`[data-${kind}-results]`); if (panel) panel.hidden = kind !== name; }
  };
  const closeCompanionResult = () => {
    codingRoot?.querySelector("[data-coding-tools]")?.removeAttribute("data-companion-open");
    if (codingRoot) {
      codingRoot.dataset.codingResults = "false";
      if (!codingRoot.querySelector('[data-coding-session][aria-current="true"]')) codingRoot.dataset.codingDetail = "false";
    }
  };
  const gitBrowser: CompanionBrowser | null = codingRoot ? clients.git?.({ root: codingRoot,
    openResult: () => openCompanionResult("git"), closeResult: closeCompanionResult }) ?? null : null;
  const filesBrowser: CompanionBrowser | null = codingRoot ? clients.files?.({ root: codingRoot,
    onWorkspaceSelected: () => { void gitBrowser?.refresh?.(); },
    openResult: () => openCompanionResult("files"), closeResult: closeCompanionResult }) ?? null : null;
  mountCoding({ ...lent, interaction: host.interaction, receipts: host.receipts,
    revealTask: () => { if (matchMedia("(max-width: 600px)").matches) host.hideDirectory?.(); closeCompanionResult(); },
    onDirectoryFace: (face: string) => { const handled = filesBrowser?.show?.(face) ?? false; gitBrowser?.show?.(face); return handled; },
    showReviews,
    addWorkspace: (workspacePath: string) => host.workspaces.add(workspacePath),
    selectWorkspace: (id: string) => host.workspaces.select(id),
    openItem: (plugin: string, id: string, title?: string) => host.openItem?.(plugin, id, title),
    openBeside: (plugin: string, id: string, title?: string) => host.openBeside?.(plugin, id, title),
  });
}
