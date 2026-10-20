import type { UiRequest, UiRequestInit } from "@molis-ai/molis-work-contracts/platform/ui";

/** The page's one request helper (packages/ui-host request-client, W3-10); clients receive it as `host.request` from W5-04. */
declare const molisWorkRequest: UiRequest;

/** A mounted root's lifetime (packages/ui-host client-lifecycle): its listeners, timers and reads end with the root. */
export interface ClientLifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  whenVisible(start: (signal: AbortSignal) => () => void): void;
  assertCurrent(signal?: AbortSignal): void;
}

export type MountPluginClient = (root: Element) => ClientLifetime | null;

/** One request to a companion plugin's routes (`/api/plugins/io.molis.work.<plugin><path>`); a failure is an Error. */
export type CompanionRequest = (plugin: string, path: string, method?: UiRequestInit["method"], body?: unknown, signal?: AbortSignal) => Promise<unknown>;

/** The Host's review actions as a client receives them: a rendering hook that calls back with the outcome, never a decision. */
export type ReviewsFactory = (ports: {
  readonly mountPluginClient: MountPluginClient;
  readonly route: (path: string) => string;
  readonly headers: () => Record<string, string>;
  readonly onDecision?: (outcome: unknown) => void;
}) => unknown;

/** What Files' and Git's clients hand back; each reads through its own plugin's routes. */
export interface CompanionBrowser {
  refresh?(): Promise<void> | void;
  afterDecision?(outcome: unknown): void;
  show?(face: string): boolean | void;
}

export type CompanionClient = (ports: Record<string, unknown>) => CompanionBrowser | null;

/** Coding's page client (src/client.ts) and the ports it takes from here. */
export type CodingClient = (ports: Record<string, unknown>) => void;

/**
 * What the workbench hands Coding's bundle when it mounts a root: the shell's ports, the Files and Git clients Coding's
 * registration names in `clientUses` (`clients`), and the Host's review actions (`reviews`).
 */
export interface CodingWorkbenchHost {
  readonly root: Element;
  readonly mountPluginClient: MountPluginClient;
  readonly route: (path: string) => string;
  readonly headers: () => Record<string, string>;
  readonly interaction?: unknown;
  readonly receipts?: unknown;
  readonly openItem?: (plugin: string, id: string, title?: string) => void;
  readonly openBeside?: (plugin: string, id: string, title?: string) => void;
  readonly openPlugin?: (plugin: string) => void;
  readonly hideDirectory?: () => void;
  /** Links a folder the person picked and confirmed to this project (`POST /api/workspaces`); answers `{ workspace }`. */
  readonly addWorkspace?: (workspacePath: string) => Promise<{ readonly workspace: unknown }>;
  readonly clients: Readonly<Record<string, CompanionClient | undefined>>;
  readonly reviews: ReviewsFactory;
}

/** The folder and file icons the Files client draws, rendered by the design system on the Host. */
export interface CodingIcons { readonly folder: string; readonly file: string }

/** What a companion page's back button says once its client has opened a result there. */
const BACK_LABEL: Readonly<Record<string, string>> = { files: "返回文件列表", git: "返回改动列表" };

/**
 * Mounts one root of Coding's bundle: Coding's own page with its Files and Git panels, or a companion page (Files, Git, Diff,
 * Text Stats) that borrows this bundle (`clientFrom`). A companion with a client in `host.clients` gets it; one without is
 * read from its plugin's `/state`. Built with esbuild into `dist/workbench-bundle.js` (src/workbench-client.ts reads it).
 */
export function codingWorkbench(host: CodingWorkbenchHost, coding: CodingClient, icons: CodingIcons): void {
  const { mountPluginClient, route, clients, reviews } = host;
  const headers = () => host.headers();
  const request: CompanionRequest = (plugin, path, method = "GET", body, signal) => molisWorkRequest(route(`/api/plugins/io.molis.work.${plugin}${path}`),
    { method, body: method === "GET" ? undefined : body ?? {}, signal, fallback: "无法读取文件工作区" });
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
  const gitBrowser: CompanionBrowser | null = codingRoot ? clients.git?.({ mountPluginClient, root: codingRoot, request,
    openResult: () => openCompanionResult("git"), closeResult: closeCompanionResult,
    showReviews: reviews({ mountPluginClient, route, headers, onDecision: outcome => gitBrowser?.afterDecision?.(outcome) }) }) ?? null : null;
  const filesBrowser: CompanionBrowser | null = codingRoot ? clients.files?.({ mountPluginClient, root: codingRoot, icons, request,
    onWorkspaceSelected: () => { void gitBrowser?.refresh?.(); },
    openResult: () => openCompanionResult("files"), closeResult: closeCompanionResult }) ?? null : null;
  coding({ mountPluginClient, interaction: host.interaction, receipts: host.receipts,
    revealTask: () => { if (matchMedia("(max-width: 600px)").matches) host.hideDirectory?.(); closeCompanionResult(); },
    onDirectoryFace: (face: string) => { const handled = filesBrowser?.show?.(face) ?? false; gitBrowser?.show?.(face); return handled; },
    showReviews: reviews({ mountPluginClient, route, headers }),
    addWorkspace: async (workspacePath: string) => (await host.addWorkspace?.(workspacePath))?.workspace,
    openItem: (plugin: string, id: string, title?: string) => host.openItem?.(plugin, id, title),
    openBeside: (plugin: string, id: string, title?: string) => host.openBeside?.(plugin, id, title),
  });
  for (const root of host.root.matches("[data-companion]") ? [host.root as HTMLElement] : []) {
    companionPage(root, { mountPluginClient, route, headers, request, icons, clients, reviews, openPlugin: plugin => host.openPlugin?.(plugin) });
  }
}

interface CompanionPorts {
  readonly mountPluginClient: MountPluginClient;
  readonly route: (path: string) => string;
  readonly headers: () => Record<string, string>;
  readonly request: CompanionRequest;
  readonly icons: CodingIcons;
  readonly clients: CodingWorkbenchHost["clients"];
  readonly reviews: ReviewsFactory;
  readonly openPlugin: (plugin: string) => void;
}

/** A companion plugin's own page: its list opens results in place; a link to another plugin opens that plugin. */
function companionPage(root: HTMLElement, ports: CompanionPorts): void {
  const lifetime = ports.mountPluginClient(root);
  if (!lifetime) return;
  const plugin = root.dataset.companion ?? "";
  const q = <E extends Element = HTMLElement>(selector: string) => root.querySelector<E>(selector);
  lifetime.listen(root, "click", event => {
    const button = (event.target as Element).closest<HTMLElement>("[data-companion-open]");
    if (button) ports.openPlugin(button.dataset.companionOpen ?? "");
  });
  const client = ports.clients[plugin];
  if (client) {
    const openResult = () => { root.dataset.companionDetail = "true"; };
    const closeResult = () => { root.dataset.companionDetail = "false"; };
    const browser: CompanionBrowser | null = client({ ...ports, root, openResult, closeResult,
      showReviews: ports.reviews({ mountPluginClient: ports.mountPluginClient, route: ports.route, headers: ports.headers, onDecision: outcome => browser?.afterDecision?.(outcome) }) });
    const panel = q(`[data-${plugin}-browser]`), back = q(`[data-${plugin}-close]`);
    if (panel) panel.hidden = false;
    if (back && BACK_LABEL[plugin]) back.textContent = BACK_LABEL[plugin];
    return;
  }
  let read = 0, view: AbortSignal | undefined, index = 0;
  const reload = q<HTMLButtonElement>("[data-companion-refresh]")!, body = q("[data-companion-content]")!, note = q("[data-companion-status]")!;
  const spin = reload.querySelector<HTMLElement>(".mw-spinner")!;
  const busy = (value: boolean) => { reload.disabled = value; spin.hidden = !value; body.setAttribute("aria-busy", String(value)); };
  const load = async () => {
    if (!lifetime.visible) return;
    const signal = view, id = ++read;
    busy(true); note.textContent = "正在读取固定内容…";
    try {
      const state = await ports.request(plugin, `/state${plugin === "diff" ? `?change_index=${index}` : ""}`, "GET", undefined, signal) as { html?: string };
      lifetime.assertCurrent(signal);
      if (id !== read) return;
      body.innerHTML = state.html || ""; note.textContent = "";
      body.querySelectorAll<HTMLElement>("[data-change-index]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.changeIndex) === index)));
    } catch (error) {
      if (!signal?.aborted && lifetime.visible && id === read) { body.replaceChildren(); molisWorkRequest.show(note, error); note.append(document.createTextNode("。请点击刷新重试。")); }
    } finally {
      if (lifetime.alive && id === read) busy(false);
    }
  };
  lifetime.listen(root, "click", event => {
    const target = event.target as Element, file = target.closest<HTMLElement>('[data-action="diff.show-file"]');
    if (file) { index = Number(file.dataset.changeIndex); void load(); } else if (target.closest("[data-companion-refresh]")) void load();
  });
  lifetime.whenVisible(signal => { view = signal; void load(); return () => { read++; busy(false); }; });
}
