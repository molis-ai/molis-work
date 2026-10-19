import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { AgentWriteChecker, AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";
import { writeCheckerFieldsOf, writeCheckerFromFields, writeCheckersAfter, type WriteCheckerFields } from "../scripts/write-checkers.js";

/** The page's one request helper (packages/ui-host request-client): control headers, one origin, plain Errors with `code`. */
declare const molisWorkRequest: UiRequest;

type Translate = (text: string, vars?: Record<string, string | number>) => string;
type Folder = { readonly workspace_id: string; readonly display_name: string };
type Kept = AgentWriteCheckerList;
type Checker = Kept["checkers"][number];

/**
 * What the workspaces section hands the after-write checkers (specs/prologue-adoption §6.0p.12): its own part of the page,
 * the project's route prefix and the page's translate. The program sets `load`, which the section calls with the folders it
 * has just read.
 */
export interface WriteCheckersHost {
  readonly section: Element | null;
  readonly prefix: string;
  readonly translate: Translate;
  load: ((folders: readonly Folder[]) => Promise<void>) | null;
}

const FIELDS = ["display_name", "executable", "args", "applies_to", "cwd", "timeout_seconds"] as const satisfies readonly (keyof WriteCheckerFields)[];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function actionButton(label: string, onClick: () => void, kind = "secondary"): HTMLButtonElement {
  const node = el("button", "mw-btn mw-btn--" + kind, label);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

/** One kept checker: what it runs on which files, with change, move up (not on the first) and delete. */
function checkerRow(L: Translate, checker: Checker, first: boolean, act: { edit(): void; up(): void; remove(): void }): HTMLElement {
  const row = el("div", "settings-setting-row"), text = el("span", "setting-copy"), actions = el("span", "setting-value");
  text.append(el("strong", "", checker.display_name), el("code", "", checker.executable + " " + writeCheckerFieldsOf(checker).args),
    el("span", "", L("适用 {extensions} · 目录 {cwd} · 时限 {seconds} 秒", { extensions: checker.applies_to.join(" "), cwd: checker.cwd, seconds: checker.timeout_ms / 1000 })));
  actions.append(actionButton(L("修改"), act.edit));
  if (!first) actions.append(actionButton(L("上移"), act.up));
  actions.append(actionButton(L("删除"), act.remove, "danger-outline"));
  row.append(text, actions);
  return row;
}

/**
 * One group per workspace the list action returns (authorized, its real path verified). Every change saves the whole group
 * against the version read; a stale version reads them again and says so where the change was made.
 */
export function bindWriteCheckers(host: WriteCheckersHost): void {
  const section = host.section;
  if (!section) return;
  const L = host.translate;
  const list = section.querySelector("[data-write-checkers-list]") as HTMLElement;
  const status = section.querySelector("[data-write-checkers-status]") as HTMLElement;
  const dialog = section.querySelector("[data-write-checkers-dialog]") as HTMLDialogElement;
  const form = dialog.querySelector("form") as HTMLFormElement;
  const error = dialog.querySelector("[data-write-checkers-error]") as HTMLElement;
  const input = (name: keyof WriteCheckerFields) => form.elements.namedItem(name) as HTMLInputElement;
  const call = <T>(body?: unknown) => molisWorkRequest<T>(host.prefix + "/api/project-settings/write-checkers", { body, fallback: L("写后检查器操作失败") });
  let folders: readonly Folder[] = [], lists: Kept[] = [], busy = false;
  let editing: { workspace_id: string; checker_id: string | null } | null = null;

  const lock = (on: boolean) => { busy = on; list.querySelectorAll("button").forEach((node) => { node.disabled = on; }); };
  const read = async () => {
    status.textContent = L("正在读取写后检查器…");
    try { lists = (await call<{ lists: Kept[] }>()).lists; render(); }
    catch (caught) { list.replaceChildren(); molisWorkRequest.show(status, caught); }
  };
  const save = async (kept: Kept, checkers: AgentWriteChecker[], target: HTMLElement): Promise<boolean> => {
    if (busy) return false;
    lock(true);
    try {
      const saved = await call<Kept>({ workspace_id: kept.workspace_id, expected_version: kept.version, checkers });
      lists = lists.map((item) => item.workspace_id === saved.workspace_id ? saved : item);
      render(); status.textContent = L("写后检查器已保存。");
      return true;
    } catch (caught) {
      if ((caught as { code?: unknown } | null)?.code === "actions.conflict") { await read(); target.textContent = L("这组检查器已在别处改过，已重新读取，请再改一次。"); }
      else molisWorkRequest.show(target, caught);
      target.hidden = false;
      return false;
    } finally { lock(false); }
  };
  const open = (kept: Kept, checker: Checker | null) => {
    editing = { workspace_id: kept.workspace_id, checker_id: checker ? checker.checker_id : null };
    form.reset(); error.hidden = true;
    if (checker) { const fields = writeCheckerFieldsOf(checker); for (const name of FIELDS) input(name).value = fields[name]; }
    const title = checker ? L("修改检查器") : L("添加检查器");
    (dialog.querySelector("[data-write-checkers-title]") as HTMLElement).textContent = title;
    dialog.setAttribute("aria-label", title);
    dialog.showModal();
  };
  const group = (kept: Kept) => {
    const folder = folders.find((item) => item.workspace_id === kept.workspace_id);
    const node = el("div"), head = el("div", "settings-setting-row"), copy = el("span", "setting-copy");
    node.dataset.writeCheckersWorkspace = kept.workspace_id;
    copy.append(el("strong", "", folder ? folder.display_name : kept.workspace_id), el("span", "", kept.version ? L("第 {version} 版", { version: kept.version }) : L("还没有保存过")));
    head.append(copy, actionButton(L("添加检查器"), () => open(kept, null)));
    node.append(head);
    if (!kept.checkers.length) node.append(el("p", "mw-field__hint", L("这个目录没有写后检查，写入后显示「未检查」。")));
    kept.checkers.forEach((checker, index) => node.append(checkerRow(L, checker, index === 0, {
      edit: () => open(kept, checker),
      up: () => void save(kept, writeCheckersAfter(kept.checkers, checker.checker_id, "up"), status),
      remove: () => { if (confirm(L("删除检查器「{name}」？", { name: checker.display_name }))) void save(kept, writeCheckersAfter(kept.checkers, checker.checker_id, "remove"), status); },
    })));
    return node;
  };
  const render = () => {
    list.replaceChildren(...lists.map(group));
    status.textContent = lists.length ? "" : L("先在上方关联目录，再给它配写后检查。");
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = editing, kept = target && lists.find((item) => item.workspace_id === target.workspace_id);
    if (!target || !kept) { error.textContent = L("这个目录已不在授权的目录里。"); error.hidden = false; return; }
    const fields = Object.fromEntries(FIELDS.map((name) => [name, input(name).value])) as Record<keyof WriteCheckerFields, string>;
    const checker = writeCheckerFromFields(fields, kept.checkers.map((item) => item.checker_id).filter((id) => id !== target.checker_id), target.checker_id);
    const submit = form.querySelector("[type=submit]") as HTMLButtonElement;
    submit.disabled = true; error.hidden = true;
    try { if (await save(kept, writeCheckersAfter(kept.checkers, target.checker_id, checker), error)) { dialog.close(); editing = null; } }
    finally { submit.disabled = false; }
  });
  (dialog.querySelector("[data-write-checkers-cancel]") as HTMLElement).addEventListener("click", () => { if (!busy) dialog.close(); });
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  host.load = (next) => { folders = next; return read(); };
}
