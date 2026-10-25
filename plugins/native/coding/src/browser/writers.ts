import { WRITER_SPLIT_HEAD } from "../writer-split.js";
import { el, errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** One directory a parallel-writers round may split work across, as `GET /workspaces/<id>/writers` lists it. */
interface WriterDirectory {
  readonly workspace_id?: string;
  readonly canonical_path: string;
  readonly branch?: string;
  readonly base_commit: string;
  readonly problem?: string;
}

/** What the person typed for a directory, kept while the dialog is open. */
interface Draft { task: string; selected: boolean }

/** A split the session keeps for its next round. */
export interface WriterAssignment { readonly workspace_id: string; readonly task: string }

export interface WriterPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "api" | "current" | "status"> {
  /** The Git directory the session works in, and what to call it. */
  readonly workspace: () => string;
  readonly workspaceLabel: () => string;
  readonly assignments: () => readonly WriterAssignment[];
  readonly saveAssignments: (owner: string, parent: string, assignments: readonly WriterAssignment[]) => Promise<void>;
  /** Makes a directory the session's working directory for the next round. */
  readonly select: (owner: string, workspaceId: string) => Promise<void>;
  /** Draws the review cards of the directory's runs (the Host's). */
  readonly reviews: (container: Element, workspaceId: string) => unknown;
}

/** A user turn of a parallel-writers round, and the frozen grants its run was given. */
export interface WriterTurnRun {
  readonly frozen: { readonly role_id: string; readonly subagent_workspaces?: readonly { readonly workspace_id: string; readonly directory: { readonly canonical_path: string } }[] };
}
export interface WriterTurn { readonly kind: string; readonly steer?: unknown; readonly text: string }

interface SplitRow { readonly workspace_id: string; readonly directory: string; readonly task: string; readonly branch: string; readonly base_commit: string }

export interface WriterDirectories {
  refresh(): Promise<void>;
  /** Draws a user turn as its task and the split the person confirmed; false when the turn is not one. */
  renderTurn(target: Element, run: WriterTurnRun, turn: WriterTurn): boolean;
}

/** What the dialog holds while it is open. */
interface Dialog {
  readonly ports: WriterPorts;
  readonly dialog: HTMLDialogElement;
  readonly list: HTMLElement;
  readonly message: HTMLElement;
  parent: string;
  owner: string;
  operation: string;
  busy: boolean;
  reading: boolean;
  ticket: number;
  renderKey: string;
  assignments: Map<string, Draft>;
}

const draftKey = (state: Dialog) => "molis-coding-writer-draft:" + state.owner + ":" + state.parent;
const path = (state: Dialog) => "/workspaces/" + encodeURIComponent(state.parent) + "/writers";

const remember = (state: Dialog) => {
  try { sessionStorage.setItem(draftKey(state), JSON.stringify([...state.assignments])); } catch { /* storage closed: the split stays in the dialog */ }
};

const button = (label: string) => {
  const node = el("button", label, "mw-btn");
  node.type = "button";
  return node;
};

/** The check box that puts a directory in the split, and the task it is given. */
function assignmentFields(state: Dialog, row: HTMLElement, directory: WriterDirectory, draft: Draft) {
  const { translate: L, lifetime } = state.ports;
  const join = el("label", "", "mw-check-row"), check = el("input");
  check.type = "checkbox";
  check.setAttribute("aria-label", L("coding.writers.assign-label", { path: directory.canonical_path }));
  check.className = "mw-check";
  check.checked = draft.selected;
  join.append(check, el("span", L("coding.writers.join")));
  row.append(join);
  const field = el("label", "", "mw-field"), task = el("textarea");
  task.setAttribute("aria-label", L("coding.writers.task-label", { path: directory.canonical_path }));
  task.className = "mw-textarea";
  task.rows = 3;
  task.maxLength = 8000;
  task.value = draft.task;
  task.disabled = !draft.selected;
  field.append(el("span", L("coding.writers.task")), task);
  row.append(field);
  lifetime.listen(check, "change", () => {
    draft.selected = check.checked;
    task.disabled = !check.checked;
    remember(state);
  });
  lifetime.listen(task, "input", () => {
    draft.task = task.value;
    remember(state);
  });
}

/** The directory a round may work in, with its split fields and the button that makes it the working directory. */
function directoryRow(state: Dialog, directory: WriterDirectory) {
  const { translate: L, lifetime } = state.ports;
  const row = el("section", "", "coding-material");
  row.append(el("p", directory.canonical_path), el("p", L("coding.writers.branch", { branch: directory.branch || L("coding.writers.no-branch") })));
  // A directory whose branch or origin no longer matches is listed so it is not a mystery, but it takes no work.
  if (directory.problem) {
    row.append(el("p", L("coding.writers.problem", { reason: directory.problem })));
    return row;
  }
  row.append(el("p", L("coding.writers.base", { commit: directory.base_commit })));
  const id = directory.workspace_id;
  if (!id) {
    row.append(el("p", L("coding.writers.unauthorized")));
    return row;
  }
  const draft = state.assignments.get(id) || { task: "", selected: false };
  state.assignments.set(id, draft);
  assignmentFields(state, row, directory, draft);
  const use = button(L("coding.writers.use"));
  lifetime.listen(use, "click", async () => {
    if (state.busy) return;
    state.busy = true;
    use.disabled = true;
    try {
      await state.ports.select(state.owner, id);
      state.dialog.close();
    } catch (error) {
      if (!lifetime.alive) return;
      state.message.textContent = errorMessage(error);
    } finally {
      state.busy = false;
      use.disabled = false;
    }
  });
  row.append(use);
  return row;
}

/** A directory the person put in the split that is not listed any more, with a button to drop it. */
function missingRow(state: Dialog, id: string, draft: Draft, again: () => void) {
  const L = state.ports.translate;
  const row = el("section", "", "coding-material"), remove = button(L("coding.writers.remove"));
  row.append(el("p", L("coding.writers.saved-gone", { id })), el("p", draft.task || L("coding.writers.no-task")), remove);
  state.ports.lifetime.listen(remove, "click", () => {
    state.assignments.delete(id);
    remember(state);
    state.renderKey = "";
    again();
  });
  return row;
}

/** Reads the directories again and draws them, unless the dialog is closed or a read is under way. */
async function refresh(state: Dialog) {
  const { ports, dialog, list, message } = state, { translate: L, lifetime, api, q } = ports;
  if (!dialog.open || state.reading || !state.parent) return;
  state.reading = true;
  const at = state.ticket;
  try {
    const data = await api<{ directories: WriterDirectory[] }>(path(state));
    if (at !== state.ticket || !dialog.open) return;
    const key = JSON.stringify(data.directories);
    if (key !== state.renderKey) {
      state.renderKey = key;
      list.replaceChildren();
      if (!data.directories.length) list.append(el("p", L("coding.writers.none")));
      for (const directory of data.directories) list.append(directoryRow(state, directory));
      for (const [id, draft] of state.assignments) {
        if (draft.selected && !data.directories.some(item => item.workspace_id === id && !item.problem)) list.append(missingRow(state, id, draft, () => void refresh(state)));
      }
    }
    await ports.reviews(q("[data-coding-writer-directory-reviews]"), state.parent);
  } catch (error) {
    if (!lifetime.alive) return;
    if (at === state.ticket && dialog.open) message.textContent = errorMessage(error);
  } finally {
    state.reading = false;
  }
}

/** Opens the dialog on the directory the session works in, with the split it already keeps (or the one typed and not saved). */
function open(state: Dialog) {
  const { ports, list, message } = state, { translate: L, q } = ports;
  if (state.busy) {
    ports.status(L("coding.writers.busy"), true);
    return;
  }
  const next = ports.workspace();
  if (state.parent !== next) state.operation = "";
  state.parent = next;
  state.owner = ports.current();
  state.assignments = new Map(ports.assignments().map(row => [row.workspace_id, { task: row.task, selected: true }]));
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(draftKey(state)) || "null");
    if (Array.isArray(saved)) state.assignments = new Map(saved);
  } catch { /* nothing typed before, or storage closed: start from the saved split */ }
  state.ticket++;
  state.renderKey = "";
  list.replaceChildren();
  message.textContent = "";
  q("[data-coding-writer-parent]").textContent = L("coding.writers.parent", { path: ports.workspaceLabel() });
  if (!state.parent || !state.owner) {
    ports.status(L("coding.writers.choose-first"), true);
    return;
  }
  state.dialog.showModal();
  void refresh(state);
}

/** Saves the split the dialog holds for the session's next round. */
async function saveSplit(state: Dialog, save: HTMLButtonElement) {
  const { ports, message } = state;
  if (state.busy) return;
  state.busy = true;
  save.disabled = true;
  const key = draftKey(state), snapshot = JSON.stringify([...state.assignments]);
  try {
    await ports.saveAssignments(state.owner, state.parent, [...state.assignments].filter(([, row]) => row.selected).map(([workspace_id, row]) => ({ workspace_id, task: row.task })));
    if (snapshot === JSON.stringify([...state.assignments])) {
      try { sessionStorage.removeItem(key); } catch { /* storage closed: nothing was kept */ }
    }
    message.textContent = ports.translate("coding.writers.saved");
  } catch (error) {
    if (!ports.lifetime.alive) return;
    message.textContent = errorMessage(error);
  } finally {
    state.busy = false;
    save.disabled = false;
  }
}

/** Creates the next writer directory of the Git directory the session works in. */
async function createDirectory(state: Dialog, create: HTMLButtonElement) {
  if (state.busy) return;
  state.busy = true;
  create.disabled = true;
  const at = state.ticket;
  state.operation ||= crypto.randomUUID();
  try {
    await state.ports.api(path(state), "POST", { operation_id: state.operation });
    state.operation = "";
    if (at === state.ticket) {
      state.message.textContent = "";
      await refresh(state);
    }
  } catch (error) {
    if (!state.ports.lifetime.alive) return;
    if (at === state.ticket) state.message.textContent = errorMessage(error);
  } finally {
    state.busy = false;
    create.disabled = false;
  }
}

/** The split the round's task ends with, when it is a well-formed one that matches the directories the run was granted. */
function splitOf(run: WriterTurnRun, turn: WriterTurn): { rows: SplitRow[]; at: number } | null {
  const at = turn.text.lastIndexOf(WRITER_SPLIT_HEAD);
  if (at < 0) return null;
  let rows: unknown;
  try { rows = JSON.parse(turn.text.slice(at + WRITER_SPLIT_HEAD.length)); } catch { return null; }
  const grants = run.frozen.subagent_workspaces || [];
  if (!Array.isArray(rows) || rows.length !== grants.length) return null;
  const whole = rows.every((row: Partial<SplitRow> | null, index) => row && typeof row.task === "string" && typeof row.branch === "string" && typeof row.base_commit === "string"
    && row.workspace_id === grants[index]?.workspace_id && row.directory === grants[index]?.directory.canonical_path);
  return whole ? { rows, at } : null;
}

const renderTurn = (L: WriterPorts["translate"], target: Element, run: WriterTurnRun, turn: WriterTurn) => {
  if (run.frozen.role_id !== "writers" || turn.kind !== "user" || turn.steer) return false;
  const split = splitOf(run, turn);
  if (!split) return false;
  target.replaceChildren();
  const task = el("p", turn.text.slice(0, split.at));
  task.style.whiteSpace = "pre-wrap";
  target.append(task);
  const details = el("details");
  details.append(el("summary", L("coding.writers.turn", { count: split.rows.length })));
  for (const row of split.rows) {
    const section = el("section", "", "coding-material"), body = el("p", row.task);
    body.style.whiteSpace = "pre-wrap";
    section.append(el("p", row.directory), body, el("p", L("coding.writers.branch-base", { branch: row.branch, commit: row.base_commit })));
    details.append(section);
  }
  target.append(details);
  return true;
};

/** The dialog that splits a parallel-writers round across the Git directory's writer directories. */
export function writerDirectories(ports: WriterPorts): WriterDirectories {
  const { lifetime, q } = ports;
  const create = q<HTMLButtonElement>("[data-coding-writer-directories-create]");
  const state: Dialog = {
    ports, dialog: q<HTMLDialogElement>("[data-coding-writer-directories-dialog]"), list: q("[data-coding-writer-directories-list]"), message: q("[data-coding-writer-directories-status]"),
    parent: "", owner: "", operation: "", busy: false, reading: false, ticket: 0, renderKey: "", assignments: new Map(),
  };
  lifetime.listen(q("[data-coding-writer-directories-open]"), "click", () => open(state));
  const save = q<HTMLButtonElement>("[data-coding-writer-assignments-save]");
  lifetime.listen(save, "click", () => void saveSplit(state, save));
  lifetime.listen(q("[data-coding-writer-directories-close]"), "click", () => state.dialog.close());
  lifetime.listen(state.dialog, "close", () => { state.ticket++; });
  lifetime.listen(q("[data-coding-writer-directories-refresh]"), "click", () => void refresh(state));
  lifetime.listen(create, "click", () => void createDirectory(state, create));
  return { refresh: () => refresh(state), renderTurn: (target, run, turn) => renderTurn(ports.translate, target, run, turn) };
}
