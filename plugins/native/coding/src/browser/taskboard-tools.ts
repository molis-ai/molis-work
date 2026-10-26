import { el } from "./dom.js";
import type { Amendment, StepNode } from "./shapes.js";
import { svg } from "./taskboard-format.js";
import type { BoardRow, RowEdit, RowView } from "./taskboard-types.js";

/** An input of the inline form: its name, placeholder and longest text. */
type TextField = readonly [name: string, placeholder: string, max: number];

/** What an inline form asks, and the change its answers make. */
interface Question {
  readonly fields: readonly TextField[];
  /** A labelled checkbox after the inputs, off by default. */
  readonly check?: readonly [name: string, label: string];
  readonly submit: string;
  readonly build: (texts: readonly string[], checked: boolean) => Amendment;
}

/** What the tools of one step row share. */
interface Tools {
  readonly view: RowView;
  readonly row: BoardRow;
  readonly node: StepNode;
  readonly edit: RowEdit;
  readonly entry: HTMLElement;
  readonly group: HTMLElement;
}

const WAITING = ["not-started", "ready"];

function add({ view, row, group }: Tools, label: string, icon: string, action: () => void) {
  const button = el("button", "", "mw-btn mw-btn--ghost mw-btn--icon-only");
  button.type = "button";
  button.title = label;
  button.setAttribute("aria-label", label + "：" + row.title);
  button.innerHTML = svg(icon);
  view.ports.lifetime.listen(button, "click", event => {
    event.stopPropagation();
    action();
  });
  group.append(button);
}

async function change({ view, edit }: Tools, amendment: Amendment) {
  view.board.dataset.busy = "true";
  try {
    await view.ports.amend(edit.runId, edit.board.version, amendment, edit.live);
  } finally {
    delete view.board.dataset.busy;
    view.redraw();
  }
}

/** The inline form's inputs: a text input per field and the checkbox. */
function drawInputs(form: HTMLFormElement, question: Question) {
  const texts = question.fields.map(([name, placeholder, max]) => {
    const input = el("input", "", "mw-input");
    input.name = name;
    input.placeholder = placeholder;
    input.maxLength = max;
    input.required = true;
    form.append(input);
    return input;
  });
  let box: HTMLInputElement | null = null;
  if (question.check) {
    const label = el("label", "", "coding-board-check");
    box = el("input");
    box.type = "checkbox";
    box.name = question.check[0];
    label.append(box, el("span", question.check[1]));
    form.append(label);
  }
  return { texts, box };
}

/** Opens a small form under the row; its answers become one change to the graph. */
function ask(tools: Tools, question: Question) {
  const { view, entry } = tools, { board, list, ports } = view, L = ports.translate;
  list.querySelector(".coding-board-form")?.remove();
  const form = el("form", "", "coding-board-form"), { texts, box } = drawInputs(form, question);
  const cancel = el("button", L("coding.board.cancel"), "mw-btn mw-btn--ghost"), ok = el("button", question.submit, "mw-btn mw-btn--primary");
  cancel.type = "button";
  ok.type = "submit";
  form.append(cancel, ok);
  board.dataset.editing = "true";
  const close = () => {
    form.remove();
    delete board.dataset.editing;
    view.redraw();
  };
  ports.lifetime.listen(cancel, "click", close);
  ports.lifetime.listen(form, "keydown", event => {
    if (event instanceof KeyboardEvent && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });
  ports.lifetime.listen(form, "submit", async event => {
    event.preventDefault();
    if (texts.some(input => !input.value.trim())) return;
    ok.disabled = true;
    delete board.dataset.editing;
    await change(tools, question.build(texts.map(input => input.value.trim()), box?.checked ?? false));
  });
  entry.after(form);
  texts[0]?.focus();
}

/** Reorder a step that has not started, among the steps that have not started. */
function moveTools(tools: Tools) {
  const { view, node, edit } = tools, L = view.ports.translate, nodes = edit.board.nodes, index = edit.position;
  if (!WAITING.includes(node.state)) return;
  if (index > 0 && WAITING.includes(nodes[index - 1]!.state)) add(tools, L("coding.board.move-up"), "chevron-up", () => void change(tools, { kind: "move", node: node.id, direction: "up" }));
  if (WAITING.includes(nodes[index + 1]?.state ?? "")) add(tools, L("coding.board.move-down"), "chevron-down", () => void change(tools, { kind: "move", node: node.id, direction: "down" }));
}

/** Decide a blocked step, skip or pass over one, insert a step after it. */
function stepTools(tools: Tools) {
  const { view, node } = tools, L = view.ports.translate;
  if (node.state === "blocked") {
    add(tools, L("coding.board.decide"), "edit", () => ask(tools, {
      fields: [["note", L("coding.board.decide-note"), 500]], submit: L("coding.board.decide-ok"), build: ([note]) => ({ kind: "unblock", node: node.id, note: note! }),
    }));
  }
  if (WAITING.includes(node.state) || node.state === "blocked" || node.state === "failed") {
    const skip = (label: string) => add(tools, label, "minus", () => ask(tools, {
      fields: [["reason", L("coding.board.skip-reason"), 300]], submit: L("coding.board.skip"), build: ([reason]) => ({ kind: "skip", node: node.id, reason: reason! }),
    }));
    skip(node.state === "failed" ? L("coding.board.pass-over") : L("coding.board.skip"));
  }
  if (node.state !== "cancelled") {
    add(tools, L("coding.board.insert"), "plus", () => ask(tools, {
      fields: [["title", L("coding.board.insert-title"), 120], ["acceptance", L("coding.board.insert-acceptance"), 300]], check: ["mine", L("coding.board.mine")], submit: L("coding.board.insert-ok"),
      build: ([title, acceptance], mine) => ({ kind: "insert", after: node.id, title: title!, acceptance: acceptance!, ...(mine ? { mine: true as const } : {}) }),
    }));
  }
}

/** Who holds it: take it on yourself, hand it back to the session, and on your own step record how it went. */
function holderTools(tools: Tools) {
  const { view, node } = tools, L = view.ports.translate;
  const open = !["succeeded", "failed", "cancelled"].includes(node.state), holder = node.owner?.kind;
  if (open && holder !== "person") add(tools, L("coding.board.mine"), "user", () => void change(tools, { kind: "assign", node: node.id, to: "me" }));
  if (open && holder && holder !== "session") {
    add(tools, holder === "none" ? L("coding.board.give-session") : L("coding.board.return-session"), "undo", () => void change(tools, { kind: "assign", node: node.id, to: "session" }));
  }
  if (open && holder === "person" && node.state !== "not-started") {
    add(tools, L("coding.board.mark-done"), "check", () => ask(tools, {
      fields: [["note", L("coding.board.mark-done-note"), 500]], submit: L("coding.board.mark-done-ok"), build: ([note]) => ({ kind: "resolve", node: node.id, state: "succeeded", note: note! }),
    }));
    add(tools, L("coding.board.mark-failed"), "x", () => ask(tools, {
      fields: [["note", L("coding.board.mark-failed-note"), 500]], submit: L("coding.board.mark-failed"), build: ([note]) => ({ kind: "resolve", node: node.id, state: "failed", note: note! }),
    }));
  }
}

/** The buttons of a step the person may still change; null when the row has none. */
export function rowTools(view: RowView, row: BoardRow, entry: HTMLElement): HTMLElement | null {
  if (!row.edit || !row.node) return null;
  const tools: Tools = { view, row, node: row.node, edit: row.edit, entry, group: el("span", "", "coding-board-tools") };
  moveTools(tools);
  stepTools(tools);
  holderTools(tools);
  return tools.group;
}
