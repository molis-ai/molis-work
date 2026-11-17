import { format, renderTaskAttemptBudget, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { setContentHtml } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { AgentRunUsage, AgentSubagentBudgetView } from "@molis-ai/molis-work-contracts/services/agent-host";
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
  readonly retry_of?: string;
  readonly budget?: AgentSubagentBudgetView;
  readonly verdict?: { readonly status: string; readonly notes?: string; readonly revision?: number };
}

/** One run's subagents, or why they could not be read. */
export interface SubagentGroup { readonly run_id: string; readonly error?: string; readonly children: readonly Child[] }

export interface SubagentPorts extends PagePorts {
  readonly roleName: (id: string) => string;
  readonly openConversation: (session: string, run: string, child: string) => Promise<void>;
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
const heading = (panel: Panel, child: Child) => (panel.ports.roleName(child.role_id) || child.role_name) + (child.workspace_path ? uiText.text("common.punctuation.in-parens", { value: child.workspace_path.split("/").pop() ?? "" }) : "");

const resultBox = (child: Child) => {
  const body = el("div");
  body.className = "coding-turn";
  if (child.result_html) setContentHtml(body, child.result_html);
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
  const box = el("article");
  box.className = "coding-compare-column";
  box.append(el("h4", heading(panel, child)), el("p", panel.states[child.state] || child.state));
  const files = edits(child);
  box.append(el("p", files.length ? uiText.text("coding.sub.files", { files: files.join(uiText.text("common.list.separator")) }) : uiText.text("coding.sub.no-files")));
  const tokens = child.usage?.tokens;
  if (tokens) box.append(el("p", uiText.text("coding.sub.usage", { tokens: format.number((tokens.input || 0) + (tokens.output || 0)) })));
  if (child.result) box.append(resultBox(child));
  if (child.error) box.append(el("p", uiText.text("coding.sub.error", { error: child.error })));
  return box;
};

/** Two results side by side, as Cursor compares attempts: retries of one subtask, or two takes on the same question. */
const compareView = (panel: Panel, all: readonly Child[]) => {
  const { compare } = panel;
  const view = el("section");
  view.className = "coding-compare";
  view.setAttribute("aria-label", uiText.text("coding.sub.compare-label"));
  const head = el("div");
  head.className = "coding-compare-head";
  head.append(el("strong", uiText.text("coding.sub.compare")), button(panel, uiText.text("coding.sub.compare-clear"), () => {
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
  pick.append(box, el("span", uiText.text("coding.sub.compare-add")));
  return pick;
};

/** The task, the directory and the tools the subagent was given. */
const assignment = (_panel: Panel, child: Child, opened: ReadonlySet<string | undefined>) => {
  const box = el("details");
  box.className = "coding-material";
  box.dataset.child = child.subagent_id + ":assignment";
  box.open = opened.has(box.dataset.child);
  box.append(el("summary", uiText.text("coding.sub.assignment")), el("p", child.task), el("p", uiText.text("coding.sub.workspace", { path: child.workspace_path || uiText.text("coding.sub.unknown") })), el("p", uiText.text("coding.sub.tools", { tools: (child.host_tools || []).join(uiText.text("common.list.separator")) })));
  return box;
};

/** The person's verdict on a subagent, or a request to stop it, then the session read again. */
const act = async (panel: Panel, id: string, group: SubagentGroup, child: Child, action: "stop" | "accepted" | "needs-work" | "retry" | "extend-budget", notes = "") => {
  const { ports, pending } = panel, { lifetime, api, current, status, refresh } = ports;
  if (pending.has(child.subagent_id)) return;
  pending.add(child.subagent_id);
  panel.stale();
  try {
    const payload = action === "extend-budget"
      ? { action, extend_attempts: 3, request_id: crypto.randomUUID(), child_run: child.child_run }
      : action === "retry" || action === "stop"
        ? { action, request_id: crypto.randomUUID(), child_run: child.child_run }
        : { action, notes, expected_revision: child.verdict?.revision ?? 0 };
    await api("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(group.run_id) + "/subagents/" + encodeURIComponent(child.subagent_id), "POST", payload);
    if (action === "accepted" || action === "needs-work") {
      try { sessionStorage.removeItem(draftKey(child.subagent_id)); } catch { /* storage closed: nothing was kept */ }
    }
    if (action === "needs-work") await ports.prepareRework(id, group.run_id, child, notes);
    if (current() === id) {
      status(action === "needs-work" ? uiText.text("coding.sub.rework-saved") : action === "stop" ? uiText.text("coding.sub.stop-asked") : action === "extend-budget" ? uiText.text("coding.card.budget-extended") : action === "retry" ? uiText.text("coding.card.retry-asked") : uiText.text("coding.sub.verdict-saved"));
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
  label.append(el("span", uiText.text("coding.sub.feedback")));
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
  const { ports, pending } = panel, busy = pending.has(child.subagent_id);
  if (child.state === "running") row.append(button(panel, uiText.text("coding.sub.stop"), () => act(panel, id, group, child, "stop"), busy));
  // Ended badly but wrote files in its own directory: the work may be whole or partial, so it is shown, never assumed.
  if (["failed", "cancelled"].includes(child.state)) {
    if (child.integration_available && (child.activity || []).some(item => WRITES.includes(item.name) && item.state === "completed")) {
      row.append(el("p", uiText.text("coding.sub.partial")));
      row.append(button(panel, uiText.text("coding.sub.look"), () => ports.openIntegration(id, group.run_id, child), busy));
    }
    if (child.budget?.exhausted) row.append(button(panel, uiText.text("coding.card.extend-budget"), () => act(panel, id, group, child, "extend-budget"), busy));
    else if (child.budget) row.append(button(panel, uiText.text("coding.card.retry"), () => act(panel, id, group, child, "retry"), busy));
  }
  if (child.state !== "completed") return;
  if (child.integration_available) row.append(button(panel, uiText.text("coding.sub.integrate"), () => ports.openIntegration(id, group.run_id, child), busy));
  const { label, input } = feedback(panel, child);
  row.append(label);
  row.append(button(panel, uiText.text("coding.sub.accept"), () => act(panel, id, group, child, "accepted", input.value), busy), button(panel, uiText.text("coding.sub.rework"), () => act(panel, id, group, child, "needs-work", input.value), busy));
}

/** What the subagent reported, then what it did and used. */
function outcome(panel: Panel, row: HTMLElement, child: Child) {
  if (child.budget) {
    const budget = child.budget;
    const sources: Readonly<Record<string, string>> = {
      "check-failed": uiText.text("coding.card.budget.reason.verification"),
      "model-error": uiText.text("coding.card.budget.reason.provider"),
      "user-requested": uiText.text("coding.card.budget.reason.user"),
    };
    const headerText = [
      uiText.text("coding.card.budget.count", { attempt: budget.attempt, max: budget.max_attempts }),
      budget.exhausted ? uiText.text("coding.card.budget.exhausted") : "",
    ].filter(Boolean).join(" · ");
    const pastAttempts = budget.prior_attempts?.map(item => {
      const stateWord = panel.states[item.state] || item.state;
      const detail = item.reason || item.error || (item.source ? sources[item.source] : "") || "";
      return {
        state: (item.state === "completed" ? "done" : item.state === "cancelled" ? "stopped" : "failed") as "done" | "stopped" | "failed",
        text: uiText.text("coding.card.budget.past-line", { attempt: item.attempt, state: stateWord, detail: detail ? " · " + detail : "" }),
      };
    });
    const wrap = el("div");
    setContentHtml(wrap, renderTaskAttemptBudget({
      headerText,
      budgetPercent: budget.max_attempts > 0 ? Math.round((budget.attempt / budget.max_attempts) * 100) : 0,
      meterLabel: uiText.text("coding.card.budget.meter-label"),
      ...(budget.retry_source && sources[budget.retry_source] ? { retryReasonLabel: sources[budget.retry_source], retryReasonTone: budget.retry_source === "user-requested" ? "info" : "warning" } : {}),
      ...(budget.retry_reason ? { summaryText: budget.retry_reason } : {}),
      ...(pastAttempts?.length ? { pastSummaryLabel: uiText.text("coding.card.budget.past-summary", { count: pastAttempts.length }), pastAttempts } : {}),
    }));
    row.append(wrap);
  }
  if (child.result) row.append(resultBox(child));
  if (child.error) row.append(el("p", uiText.text("coding.sub.error", { error: child.error })));
  for (const activity of child.activity || []) row.append(el("p", activity.name + " · " + activity.state));
  if (child.usage) row.append(el("p", uiText.text("coding.sub.own-usage", { usage: panel.ports.usageSummary(child.usage) })));
  if (child.verdict) {
    const notes = child.verdict.notes || uiText.text("coding.sub.verdict.no-notes");
    row.append(el("p", child.verdict.status === "accepted" ? uiText.text("coding.sub.verdict.accepted", { notes }) : uiText.text("coding.sub.verdict.needs-work", { notes })));
  }
}

function childRow(panel: Panel, id: string, group: SubagentGroup, child: Child, opened: ReadonlySet<string | undefined>) {
  const resultState = child.state === "completed" && child.verdict ? (child.verdict.status === "accepted" ? uiText.text("coding.sub.state.accepted") : uiText.text("coding.sub.state.needs-work")) : panel.states[child.state];
  const row = el("details"), summary = el("summary", heading(panel, child) + " · " + resultState);
  row.dataset.child = child.subagent_id;
  row.open = opened.has(child.subagent_id);
  const conversation = button(panel, uiText.text("coding.subtask.open-result"), () => panel.ports.openConversation(id, group.run_id, child.subagent_id).catch(error => panel.ports.status(errorMessage(error), true)));
  conversation.classList.add("mw-btn--ghost"); conversation.dataset.codingChildConversation = child.subagent_id;
  row.append(summary, conversation, assignment(panel, child, opened));
  if (child.state !== "running") row.append(compareToggle(panel, child));
  outcome(panel, row, child);
  offers(panel, row, id, group, child);
  return row;
}

/** UI projections never turn a runtime completion into user acceptance. */
export function subagentGroups(ports: SubagentPorts): SubagentGroups {
  const { q } = ports, region = q("[data-coding-subagents]");
  let key = "", lastGroups: readonly SubagentGroup[] = [], lastId = "";
  const compare: string[] = [], pending = new Set<string>();
  const states = { running: uiText.text("coding.state.running"), completed: uiText.text("coding.sub.state.completed"), failed: uiText.text("coding.phase.failed"), cancelled: uiText.text("coding.phase.stopped"), "reconcile-required": uiText.text("coding.plan.run.reconcile") };
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
    region.append(el("h3", uiText.text("coding.sub.title")), el("p", uiText.text("coding.sub.note")));
    const all = groups.flatMap(group => group.children || []);
    for (let index = compare.length - 1; index >= 0; index--) {
      if (!all.some(child => child.subagent_id === compare[index])) compare.splice(index, 1);
    }
    if (compare.length === 2) region.append(compareView(panel, all));
    else if (all.filter(child => child.state !== "running").length > 1) region.append(el("p", uiText.text("coding.sub.compare-hint")));
    for (const group of groups) {
      if (group.error) { region.append(el("p", uiText.text("coding.sub.unreadable", { reason: group.error }))); continue; }
      if (!group.children.length) { region.append(el("p", uiText.text("coding.sub.none"))); continue; }
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
