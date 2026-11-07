import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { TaskGrantListResult, TaskGrantSubject } from "@molis-ai/molis-work-contracts/services/agent-task-grants";
import { taskGrantChange, taskGrantRows } from "./plugin-frame/task-grants-area.js";

/**
 * 授权与放行 in a project's settings (specs/proactive-assistant/task-grants-platform-area.md §5): every background task's grants,
 * grouped by the installation it is in, one row per category it holds. It reads once on open (`list`, then each installation's own
 * titles, §5.2) and never polls; a change is one `set` or `clear`, formed as the task's own area forms it (§3.6, the shared
 * `taskGrantChange`), and the answer is shown without reading again. The rows' words are the area's (`taskGrantRows`, the provider's
 * English from the shell dictionary or its own `ui.translations`). Everything is drawn with textContent.
 */
type Translate = (text: string, values?: Record<string, string | number>) => string;
type Row = ReturnType<typeof taskGrantRows>[number];
interface Installation { plugin_install_id: string; plugin_id: string | null; name: string | null; titled: boolean }
interface Listed extends TaskGrantListResult { installations: Installation[] }
interface Title { key: string; title: string; open: { surface: string; id: string } }
interface TitlesPage { entries: Title[]; next_cursor: string | null }

const page = globalThis as typeof globalThis & { L?: Translate; LF?: (pluginId: string, text: string) => string; molisWorkRequest: UiRequest };
const L: Translate = (text, values) => page.L ? page.L(text, values) : Object.entries(values ?? {}).reduce((out, [key, value]) => out.split("{" + key + "}").join(String(value)), text);
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const button = (text: string, variant: string, act: string) => { const node = el("button", "mw-btn mw-btn--sm " + variant, text); node.type = "button"; node.dataset.taskGrantsAct = act; return node; };
const badge = (text: string, tone: string) => { const node = el("span", "mw-badge mw-badge--" + tone, text); node.dataset.slot = "badge"; return node; };
/** A row's state as a tag in its state's colour (DESIGN.md, a row is one line); the area's longer note is its tooltip. */
const STATES: Record<string, [string, string, string]> = {
  granted: ["已允许", "success", ""], needs_confirmation: ["有新的读取能力", "warning", "有新的读取能力，允许之前读不到"],
  unavailable: ["暂时不可读", "neutral", "暂时读不到，授权还在"], removed: ["已不再提供", "neutral", "这一类已不再提供"],
};
const subjectId = (subject: Pick<TaskGrantSubject, "plugin_install_id" | "key">) => subject.plugin_install_id + "\n" + subject.key;

type Post = <T>(body: Record<string, unknown>) => Promise<T>;
/** The settings page's own toast: what a write did, or that it did not. */
const toast = (text: string, error = false) => {
  const box = document.querySelector<HTMLElement>("[data-settings-toast], [data-toast]"); if (!box) return;
  box.textContent = text; box.classList.toggle("is-error", error); box.classList.add("is-visible");
  setTimeout(() => box.classList.remove("is-visible"), error ? 5000 : 2600);
};

/** One installation's titles (§5.2): a page of up to 500 of its own entries; the next only while a task is still unnamed. */
async function readTitles(post: Post, install: string, keys: ReadonlySet<string>, found: Map<string, Title>): Promise<void> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  try {
    do {
      const answer: TitlesPage = await post<TitlesPage>({ mode: "titles", plugin_install_id: install, cursor });
      for (const entry of answer.entries) if (keys.has(entry.key)) found.set(entry.key, entry);
      // A cursor given twice would never end; past it, the tasks still unnamed are named by their plugin.
      cursor = [...keys].some(key => !found.has(key)) && answer.next_cursor && !seen.has(answer.next_cursor) ? answer.next_cursor : null;
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

/** The catalog's alert dialog: cancel is the default. */
function ask(root: HTMLElement, title: string, description: string): Promise<boolean> {
  return new Promise(resolve => {
    const dialog = el("dialog", "mw-dialog mw-dialog--alert"), form = el("form", "mw-form mw-dialog__shell"), header = el("header", "mw-form__header"), heading = el("div");
    dialog.dataset.slot = "alert-dialog"; form.method = "dialog";
    heading.append(el("h2", "", title), el("p", "", description)); header.append(heading);
    const footer = el("footer", "mw-form__footer"), cancel = button(L("取消"), "mw-btn--secondary", "cancel"), yes = button(L("全部撤回"), "mw-btn--danger", "confirm");
    cancel.classList.replace("mw-btn--sm", "mw-btn--md"); yes.classList.replace("mw-btn--sm", "mw-btn--md");
    let answer = false;
    cancel.addEventListener("click", () => dialog.close());
    yes.addEventListener("click", () => { answer = true; dialog.close(); });
    dialog.addEventListener("close", () => { dialog.remove(); resolve(answer); });
    footer.append(cancel, yes); form.append(header, footer); dialog.append(form); root.append(dialog); dialog.showModal(); cancel.focus();
  });
}

/** One category the task holds, on one line: its name and what it is, its state as a tag, and its one or two actions. */
function rowElement(row: Row): HTMLLIElement {
  const item = el("li", "mw-item task-grants-page__row"), copy = el("span", "task-grants-page__copy"), end = el("span", "mw-item__end");
  item.dataset.taskGrantsRow = row.name; item.dataset.status = row.status;
  const title = el("strong", "", row.title), description = el("small", "", row.description);
  title.title = row.title; description.title = row.description; copy.append(title, description);
  const [label, tone, note] = STATES[row.status]!, state = badge(L(label), tone);
  if (note) state.title = L(note);
  end.append(state);
  if (row.status === "needs_confirmation") end.append(button(L("允许"), "mw-btn--secondary", "allow"));
  end.append(row.status === "removed" ? button(L("移除"), "mw-btn--secondary", "remove") : button(L("撤回"), "mw-btn--ghost", "off"));
  for (const control of end.querySelectorAll<HTMLButtonElement>("[data-task-grants-act]")) control.setAttribute("aria-label", control.textContent + " · " + row.title);
  item.append(copy, end);
  return item;
}

export function bindTaskGrantsSettings(root: HTMLElement): void {
  if (root.dataset.taskGrantsBound === "1") return;
  root.dataset.taskGrantsBound = "1";
  const endpoint = "/projects/" + encodeURIComponent(root.dataset.project ?? "") + "/api/settings/task-grants";
  const list = root.querySelector<HTMLElement>("[data-task-grants-list]")!;
  const post: Post = body => page.molisWorkRequest(endpoint, { body, fallback: L("操作没有完成") });
  let listed: Listed | null = null;
  /** Titles found this time the page is open, by installation; `asked` is which keys each installation was asked for. */
  const titles = new Map<string, Map<string, Title>>(), asked = new Map<string, Set<string>>(), busy = new Set<string>();

  async function load(): Promise<void> {
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
    } catch {
      const failed = el("div", "task-grants-page__state is-error");
      failed.append(el("span", "", L("暂时读不到后台任务的授权")), button(L("重试"), "mw-btn--secondary", "reload"));
      list.replaceChildren(failed);
    } finally { list.removeAttribute("aria-busy"); }
  }

  const installName = (install: Installation | undefined) => {
    const name = install?.name ?? install?.plugin_install_id ?? "";
    return install?.plugin_id && page.LF ? page.LF(install.plugin_id, name) : L(name);
  };
  const titleOf = (subject: TaskGrantSubject) => titles.get(subject.plugin_install_id)?.get(subject.key);
  const nameOf = (subject: TaskGrantSubject) => titleOf(subject)?.title
    ?? L("{name} · 一个任务", { name: installName(listed?.installations.find(install => install.plugin_install_id === subject.plugin_install_id)) });
  const held = (subject: TaskGrantSubject) => taskGrantRows({ categories: listed!.categories, subject }).filter(row => row.status !== "off");

  function categoryRow(subject: TaskGrantSubject, row: Row): HTMLLIElement {
    const item = rowElement(row);
    item.addEventListener("click", event => {
      const act = (event.target as Element).closest<HTMLElement>("[data-task-grants-act]")?.dataset.taskGrantsAct;
      if (act === "off" || act === "allow" || act === "remove") void change(subject, row, act);
    });
    return item;
  }

  function taskCard(subject: TaskGrantSubject): HTMLElement {
    const card = el("article", "task-grants-page__task"), head = el("header", "task-grants-page__task-head"), target = titleOf(subject);
    card.dataset.taskGrantsTask = subjectId(subject);
    if (busy.has(subjectId(subject))) card.setAttribute("aria-busy", "true");
    const name = el("strong", target ? "" : "is-unnamed", nameOf(subject)); name.title = name.textContent ?? "";
    const actions = el("span", "task-grants-page__task-actions");
    if (target) {
      const open = el("a", "mw-btn mw-btn--sm mw-btn--ghost", L("打开")); open.href = openHref(root.dataset.project ?? "", target);
      open.setAttribute("aria-label", L("打开") + " · " + target.title); actions.append(open);
    }
    const all = button(L("全部撤回"), "mw-btn--ghost", "clear"); all.setAttribute("aria-label", L("全部撤回") + " · " + nameOf(subject));
    all.addEventListener("click", () => void clear(subject));
    actions.append(all); head.append(name, actions);
    const rows = el("ul", "task-grants-page__rows"); rows.append(...held(subject).map(row => categoryRow(subject, row)));
    card.append(head, rows);
    if (card.hasAttribute("aria-busy")) card.querySelectorAll<HTMLButtonElement>("button").forEach(control => { control.disabled = true; });
    return card;
  }

  function draw(): void {
    if (!listed) return;
    const subjects = listed.subjects.filter(subject => held(subject).length > 0);
    if (!subjects.length) { list.replaceChildren(el("p", "task-grants-page__state", L("还没有后台任务能读这个项目的数据。在一个任务的「能读的数据」里打开一类之后，它会列在这里。"))); return; }
    const groups = new Map<string, TaskGrantSubject[]>();
    for (const subject of subjects) groups.set(subject.plugin_install_id, [...groups.get(subject.plugin_install_id) ?? [], subject]);
    const installs = [...groups.keys()].map(id => listed!.installations.find(install => install.plugin_install_id === id) ?? { plugin_install_id: id, plugin_id: null, name: null, titled: false });
    const sections = installs.sort((left, right) => installName(left).localeCompare(installName(right))).map(install => {
      const section = el("section", "task-grants-page__group"), head = el("h3", "task-grants-page__group-head"), tasks = groups.get(install.plugin_install_id)!;
      section.dataset.taskGrantsInstall = install.plugin_install_id;
      head.append(el("span", "", installName(install)), badge(String(tasks.length), "neutral"));
      // Named tasks first, by title; the ones the plugin did not name keep their order.
      const ordered = [...tasks].sort((left, right) => Number(!titleOf(left)) - Number(!titleOf(right)) || (titleOf(left) && titleOf(right) ? nameOf(left).localeCompare(nameOf(right)) : 0));
      section.append(head, ...ordered.map(taskCard));
      return section;
    });
    list.replaceChildren(...sections);
  }

  /** Puts the task's new state in place: the answer of `set` is the task as it is now (§6), shown without reading again. */
  function settle(subject: TaskGrantSubject, next: TaskGrantSubject | null): void {
    if (!listed) return;
    listed = { ...listed, subjects: listed.subjects.flatMap(item => subjectId(item) !== subjectId(subject) ? [item] : next && next.categories.length ? [next] : []) };
  }
  /** A write failed: changed elsewhere reads the page again (§3.6 冲突); anything else leaves the grants as they were. */
  async function failed(error: unknown): Promise<void> {
    if ((error as { code?: string }).code === "actions.conflict") { toast(L("已在别处改动，已刷新")); await load(); return; }
    toast(L("没能保存，原来的授权没变"), true);
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
    const { categories } = taskGrantChange(act, row, subject), name = { name: row.title };
    return write(subject, async () => (await post<{ subject: TaskGrantSubject }>({ mode: "set", plugin_install_id: subject.plugin_install_id, key: subject.key,
      categories, expected_revision: subject.revision })).subject, () => act === "allow" ? L("已允许{name}的新读取能力；不想要就撤回这一类", name)
      : act === "remove" ? L("已移除{name}，这一类已不再提供", name) : L("已撤回{name}，下一次运行起读不到", name));
  }

  /** Everything a task may read, taken back in one `clear` once the person says so. */
  async function clear(subject: TaskGrantSubject): Promise<void> {
    const task = nameOf(subject);
    if (!await ask(root, L("撤回这个任务能读的全部数据？"), L("「{task}」下一次运行起不再读任何插件的数据；要再读，到任务里重新打开。", { task }))) return;
    await write(subject, async () => { await post({ mode: "clear", plugin_install_id: subject.plugin_install_id, key: subject.key }); return null; },
      () => L("已撤回「{task}」能读的全部数据", { task }));
  }

  list.addEventListener("click", event => { if ((event.target as Element).closest("[data-task-grants-act=reload]")) void load(); });
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
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => bindAll(document));
else bindAll(document);
