import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { TaskGrantCategory, TaskGrantListResult, TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { escapeHtml as escape } from "@molis-ai/molis-work-plugin-sdk/ui";
import { taskGrantCategoryName, taskGrantChange, taskGrantRowHtml, taskGrantRows } from "./plugin-frame/task-grants-area.js";

const uiText = globalThis.t;

/**
 * 授权与放行 in a project's settings (specs/proactive-assistant/task-grants-platform-area.md §5): every background task's grants,
 * grouped by the installation it is in, one row per category it holds. It reads once on open (`list`, then each installation's own
 * titles, §5.2) and never polls; a change is one `set` or `clear`, formed as the task's own area forms it (§3.6, the shared
 * `taskGrantChange`), and the answer is shown without reading again. A row is the area's own (`taskGrantRowHtml`, with the
 * provider's words from `taskGrantRows`); what a change did is said in the page's own words (`doneText`), since the page has no
 * switch to point to. Everything drawn is
 * escaped markup, as the area's is; one click listener on the list reads which control, which task and which row from the markup.
 */
type Row = ReturnType<typeof taskGrantRows>[number];
interface Installation { plugin_install_id: string; plugin_id: string | null; name: string | null; titled: boolean }
interface Listed extends TaskGrantListResult { installations: Installation[] }
interface Title { key: string; title: string; open: { surface: string; id: string } }
interface TitlesPage { entries: Title[]; next_cursor: string | null }
type Post = <T>(body: Record<string, unknown>) => Promise<T>;

const { molisWorkRequest } = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };
const refreshSettingsLanguage = new WeakMap<HTMLElement, () => void>();
const subjectId = (subject: Pick<TaskGrantSubject, "plugin_install_id" | "key">) => subject.plugin_install_id + "\n" + subject.key;
const button = (label: string, variant: string, act: string, about?: string) => {
  const text = escape(uiText.text(label));
  return `<button type="button" class="mw-btn mw-btn--sm ${variant}" data-task-grants-act="${act}"${about === undefined ? "" : ` aria-label="${text} · ${escape(about)}"`}>${text}</button>`;
};

/** The settings page's own toast: what a write did, or that it did not. */
const toast = (text: string, error = false) => {
  const box = document.querySelector<HTMLElement>("[data-settings-toast], [data-toast]"); if (!box) return;
  box.textContent = text; box.classList.toggle("is-error", error); box.classList.add("is-visible");
  setTimeout(() => box.classList.remove("is-visible"), error ? 5000 : 2600);
};

/**
 * One installation's titles (§5.2): a page of up to 500 of its own entries; the next only while a task is still unnamed, and at
 * most 20 pages (10,000 entries), so a provider that keeps giving new cursors cannot keep the page reading.
 */
async function readTitles(post: Post, install: string, keys: ReadonlySet<string>, found: Map<string, Title>): Promise<void> {
  let cursor: string | null = null, pages = 0;
  const seen = new Set<string>();
  try {
    do {
      const answer: TitlesPage = await post<TitlesPage>({ mode: "titles", plugin_install_id: install, cursor });
      for (const entry of answer.entries) if (keys.has(entry.key)) found.set(entry.key, entry);
      // A cursor given twice would never end, nor would new ones forever; past either, the tasks still unnamed are named by their plugin.
      cursor = ++pages < 20 && [...keys].some(key => !found.has(key)) && answer.next_cursor && !seen.has(answer.next_cursor) ? answer.next_cursor : null;
      if (cursor) seen.add(cursor);
    } while (cursor);
  } catch { /* Not named: the row says the plugin's name and "a task", and can still be taken back (§5.2 ③). */ }
}

/** Where 「打开」 goes: the workbench with the provider's own surface and item, as a search result opens it. */
function openHref(project: string, target: Title): string {
  const query = new URLSearchParams({ openPlugin: target.open.surface, openItem: target.open.id, openTitle: target.title });
  if (new URLSearchParams(location.search).get("desktop")) query.set("desktop", "1");
  return "/projects/" + encodeURIComponent(project) + "/?" + query.toString();
}

/** The catalog's alert dialog: cancel is the default (it has the focus, and Escape is cancel); the answer is the button's value. */
function ask(root: HTMLElement, title: string, description: string): Promise<boolean> {
  const holder = document.createElement("template");
  holder.innerHTML = `<dialog class="mw-dialog mw-dialog--alert" data-slot="alert-dialog"><form method="dialog" class="mw-form mw-dialog__shell"><header class="mw-form__header"><div><h2>${escape(title)}</h2><p>${escape(description)}</p></div></header>`
    + `<footer class="mw-form__footer"><button class="mw-btn mw-btn--md mw-btn--secondary" data-task-grants-act="cancel" autofocus>${escape(uiText.text("common.control.cancel"))}</button><button class="mw-btn mw-btn--md mw-btn--danger" data-task-grants-act="confirm" value="1">${escape(uiText.text("workbench.task-grants-page.withdraw-all"))}</button></footer></form></dialog>`;
  const dialog = holder.content.firstElementChild as HTMLDialogElement;
  root.append(dialog); dialog.showModal();
  return new Promise(resolve => dialog.addEventListener("close", () => { dialog.remove(); resolve(dialog.returnValue === "1"); }));
}

/**
 * One category the task holds: the area's own row (`taskGrantRowHtml`: its name, what it is and the same note), with the page's
 * buttons in place of the switch, since turning a category on belongs to the task. On one line here; the note is cut first.
 */
const rowHtml = (row: Row) => taskGrantRowHtml(uiText.text, row, (row.status === "needs_confirmation" ? button("workbench.task-grants-page.allow", "mw-btn--secondary", "allow", row.title) : "")
  + (row.status === "removed" ? button("workbench.task-grants-page.remove", "mw-btn--secondary", "remove", row.title) : button("workbench.task-grants-page.withdraw", "mw-btn--ghost", "off", row.title)));

/**
 * What a change did, in the page's words: the area's line points at its switch, which this page does not have, so a category
 * taken back that cannot simply be turned on again says where to turn it on (the task's 「能读的数据」).
 */
const doneText = (act: "off" | "allow" | "remove", row: Row) => uiText.text(act === "allow" ? "workbench.task-grants-page.name-may-read-its-new-data-can-withdraw"
  : act === "remove" ? "workbench.task-grants-page.name-removed-no-longer-offered"
  : row.status === "granted" ? "workbench.task-grants-page.name-withdrawn-next-run-cannot-read" : "workbench.task-grants-page.name-withdrawn-read-again-turn-task-s-data", { name: row.title });

export function bindTaskGrantsSettings(root: HTMLElement): void {
  if (root.dataset.taskGrantsBound === "1") return;
  root.dataset.taskGrantsBound = "1";
  const project = root.dataset.project ?? "", endpoint = "/projects/" + encodeURIComponent(project) + "/api/settings/task-grants";
  const list = root.querySelector<HTMLElement>("[data-task-grants-list]")!;
  const post: Post = body => molisWorkRequest(endpoint, { body, fallback: uiText.text("workbench.task-grants-page.that-did-not-finish") });
  let listed: Listed | null = null;
  /** Titles found this time the page is open, by installation; `asked` is which keys each installation was asked for. */
  const titles = new Map<string, Map<string, Title>>(), asked = new Map<string, Set<string>>(), busy = new Set<string>();

  async function load(): Promise<void> {
    const language = document.documentElement.lang;
    list.setAttribute("aria-busy", "true");
    try {
      const next = await post<Listed>({ mode: "list" });
      await Promise.all(next.installations.filter(install => install.titled).map(install => {
        const keys = new Set(next.subjects.filter(subject => subject.plugin_install_id === install.plugin_install_id).map(subject => subject.key));
        const before = asked.get(install.plugin_install_id);
        if (before && [...keys].every(key => before.has(key))) return undefined;
        const found = titles.get(install.plugin_install_id) ?? new Map<string, Title>();
        titles.set(install.plugin_install_id, found); asked.set(install.plugin_install_id, keys);
        return readTitles(post, install.plugin_install_id, keys, found);
      }));
      listed = next; draw();
      if (language !== document.documentElement.lang) void retitle();
    } catch {
      list.innerHTML = `<div class="task-grants-page__state is-error"><span>${escape(uiText.text("workbench.task-grants-page.cannot-read-background-tasks-permissions-right-now"))}</span>${button("common.control.retry", "mw-btn--secondary", "reload")}</div>`;
    } finally { list.removeAttribute("aria-busy"); }
  }

  let languageTurn = 0;
  async function retitle(): Promise<void> {
    if (!listed) return;
    const turn = ++languageTurn;
    try {
      const current = await post<Listed>({ mode: "list" });
      if (!root.isConnected || !listed || turn !== languageTurn) return;
      const words = new Map([...current.categories, ...current.subjects.flatMap(subject => subject.categories)]
        .map(category => [taskGrantCategoryName(category), category]));
      const retitleCategory = <T extends TaskGrantCategory>(category: T): T => {
        const next = words.get(taskGrantCategoryName(category));
        return next ? { ...category, title: next.title, description: next.description } : category;
      };
      listed = { ...listed, categories: listed.categories.map(retitleCategory),
        subjects: listed.subjects.map(subject => ({ ...subject, categories: subject.categories.map(retitleCategory) })) };
      const focused = document.activeElement instanceof HTMLElement && list.contains(document.activeElement) ? document.activeElement : null;
      const task = focused?.closest<HTMLElement>("[data-task-grants-task]")?.dataset.taskGrantsTask;
      const category = focused?.closest<HTMLElement>("[data-task-grants-row]")?.dataset.taskGrantsRow;
      const action = focused?.dataset.taskGrantsAct;
      draw();
      if (task !== undefined && focused) {
        const scope = list.querySelector(`[data-task-grants-task="${CSS.escape(task)}"]`);
        const area = category === undefined ? scope : scope?.querySelector(`[data-task-grants-row="${CSS.escape(category)}"]`);
        const replacement = action === undefined ? area?.querySelector("a") : area?.querySelector(`[data-task-grants-act="${CSS.escape(action)}"]`);
        if (replacement instanceof HTMLElement) replacement.focus({ preventScroll: true });
      }
    } catch { if (root.isConnected && turn === languageTurn) toast(uiText.text("workbench.language.window-failed"), true); }
  }
  refreshSettingsLanguage.set(root, () => { void retitle(); });

  const installName = (install: Installation | undefined) => {
    const name = install?.name ?? install?.plugin_install_id ?? "";
    return name;
  };
  const titleOf = (subject: TaskGrantSubject) => titles.get(subject.plugin_install_id)?.get(subject.key);
  const nameOf = (subject: TaskGrantSubject) => titleOf(subject)?.title
    ?? uiText.text("workbench.task-grants-page.name-task", { name: installName(listed?.installations.find(install => install.plugin_install_id === subject.plugin_install_id)) });
  const held = (subject: TaskGrantSubject) => taskGrantRows({ categories: listed!.categories, subject }).filter(row => row.status !== "off");

  /** A task: its name (its plugin's title for it, or the plugin's name and "a task"), 打开 when it has one, 全部撤回, then its rows. */
  function taskHtml(subject: TaskGrantSubject): string {
    const target = titleOf(subject), name = escape(nameOf(subject)), open = escape(uiText.text("common.control.open"));
    return `<article class="task-grants-page__task" data-task-grants-task="${escape(subjectId(subject))}"${busy.has(subjectId(subject)) ? ' aria-busy="true"' : ""}>`
      + `<header class="task-grants-page__task-head"><strong${target ? "" : ' class="is-unnamed"'} title="${name}">${name}</strong><span class="task-grants-page__task-actions">`
      + (target ? `<a class="mw-btn mw-btn--sm mw-btn--ghost" href="${escape(openHref(project, target))}" aria-label="${open} · ${escape(target.title)}">${open}</a>` : "")
      + `${button("workbench.task-grants-page.withdraw-all", "mw-btn--ghost", "clear", nameOf(subject))}</span></header><ul class="task-grants-page__rows">${held(subject).map(rowHtml).join("")}</ul></article>`;
  }

  function draw(): void {
    if (!listed) return;
    const subjects = listed.subjects.filter(subject => held(subject).length > 0);
    if (!subjects.length) { list.innerHTML = `<p class="task-grants-page__state">${escape(uiText.text("workbench.task-grants-page.no-background-task-may-read-project-s-data"))}</p>`; return; }
    const groups = new Map<string, TaskGrantSubject[]>();
    for (const subject of subjects) groups.set(subject.plugin_install_id, [...groups.get(subject.plugin_install_id) ?? [], subject]);
    const installs = [...groups.keys()].map(id => listed!.installations.find(install => install.plugin_install_id === id) ?? { plugin_install_id: id, plugin_id: null, name: null, titled: false });
    list.innerHTML = installs.sort((left, right) => installName(left).localeCompare(installName(right))).map(install => {
      const tasks = groups.get(install.plugin_install_id)!;
      // Named tasks first, by title; the ones the plugin did not name keep their order.
      const ordered = [...tasks].sort((left, right) => Number(!titleOf(left)) - Number(!titleOf(right)) || (titleOf(left) && titleOf(right) ? nameOf(left).localeCompare(nameOf(right)) : 0));
      return `<section class="task-grants-page__group" data-task-grants-install="${escape(install.plugin_install_id)}"><h3 class="task-grants-page__group-head"><span>${escape(installName(install))}</span>`
        + `<span class="mw-badge mw-badge--neutral" data-slot="badge">${tasks.length}</span></h3>${ordered.map(taskHtml).join("")}</section>`;
    }).join("");
    // A note cut short keeps its words as a tooltip; a task with a write in flight takes no other press.
    list.querySelectorAll("em").forEach(note => { note.title = note.textContent!; });
    list.querySelectorAll<HTMLButtonElement>("article[aria-busy] button").forEach(control => { control.disabled = true; });
  }

  /** Puts the task's new state in place: the answer of `set` is the task as it is now (§6), shown without reading again. */
  function settle(subject: TaskGrantSubject, next: TaskGrantSubject | null): void {
    if (!listed) return;
    listed = { ...listed, subjects: listed.subjects.flatMap(item => subjectId(item) !== subjectId(subject) ? [item] : next && next.categories.length ? [next] : []) };
  }
  /** A write failed: changed elsewhere reads the page again (§3.6 冲突); anything else leaves the grants as they were. */
  async function failed(error: unknown): Promise<void> {
    if ((error as { code?: string }).code === "actions.conflict") { toast(uiText.text("workbench.task-grants-page.changed-elsewhere-refreshed")); await load(); return; }
    toast(uiText.text("workbench.task-grants-page.not-saved-permissions-they-were"), true);
  }
  async function write(subject: TaskGrantSubject, send: () => Promise<TaskGrantSubject | null>, done: () => string): Promise<void> {
    const id = subjectId(subject); if (busy.has(id)) return;
    busy.add(id); draw();
    try { settle(subject, await send()); toast(done()); }
    catch (error) { busy.delete(id); await failed(error); }
    finally { busy.delete(id); draw(); }
  }

  /** Taking one category back, allowing one, or removing one no longer offered: one `set` of the task's categories as read, ± this one. */
  function change(subject: TaskGrantSubject, row: Row, act: "off" | "allow" | "remove"): Promise<void> {
    const sent = taskGrantChange(act, row, subject);
    return write(subject, async () => (await post<{ subject: TaskGrantSubject }>({ mode: "set", plugin_install_id: subject.plugin_install_id, key: subject.key,
      categories: sent.categories, expected_revision: subject.revision })).subject, () => doneText(act, row));
  }

  /** Everything a task may read, taken back in one `clear` once the person says so. */
  async function clear(subject: TaskGrantSubject): Promise<void> {
    const task = nameOf(subject);
    if (!await ask(root, uiText.text("workbench.task-grants-page.withdraw-everything-task-may-read"), uiText.text("workbench.task-grants-page.its-next-run-task-reads-no-plugin-s", { task }))) return;
    await write(subject, async () => { await post({ mode: "clear", plugin_install_id: subject.plugin_install_id, key: subject.key }); return null; },
      () => uiText.text("workbench.task-grants-page.everything-task-may-read-withdrawn", { task }));
  }

  // Which control, which task and which row, read from the markup: the task by its installation and key, the row by its category.
  list.addEventListener("click", event => {
    const control = (event.target as Element).closest<HTMLElement>("[data-task-grants-act]"), act = control?.dataset.taskGrantsAct;
    if (act === "reload") { void load(); return; }
    const card = control?.closest<HTMLElement>("[data-task-grants-task]")?.dataset.taskGrantsTask;
    const subject = listed?.subjects.find(item => subjectId(item) === card);
    if (!subject) return;
    if (act === "clear") { void clear(subject); return; }
    const row = held(subject).find(item => item.name === control!.closest<HTMLElement>("[data-task-grants-row]")?.dataset.taskGrantsRow);
    if (row && (act === "off" || act === "allow" || act === "remove")) void change(subject, row, act);
  });
  void load();
}

const bindAll = (container: ParentNode) => {
  if (container instanceof HTMLElement && container.matches("[data-task-grants-settings]")) bindTaskGrantsSettings(container);
  else container.querySelectorAll<HTMLElement>("[data-task-grants-settings]").forEach(bindTaskGrantsSettings);
};
document.addEventListener("molis-work:settings-embed", event => {
  const root = (event as CustomEvent<{ root?: ParentNode }>).detail?.root;
  if (root) bindAll(root);
});
document.addEventListener("molis-work:language-changed", () => {
  document.querySelectorAll<HTMLElement>("[data-task-grants-settings]").forEach(root => refreshSettingsLanguage.get(root)?.());
});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bindAll(document));
else bindAll(document);
