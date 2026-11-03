import { messageOf, said } from "./dom.js";
import { active, request } from "./page.js";
import type { FilesPage } from "./page.js";
import type { DirectoryAnswer, DirectoryEntry, ReadOutcome } from "./types.js";

/** The sentence for each reason a read gave nothing to show. */
export function readErrors(page: FilesPage): Record<ReadOutcome, string> {
  const { L } = page;
  return { missing: L("files.error.missing"), denied: L("files.error.denied"), unsupported: L("files.error.unsupported"), binary: L("files.error.binary"), changed: L("files.error.changed") };
}

function entryRow(page: FilesPage, entry: DirectoryEntry): { li: HTMLLIElement; button: HTMLButtonElement } {
  const li = document.createElement("li"), button = document.createElement("button");
  button.type = "button"; button.className = "mw-dir-row mw-dir-row--compact"; button.textContent = entry.name; button.title = entry.path.join("/");
  button.dataset.filePath = JSON.stringify(entry.path); li.append(button);
  const mark = document.createElement("span"); mark.className = "mw-dir-row__icon"; mark.innerHTML = page.host.icons?.[entry.kind === "directory" ? "folder" : "file"] ?? "";
  const copy = document.createElement("span"); copy.className = "mw-dir-row__copy";
  const headline = document.createElement("span"); headline.className = "mw-dir-row__headline";
  const label = document.createElement("strong"); label.textContent = entry.name; headline.append(label); copy.append(headline);
  button.replaceChildren(mark, copy);
  return { li, button };
}

/** Lists one folder into `container`; a folder expands in place the first time it is opened. */
export async function list(page: FilesPage, path: readonly string[], container: HTMLElement, ticket: number, openFile: (path: string[]) => Promise<void>): Promise<void> {
  const { L, lifetime, result } = page, id = page.workspace;
  const value = await request<DirectoryAnswer>(page, "/directory?workspace_id=" + encodeURIComponent(id) + "&path=" + encodeURIComponent(JSON.stringify(path)));
  if (!active(page, ticket)) return;
  if (value.result.outcome !== "directory") throw new Error(readErrors(page)[value.result.outcome] || L("files.directory.unreadable"));
  const { entries, truncated } = value.result;
  const ul = document.createElement("ul");
  for (const entry of entries) {
    const { li, button } = entryRow(page, entry);
    if (entry.kind === "directory") {
      button.setAttribute("aria-expanded", "false");
      const children = document.createElement("div"); children.hidden = true; li.append(children);
      lifetime.listen(button, "click", async () => {
        const expanded = button.getAttribute("aria-expanded") !== "true";
        button.setAttribute("aria-expanded", String(expanded)); children.hidden = !expanded;
        if (!expanded || children.querySelector("ul")) return;
        button.disabled = true;
        try { await list(page, entry.path, children, ticket, openFile); }
        catch (error) { if (active(page, ticket)) children.textContent = said(L, messageOf(error)); }
        finally { if (lifetime.alive) button.disabled = false; }
      });
    } else if (entry.kind === "file") {
      lifetime.listen(button, "click", () => {
        page.opener = button; page.host.openResult(); result.hidden = false; result.classList.add("is-arriving");
        page.q("[data-files-close]").focus({ preventScroll: true }); void openFile([...entry.path]);
      });
    } else { button.disabled = true; button.title += " · " + L("files.directory.not-regular"); }
    ul.append(li);
  }
  container.replaceChildren(ul);
  if (!entries.length) { const empty = document.createElement("p"); empty.textContent = L("files.directory.empty"); container.append(empty); }
  if (truncated) { const hint = document.createElement("p"); hint.textContent = L("files.directory.truncated"); container.append(hint); }
}
