import { el, errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

/** One file a writer directory changed, as `GET …/integration` lists it. */
interface IntegrationFile {
  readonly path: readonly string[];
  readonly revision: string;
  readonly selectable: boolean;
  readonly target: "added" | "modified" | "deleted";
  readonly reason?: string;
  readonly diff_html?: string;
  readonly before_text?: string | null;
  readonly after_text?: string | null;
  /** Both sides changed the file: the merge a person finishes. */
  readonly conflict?: { readonly clean: boolean; readonly merged_text: string };
}

interface IntegrationRead {
  readonly workspace_id: string;
  readonly source_path: string;
  readonly branch: string;
  readonly target_path: string;
  readonly files: readonly IntegrationFile[];
}

export interface WriterIntegrationPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "api" | "status"> {
  /** Draws the review cards of the directory's runs (the Host's). */
  readonly reviews: (container: Element, workspaceId: string) => unknown;
}

export interface WriterIntegration {
  refreshReviews(): Promise<void>;
  /** Opens the dialog on what the subagent's directory changed. */
  open(id: string, run: string, child: { readonly subagent_id: string }): Promise<void>;
}

/** What the dialog holds while it is open. */
interface Integration {
  readonly ports: WriterIntegrationPorts;
  readonly dialog: HTMLDialogElement;
  readonly list: HTMLElement;
  readonly message: HTMLElement;
  readonly prepare: HTMLButtonElement;
  endpoint: string;
  workspace: string;
  view: IntegrationRead | null;
  ticket: number;
  busy: boolean;
  reading: boolean;
  reviewing: boolean;
  operation: string;
  /** The files to hand over: path → the revision the person saw. */
  selection: Map<string, string>;
  /** The text a person finished a conflicted file with. */
  resolutions: Map<string, string>;
  draft: string;
}

const MARKER = /^(<{7}|={7}|>{7}|\|{7})( |$)/m;
const markers = (text: string) => (text.match(/^<{7}( |$)/gm) || []).length;
// One conflict block: main's lines, the original base, then the subtask's. Taking a side rewrites only that block, like accept current/incoming/both.
const HUNKS = /^<{7}[^\n]*\n([\s\S]*?)(?:^\|{7}[^\n]*\n[\s\S]*?)?^={7}[^\n]*\n([\s\S]*?)^>{7}[^\n]*(?:\n|$)/gm;
const hunks = (text: string) => [...text.matchAll(HUNKS)].map(match => ({ ours: match[1], theirs: match[2] }));
type Side = "ours" | "theirs" | "both";
const take = (text: string, index: number, how: Side) => {
  let at = 0;
  return text.replace(HUNKS, (all, ours: string, theirs: string) => at++ !== index ? all : how === "ours" ? ours : how === "theirs" ? theirs : ours + theirs);
};
const lines = (text: string) => text ? text.replace(/\n$/, "").split("\n").length : 0;

const remember = (state: Integration) => {
  try { sessionStorage.setItem(state.draft, JSON.stringify([...state.selection])); } catch { /* storage closed: the choice stays in the dialog */ }
};
const update = (state: Integration) => {
  state.prepare.disabled = state.busy || state.reading || ![...state.selection.values()].some(Boolean);
};
const choose = (state: Integration, key: string, file: IntegrationFile, text?: string) => {
  state.selection.set(key, file.revision);
  if (text !== undefined) state.resolutions.set(key, text);
};
const drop = (state: Integration, key: string) => {
  state.selection.delete(key);
  state.resolutions.delete(key);
};

async function refreshReviews(state: Integration) {
  if (!state.dialog.open || !state.workspace || state.reviewing) return;
  state.reviewing = true;
  try {
    await state.ports.reviews(state.ports.q("[data-coding-integration-reviews]"), state.workspace);
  } finally {
    state.reviewing = false;
  }
}

/** The buttons that settle one conflict block by taking a side, rebuilt each time the text in the editor changes. */
function drawPicks(state: Integration, picks: HTMLElement, editor: HTMLTextAreaElement, sync: () => void) {
  const { translate: L, lifetime } = state.ports;
  const found = hunks(editor.value);
  picks.hidden = !found.length;
  picks.replaceChildren();
  found.forEach((hunk, index) => {
    const pick = el("div", "", "coding-merge-pick");
    pick.append(el("span", L("coding.integration.hunk", { number: index + 1, ours: lines(hunk.ours), theirs: lines(hunk.theirs) })));
    const sides: readonly (readonly [Side, string])[] = [["ours", L("coding.integration.take-ours")], ["theirs", L("coding.integration.take-theirs")], ["both", L("coding.integration.take-both")]];
    for (const [how, label] of sides) {
      const side = el("button", label, "mw-btn mw-btn--ghost");
      side.type = "button";
      side.setAttribute("aria-label", L("coding.integration.take-label", { number: index + 1, choice: label }));
      lifetime.listen(side, "click", () => {
        editor.value = take(editor.value, index, how);
        sync();
        (picks.querySelector("button") || editor).focus();
      });
      pick.append(side);
    }
    picks.append(pick);
  });
}

/** The editor a person finishes a conflicted file in; unresolved markers keep the file out of the hand-over. */
function openMerge(state: Integration, key: string, file: IntegrationFile, conflict: NonNullable<IntegrationFile["conflict"]>, merge: HTMLElement) {
  const { translate: L, lifetime } = state.ports;
  const editor = el("textarea", "", "mw-textarea coding-merge-editor"), status = el("p"), use = el("label", "", "mw-check-row"), useCheck = el("input");
  editor.rows = Math.min(18, Math.max(6, conflict.merged_text.split("\n").length + 1));
  editor.spellcheck = false;
  editor.value = state.resolutions.get(key) ?? conflict.merged_text;
  editor.setAttribute("aria-label", L("coding.integration.merge-label", { path: key }));
  useCheck.type = "checkbox";
  useCheck.className = "mw-check";
  use.append(useCheck, el("span", L("coding.integration.merge-use")));
  const picks = el("div", "", "coding-merge-picks");
  const sync = () => {
    const blocked = MARKER.test(editor.value);
    drawPicks(state, picks, editor, sync);
    status.textContent = blocked ? L("coding.integration.unresolved", { count: Math.max(markers(editor.value), 1) }) : conflict.clean && editor.value === conflict.merged_text ? L("coding.integration.clean") : L("coding.integration.resolved");
    status.dataset.tone = blocked ? "attention" : "done";
    useCheck.disabled = blocked;
    if (blocked) {
      useCheck.checked = false;
      drop(state, key);
    } else if (useCheck.checked) {
      choose(state, key, file, editor.value);
    }
    state.operation = "";
    remember(state);
    update(state);
  };
  lifetime.listen(editor, "input", sync);
  lifetime.listen(useCheck, "change", () => {
    if (useCheck.checked) choose(state, key, file, editor.value);
    else drop(state, key);
    state.operation = "";
    remember(state);
    update(state);
  });
  merge.append(el("p", conflict.clean ? L("coding.integration.clean-note") : L("coding.integration.conflict-note")), editor, picks, status, use);
  sync();
  editor.focus();
}

/** What would change in the main workspace, as a folded diff; without one, the two full texts. */
function changes(L: WriterIntegrationPorts["translate"], row: HTMLElement, key: string, file: IntegrationFile, shown: number) {
  if (file.diff_html) {
    const diff = el("details", "", "coding-integration-diff");
    diff.open = shown <= 3;
    diff.append(el("summary", L("coding.integration.diff")));
    const body = el("div");
    body.dataset.codePath = key;
    body.innerHTML = file.diff_html;
    diff.append(body);
    row.append(diff);
    return;
  }
  if (file.before_text !== undefined) {
    const before = el("details");
    before.append(el("summary", L("coding.integration.before")), el("pre", file.before_text === null ? L("coding.integration.not-yet") : file.before_text || L("coding.integration.empty")));
    row.append(before);
  }
  if (file.after_text !== undefined) {
    const after = el("details");
    after.append(el("summary", L("coding.integration.after")), el("pre", file.after_text === null ? L("coding.integration.delete-file") : file.after_text || L("coding.integration.empty")));
    row.append(after);
  }
}

/** One changed file: its check box, what changed and, when both sides changed it, the merge. */
function fileRow(state: Integration, file: IntegrationFile, previous: ReadonlyMap<string, string>, shown: number) {
  const { translate: L, lifetime } = state.ports;
  const key = file.path.join("/"), row = el("section", "", "coding-material");
  const label = el("label", "", "mw-check-row"), check = el("input");
  check.type = "checkbox";
  check.className = "mw-check";
  check.disabled = !file.selectable;
  check.checked = file.selectable && previous.get(key) === file.revision;
  check.setAttribute("aria-label", L("coding.integration.file-label", { path: key }));
  if (check.checked) state.selection.set(key, file.revision);
  lifetime.listen(check, "change", () => {
    if (check.checked) state.selection.set(key, file.revision);
    else state.selection.delete(key);
    state.operation = "";
    remember(state);
    update(state);
  });
  const targets = { added: L("coding.integration.added"), modified: L("coding.integration.modified"), deleted: L("coding.integration.deleted") };
  label.append(check, el("span", key + " · " + targets[file.target]));
  row.append(label);
  if (file.reason) row.append(el("p", file.reason));
  changes(L, row, key, file, shown);
  // Both sides changed this file: a three-way merge a person finishes, never the child's version over the main one.
  const conflict = file.conflict;
  if (conflict) {
    const merge = el("div", "", "coding-merge"), open = el("button", conflict.clean ? L("coding.integration.merge-view") : L("coding.integration.merge-resolve"), "mw-btn");
    open.type = "button";
    merge.append(open);
    row.append(merge);
    lifetime.listen(open, "click", () => {
      open.remove();
      openMerge(state, key, file, conflict, merge);
    });
  }
  return row;
}

/** Reads what the directory changed and draws it. */
async function refresh(state: Integration) {
  const { ports, dialog, list, message } = state, { translate: L, lifetime, api, q } = ports;
  if (state.reading || state.busy) return;
  state.reading = true;
  message.textContent = L("coding.integration.reading");
  update(state);
  const at = state.ticket;
  try {
    const data = await api<IntegrationRead>(state.endpoint);
    if (at !== state.ticket || !dialog.open) return;
    state.view = data;
    state.workspace = data.workspace_id;
    state.operation = "";
    list.replaceChildren();
    q("[data-coding-integration-source]").textContent = L("coding.integration.source", { path: data.source_path, branch: data.branch });
    q("[data-coding-integration-target]").textContent = L("coding.integration.target", { path: data.target_path });
    const previous = state.selection;
    state.selection = new Map();
    if (!data.files.length) list.append(el("p", L("coding.integration.no-changes")));
    for (const file of data.files) list.append(fileRow(state, file, previous, data.files.length));
    remember(state);
    message.textContent = L("coding.integration.choose");
    await refreshReviews(state);
  } catch (error) {
    if (!lifetime.alive) return;
    if (at === state.ticket) {
      state.view = null;
      state.selection.clear();
      message.textContent = errorMessage(error);
    }
  } finally {
    state.reading = false;
    update(state);
  }
}

/** Hands the chosen files (and the text a conflict was finished with) to the Host to prepare in the main workspace. */
async function prepare(state: Integration) {
  const { ports, message } = state, { translate: L, lifetime, api } = ports, view = state.view;
  if (state.busy || state.reading || !view) return;
  state.busy = true;
  message.textContent = L("coding.integration.preparing");
  update(state);
  state.operation ||= crypto.randomUUID();
  const at = state.ticket;
  const files = view.files.filter(file => state.selection.get(file.path.join("/")) === file.revision).map(file => {
    const resolution = state.resolutions.get(file.path.join("/"));
    return { path: file.path, revision: file.revision, ...(resolution !== undefined ? { resolution } : {}) };
  });
  try {
    await api(state.endpoint, "POST", { operation_id: state.operation, files });
    state.operation = "";
    if (at === state.ticket) {
      message.textContent = L("coding.integration.prepared");
      await refreshReviews(state);
    }
  } catch (error) {
    if (!lifetime.alive) return;
    if (at === state.ticket) message.textContent = errorMessage(error);
  } finally {
    state.busy = false;
    update(state);
  }
}

async function open(state: Integration, id: string, run: string, child: { readonly subagent_id: string }) {
  const { ports, list, message } = state, { translate: L, q } = ports;
  if (state.busy || state.reading) {
    ports.status(L("coding.integration.busy"), true);
    return;
  }
  state.endpoint = "/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(run) + "/subagents/" + encodeURIComponent(child.subagent_id) + "/integration";
  state.resolutions = new Map();
  state.draft = "coding-integration:" + location.pathname + ":" + state.endpoint;
  state.selection = new Map();
  try {
    const saved: unknown = JSON.parse(sessionStorage.getItem(state.draft) || "null");
    if (Array.isArray(saved)) state.selection = new Map(saved);
  } catch { /* nothing chosen before, or storage closed: start with nothing chosen */ }
  state.ticket++;
  state.workspace = "";
  state.view = null;
  state.operation = "";
  list.replaceChildren();
  message.textContent = L("coding.integration.reading");
  const reviews = q("[data-coding-integration-reviews]");
  reviews.replaceChildren();
  delete reviews.dataset.reviewHtml;
  state.dialog.showModal();
  await refresh(state);
}

/** The dialog that hands the files a writer directory changed over to the main workspace, as Git changes to review there. */
export function writerIntegration(ports: WriterIntegrationPorts): WriterIntegration {
  const { lifetime, q } = ports;
  const state: Integration = {
    ports, dialog: q<HTMLDialogElement>("[data-coding-integration-dialog]"), list: q("[data-coding-integration-files]"), message: q("[data-coding-integration-status]"), prepare: q<HTMLButtonElement>("[data-coding-integration-prepare]"),
    endpoint: "", workspace: "", view: null, ticket: 0, busy: false, reading: false, reviewing: false, operation: "", selection: new Map(), resolutions: new Map(), draft: "",
  };
  lifetime.listen(q("[data-coding-integration-close]"), "click", () => state.dialog.close());
  lifetime.listen(state.dialog, "close", () => { state.ticket++; });
  lifetime.listen(q("[data-coding-integration-refresh]"), "click", () => void refresh(state));
  lifetime.listen(state.prepare, "click", () => void prepare(state));
  return { refreshReviews: () => refreshReviews(state), open: (id, run, child) => open(state, id, run, child) };
}
