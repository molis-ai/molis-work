import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequestInit, UiPageWorkspaces, UiPageReviews, UiPageDialogs } from "@molis-ai/molis-work-contracts/platform/ui";
import { codingArchive } from "./session-archive.js";

/** The page's one request helper (packages/ui-host request-client, W3-10). */

/** A mounted root's lifetime (packages/ui-host client-lifecycle): its listeners, timers and reads end with the root. */
interface ClientLifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  whenVisible(start: (signal: AbortSignal) => () => void): void;
  assertCurrent(signal?: AbortSignal): void;
}

type MountPluginClient = (root: Element) => ClientLifetime | null;

/** One request to a companion plugin's routes (`/api/plugins/io.molis.work.<plugin><path>`); a failure is an Error. */
type CompanionRequest = (plugin: string, path: string, method?: UiRequestInit["method"], body?: unknown, signal?: AbortSignal) => Promise<unknown>;

/** The Host's review actions as a client receives them: a rendering hook that calls back with the outcome, never a decision. */
type ReviewsFactory = (ports: {
  readonly mountPluginClient: MountPluginClient;
  readonly route: (path: string) => string;
  readonly headers: () => Record<string, string>;
  readonly onDecision?: (outcome: unknown) => void;
}) => unknown;

/** What Files' and Git's clients hand back; each reads through its own plugin's routes. */
interface CompanionBrowser {
  refresh?(): Promise<void> | void;
  afterDecision?(outcome: unknown): void;
  show?(face: string): boolean | void;
}

type CompanionClient = (ports: Record<string, unknown>) => CompanionBrowser | null;

/** Coding's page client (src/client.ts) and the ports it takes from here. */
export type CodingClient = (ports: Record<string, unknown>) => void;

/**
 * What the workbench hands Coding's bundle when it mounts a root: the shell's ports, the Files and Git clients Coding's
 * registration names in `clientUses` (`clients`), and the Host's review actions (`reviews`).
 */
export interface CodingWorkbenchHost {
  readonly root: Element;
  readonly mountPluginClient: MountPluginClient;
  /** The page's words; Files' and Git's clients read theirs through it as `host.translate`. */
  readonly translate: (text: string, values?: Record<string, string | number>) => string;
  /** What a page says when the router refused a read for who-may-read reasons; empty for any other failure. */
  readonly readRefusal?: (status: number, code: unknown) => string;
  readonly route: (path: string) => string;
  readonly headers: () => Record<string, string>;
  readonly interaction?: unknown;
  readonly receipts?: unknown;
  readonly confirm: UiPageDialogs["confirm"];
  readonly openItem?: (plugin: string, id: string, title?: string) => void;
  readonly openBeside?: (plugin: string, id: string, title?: string) => void;
  readonly openPlugin?: (plugin: string) => void;
  readonly hideDirectory?: () => void;
  readonly workspaces: UiPageWorkspaces;
  readonly clients: Readonly<Record<string, CompanionClient | undefined>>;
  readonly reviews: UiPageReviews<Element>;
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
  const { mountPluginClient, route, clients } = host;
  const reviews: ReviewsFactory = ports => (element: Element, refs: { run_id: string }[], sessionId?: string | null, workspaceId?: string | null,
    query?: { runSession?: string; limit?: number }, control?: { signal?: AbortSignal }) => host.reviews.show(element,
      { runIds: refs.map(ref => ref.run_id), sessionId, workspaceId, ...query }, { signal: control?.signal,
        onDecision: state => ports.onDecision?.({ workspaceId, sessionId, state }) });
  // What every client mounted here (Coding's own, Files, Git, a companion page) gets besides its own ports.
  const lent = { mountPluginClient, translate: host.translate, readRefusal: host.readRefusal };
  const headers = () => host.headers();
  const request: CompanionRequest = (plugin, path, method = "GET", body, signal) => {
    const url = new URL(path, "https://plugin.invalid");
    if (method === "GET" && url.pathname === "/state" && ["diff", "text-stats"].includes(plugin) && host.root.getAttribute("data-work-surface") !== plugin) {
      const query = url.searchParams;
      const input = { ...(query.has("artifact_id") ? { reference: { artifact_id: query.get("artifact_id"), version: Number(query.get("version")) } } : {}),
        ...(query.has("change_index") ? { change_index: Number(query.get("change_index")) } : {}) };
      return molisWorkRequest(route("/api/host/plugin-page-actions"), { body: { reference: { capability_id: plugin + ".state", version: 1 }, input }, signal });
    }
    if (host.root.getAttribute("data-work-surface") === "coding" && ["files", "git"].includes(plugin) && url.pathname !== "/view-revision") {
      const operation = plugin === "git" ? ({ "/diff": "select-diff", "/results": method === "POST" ? "save-result" : "results", "/operations": method === "POST" ? "prepare-operation" : "operations" } as Record<string, string>)[url.pathname] ?? url.pathname.slice(1) : url.pathname.slice(1);
      const input = method !== "GET" ? body ?? {} : plugin === "files" && operation === "directory"
        ? { workspace_id: url.searchParams.get("workspace_id"), path: JSON.parse(url.searchParams.get("path") ?? "[]") }
        : operation === "conflict" ? { path: url.searchParams.get("path") ?? "" } : {};
      return molisWorkRequest(route("/api/host/plugin-page-actions"), { body: { reference: { capability_id: plugin + "." + operation, version: 1 }, input }, signal });
    }
    return molisWorkRequest(route(`/api/plugins/io.molis.work.${plugin}${path}`),
      { method, body: method === "GET" ? undefined : body ?? {}, signal, fallback: host.translate("无法读取文件工作区") });
  };
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
  const gitBrowser: CompanionBrowser | null = codingRoot ? clients.git?.({ ...lent, root: codingRoot, request,
    openResult: () => openCompanionResult("git"), closeResult: closeCompanionResult,
    showReviews: reviews({ mountPluginClient, route, headers, onDecision: outcome => gitBrowser?.afterDecision?.(outcome) }) }) ?? null : null;
  const filesBrowser: CompanionBrowser | null = codingRoot ? clients.files?.({ ...lent, root: codingRoot, icons, request,
    onWorkspaceSelected: () => { void gitBrowser?.refresh?.(); },
    openResult: () => openCompanionResult("files"), closeResult: closeCompanionResult }) ?? null : null;
  coding({ ...lent, interaction: host.interaction, receipts: host.receipts,
    archive: (ports: Omit<Parameters<typeof codingArchive>[0], "confirm">) => codingArchive({ ...ports, confirm: host.confirm }),
    revealTask: () => { if (matchMedia("(max-width: 600px)").matches) host.hideDirectory?.(); closeCompanionResult(); },
    onDirectoryFace: (face: string) => { const handled = filesBrowser?.show?.(face) ?? false; gitBrowser?.show?.(face); return handled; },
    showReviews: reviews({ mountPluginClient, route, headers }),
    addWorkspace: (workspacePath: string) => host.workspaces.add(workspacePath),
    selectWorkspace: (id: string) => host.workspaces.select(id),
    openItem: (plugin: string, id: string, title?: string) => host.openItem?.(plugin, id, title),
    openBeside: (plugin: string, id: string, title?: string) => host.openBeside?.(plugin, id, title),
  });
  for (const root of host.root.matches("[data-companion]") ? [host.root as HTMLElement] : []) {
    companionPage(root, { ...lent, route, headers, request, icons, clients, reviews, openPlugin: plugin => host.openPlugin?.(plugin) });
  }
}

interface CompanionPorts {
  readonly mountPluginClient: MountPluginClient;
  readonly translate: CodingWorkbenchHost["translate"];
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
    if (back && BACK_LABEL[plugin]) back.textContent = ports.translate(BACK_LABEL[plugin]);
    return;
  }
  let read = 0, view: AbortSignal | undefined, index = 0;
  const reload = q<HTMLButtonElement>("[data-companion-refresh]")!, body = q("[data-companion-content]")!, note = q("[data-companion-status]")!;
  const spin = reload.querySelector<HTMLElement>(".mw-spinner")!;
  const busy = (value: boolean) => { reload.disabled = value; spin.hidden = !value; body.setAttribute("aria-busy", String(value)); };
  const load = async () => {
    if (!lifetime.visible) return;
    const signal = view, id = ++read;
    busy(true); note.textContent = ports.translate("正在读取固定内容…");
    try {
      const state = await ports.request(plugin, `/state${plugin === "diff" ? `?change_index=${index}` : ""}`, "GET", undefined, signal) as { html?: string };
      lifetime.assertCurrent(signal);
      if (id !== read) return;
      body.innerHTML = state.html || ""; note.textContent = "";
      body.querySelectorAll<HTMLElement>("[data-change-index]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.changeIndex) === index)));
    } catch (error) {
      if (!signal?.aborted && lifetime.visible && id === read) { body.replaceChildren(); molisWorkRequest.show(note, error); note.append(document.createTextNode(ports.translate("。请点击刷新重试。"))); }
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
