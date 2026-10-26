import { messageOf } from "./dom.js";
import { open } from "./diff.js";
import { active, reading, request, rowOf, showReviews } from "./page.js";
import type { GitPage } from "./page.js";
import { clearResults } from "./results.js";
import { loadSource } from "./source.js";
import type { ListItem, StateAnswer, View } from "./types.js";

/** One row of the list: a button for a changed file, made once and kept while the file stays in the list. */
function rowButton(page: GitPage, item: ListItem, side: string, key: string): HTMLElement {
  const button = document.createElement("button"), copy = document.createElement("span"), headline = document.createElement("span");
  button.type = "button";
  button.className = "mw-dir-row mw-dir-row--compact";
  button.dataset.gitPath = key;
  copy.className = "mw-dir-row__copy";
  headline.className = "mw-dir-row__headline";
  headline.append(document.createElement("strong"));
  copy.append(headline);
  button.append(copy);
  page.lifetime.listen(button, "click", () => void open(page, item.path, side, button));
  return button;
}

/** Puts the three groups of changes in the list, keeping the rows and groups that are still there (and their focus). */
function paint(page: GitPage, view: View): void {
  const { L, list, result } = page;
  const entries: [string, readonly ListItem[], string, string][] = [
    [L("git.group.conflicts"), view.conflicts, "worktree", "conflict"],
    [L("git.group.staged"), view.staged, "index", "staged"],
    [L("git.group.unstaged"), view.changes, "worktree", "unstaged"],
  ];
  const groups = new Map([...list.children].map((group): [string, HTMLElement] => [(group as HTMLElement).dataset.gitGroup ?? "", group as HTMLElement]));
  const rows = new Map([...list.querySelectorAll<HTMLElement>("[data-git-path]")].map((row): [string, HTMLElement] => [row.dataset.gitPath ?? "", row]));
  const wanted = new Set(entries.flatMap(([, items, side]) => items.map((item) => rowOf(item, side))));
  for (const [key, row] of rows) if (!wanted.has(key)) { row.remove(); rows.delete(key); }
  const ordered: HTMLElement[] = [];
  for (const [label, items, side, state] of entries) {
    if (!items.length) continue;
    let group = groups.get(state);
    if (!group) { group = document.createElement("section"); group.dataset.gitGroup = state; group.append(document.createElement("h4")); }
    groups.delete(state);
    ordered.push(group);
    const heading = group.querySelector<HTMLElement>("h4");
    if (!heading) continue;
    heading.textContent = `${label} · ${items.length}`;
    heading.dataset.mwState = state;
    let previous: Element = heading;
    for (const item of items) {
      const key = rowOf(item, side), button = rows.get(key) ?? rowButton(page, item, side, key);
      const name = button.querySelector("strong");
      if (name) name.textContent = item.label;
      button.title = `${label} · ${item.label}`;
      button.setAttribute("aria-label", L("git.group.row-label", { group: label, name: item.label }));
      const shown = page.displayed && page.displayed.workspace_id === page.workspace && page.displayed.side === side && JSON.stringify(page.displayed.path) === JSON.stringify(item.path);
      button.classList.toggle("is-selected", Boolean(shown || (page.opener === button && result.getAttribute("aria-busy") === "true")));
      if (previous.nextElementSibling !== button) group.insertBefore(button, previous.nextElementSibling);
      previous = button;
    }
  }
  for (const group of groups.values()) group.remove();
  ordered.forEach((group, index) => { if (list.children[index] !== group) list.insertBefore(group, list.children[index] || null); });
}

/** Reads the workspace's changes and paints them, then the source-control block. */
export async function refresh(page: GitPage): Promise<void> {
  const { L, S, list, notice, reopen, history, result } = page;
  if (!page.lifetime.visible) return;
  const epoch = ++page.generation;
  page.ticket++;
  result.setAttribute("aria-busy", "false");
  reading(page, true);
  notice.textContent = L("git.list.reading");
  reopen.hidden = true;
  history.disabled = true;
  try {
    const value = await request<StateAnswer>(page, "/state");
    if (!active(page, epoch)) return;
    if (page.workspace !== value.workspace.workspace_id) {
      list.replaceChildren();
      clearResults(page);
      if (page.workspace && !result.hidden) { result.hidden = true; page.host.closeResult(); }
    }
    page.workspace = value.workspace.workspace_id;
    page.selected = value.selected ?? null;
    reopen.hidden = !page.selected;
    await showReviews(page);
    if (!active(page, epoch)) return;
    await loadSource(page);
    if (!active(page, epoch)) return;
    const view = value.view;
    notice.textContent = view.phase === "ready" ? [S(view.head), page.U(view.upstream), view.message && S(view.message)].filter(Boolean).join(" · ") : S(view.message);
    paint(page, view);
    history.disabled = false;
  } catch (error) {
    if (active(page, epoch)) {
      list.replaceChildren();
      page.workspace = "";
      page.selected = null;
      clearResults(page);
      history.disabled = true;
      notice.textContent = S(messageOf(error));
      if (!result.hidden) { page.q("[data-git-diff]").replaceChildren(); page.diffNotice.textContent = S(messageOf(error)); }
    }
  } finally {
    if (active(page, epoch)) reading(page, false);
  }
}
