import { el, errorMessage } from "./dom.js";
import type { PagePorts, Translate } from "./types.js";

declare global {
  interface Window {
    /** The page's copy helper: puts the text on the clipboard and says on the button how it went. */
    molisCopy?: (button: Element, text: () => string, labels: { done: string; failed: string }) => void;
  }
}

interface ChangeFile {
  readonly path: string;
  readonly kind: string;
  readonly added_lines: number;
  readonly removed_lines: number;
  readonly review?: { readonly decision: string; readonly execution?: string } | null;
}

/** A round's changes, as `GET …/changeset` answers them. */
interface Changeset {
  readonly html: string;
  readonly change: { readonly files: readonly ChangeFile[] };
  readonly view_mode: string;
  readonly net_groups?: readonly { readonly path: string; readonly available: boolean; readonly reason?: string; readonly indices: readonly number[] }[];
  readonly patch?: string;
  readonly reference?: { readonly artifact_id: string; readonly version: number } | null;
  readonly output?: { readonly artifact_id: string; readonly version: number } | null;
  readonly saved_at?: string | number;
}

/** A remark on one line of a change, kept until it is sent back. */
interface Remark { change_index: number; side: string; line: number; comment: string }

/** Where the reader was looking, so a redraw lands on the same line. */
interface Place { readonly after: string; readonly before: string; readonly offset: number }

export interface ChangesetPorts extends Pick<PagePorts, "lifetime" | "translate" | "q" | "api" | "current"> {
  readonly root: HTMLElement;
  readonly closeReport: () => void;
  readonly returnToTask: () => void;
  readonly onRunOpen: () => void;
  /** Adds the remarks to the composer's draft. */
  readonly appendDraft: (task: string) => Promise<unknown>;
  readonly focusDraft: () => void;
}

export interface ChangesetClient {
  close(): void;
  /** Opens the changes as they were fixed. */
  openFixed(runId: string): Promise<void>;
  active(): boolean;
}

type Layout = "unified" | "split";

/** What the reader holds while a round's changes are open. */
interface Reader {
  readonly ports: ChangesetPorts;
  readonly reader: HTMLElement;
  readonly message: HTMLElement;
  runId: string;
  ticket: number;
  index: number;
  value: Changeset | null;
  comments: Remark[];
  fixed: boolean;
  net: boolean;
  netIndices: readonly number[] | null;
  anchor: Place | null;
  opened: Set<string>;
  layout: Layout;
}

const LAYOUT_KEY = "molis-coding-diff-layout";
const MAX_REMARKS = 30;

const numberOf = (row: Element, side: string) => row.querySelector(":scope > .diff-" + side)?.textContent?.trim() || "";
const key = (r: Reader) => "molis-coding-feedback:" + r.ports.root.dataset.codingPrefix + ":" + r.ports.current() + ":" + r.runId;

function showLayout(r: Reader) {
  r.reader.querySelectorAll<HTMLElement>("[data-coding-change-layout]").forEach(button => {
    const on = button.dataset.codingChangeLayout === r.layout;
    button.classList.toggle("is-current", on);
    button.setAttribute("aria-pressed", String(on));
  });
}

function anchorOf(r: Reader): Place | null {
  const { q } = r.ports, top = q("[data-coding-tools]").getBoundingClientRect().top;
  const row = [...q("[data-coding-change-body]").querySelectorAll(".diff-rows > li:not([hidden]):not(.diff-fold)")].find(li => li.getBoundingClientRect().bottom > top);
  return row ? { after: numberOf(row, "after"), before: numberOf(row, "before"), offset: row.getBoundingClientRect().top - top } : null;
}

function unfold(rows: Element | null | undefined, group: string) {
  rows?.querySelectorAll<HTMLElement>('[data-diff-folded="' + group + '"]').forEach(row => { row.hidden = false; });
  rows?.querySelector('[data-diff-unfold="' + group + '"]')?.closest("li")?.remove();
}

/** Unfolds what the reader had open and scrolls back to the line they were reading. */
function keepPlace(r: Reader, place: Place | null) {
  const { q } = r.ports, list = q("[data-coding-change-body]").querySelector(".diff-rows");
  r.opened.forEach(group => unfold(list, group));
  if (!place || !list) return;
  const row = [...list.children].find((li): li is HTMLElement => li instanceof HTMLElement && (place.after ? numberOf(li, "after") === place.after : place.before !== "" && numberOf(li, "before") === place.before));
  if (!row) return;
  if (row.hidden && row.dataset.diffFolded) {
    r.opened.add(row.dataset.diffFolded);
    unfold(list, row.dataset.diffFolded);
  }
  const tools = q("[data-coding-tools]");
  tools.scrollTop += row.getBoundingClientRect().top - tools.getBoundingClientRect().top - place.offset;
}

function remember(r: Reader) {
  try {
    localStorage.setItem(key(r), JSON.stringify(r.comments));
  } catch {
    r.message.textContent = r.ports.translate("coding.change.not-stored");
  }
}

function close(r: Reader) {
  r.ticket++;
  r.runId = "";
  r.value = null;
  r.fixed = false;
  r.net = false;
  r.netIndices = null;
  r.reader.hidden = true;
  r.reader.parentElement?.removeAttribute("data-coding-reading");
}

const lineLabel = (L: Translate, remark: Remark) => remark.side === "before" ? L("coding.change.line-before", { line: remark.line }) : L("coding.change.line-after", { line: remark.line });

/** One remark: where it is, its text, and the button that drops it. */
function remarkRow(r: Reader, remark: Remark, n: number) {
  const { translate: L, lifetime } = r.ports, file = r.value?.change.files[remark.change_index];
  const row = el("div", "", "coding-feedback-item"), head = el("div", "", "coding-feedback-where");
  const where = el("span", L("coding.change.where", { path: file?.path || L("coding.change.original-file"), write: remark.change_index + 1, line: lineLabel(L, remark) }));
  where.title = where.textContent ?? "";
  const input = el("textarea", "", "mw-textarea"), remove = el("button", "", "mw-btn mw-btn--ghost coding-feedback-remove");
  input.rows = 2;
  input.value = remark.comment;
  input.maxLength = 5000;
  input.placeholder = L("coding.change.comment-placeholder");
  input.setAttribute("aria-label", L("coding.change.comment-label", { where: where.textContent ?? "" }));
  lifetime.listen(input, "input", () => {
    remark.comment = input.value;
    remember(r);
  });
  remove.type = "button";
  remove.setAttribute("aria-label", L("coding.change.comment-remove"));
  remove.title = L("coding.change.comment-remove");
  remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
  lifetime.listen(remove, "click", () => {
    r.comments.splice(n, 1);
    remember(r);
    renderComments(r);
  });
  head.append(where, remove);
  row.append(head, input);
  return row;
}

function renderComments(r: Reader) {
  const { q } = r.ports, list = q("[data-coding-feedback-list]");
  list.replaceChildren();
  r.comments.forEach((remark, n) => list.append(remarkRow(r, remark, n)));
  q("[data-coding-feedback-count]").textContent = r.comments.length ? String(r.comments.length) : "";
  q<HTMLButtonElement>("[data-coding-feedback-return]").disabled = !r.comments.length || !r.value?.reference;
  // In the net view, after-side lines are the last write's result and before-side lines the first write's original.
  const indices = r.netIndices;
  const shown = (remark: Remark) => r.net && indices ? (remark.side === "after" ? remark.change_index === indices.at(-1) : remark.change_index === indices[0]) : remark.change_index === r.index;
  const commented = new Set(r.comments.filter(shown).map(remark => remark.side + ":" + remark.line));
  r.reader.querySelectorAll<HTMLElement>("[data-coding-line]").forEach(button => {
    button.closest("li")?.toggleAttribute("data-coding-commented", commented.has(button.dataset.codingLineSide + ":" + button.dataset.codingLine));
  });
}

/** The state of one write: tone, words, and the ring the page draws for it. */
function stateOf(L: Translate, file: ChangeFile): readonly [string, string, string] {
  const tones: Readonly<Record<string, readonly [string, string, string]>> = { applied: ["done", L("coding.change.applied"), "done"], failed: ["failed", L("coding.change.apply-failed"), "failed"], unknown: ["attention", L("coding.change.unknown"), "verify"], "not-applied": ["idle", L("coding.change.not-applied"), "idle"] };
  if (!file.review) return ["idle", L("coding.change.old-record"), "verify"];
  const decisions: Readonly<Record<string, readonly [string, string]>> = { rejected: [L("coding.change.rejected"), "cancelled"], cancelled: [L("coding.state.cancelled"), "cancelled"], expired: [L("coding.change.expired"), "stale"], pending: [L("coding.change.pending"), "approval"] };
  const decided = file.review.decision !== "approved" ? decisions[file.review.decision] : undefined;
  if (decided) return ["idle", decided[0], decided[1]];
  return tones[file.review.execution ?? ""] ?? tones.unknown!;
}

const fileIcon = () => {
  const node = el("span", "", "coding-change-icon");
  node.innerHTML = '<svg aria-hidden="true"><use href="#icon-file"></use></svg>';
  return node;
};
const counts = (added: number, removed: number) => {
  const box = el("span", "", "coding-change-counts");
  box.append(el("ins", "+" + added), el("del", "−" + removed));
  return box;
};
const pathLabel = (path: string) => {
  const box = el("span", "", "coding-change-path"), cut = path.lastIndexOf("/");
  if (cut >= 0) box.append(el("span", path.slice(0, cut + 1), "coding-change-dir"));
  box.append(el("b", path.slice(cut + 1)));
  box.title = path;
  return box;
};

function stateChip(L: Translate, file: ChangeFile) {
  const [tone, label, ring] = stateOf(L, file), node = el("span", label, "coding-change-state");
  node.dataset.tone = tone;
  node.dataset.mwState = ring;
  return node;
}

/** The button for one write of a path. */
function pickButton(r: Reader, runValue: string, n: number) {
  const button = el("button", "", "coding-change-write");
  button.type = "button";
  button.dataset.codingChangeIndex = String(n);
  button.setAttribute("aria-pressed", String(!r.net && n === r.index));
  r.ports.lifetime.listen(button, "click", () => {
    if (r.net || n !== r.index) void open(r, runValue, false, n, r.fixed, "0");
  });
  return button;
}

/** A path changed once: one button for the file. */
function singleFile(r: Reader, runValue: string, path: string, n: number, file: ChangeFile) {
  const L = r.ports.translate, button = pickButton(r, runValue, n);
  button.setAttribute("aria-pressed", String(n === r.index));
  button.classList.add("is-file");
  button.append(fileIcon(), pathLabel(path), el("span", file.kind === "added" ? L("coding.change.created") : L("coding.change.modified"), "coding-change-kind"), counts(file.added_lines, file.removed_lines), stateChip(L, file));
  return button;
}

/** A path written more than once: its header, the net change when it can be shown, and each write. */
function manyWrites(r: Reader, runValue: string, files: readonly ChangeFile[], path: string, list: readonly number[], group: HTMLElement) {
  const { translate: L, lifetime } = r.ports;
  const head = el("div", "", "coding-change-file-head"), writes = el("span", L("coding.change.writes", { count: list.length }), "coding-change-kind");
  const netGroup = (r.value?.net_groups || []).find(item => item.path === path);
  if (netGroup && !netGroup.available && netGroup.reason) writes.title = netGroup.reason;
  head.append(fileIcon(), pathLabel(path), writes);
  group.append(head);
  if (netGroup?.available) {
    const whole = el("button", "", "coding-change-write is-net");
    whole.type = "button";
    whole.dataset.codingChangeNet = path;
    whole.setAttribute("aria-pressed", String(r.net && list.includes(r.index)));
    whole.append(el("span", L("coding.change.net"), "coding-change-step"));
    lifetime.listen(whole, "click", () => {
      const first = list[0];
      if (!(r.net && list.includes(r.index)) && first !== undefined) void open(r, runValue, false, first, r.fixed, "1");
    });
    group.append(whole);
  }
  list.forEach((n, order) => {
    const file = files[n];
    if (!file) return;
    const button = pickButton(r, runValue, n);
    button.append(el("span", L("coding.change.write-number", { number: order + 1 }) + (file.kind === "added" && order === 0 ? " · " + L("coding.change.created") : ""), "coding-change-step"), counts(file.added_lines, file.removed_lines), stateChip(L, file));
    group.append(button);
  });
}

function renderFiles(r: Reader, files: readonly ChangeFile[], runValue: string) {
  const { translate: L, q } = r.ports, nav = q("[data-coding-change-files]");
  nav.replaceChildren();
  const groups = new Map<string, number[]>();
  files.forEach((file, n) => groups.set(file.path, [...(groups.get(file.path) ?? []), n]));
  for (const [path, list] of groups) {
    const first = files[list[0] ?? 0], group = el("div", "", "coding-change-file");
    if (!first) continue;
    group.dataset.kind = first.kind;
    if (list.length === 1) group.append(singleFile(r, runValue, path, list[0] ?? 0, first));
    else manyWrites(r, runValue, files, path, list, group);
    nav.append(group);
  }
  q("[data-coding-change-summary]").textContent = files.length ? L("coding.change.summary", { files: groups.size, writes: files.length }) : L("coding.change.no-writes");
}

/** The save chip, the output button and the hint under the remarks, after a read. */
function drawReference(r: Reader, result: Changeset, scrollToStart: boolean) {
  const { translate: L, q } = r.ports;
  q<HTMLButtonElement>("[data-coding-change-patch]").disabled = !result.patch;
  const fixedChip = q("[data-coding-change-fixed]"), saveButton = q<HTMLButtonElement>("[data-coding-change-save]");
  fixedChip.hidden = !result.reference;
  saveButton.hidden = Boolean(result.reference);
  saveButton.disabled = Boolean(result.reference);
  if (result.reference) {
    const chip = fixedChip.lastElementChild;
    if (chip) chip.textContent = L("coding.change.fixed", { version: result.reference.version });
    fixedChip.title = L("coding.change.fixed-at", { time: new Date(result.saved_at ?? 0).toLocaleString(document.documentElement.lang || "zh-CN") });
  }
  r.message.textContent = result.change.files.length ? "" : L("coding.change.no-reviewed");
  q("[data-coding-feedback-hint]").textContent = result.reference ? L("coding.change.comment-hint") : L("coding.feedback.hint");
  const output = q<HTMLButtonElement>("[data-coding-change-output]");
  const selected = Boolean(result.reference) && result.output?.artifact_id === result.reference?.artifact_id && result.output?.version === result.reference?.version;
  output.hidden = !result.reference;
  showLayout(r);
  if (scrollToStart) q("[data-coding-tools]").scrollTop = 0;
  else keepPlace(r, r.anchor);
  r.anchor = null;
  output.disabled = !result.reference || selected;
  output.textContent = selected ? L("coding.change.is-output") : L("coding.change.set-output");
}

/** Reads (or, to fix them, saves) a round's changes and draws them. */
async function open(r: Reader, nextRun: string, save = false, nextIndex = 0, requireFixed = false, mode = "auto") {
  const { ports, message } = r, { translate: L, q, api, lifetime } = ports;
  const id = ports.current(), token = ++r.ticket;
  const scrollToStart = !r.runId || r.runId !== nextRun || r.index !== nextIndex || (mode !== "auto" && r.net !== (mode === "1"));
  if (scrollToStart) {
    r.opened = new Set();
    r.anchor = null;
  }
  if (!r.runId) ports.closeReport();
  if (r.runId !== nextRun) {
    r.comments = [];
    r.runId = nextRun;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key(r)) || "[]");
      if (Array.isArray(saved)) r.comments = saved;
    } catch { /* nothing kept, or storage closed: start with no remarks */ }
  }
  r.index = nextIndex;
  r.fixed = requireFixed;
  r.value = null;
  r.reader.hidden = false;
  r.reader.parentElement?.setAttribute("data-coding-reading", "");
  q<HTMLButtonElement>("[data-coding-change-save]").disabled = true;
  q<HTMLButtonElement>("[data-coding-feedback-return]").disabled = true;
  q<HTMLButtonElement>("[data-coding-change-patch]").disabled = true;
  message.textContent = save ? L("coding.change.saving") : L("coding.change.reading");
  try {
    const result = await api<Changeset>("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(nextRun) + "/changeset?change_index=" + r.index + "&net=" + mode + "&layout=" + r.layout + (requireFixed ? "&fixed=1" : ""), save ? "POST" : "GET");
    if (r.ticket !== token || id !== ports.current()) return;
    r.value = result;
    r.net = result.view_mode === "net";
    r.netIndices = r.net ? (result.net_groups || []).find(group => group.indices.includes(r.index))?.indices || null : null;
    const body = q("[data-coding-change-body]");
    body.innerHTML = result.html;
    body.dataset.codePath = result.change.files[r.index]?.path || "";
    renderFiles(r, result.change.files, nextRun);
    if (r.net) {
      const whole = ports.root.querySelector("[data-coding-change-files] .is-net[aria-pressed=true]");
      whole?.append(counts(body.querySelectorAll(".diff-rows li[data-kind=insert],.diff-split code[data-kind=insert]").length, body.querySelectorAll(".diff-rows li[data-kind=delete],.diff-split code[data-kind=delete]").length));
    }
    drawReference(r, result, scrollToStart);
    renderComments(r);
  } catch (error) {
    if (!lifetime.alive) return;
    if (r.ticket === token) {
      message.textContent = errorMessage(error);
      q("[data-coding-change-body]").replaceChildren();
      q("[data-coding-change-files]").replaceChildren();
    }
  }
}

/** Makes the round's saved changes the round's output. */
async function setOutput(r: Reader, target: HTMLButtonElement) {
  const { ports } = r, id = ports.current(), run = r.runId, token = r.ticket;
  if (!r.value?.reference) return;
  target.disabled = true;
  try {
    await ports.api("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(run) + "/changeset/output", "POST", { expected_reference: r.value.output });
    if (id === ports.current() && token === r.ticket) await open(r, run, false, r.index, r.fixed);
  } catch (error) {
    if (!ports.lifetime.alive) return;
    if (token === r.ticket) {
      r.message.textContent = errorMessage(error);
      target.disabled = false;
    }
  }
}

/** Adds a remark on the line the person pressed. */
function addRemark(r: Reader, target: HTMLElement) {
  const { translate: L, q } = r.ports;
  if (r.comments.length >= MAX_REMARKS) {
    r.message.textContent = L("coding.change.too-many");
    return;
  }
  const side = target.dataset.codingLineSide ?? "after", indices = r.netIndices;
  const at = r.net && indices ? (side === "after" ? indices.at(-1) ?? r.index : indices[0] ?? r.index) : r.index;
  r.comments.push({ change_index: at, side, line: Number(target.dataset.codingLine), comment: "" });
  remember(r);
  renderComments(r);
  q("[data-coding-feedback-list]").lastElementChild?.querySelector("textarea")?.focus();
}

/** Sends the remarks back to the composer as the next request. */
async function returnRemarks(r: Reader, target: HTMLButtonElement) {
  const { ports } = r, id = ports.current(), run = r.runId, token = r.ticket;
  if (!r.value?.reference) return;
  target.disabled = true;
  try {
    const result = await ports.api<{ task: string }>("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(run) + "/changeset/feedback", "POST", { comments: r.comments });
    if (id !== ports.current() || r.ticket !== token) return;
    await ports.appendDraft(result.task);
    if (id !== ports.current() || r.ticket !== token) return;
    r.comments = [];
    remember(r);
    close(r);
    ports.focusDraft();
  } catch (error) {
    if (!ports.lifetime.alive) return;
    if (r.ticket === token) {
      r.message.textContent = errorMessage(error);
      target.disabled = false;
    }
  }
}

/** Switches the layout of the diff and draws it again where the person was reading. */
async function setLayout(r: Reader, next: string | undefined) {
  if (next === r.layout || (next !== "unified" && next !== "split")) return;
  r.layout = next;
  try { localStorage.setItem(LAYOUT_KEY, r.layout); } catch { /* storage refused: the choice lasts for this page */ }
  showLayout(r);
  if (r.runId && r.value) {
    r.anchor = anchorOf(r);
    await open(r, r.runId, false, r.index, r.fixed, r.net ? "1" : "0");
  }
}

/** One press inside the page's root: the reader's own buttons are told apart by their marks. */
async function onClick(r: Reader, event: Event) {
  const { ports } = r, button = event.target instanceof Element ? event.target.closest("button") : null;
  if (!button) return;
  const inReader = r.reader.contains(button);
  if (button.hasAttribute("data-coding-change-patch") && inReader) {
    const patch = r.value?.patch, L = ports.translate;
    if (patch) window.molisCopy?.(button, () => patch, { done: L("coding.change.copied"), failed: L("coding.change.copy-failed") });
  } else if (button.hasAttribute("data-diff-unfold") && inReader) {
    const group = button.dataset.diffUnfold ?? "";
    r.opened.add(group);
    unfold(button.closest("ol"), group);
  } else if (button.hasAttribute("data-coding-change-layout")) {
    await setLayout(r, button.dataset.codingChangeLayout);
  } else if (button.hasAttribute("data-coding-change-open")) {
    ports.onRunOpen();
    await open(r, button.dataset.codingChangeOpen ?? "");
  } else if (button.hasAttribute("data-coding-change-close")) {
    close(r);
    ports.returnToTask();
  } else if (button.hasAttribute("data-coding-change-save") && r.runId) {
    await open(r, r.runId, true, r.index, r.fixed, r.net ? "1" : "0");
  } else if (button.hasAttribute("data-coding-change-output") && r.value?.reference) {
    await setOutput(r, button);
  } else if (button.hasAttribute("data-coding-line") && r.value?.reference) {
    addRemark(r, button);
  } else if (button.hasAttribute("data-coding-feedback-return") && r.value?.reference) {
    await returnRemarks(r, button);
  }
}

/** Fixed review reader; only the existing composer can submit model work. */
export function changesetClient(ports: ChangesetPorts): ChangesetClient {
  const { lifetime, q } = ports;
  // Unified or side by side is the reader's own choice, kept on this device; switching keeps the line being read in place.
  let layout: Layout = "unified";
  try { if (localStorage.getItem(LAYOUT_KEY) === "split") layout = "split"; } catch { /* storage refused: start unified */ }
  const r: Reader = { ports, reader: q("[data-coding-change-reader]"), message: q("[data-coding-change-status]"), runId: "", ticket: 0, index: 0, value: null, comments: [], fixed: false, net: false, netIndices: null, anchor: null, opened: new Set(), layout };
  showLayout(r);
  lifetime.listen(ports.root, "click", event => onClick(r, event));
  return { close: () => close(r), openFixed: run => open(r, run, false, 0, true), active: () => Boolean(r.runId) };
}
