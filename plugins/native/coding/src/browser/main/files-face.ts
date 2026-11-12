import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { errorMessage } from "../dom.js";
import type { Page } from "./page.js";

const FOLDER_READ: ActionReference = { capability_id: "projects.workspace.files.read", version: /* @version action.projects.workspace.files.read */ 1 };
const MATERIALS_OPEN: ActionReference = { capability_id: "materials.open", version: /* @version action.materials.open */ 1 };

type Entry = Extract<WorkspaceFileResult, { outcome: "directory" }>["entries"][number];

/** The files face as the page drives it: shown or hidden with its face, and following the folder the session works in. */
export interface FilesFace {
  show(visible: boolean): void;
  /** The folder the open session's next round runs in; the face follows it unless the person is looking at another one. */
  follow(workspaceId: string): void;
}

/**
 * Where Coding works and the project's other folders (design A, materials-ui-contract §5). The tree is read a folder at a time
 * through the platform's folder read, as the person, with this page's declarations; opening a file is the platform's
 * 「打开资料」 (it remembers where they read and hands the folder on to whatever takes it), and the file then shows in the side
 * panel's reader, where it is quoted, fixed, or handed to Diff. Another folder is only looked at: the session keeps working where it is.
 */
export function mountFilesFace(page: Page): FilesFace {
  const { directory, lifetime, host, s } = page;
  const panel = directory.querySelector<HTMLElement>("[data-coding-files-face]")!;
  const part = <T extends HTMLElement>(name: string) => panel.querySelector<T>(`[data-coding-files-${name}]`)!;
  const folder = part<HTMLSelectElement>("folder"), tree = part("tree"), role = part("role"), note = part("note"), said = part("status");
  const back = part<HTMLButtonElement>("back"), icons = part<HTMLTemplateElement>("icons");
  let visible = false, viewing: string | null = null, ticket = 0;
  const working = () => s.workspaceId || s.state.workspace?.workspace_id || s.state.workspaces[0]?.workspace_id || "";
  const shown = () => viewing ?? working();
  const nameOf = (id: string) => {
    const row = s.state.workspaces.find(item => item.workspace_id === id);
    return String(row?.name || row?.canonical_path?.split("/").filter(Boolean).at(-1) || id);
  };
  const icon = (kind: "folder" | "file") => icons.content.querySelector(`[data-icon="${kind}"]`)?.cloneNode(true) ?? document.createElement("span");

  function paint(): void {
    const id = shown(), reference = Boolean(id) && id !== working();
    folder.replaceChildren(...s.state.workspaces.map(row => new Option(nameOf(row.workspace_id), row.workspace_id, false, row.workspace_id === id)));
    folder.disabled = s.state.workspaces.length < 2;
    role.textContent = id ? uiText.text(reference ? "coding.files.reference" : "coding.files.working") : "";
    role.hidden = !id;
    note.textContent = !id ? "" : reference ? uiText.text("coding.files.reference-note", { name: nameOf(working()) }) : uiText.text("coding.files.working-note");
    back.hidden = !reference;
  }

  function row(entry: Entry): { item: HTMLLIElement; button: HTMLButtonElement } {
    const item = document.createElement("li"), button = document.createElement("button");
    button.type = "button"; button.className = "mw-dir-row mw-dir-row--compact"; button.title = entry.path.join("/");
    const mark = document.createElement("span"); mark.className = "mw-dir-row__icon"; mark.append(icon(entry.kind === "directory" ? "folder" : "file"));
    const copy = document.createElement("span"); copy.className = "mw-dir-row__copy";
    const headline = document.createElement("span"); headline.className = "mw-dir-row__headline";
    const label = document.createElement("strong"); label.textContent = entry.name;
    headline.append(label); copy.append(headline); button.append(mark, copy); item.append(button);
    return { item, button };
  }

  /** One folder into `into`; a folder below opens in place the first time. */
  async function list(id: string, path: readonly string[], into: HTMLElement, at: number): Promise<void> {
    const read = await host.invokeAction<WorkspaceFileResult>(FOLDER_READ, { workspace_id: id, path, kind: "directory" });
    if (at !== ticket) return;
    if (read.outcome !== "directory") throw new Error(uiText.text("coding.files.unreadable"));
    const items = document.createElement("ul");
    for (const entry of read.entries) {
      const { item, button } = row(entry);
      if (entry.kind === "directory") {
        const below = document.createElement("div"); below.hidden = true; item.append(below);
        button.setAttribute("aria-expanded", "false");
        lifetime.listen(button, "click", async () => {
          const open = button.getAttribute("aria-expanded") !== "true";
          button.setAttribute("aria-expanded", String(open)); below.hidden = !open;
          if (!open || below.firstChild) return;
          button.disabled = true;
          try { await list(id, entry.path, below, at); } catch (error) { if (at === ticket) below.textContent = errorMessage(error); } finally { button.disabled = false; }
        });
      } else if (entry.kind === "file") {
        lifetime.listen(button, "click", () => void openFile(id, entry, button));
      } else button.disabled = true;
      items.append(item);
    }
    into.replaceChildren(items);
    if (!read.entries.length) into.append(Object.assign(document.createElement("p"), { className: "coding-face-note", textContent: uiText.text("coding.files.empty") }));
    if (read.truncated) into.append(Object.assign(document.createElement("p"), { className: "coding-face-note", textContent: uiText.text("coding.files.truncated") }));
  }

  async function openFile(id: string, entry: Entry, button: HTMLButtonElement): Promise<void> {
    button.disabled = true; said.textContent = "";
    try {
      await host.invokeAction(MATERIALS_OPEN, { workspace_id: id, path: entry.path });
      lifetime.assertCurrent();
      document.dispatchEvent(new CustomEvent("molis:side-open", { cancelable: true,
        detail: { tab: "files", target: { subject: { kind: "workspace_file", id: id + ":" + entry.path.join("/") }, title: entry.name }, focus: true } }));
      said.textContent = uiText.text("coding.files.opened", { name: entry.name });
    } catch (error) {
      if (lifetime.alive) said.textContent = errorMessage(error);
    } finally { button.disabled = false; }
  }

  async function load(): Promise<void> {
    const at = ++ticket, id = shown();
    paint();
    tree.replaceChildren();
    if (!id) { said.textContent = uiText.text("coding.files.none"); return; }
    said.textContent = uiText.text("coding.files.reading");
    try { await list(id, [], tree, at); if (at === ticket) said.textContent = ""; }
    catch (error) { if (at === ticket && lifetime.alive) said.textContent = errorMessage(error); }
  }

  lifetime.listen(folder, "change", () => { viewing = folder.value === working() ? null : folder.value; void load(); });
  lifetime.listen(back, "click", () => { viewing = null; void load(); folder.focus(); });
  lifetime.listen(part("refresh"), "click", () => void load());
  return {
    show(on) { visible = on; panel.hidden = !on; if (on) void load(); },
    follow() { if (visible && viewing === null) void load(); },
  };
}
