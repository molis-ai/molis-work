import { el, errorMessage, part } from "./dom.js";
import type { Child } from "./subagents.js";
import type { PagePorts, ShowReviews, TimelineApi, Translate } from "./types.js";

/** The run whose block the subagent cards sit under. */
export interface CardsRun { readonly ref: { readonly run_id: string }; readonly phase: string }

/** One run's subagents, or why they could not be read. */
export interface CardsGroup { readonly run_id: string; readonly error?: string; readonly children?: readonly Child[] }

export interface SubagentCardPorts extends PagePorts {
  readonly timeline: TimelineApi;
  readonly roleName: (id: string) => string;
  readonly showReviews: ShowReviews;
  readonly sessionId: () => string | null;
  /** Opens the results panel on the subagent. */
  readonly openInPanel: (id: string) => void;
  /** Whether the run can still be asked something through the supplemental channel. */
  readonly parentLive: (run: CardsRun) => boolean;
  /** Puts a request in the composer, sent only when the person chooses. */
  readonly prefill: (text: string) => void;
}

export interface SubagentCards {
  /** The section of the run's subagents under its block, or null when there are none. */
  render(run: CardsRun, group: CardsGroup | undefined): HTMLElement | null;
}

const WRITES = ["edit", "write"];

const phaseOf = (child: Child) => child.state === "running" ? "running" : child.state === "completed" ? "completed" : child.state === "failed" ? "failed" : "stopped";
const markOf = (child: Child) => child.state === "running" ? "running" : child.state === "completed" ? "round-ended" : child.state === "failed" ? "failed" : child.state === "reconcile-required" ? "verify" : "stopped";
const edits = (child: Child) => [...new Set((child.activity || []).filter(item => WRITES.includes(item.name) && item.state === "completed" && item.target).map(item => item.target as string))];

const button = (label: string, action: (button: HTMLButtonElement) => unknown) => {
  const node = el("button", label, "mw-btn mw-btn--ghost");
  node.type = "button";
  return { node, action: () => void action(node) };
};

/** An empty card: header, task, the child's own timeline, its approvals, its conclusion and its footer. */
function build(child: Child) {
  const node = el("article", "", "coding-child");
  node.dataset.child = child.subagent_id;
  const head = el("header", "", "coding-child-head");
  head.append(el("span", "", "coding-child-mark"), el("strong", "", "coding-child-role"), el("span", "", "coding-child-state"), el("span", "", "coding-child-meta"));
  const process = el("details", "", "coding-activity coding-child-process");
  process.dataset.codingActivity = "child:" + child.subagent_id;
  const reviews = el("div", "", "coding-child-reviews"), result = el("details", "", "coding-child-result");
  reviews.hidden = true;
  result.append(el("summary"), el("div", "", "coding-turn"));
  node.append(head, el("p", "", "coding-child-task"), process, reviews, result, el("footer", "", "coding-child-foot"));
  return node;
}

function drawHead(ports: SubagentCardPorts, node: HTMLElement, child: Child) {
  const L = ports.translate, verdict = child.verdict?.status;
  part(node, ".coding-child-mark").dataset.mwState = markOf(child);
  part(node, ".coding-child-role").textContent = ports.roleName(child.role_id) || child.role_name;
  const states: Readonly<Record<string, string>> = { running: L("coding.state.running"), completed: L("coding.card.state.completed"), failed: L("coding.phase.failed"), cancelled: L("coding.phase.stopped"), "reconcile-required": L("coding.card.state.reconcile") };
  part(node, ".coding-child-state").textContent = verdict === "accepted" ? L("coding.card.accepted") : verdict === "needs-work" ? L("coding.card.needs-work") : states[child.state] || child.state;
  const tokens = child.usage?.tokens;
  part(node, ".coding-child-meta").textContent = [
    child.workspace_path && child.integration_available ? L("coding.board.own-directory", { path: (child.workspace_path.split("/").pop() ?? "") }) : "",
    tokens && (tokens.input || tokens.output) ? L("coding.card.usage", { tokens: ((tokens.input || 0) + (tokens.output || 0)).toLocaleString() }) : "",
  ].filter(Boolean).join(" · ");
  const task = part(node, ".coding-child-task");
  task.textContent = (child.task || "").trim().split("\n").find(line => line.trim()) || "";
  task.title = child.task || "";
}

/** The child's own timeline, drawn like the parent's: live while it runs, folded once it is done. */
function drawProcess(ports: SubagentCardPorts, node: HTMLElement, child: Child) {
  const process = part(node, ".coding-child-process");
  process.hidden = !child.activity?.length;
  if (child.activity?.length) ports.timeline.renderGroup(process, child.activity, { ref: { run_id: child.subagent_id }, phase: phaseOf(child), activity: child.activity }, child.state === "running");
}

/** Its pending approvals appear in its own card, decided by the Host like any other. */
function drawReviews(ports: SubagentCardPorts, node: HTMLElement, child: Child) {
  const reviews = part(node, ".coding-child-reviews");
  // The Host's review client shows or hides this box itself; an empty one never takes space.
  if (child.state === "running" && child.child_run) {
    const now = Date.now();
    if (now - Number(reviews.dataset.readAt || 0) > 1500) {
      reviews.dataset.readAt = String(now);
      void ports.showReviews(reviews, [child.child_run], ports.sessionId());
    }
    return;
  }
  reviews.hidden = true;
  reviews.replaceChildren();
  delete reviews.dataset.readAt;
}

/** What the child changed, at a glance, without unfolding its timeline or opening the integration dialog. */
function drawChanged(L: Translate, node: HTMLElement, child: Child, edited: readonly string[]) {
  let changed = node.querySelector<HTMLElement>(".coding-child-changed");
  if (!edited.length) {
    changed?.remove();
    return;
  }
  if (!changed) {
    changed = el("p", "", "coding-child-changed");
    part(node, ".coding-child-result").before(changed);
  }
  changed.textContent = L("coding.card.changed", { count: edited.length, files: edited.slice(0, 6).join(L("coding.list.joiner")) + (edited.length > 6 ? L("coding.card.and-more") : "") }) + (child.integration_available ? L("coding.card.own-directory") : "");
}

/** Folded by default with a one-line preview: the parent's summary is where the reading happens. */
function drawResult(L: Translate, node: HTMLElement, child: Child) {
  const result = part(node, ".coding-child-result");
  result.hidden = !child.result;
  if (!child.result) return;
  const body = part(result, ".coding-turn"), html = child.result_html || "";
  if (body.dataset.source !== child.result) {
    body.dataset.source = child.result;
    if (html) body.innerHTML = html;
    else body.textContent = child.result;
  }
  const preview = child.result.replace(/[#*`>|-]+/g, " ").replace(/\s+/g, " ").trim();
  part(result, "summary").textContent = L("coding.card.conclusion", { preview: preview.length > 90 ? preview.slice(0, 90) + "…" : preview });
}

/** A failure reads in plain words first; the original reason stays next to it. */
function drawError(ports: SubagentCardPorts, node: HTMLElement, child: Child) {
  if (!child.error) return;
  let error = node.querySelector<HTMLElement>(".coding-child-error");
  if (!error) {
    error = el("p", "", "coding-child-error");
    part(node, ".coding-child-foot").before(error);
  }
  const explained = ports.timeline.explainFailure?.(child.error);
  error.replaceChildren();
  if (explained) error.append(el("strong", explained.title), document.createTextNode(ports.translate("coding.timeline.colon") + explained.hint), el("span", child.error, "coding-child-error-code"));
  else error.textContent = child.error;
}

/** Asks the Host to stop the running subagent, then reads the session again. */
function stopButton(ports: SubagentCardPorts, run: CardsRun, child: Child) {
  const { translate: L, lifetime, api, current, status, refresh } = ports;
  return button(L("coding.card.stop"), async stop => {
    stop.disabled = true;
    const id = current();
    try {
      await api("/sessions/" + encodeURIComponent(id) + "/runs/" + encodeURIComponent(run.ref.run_id) + "/subagents/" + encodeURIComponent(child.subagent_id), "POST", { action: "stop" });
      status(L("coding.card.stop-asked"));
    } catch (error) {
      if (!lifetime.alive) return;
      status(errorMessage(error), true);
      stop.disabled = false;
    }
    if (id === current()) await refresh();
  });
}

/** What the parent is asked to do again for a failed or stopped child. A dispatch key already used names the same dispatch and returns the stopped result instead of running again. */
const retryRequest = (role: string, child: Child) => "请重新派出子任务「" + role + "」，沿用原分工，并用一个没用过的 idempotencyKey（原来的标识会被当成同一次派出，直接返回已停止的结果，不会重跑）" + (child.error ? "；上次没有完成的原因：" + child.error : "") + "。原分工：\n" + (child.task || "");

/**
 * A failed or stopped child is sent again by the parent, never re-run behind its back: a live parent is asked through the
 * supplemental channel; an ended one gets the request in the composer, sent only when the person chooses.
 */
function retryButton(ports: SubagentCardPorts, run: CardsRun, child: Child) {
  const { translate: L, lifetime, api, current, status, refresh } = ports;
  return button(L("coding.card.retry"), async retry => {
    const ask = retryRequest(ports.roleName(child.role_id) || child.role_name, child);
    if (!ports.parentLive(run)) {
      ports.prefill(ask);
      status(L("coding.card.retry-prefilled"));
      return;
    }
    retry.disabled = true;
    const id = current();
    try {
      await api("/sessions/" + encodeURIComponent(id) + "/control", "POST", { kind: "steer", run_id: run.ref.run_id, text: ask });
      status(L("coding.card.retry-asked"));
    } catch (error) {
      if (!lifetime.alive) return;
      status(errorMessage(error), true);
      retry.disabled = false;
    }
    if (id === current()) await refresh();
  });
}

/** The buttons a child in its state is offered, drawn again only when what they depend on changed. */
function drawFoot(ports: SubagentCardPorts, node: HTMLElement, run: CardsRun, child: Child, edited: readonly string[]) {
  const L = ports.translate, foot = part(node, ".coding-child-foot"), key = JSON.stringify([child.state, child.verdict?.status, child.integration_available, edited.length > 0]);
  if (foot.dataset.key === key) return;
  foot.dataset.key = key;
  foot.replaceChildren();
  const add = (made: { node: HTMLButtonElement; action: () => void }) => {
    ports.lifetime.listen(made.node, "click", made.action);
    foot.append(made.node);
  };
  if (child.state === "running") add(stopButton(ports, run, child));
  if (child.state === "completed") add(button(child.integration_available ? L("coding.card.judge-integrate") : L("coding.card.judge"), () => ports.openInPanel(child.subagent_id)));
  const ended = ["failed", "cancelled"].includes(child.state);
  // A child that ended badly may still have written real work in its own directory; the person looks before deciding.
  if (ended && child.integration_available && edited.length) add(button(L("coding.sub.look"), () => ports.openInPanel(child.subagent_id)));
  if (ended) add(retryButton(ports, run, child));
}

function card(ports: SubagentCardPorts, section: HTMLElement, run: CardsRun, child: Child) {
  let node = [...section.children].find((entry): entry is HTMLElement => entry instanceof HTMLElement && entry.dataset.child === child.subagent_id);
  if (!node) {
    node = build(child);
    section.append(node);
  }
  node.dataset.state = child.state;
  const edited = edits(child);
  drawHead(ports, node, child);
  drawProcess(ports, node, child);
  drawReviews(ports, node, child);
  drawChanged(ports.translate, node, child, edited);
  drawResult(ports.translate, node, child);
  drawError(ports, node, child);
  drawFoot(ports, node, run, child, edited);
}

/** The "compare" button of two or more children: their conclusions side by side, open. */
function compareButton(ports: SubagentCardPorts, section: HTMLElement) {
  const L = ports.translate, compare = el("button", section.dataset.layout === "compare" ? L("coding.card.one-by-one") : L("coding.sub.compare"), "coding-children-compare");
  compare.type = "button";
  compare.setAttribute("aria-pressed", String(section.dataset.layout === "compare"));
  ports.lifetime.listen(compare, "click", () => {
    const on = section.dataset.layout !== "compare";
    section.dataset.layout = on ? "compare" : "";
    section.querySelectorAll<HTMLDetailsElement>(".coding-child-result").forEach(node => {
      if (!node.hidden) node.open = on;
    });
    compare.textContent = on ? L("coding.card.one-by-one") : L("coding.sub.compare");
    compare.setAttribute("aria-pressed", String(on));
  });
  return compare;
}

/** The subagents of each run as cards under its block: a header, the child's own timeline, its approvals, its conclusion. */
export function subagentCards(ports: SubagentCardPorts): SubagentCards {
  const L = ports.translate;
  return {
    render(run, group) {
      if (!group || (!group.children?.length && !group.error)) return null;
      let section = document.querySelector<HTMLElement>('[data-coding-subagents-of="' + CSS.escape(run.ref.run_id) + '"]');
      if (!section) {
        section = el("section", "", "coding-children");
        section.dataset.codingSubagentsOf = run.ref.run_id;
        section.setAttribute("aria-label", L("coding.card.section"));
      }
      let head = section.querySelector<HTMLElement>(":scope > .coding-children-head");
      if (!head) {
        head = el("p", "", "coding-children-head");
        section.prepend(head);
      }
      if (group.error) {
        head.textContent = L("coding.card.unreadable", { reason: group.error });
        return section;
      }
      const children = group.children ?? [], running = children.filter(child => child.state === "running").length;
      head.replaceChildren(document.createTextNode(L("coding.call.dispatch.count", { count: children.length }) + " · " + (running ? L("coding.card.running", { count: running }) : L("coding.card.all-ended"))));
      // Two or more children can be read side by side, conclusions open, like comparing parallel agents.
      if (children.length > 1) head.append(compareButton(ports, section));
      for (const child of children) card(ports, section, run, child);
      for (const node of section.querySelectorAll<HTMLElement>(":scope > .coding-child")) {
        if (!children.some(child => child.subagent_id === node.dataset.child)) node.remove();
      }
      return section;
    },
  };
}
