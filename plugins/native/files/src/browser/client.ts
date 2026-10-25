import { messageOf, said } from "./dom.js";
import { active, createPage, request } from "./page.js";
import type { FilesPage } from "./page.js";
import { capture, clearReader, companions, controls, copyAll, openFile } from "./reader.js";
import { list } from "./tree.js";
import type { FilesBrowser, FilesHost, StateAnswer } from "./types.js";

const open = (page: FilesPage) => (path: string[]) => openFile(page, path);

/** Opens the file the shell asked for, in the folder being browsed only. */
function openWanted(page: FilesPage): void {
  const { wanted, workspace, L } = page;
  if (!wanted || !workspace) return;
  const [id = "", ...rest] = wanted.split(":"), path = rest.join(":").split("/").filter(Boolean);
  page.wanted = null;
  if (id !== workspace || !path.length) { page.notice(L("files.directory.outside")); return; }
  page.host.openResult(); page.result.hidden = false; void openFile(page, path);
}

/** Browses one workspace: its top folder, then the file the person left open (or the one asked for), then the companions. */
async function choose(page: FilesPage, id: string): Promise<void> {
  const { L, tree } = page, ticket = ++page.generation;
  page.workspace = id; clearReader(page); tree.replaceChildren(); page.notice(id ? L("files.directory.reading") : L("files.directory.choose-workspace"));
  try {
    if (!id || !active(page, ticket)) return;
    page.host.onWorkspaceSelected?.(id);
    await list(page, [], tree, ticket, open(page));
    if (!active(page, ticket)) return;
    page.notice("");
    const state = await request<StateAnswer>(page, "/state");
    if (!active(page, ticket)) return;
    if (page.wanted) openWanted(page);
    else if (state.position?.workspace_id === id) await openFile(page, state.position.path);
    if (!active(page, ticket)) return;
    await companions(page, ticket);
  } catch (error) {
    if (active(page, ticket)) { clearReader(page); tree.replaceChildren(); page.notice(said(L, messageOf(error))); }
  }
}

const loading = (page: FilesPage, on: boolean) => {
  page.refresh.disabled = on; page.refresh.toggleAttribute("data-loading", on);
  page.refresh.querySelector<HTMLElement>(".mw-spinner")!.hidden = !on;
  page.tree.setAttribute("aria-busy", String(on));
};

/** Reads the project's browsing workspace and shows it. */
async function load(page: FilesPage): Promise<void> {
  const { L, lifetime } = page;
  if (!lifetime.visible || page.refresh.disabled) return;
  const serial = ++page.loadingTicket;
  loading(page, true); page.notice(L("files.directory.reading-workspace"));
  try {
    const state = await request<StateAnswer>(page, "/state");
    if (serial !== page.loadingTicket) return;
    await choose(page, state.workspace?.workspace_id ?? "");
  } catch (error) {
    if (lifetime.visible && serial === page.loadingTicket) { page.workspace = ""; clearReader(page); page.tree.replaceChildren(); page.notice(said(L, messageOf(error))); }
  } finally {
    if (lifetime.alive && serial === page.loadingTicket) loading(page, false);
  }
}

function listen(page: FilesPage): void {
  const { lifetime, text, result, surface } = page;
  lifetime.listen(page.reload, "click", () => { if (page.selectedPath) void openFile(page, page.selectedPath); });
  if (surface) {
    lifetime.listen(surface, "molis-work:select-item", event => {
      const id = (event as CustomEvent<{ itemId?: unknown }>).detail?.itemId;
      if (typeof id !== "string" || !id) return;
      page.wanted = id; openWanted(page);
    });
  }
  lifetime.listen(page.refresh, "click", () => void load(page));
  for (const name of ["select", "keyup", "mouseup"]) lifetime.listen(text, name, () => controls(page));
  lifetime.listen(page.q("[data-files-close]"), "click", () => {
    result.hidden = true; result.classList.remove("is-arriving"); page.host.closeResult();
    if (page.opener?.isConnected) page.opener.focus({ preventScroll: true });
  });
  lifetime.listen(page.q("[data-files-copy]"), "click", () => void copyAll(page));
  result.querySelectorAll<HTMLButtonElement>("[data-files-capture]").forEach(button => lifetime.listen(button, "click", () => void capture(page, button)));
}

/**
 * The Files directory and reader: a folder tree, the file read as text (read-only), and pinning of the text or a selection as a
 * snapshot. Coding's bundle mounts it (`clientFrom`); what it shows follows the project's browsing workspace.
 */
export function filesClient(host: FilesHost): FilesBrowser | null {
  const scope = host.root ?? document;
  const directory = scope.querySelector<HTMLElement>("[data-files-browser]"), result = scope.querySelector<HTMLElement>("[data-files-results]");
  if (!directory || !result) return null;
  const lifetime = host.mountPluginClient(directory);
  if (!lifetime) return null;
  const page = createPage(host, lifetime, directory, result);
  listen(page);
  lifetime.whenVisible(signal => {
    page.viewSignal = signal; page.initialRead = true;
    page.q("[data-files-copy]").textContent = page.L("files.reader.copy");
    loading(page, true); page.notice(page.L("files.directory.reading-workspace"));
    return () => { page.generation++; page.readTicket++; page.loadingTicket++; result.setAttribute("aria-busy", "false"); loading(page, false); };
  });
  lifetime.watchRevision(signal => host.request("files", "/view-revision", "GET", undefined, signal), async () => {
    if (page.captureBusy || (page.refresh.disabled && !page.initialRead)) return false;
    page.initialRead = false; loading(page, false); await load(page);
  });
  return {
    refresh: () => load(page),
    show(face) {
      if (!["files", "sessions"].includes(face)) return false;
      const visible = face === "files";
      directory.hidden = !visible;
      if (!visible) { result.hidden = true; host.closeResult(); }
      return true;
    },
  };
}
