import type { AgentRunUsage } from "@molis-ai/molis-work-contracts/services/agent-host";
import { el, errorMessage } from "./dom.js";
import type { PagePorts } from "./types.js";

interface Activity { readonly name: string; readonly state: string; readonly target?: string; readonly at?: string | null }

/** What a subagent used; `usageSummary` words it. */
export type ChildUsage = AgentRunUsage;

export interface Child {
  readonly subagent_id: string;
  readonly role_id: string;
  readonly role_name: string;
  readonly workspace_path?: string;
  readonly state: string;
  readonly task: string;
  readonly host_tools?: readonly string[];
  readonly activity?: readonly Activity[];
  readonly usage?: ChildUsage;
  readonly result?: string;
  readonly result_html?: string;
  readonly error?: string;
  readonly integration_available?: boolean;
  /** The run the subagent is executing (while it runs). */
  readonly child_run?: { readonly run_id: string };
  readonly verdict?: { readonly status: string; readonly notes?: string; readonly revision?: number };
}

/** One run's subagents, or why they could not be read. */
export interface SubagentGroup { readonly run_id: string; readonly error?: string; readonly children: readonly Child[] }

export interface SubagentPorts extends PagePorts {
  readonly roleName: (id: string) => string;
  readonly openIntegration: (id: string, runId: string, child: Child) => Promise<void> | void;
  readonly usageSummary: (usage: ChildUsage) => string;
  /** Puts a rework instruction for a subagent in the composer. */
  readonly prepareRework: (id: string, runId: string, child: Child, notes: string) => Promise<void>;
}

export interface SubagentGroups {
  update(id: string, groups: readonly SubagentGroup[]): void;
}

/** What the pieces of the panel share: the region, the two attempts being compared and the requests under way. */
interface Panel {
  readonly ports: SubagentPorts;
  readonly region: HTMLElement;
  readonly compare: string[];
  readonly pending: Set<string>;
  readonly states: Readonly<Record<string, string>>;
  /** Draws the panel again from the last groups. */
  readonly redraw: () => void;
  /** The next `update` draws even when nothing it shows changed. */
  readonly stale: () => void;
}

const WRITES = ["edit", "write"];
const draftKey = (id: string) => "coding-subagent-feedback:" + location.pathname + ":" + id;

const edits = (child: Child) => [...new Set((child.activity || []).filter(item => WRITES.includes(item.name) && item.state === "completed" && item.target).map(item => item.target as string))];

/** Subtasks of one role look alike; the directory each worked in tells them apart. */
const heading = (panel: Panel, child: Child) => (panel.ports.roleName(child.role_id) || child.role_name) + (child.workspace_path ? "（" + child.workspace_path.split("/").pop() + "）" : "");

const resultBox = (child: Child) => {
  const body = el("div");
  body.className = "coding-turn";
  if (child.result_html) body.innerHTML = child.result_html;
  else body.textContent = child.result ?? "";
  return body;
};

const button = (panel: Panel, label: string, action: () => unknown, disabled?: boolean) => {
  const node = el("button", label);
  node.type = "button";
  node.className = "mw-btn";
  node.disabled = Boolean(disabled);
  panel.ports.lifetime.listen(node, "click", () => void action());
  return node;
};

const column = (panel: Panel, child: Child) => {
  const L = panel.ports.translate;
  const box = el("article");
  box.className = "coding-compare-column";
  box.append(el("h4", heading(panel, child)), el("p", panel.states[child.state] || child.state));
  const files = edits(child);
  box.append(el("p", files.length ? L("coding.sub.files", { files: files.join(L("coding.list.joiner")) }) : L("coding.sub.no-files")));
  const tokens = child.usage?.tokens;
  if (tokens) box.append(el("p", L("coding.sub.usage", { tokens: ((tokens.input || 0) + (tokens.output || 0)).toLocaleString() })));
  if (child.result) box.append(resultBox(child));
  if (child.error) box.append(el("p", L("coding.sub.error", { error: child.error })));
  return box;
};

/** Two results side by side, as Cursor compares attempts: retries of one subtask, or two takes on the same question. */
const compareView = (panel: Panel, all: readonly Child[]) => {
  const L = panel.ports.translate, { compare } = panel;
  const view = el("section");
  view.className = "coding-compare";
  view.setAttribute("aria-label", L("coding.sub.compare-label"));
  const head = el("div");
  head.className = "coding-compare-head";
  head.append(el("strong", L("coding.sub.compare")), button(panel, L("coding.sub.compare-clear"), () => {
    compare.length = 0;
    panel.stale();
    panel.redraw();
  }));
  view.append(head, ...compare.flatMap(id => all.filter(child => child.subagent_id === id).map(child => column(panel, child))));
  return view;
};

const compareToggle = (panel: Panel, child: Child) => {
  const { compare } = panel;
  const pick = el("label"), box = el("input");
  pick.className = "mw-check-row";
  box.type = "checkbox";
  box.className = "mw-check";
  box.checked = compare.includes(child.subagent_id);
  panel.ports.lifetime.listen(box, "change", () => {
    const at = compare.indexOf(child.subagent_id);
    if (box.checked && at < 0) {
      compare.push(child.subagent_id);
      if (compare.length > 2) compare.shift();
    } else if (!box.checked && at >= 0) {
      compare.splice(at, 1);
    }
    panel.stale();
    panel.redraw();
  });
  pick.append(box, el("span", panel.ports.translate("coding.sub.compare-add")));
  return pick;
};

/** The task, the directory and the tools the subagent was given. */
const assignment = (panel: Panel, child: Child, opened: ReadonlySet<string | undefined>) => {
  const L = panel.ports.translate;
  const box = el("details");
  box.className = "coding-material";
  box.dataset.child = child.subagent_id + ":assignment";
  box.open = opened.has(box.dataset.child);
  box.append(el("summary", L("coding.sub.assignment")), el("p", child.task), el("p", L("coding.sub.workspace", { path: child.workspace_path || L("coding.sub.unknown") })), el("p", L("coding.sub.tools", { tools: (child.host_tools || []).join(L("coding.list.joiner")) })));
  return box;
};

/** The person's verdict on a subagent, or a request to stop it, then the session read again. */
const act = async (panel: Panel, id: string, group: SubagentGroup, child: Child, action: "stop" | "accepted" | "needs-work", notes = "") => {
  const { ports, pending } = panel, { translate: L, lifetime, api, current, status, refresh } = ports;
  if (pending.has(child.subagent_id)) return;
  pending.add(child.subagent_id);
  panel.stale();
  try {
    await api("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(group.run_id) + "/subagents/" + encodeURIComponent(child.subagent_id), "POST", { action, notes, expected_revision: child.verdict?.revision ?? 0 });
    if (action !== "stop") {
      try { sessionStorage.removeItem(draftKey(child.subagent_id)); } catch { /* storage closed: nothing was kept */ }
    }
    if (action === "needs-work") await ports.prepareRework(id, group.run_id, child, notes);
    if (current() === id) {
      status(action === "needs-work" ? L("coding.sub.rework-saved") : action === "stop" ? L("coding.sub.stop-asked") : L("coding.sub.verdict-saved"));
      await refresh();
    }
  } catch (error) {
    if (!lifetime.alive) return;
    if (current() === id) status(errorMessage(error), true);
  } finally {
    pending.delete(child.subagent_id);
    panel.stale();
  }
};

/** The feedback box of a finished subagent, kept in the window while it is typed. */
const feedback = (panel: Panel, child: Child) => {
  const label = el("label"), input = el("textarea");
  label.className = "mw-field";
  label.append(el("span", panel.ports.translate("coding.sub.feedback")));
  input.className = "mw-input";
  input.rows = 2;
  input.maxLength = 4000;
  input.dataset.feedback = child.subagent_id;
  try { input.value = sessionStorage.getItem(draftKey(child.subagent_id)) ?? ""; } catch { /* storage closed: start empty */ }
  panel.ports.lifetime.listen(input, "input", () => {
    try { sessionStorage.setItem(draftKey(child.subagent_id), input.value); } catch { /* storage closed: the words stay in the box */ }
  });
  label.append(input);
  return { label, input };
};

/** The buttons a subagent in its state is offered. */
function offers(panel: Panel, row: HTMLElement, id: string, group: SubagentGroup, child: Child) {
  const { ports, pending } = panel, L = ports.translate, busy = pending.has(child.subagent_id);
  if (child.state === "running") row.append(button(panel, L("coding.sub.stop"), () => act(panel, id, group, child, "stop"), busy));
  // Ended badly but wrote files in its own directory: the work may be whole or partial, so it is shown, never assumed.
  if (["failed", "cancelled"].includes(child.state) && child.integration_available && (child.activity || []).some(item => WRITES.includes(item.name) && item.state === "completed")) {
    row.append(el("p", L("coding.sub.partial")));
    row.append(button(panel, L("coding.sub.look"), () => ports.openIntegration(id, group.run_id, child), busy));
  }
  if (child.state !== "completed") return;
  if (child.integration_available) row.append(button(panel, L("coding.sub.integrate"), () => ports.openIntegration(id, group.run_id, child), busy));
  const { label, input } = feedback(panel, child);
  row.append(label);
  row.append(button(panel, L("coding.sub.accept"), () => act(panel, id, group, child, "accepted", input.value), busy), button(panel, L("coding.sub.rework"), () => act(panel, id, group, child, "needs-work", input.value), busy));
}

/** What the subagent reported, then what it did and used. */
function outcome(panel: Panel, row: HTMLElement, child: Child) {
  const L = panel.ports.translate;
  if (child.result) row.append(resultBox(child));
  if (child.error) row.append(el("p", L("coding.sub.error", { error: child.error })));
  for (const activity of child.activity || []) row.append(el("p", activity.name + " · " + activity.state));
  if (child.usage) row.append(el("p", L("coding.sub.own-usage", { usage: panel.ports.usageSummary(child.usage) })));
  if (child.verdict) {
    const notes = child.verdict.notes || L("coding.sub.verdict.no-notes");
    row.append(el("p", child.verdict.status === "accepted" ? L("coding.sub.verdict.accepted", { notes }) : L("coding.sub.verdict.needs-work", { notes })));
  }
}

function childRow(panel: Panel, id: string, group: SubagentGroup, child: Child, opened: ReadonlySet<string | undefined>) {
  const L = panel.ports.translate;
  const resultState = child.state === "completed" && child.verdict ? (child.verdict.status === "accepted" ? L("coding.sub.state.accepted") : L("coding.sub.state.needs-work")) : panel.states[child.state];
  const row = el("details"), summary = el("summary", heading(panel, child) + " · " + resultState);
  row.dataset.child = child.subagent_id;
  row.open = opened.has(child.subagent_id);
  row.append(summary, assignment(panel, child, opened));
  if (child.state !== "running") row.append(compareToggle(panel, child));
  outcome(panel, row, child);
  offers(panel, row, id, group, child);
  return row;
}

/** UI projections never turn a runtime completion into user acceptance. */
export function subagentGroups(ports: SubagentPorts): SubagentGroups {
  const { translate: L, q } = ports, region = q("[data-coding-subagents]");
  let key = "", lastGroups: readonly SubagentGroup[] = [], lastId = "";
  const compare: string[] = [], pending = new Set<string>();
  const states = { running: L("coding.state.running"), completed: L("coding.sub.state.completed"), failed: L("coding.phase.failed"), cancelled: L("coding.phase.stopped"), "reconcile-required": L("coding.plan.run.reconcile") };
  const panel: Panel = { ports, region, compare, pending, states, redraw: () => update(lastId, lastGroups), stale: () => { key = ""; } };
  const update = (id: string, groups: readonly SubagentGroup[]) => {
    lastGroups = groups;
    lastId = id;
    const next = JSON.stringify([id, groups, [...pending], compare]);
    if (key === next) return;
    key = next;
    const opened = new Set([...region.querySelectorAll<HTMLElement>("details[open]")].map(node => node.dataset.child));
    const focused = document.activeElement, focusId = focused instanceof HTMLTextAreaElement && region.contains(focused) ? focused.dataset.feedback : undefined;
    const selection = focusId && focused instanceof HTMLTextAreaElement ? [focused.selectionStart, focused.selectionEnd] as const : null;
    region.replaceChildren();
    region.hidden = !groups.length;
    if (!groups.length) return;
    region.append(el("h3", L("coding.sub.title")), el("p", L("coding.sub.note")));
    const all = groups.flatMap(group => group.children || []);
    for (let index = compare.length - 1; index >= 0; index--) {
      if (!all.some(child => child.subagent_id === compare[index])) compare.splice(index, 1);
    }
    if (compare.length === 2) region.append(compareView(panel, all));
    else if (all.filter(child => child.state !== "running").length > 1) region.append(el("p", L("coding.sub.compare-hint")));
    for (const group of groups) {
      if (group.error) { region.append(el("p", L("coding.sub.unreadable", { reason: group.error }))); continue; }
      if (!group.children.length) { region.append(el("p", L("coding.sub.none"))); continue; }
      for (const child of group.children) region.append(childRow(panel, id, group, child, opened));
    }
    if (!focusId) return;
    const node = [...region.querySelectorAll("textarea")].find(each => each.dataset.feedback === focusId);
    if (!node) return;
    node.focus({ preventScroll: true });
    if (selection) node.setSelectionRange(selection[0], selection[1]);
  };
  return { update };
}
