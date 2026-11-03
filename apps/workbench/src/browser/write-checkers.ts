import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { AgentWriteChecker, AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";
import { writeCheckerFieldsOf, writeCheckerFromFields, writeCheckersAfter, type WriteCheckerFields } from "../scripts/write-checkers.js";

/** The page's one request helper (packages/ui-host request-client): control headers, one origin, plain Errors with `code`. */

type Folder = { readonly workspace_id: string; readonly display_name: string };
type Kept = AgentWriteCheckerList;
type Checker = Kept["checkers"][number];

/**
 * What the workspaces section hands the after-write checkers (specs/prologue-adoption §6.0p.13): its own part of the page and the
 * project's route prefix. The program sets `load`, which the section calls with the folders it has just read.
 */
export interface WriteCheckersHost {
  readonly section: HTMLElement | null;
  readonly prefix: string;
  load: ((folders: readonly Folder[]) => Promise<unknown>) | null;
}

let sections = 0;

/**
 * One group per workspace the list action returns (authorized, its real path verified). Every change saves the whole group
 * against the version read; a stale version reads them again and says so where the change was made.
 *
 * The program writes no sentence of its own: the host's section (src/write-checkers-section.ts) carries them all, in the page's
 * language, as `data-say` and as `<template>`s with `{slots}`; the program clones a template and fills the slots with
 * `textContent`, so nothing a person typed or a folder is called is ever read as markup. After every change, and whichever way a
 * dialog closes, focus goes back to the button the person used, or to the group's "add" when that button is gone.
 */
export function bindWriteCheckers(host: WriteCheckersHost): void {
  const section = host.section;
  if (!section) return;
  const say = JSON.parse(section.dataset.say as string) as Record<"loading" | "saved" | "none" | "stale" | "failed" | "gone" | "add" | "edit", string>;
  const part = <T extends HTMLElement = HTMLElement>(name: string) => section.querySelector(`[data-wc=${name}]`) as T;
  const list = part("list"), status = part("status"), error = part("error"), dialog = part<HTMLDialogElement>("dialog");
  const form = dialog.querySelector("form") as HTMLFormElement;
  // The section can be on a page twice, so the dialog's heading gets an id of its own here.
  const heading = dialog.querySelector("h2") as HTMLElement;
  heading.id += ++sections;
  dialog.setAttribute("aria-labelledby", heading.id);
  const call = <T>(body?: unknown) => molisWorkRequest<T>(host.prefix + "/api/project-settings/write-checkers", { body, fallback: say.failed });
  let folders: readonly Folder[] = [], lists: Kept[] = [], busy = false;
  let editing: { workspace_id: string; checker_id: string | null } | null = null;

  // A copy of a template with its `{slots}` filled (once: a value is never read for slots again) and the `data-if` parts it does not use dropped.
  const make = (name: string, values: Record<string, string | number> = {}, flags: Record<string, boolean> = {}): HTMLElement => {
    const node = document.importNode(part<HTMLTemplateElement>(name).content.firstElementChild as Element, true) as HTMLElement;
    const fill = (text: string) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
    for (const piece of node.querySelectorAll<HTMLElement>("*")) {
      if (piece.dataset.if && !flags[piece.dataset.if]) piece.remove();
      if (!piece.firstElementChild && piece.textContent?.includes("{")) piece.textContent = fill(piece.textContent);
      if (piece.ariaLabel?.includes("{")) piece.ariaLabel = fill(piece.ariaLabel);
    }
    return node;
  };
  // The button a person used, found again after the list was drawn anew; when it is gone (moved to the top, deleted) the group's "add".
  const refocus = (workspace: string, checker: string | null, act: string) => {
    const find = (css: string) => list.querySelector<HTMLElement>(`[data-workspace="${CSS.escape(workspace)}"] ${css}`);
    (find(`[data-checker="${CSS.escape(checker ?? "")}"] [data-act=${act}]`) ?? find("[data-act=add]"))?.focus();
  };
  const lock = (on: boolean) => { busy = on; list.querySelectorAll("button").forEach((node) => { node.disabled = on; }); };
  const render = () => {
    list.replaceChildren(...lists.map((kept) => {
      const folder = folders.find((item) => item.workspace_id === kept.workspace_id);
      const group = make("group", { folder: folder ? folder.display_name : kept.workspace_id, version: kept.version }, { saved: Boolean(kept.version), unsaved: !kept.version, empty: !kept.checkers.length });
      group.dataset.workspace = kept.workspace_id;
      group.append(...kept.checkers.map((checker, index) => {
        const row = make("row", { name: checker.display_name, command: checker.executable + " " + writeCheckerFieldsOf(checker).args,
          extensions: checker.applies_to.join(" "), cwd: checker.cwd, seconds: checker.timeout_ms / 1000 }, { movable: index > 0 });
        row.dataset.checker = checker.checker_id;
        return row;
      }));
      return group;
    }));
    status.textContent = lists.length ? "" : say.none;
  };
  const read = async (failure: HTMLElement = status): Promise<boolean> => {
    status.textContent = say.loading;
    try { lists = (await call<{ lists: Kept[] }>()).lists; render(); return true; }
    catch (caught) { status.textContent = ""; molisWorkRequest.show(failure, caught); return false; }
  };
  const save = async (kept: Kept, checkers: AgentWriteChecker[], target: HTMLElement): Promise<boolean> => {
    lock(true);
    try {
      const saved = await call<Kept>({ workspace_id: kept.workspace_id, expected_version: kept.version, checkers });
      lists = lists.map((item) => item.workspace_id === saved.workspace_id ? saved : item);
      render(); status.textContent = say.saved;
      return true;
    } catch (caught) {
      // The stale-version note replaces the failure only once the groups were read again; if that fails too, its own failure stands.
      molisWorkRequest.show(target, caught);
      if ((caught as { code?: unknown } | null)?.code === "actions.conflict" && await read(target)) target.textContent = say.stale;
      target.hidden = false;
      return false;
    } finally { lock(false); }
  };
  const change = async (kept: Kept, checkerId: string, how: "up" | "remove") => {
    await save(kept, writeCheckersAfter(kept.checkers, checkerId, how), status);
    refocus(kept.workspace_id, checkerId, how);
  };
  const open = (kept: Kept, checker: Checker | null) => {
    editing = { workspace_id: kept.workspace_id, checker_id: checker ? checker.checker_id : null };
    form.reset(); error.hidden = true;
    for (const [name, value] of Object.entries(checker ? writeCheckerFieldsOf(checker) : {})) (form.elements.namedItem(name) as HTMLInputElement).value = value;
    heading.textContent = checker ? say.edit : say.add;
    dialog.showModal();
  };
  // Deleting asks in the catalog's alert dialog; only its "delete" button (a method=dialog submit, returnValue "remove") goes on.
  const ask = (kept: Kept, checker: Checker) => {
    const question = make("remove", { name: checker.display_name }) as HTMLDialogElement;
    question.addEventListener("close", () => {
      question.remove();
      if (question.returnValue === "remove") void change(kept, checker.checker_id, "remove");
      else refocus(kept.workspace_id, checker.checker_id, "remove");
    });
    section.append(question);
    question.showModal();
  };

  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLElement>("[data-act]");
    const kept = button && lists.find((item) => item.workspace_id === button.closest<HTMLElement>("[data-workspace]")?.dataset.workspace);
    if (!button || !kept) return;
    const id = button.closest<HTMLElement>("[data-checker]")?.dataset.checker ?? null;
    const checker = kept.checkers.find((item) => item.checker_id === id) ?? null;
    if (button.dataset.act === "add" || button.dataset.act === "edit") open(kept, checker);
    else if (button.dataset.act === "up" && id) void change(kept, id, "up");
    else if (button.dataset.act === "remove" && checker) ask(kept, checker);
  });
  section.addEventListener("click", (event) => {
    const close = (event.target as Element).closest("[data-dialog-close]");
    if (close && !busy) (close.closest("dialog") as HTMLDialogElement).close();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const target = editing, kept = target && lists.find((item) => item.workspace_id === target.workspace_id);
    if (!target || !kept) { error.textContent = say.gone; error.hidden = false; return; }
    const data = new FormData(form), text = (name: keyof WriteCheckerFields) => String(data.get(name) ?? "");
    const fields: WriteCheckerFields = { display_name: text("display_name"), executable: text("executable"), args: text("args"),
      applies_to: text("applies_to"), cwd: text("cwd"), timeout_seconds: text("timeout_seconds") };
    const checker = writeCheckerFromFields(fields, kept.checkers.map((item) => item.checker_id).filter((id) => id !== target.checker_id), target.checker_id);
    const submit = form.querySelector("[type=submit]") as HTMLButtonElement;
    submit.disabled = true; error.hidden = true;
    try { if (await save(kept, writeCheckersAfter(kept.checkers, target.checker_id, checker), error)) dialog.close(); }
    finally { submit.disabled = false; if (dialog.open) submit.focus(); }
  });
  dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
  // Closed any way (saved, cancelled, Esc): the list was drawn anew behind it, so the opener is gone; focus goes where the person was.
  dialog.addEventListener("close", () => { if (editing) refocus(editing.workspace_id, editing.checker_id, "edit"); editing = null; });
  host.load = (next) => { folders = next; return read(); };
}
