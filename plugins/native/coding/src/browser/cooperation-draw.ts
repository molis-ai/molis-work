import type { BackgroundTask, Coop, Delegation, Delegations, Delivery, Mail, Side } from "./cooperation-types.js";
import { el, errorMessage } from "./dom.js";
import type { Translate } from "./types.js";

type Variant = "secondary" | "ghost" | "";

const time = (value: number | undefined) => value ? new Date(value).toLocaleString(document.documentElement.lang || "zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const ENDED = ["completed", "rejected", "cancelled", "failed"];

/** The words and tones of every state the panels name. */
function words(L: Translate) {
  return {
    event: { submitted: L("coding.coop.event.submitted"), delivered: L("coding.coop.event.delivered"), accepted: L("coding.coop.event.accepted"), started: L("coding.coop.event.started"), "delivery-sent": L("coding.coop.event.delivery-sent"), "delivery-accepted": L("coding.coop.event.delivery-accepted"), "delivery-rejected": L("coding.coop.event.delivery-rejected"), completed: L("coding.coop.event.completed"), rejected: L("coding.coop.event.rejected"), cancelled: L("coding.state.cancelled"), failed: L("coding.timeline.failed") } as Readonly<Record<string, string>>,
    session: { idle: L("coding.state.idle"), running: L("coding.state.running"), paused: L("coding.state.paused"), "waiting-answer": L("coding.state.waiting-answer"), "waiting-approval": L("coding.state.waiting-approval"), failed: L("coding.state.failed"), stopped: L("coding.phase.stopped"), cancelled: L("coding.state.cancelled"), "reconcile-required": L("coding.coop.state.reconcile"), queued: L("coding.state.queued"), done: L("coding.state.done") } as Readonly<Record<string, string>>,
    delegation: { received: L("coding.coop.state.received"), delivered: L("coding.coop.state.delivered"), accepted: L("coding.coop.state.accepted"), committing: L("coding.coop.state.committing"), completed: L("coding.coop.state.completed"), rejected: L("coding.coop.state.rejected"), cancelled: L("coding.coop.state.cancelled"), failed: L("coding.coop.state.failed") } as Readonly<Record<string, string>>,
    mailKind: { request: L("coding.coop.mail.request"), reply: L("coding.coop.mail.reply"), notice: L("coding.coop.mail.notice"), handoff: L("coding.coop.mail.handoff") } as Readonly<Record<string, string>>,
    mailState: { queued: L("coding.coop.mail.queued"), delivered: L("coding.coop.mail.delivered"), accepted: L("coding.coop.event.accepted"), completed: L("coding.board.phase.completed"), rejected: L("coding.coop.event.rejected"), cancelled: L("coding.coop.mail.cancelled"), expired: L("coding.coop.mail.expired") } as Readonly<Record<string, string>>,
    task: { running: L("coding.coop.task.running"), succeeded: L("coding.coop.task.succeeded"), failed: L("coding.timeline.failed"), stopped: L("coding.phase.stopped"), interrupted: L("coding.coop.task.interrupted") } as Readonly<Record<string, string>>,
  };
}
const TONE: Readonly<Record<string, string>> = { received: "attention", delivered: "attention", accepted: "progress", committing: "progress", completed: "done", rejected: "blocked", cancelled: "idle", failed: "blocked" };
const RING: Readonly<Record<string, string>> = { received: "approval", delivered: "approval", accepted: "ready", committing: "running", completed: "done", rejected: "cancelled", cancelled: "cancelled", failed: "failed" };
const MAIL_TONE: Readonly<Record<string, string>> = { queued: "attention", delivered: "progress", accepted: "progress", completed: "done", rejected: "blocked", cancelled: "idle", expired: "idle" };
const MAIL_RING: Readonly<Record<string, string>> = { queued: "queued", delivered: "waiting", accepted: "ready", completed: "round-ended", rejected: "cancelled", cancelled: "cancelled", expired: "stale" };
const TASK_TONE: Readonly<Record<string, string>> = { running: "progress", succeeded: "done", failed: "blocked", stopped: "idle", interrupted: "attention" };

function button(coop: Coop, label: string, variant: Variant, handler: () => unknown) {
  const node = el("button", label, "mw-btn" + (variant ? " mw-btn--" + variant : ""));
  node.type = "button";
  coop.ports.lifetime.listen(node, "click", handler);
  return node;
}

/** Posts a change to a delegation, says it is done, and reads again. */
async function act(coop: Coop, path: string, body: unknown, done?: string) {
  const { api, current, status, lifetime } = coop.ports;
  try {
    await api("/sessions/" + encodeURIComponent(current()) + "/delegations" + path, "POST", body);
    if (done) status(done);
    await coop.again();
  } catch (error) {
    if (!lifetime.alive) return;
    status(errorMessage(error), true);
    await coop.again();
  }
}

/** Posts a request that stops or withdraws something, says so, and reads again. */
async function post(coop: Coop, path: string, said: string) {
  const { api, current, status, lifetime } = coop.ports;
  try {
    await api("/sessions/" + encodeURIComponent(current()) + path, "POST", {});
    status(said);
  } catch (error) {
    if (!lifetime.alive) return;
    status(errorMessage(error), true);
  }
  await coop.again();
}

function receipts(coop: Coop, delegation: Delegation) {
  const L = coop.ports.translate, word = words(L).event;
  const details = el("details", "", "coding-coop-receipts"), list = el("ol");
  for (const receipt of delegation.receipts) {
    const item = el("li");
    item.append(el("span", word[receipt.event] || receipt.event, "coding-coop-event"), el("time", time(receipt.at)));
    if (receipt.note) item.append(el("span", receipt.note, "coding-coop-note"));
    if (receipt.recorded_only) item.append(el("span", L("coding.coop.late"), "coding-coop-late"));
    list.append(item);
  }
  details.append(el("summary", L("coding.coop.receipts", { count: delegation.receipts.length })), list);
  return details;
}

function stateChip(L: Translate, delegation: Delegation) {
  const chip = el("span", words(L).delegation[delegation.state] || delegation.state_label, "mw-status mw-status--plain");
  chip.dataset.tone = TONE[delegation.state] || "idle";
  chip.dataset.mwState = RING[delegation.state] || "verify";
  return chip;
}

const sessionLink = (coop: Coop, side: Side | null | undefined) => side?.title
  ? button(coop, coop.ports.translate("coding.coop.quoted", { title: side.title }), "ghost", () => void coop.ports.openSession(side.session_id, side.title ?? ""))
  : el("span", coop.ports.translate("coding.coop.gone"), "coding-coop-gone");

/** A form that asks why, then hands the reason to the handler. */
function reasonForm(coop: Coop, label: string, confirm: string, handler: (reason: string) => unknown) {
  const form = el("form", "", "coding-coop-reason"), input = el("textarea", "", "mw-textarea"), send = el("button", confirm, "mw-btn mw-btn--secondary");
  input.rows = 2;
  input.maxLength = 2000;
  input.required = true;
  input.setAttribute("aria-label", label);
  input.placeholder = label;
  send.type = "submit";
  form.append(input, send);
  coop.ports.lifetime.listen(form, "submit", event => {
    event.preventDefault();
    if (input.value.trim()) void handler(input.value.trim());
  });
  return form;
}

/** Commands a round left running in the background, with a button to stop each. */
export function drawBackground(coop: Coop) {
  const { translate: L } = coop.ports, section = coop.backgroundSection, word = words(L).task;
  section.hidden = !coop.commands.length && !coop.backgroundUnknown;
  section.replaceChildren();
  if (section.hidden) return;
  section.append(el("h3", L("coding.results.background")));
  if (coop.backgroundUnknown) section.append(el("p", L("coding.coop.state-unreadable")));
  const list = el("ol", "", "coding-coop-mail coding-background-list");
  for (const task of coop.commands.slice().reverse()) list.append(backgroundItem(coop, task, word));
  section.append(list);
}

function backgroundItem(coop: Coop, task: BackgroundTask, word: Readonly<Record<string, string>>) {
  const L = coop.ports.translate, item = el("li"), head = el("div", "", "coding-coop-head"), chip = el("span", word[task.state] || task.state, "mw-status mw-status--plain");
  chip.dataset.tone = TASK_TONE[task.state] || "idle";
  chip.dataset.mwState = task.state === "succeeded" ? "done" : task.state;
  item.dataset.state = task.state;
  head.append(el("code", task.summary, "coding-background-command"), chip);
  const line = el("p", "", "coding-coop-line");
  line.append(el("span", (task.exit_code === undefined ? "" : "exit " + task.exit_code + " · ") + L("coding.coop.started-at", { time: time(task.started_at_ms) }) + (task.ended_at_ms ? " · " + L("coding.coop.ended-at", { time: time(task.ended_at_ms) }) : ""), "coding-coop-note"));
  item.append(head, line);
  if (task.state === "running") item.append(button(coop, L("coding.coop.stop"), "ghost", () => post(coop, "/background/" + encodeURIComponent(task.task_id) + "/stop", L("coding.coop.stopped-command"))));
  return item;
}

/** A work-in-progress hand-off the other session delivered: the choice of which round and which result to deliver. */
function deliverForm(coop: Coop, incoming: Delegation, path: string) {
  const { translate: L, lifetime } = coop.ports, finished = coop.ports.rounds().filter(round => round.phase === "completed");
  const form = el("form", "", "coding-coop-deliver"), choice = el("select", "", "mw-select"), kind = el("select", "", "mw-select"), note = el("input", "", "mw-input"), send = el("button", L("coding.coop.deliver"), "mw-btn mw-btn--secondary");
  for (const round of finished.slice().reverse()) {
    const option = el("option", L("coding.turn.number", { number: round.number }));
    option.value = round.run_id;
    choice.append(option);
  }
  for (const [value, label] of [["report", L("coding.coop.kind.report")], ["changeset", L("coding.coop.kind.changeset")]] as const) {
    const option = el("option", label);
    option.value = value;
    kind.append(option);
  }
  choice.setAttribute("aria-label", L("coding.coop.which-turn"));
  kind.setAttribute("aria-label", L("coding.coop.which-result"));
  note.placeholder = L("coding.coop.note-optional");
  note.maxLength = 2000;
  note.setAttribute("aria-label", L("coding.coop.note"));
  send.type = "submit";
  form.append(choice, kind, note, send);
  lifetime.listen(form, "submit", event => {
    event.preventDefault();
    send.disabled = true;
    void act(coop, path + "/deliveries", { run_id: choice.value, kind: kind.value, note: note.value, expected_revision: incoming.revision }, L("coding.coop.delivered"));
  });
  return form;
}

/** What the incoming delegation is waiting for while it is being carried out. */
function committing(coop: Coop, incoming: Delegation, path: string) {
  const L = coop.ports.translate, { banner } = coop, finished = coop.ports.rounds().filter(round => round.phase === "completed");
  const pending = incoming.deliveries.find(item => item.state === "sent");
  if (pending) {
    const number = coop.ports.rounds().find(round => round.run_id === pending.run_id)?.number || "?";
    banner.append(el("p", pending.kind === "report" ? L("coding.coop.delivered-report", { number }) : L("coding.coop.delivered-change", { number }), "coding-coop-note"));
  } else if (!finished.length) {
    banner.append(el("p", L("coding.coop.deliver-later"), "coding-coop-note"));
  } else {
    banner.append(deliverForm(coop, incoming, path));
  }
  for (const delivery of incoming.deliveries.filter(item => item.state === "rejected").slice(-1)) banner.append(el("p", L("coding.coop.last-rejected", { reason: delivery.reason ?? "" }), "coding-coop-rejected"));
}

/** The accept and reject buttons of a delegation that has arrived. */
function answerRow(coop: Coop, incoming: Delegation, path: string) {
  const L = coop.ports.translate, row = el("div", "", "coding-coop-actions");
  const reject = (why: string) => reasonForm(coop, why, L("coding.coop.reject-ok"), reason => act(coop, path, { action: "reject", reason, expected_revision: incoming.revision }, L("coding.coop.rejected")));
  if (incoming.state === "delivered") {
    row.append(button(coop, L("coding.coop.accept"), "secondary", () => void act(coop, path, { action: "accept", expected_revision: incoming.revision }, L("coding.coop.accepted")).then(() => coop.ports.prefill(incoming.task))), button(coop, L("coding.coop.reject"), "ghost", () => {
      row.replaceChildren(reject(L("coding.coop.reject-why-seen")));
      row.querySelector("textarea")?.focus();
    }));
  } else {
    row.append(button(coop, L("coding.coop.reject"), "ghost", () => row.replaceChildren(reject(L("coding.coop.reject-why")))));
  }
  return row;
}

/** The delegation another session handed to this one: what it asks, and what can be done with it now. */
export function drawBanner(coop: Coop, incoming: Delegation | null) {
  const { translate: L } = coop.ports, { banner } = coop;
  banner.hidden = !incoming;
  banner.replaceChildren();
  if (!incoming) return;
  const head = el("div", "", "coding-coop-head");
  head.append(el("strong", L("coding.coop.incoming")), stateChip(L, incoming));
  const from = el("p", "", "coding-coop-line");
  from.append(document.createTextNode(L("coding.coop.from")), sessionLink(coop, incoming.from), document.createTextNode(" · " + incoming.title));
  const ended = ENDED.includes(incoming.state);
  banner.classList.toggle("is-ended", ended);
  if (ended) {
    head.append(from);
    banner.append(head, receipts(coop, incoming));
    return;
  }
  const task = el("details", "", "coding-coop-task");
  task.append(el("summary", L("coding.coop.task")), el("p", incoming.task));
  banner.append(head, from, task);
  const path = "/" + encodeURIComponent(incoming.delegation_id);
  if (incoming.state === "delivered") {
    banner.append(el("p", L("coding.coop.accept-note"), "coding-coop-note"), answerRow(coop, incoming, path));
  } else if (incoming.state === "accepted") {
    banner.append(el("p", L("coding.coop.accepted-note"), "coding-coop-note"), answerRow(coop, incoming, path));
  } else if (incoming.state === "committing") {
    committing(coop, incoming, path);
  } else {
    banner.append(el("p", incoming.state === "completed" ? L("coding.coop.completed") : (incoming.receipts.at(-1)?.note || words(L).delegation[incoming.state] || incoming.state_label), "coding-coop-note"));
  }
  banner.append(receipts(coop, incoming));
}

/** One message between sessions. */
function mailItem(coop: Coop, message: Mail, word: ReturnType<typeof words>) {
  const L = coop.ports.translate, item = el("li"), head = el("div", "", "coding-coop-head"), line = el("p", "", "coding-coop-line");
  item.dataset.state = message.state;
  const failed = message.state === "cancelled" && (message.history || []).some(entry => entry.event === "failed");
  const chip = el("span", failed ? L("coding.coop.mail.failed") : (word.mailState[message.state] || message.state), "mw-status mw-status--plain");
  chip.dataset.tone = failed ? "blocked" : (MAIL_TONE[message.state] || "idle");
  chip.dataset.mwState = failed ? "failed" : MAIL_RING[message.state] || "verify";
  const kind = word.mailKind[message.kind] || message.kind;
  head.append(el("strong", (message.outgoing ? L("coding.coop.mail.sent", { kind }) : L("coding.coop.mail.received", { kind })) + (message.await_reply ? L("coding.coop.mail.awaiting") : "")), chip);
  line.append(document.createTextNode(message.outgoing ? L("coding.coop.mail.to") : L("coding.coop.mail.from")), message.peer ? sessionLink(coop, message.peer) : el("span", L("coding.coop.quoted", { title: (message.outgoing ? message.to_title : message.from_title) ?? "" })), el("time", time(message.sent_at_ms)));
  const body = el("details", "", "coding-coop-task");
  body.append(el("summary", message.body.split("\n")[0]?.slice(0, 80) ?? ""), el("p", message.body));
  item.append(head, line, body);
  if (message.outgoing && ["queued", "delivered", "accepted"].includes(message.state)) item.append(button(coop, L("coding.coop.withdraw"), "ghost", () => post(coop, "/messages/" + encodeURIComponent(message.message_id) + "/cancel", L("coding.coop.withdrawn"))));
  return item;
}

function drawMail(coop: Coop) {
  if (!coop.mail.length) return;
  const word = words(coop.ports.translate), list = el("ol", "", "coding-coop-mail");
  for (const message of coop.mail.slice().reverse()) list.append(mailItem(coop, message, word));
  coop.section.append(el("h4", coop.ports.translate("coding.coop.mail")), list);
}

/** One delivery of a delegation this session handed out: what came back, and the buttons to take or decline it. */
function deliveryRow(coop: Coop, delegation: Delegation, delivery: Delivery, path: string, open: boolean) {
  const { translate: L, openArtifact } = coop.ports, row = el("div", "", "coding-coop-delivery");
  row.dataset.state = delivery.state;
  row.append(el("p", L("coding.coop.delivery", { kind: delivery.kind === "report" ? L("coding.coop.report") : L("coding.coop.change") }) + " · " + delivery.title + (delivery.note ? " · " + delivery.note : "") + " · " + time(delivery.sent_at)));
  const artifact = delivery.artifact;
  if (artifact && openArtifact) row.append(button(coop, delivery.kind === "report" ? L("coding.coop.open-report") : L("coding.coop.open-change"), "ghost", () => openArtifact(artifact, delivery.title)));
  const decide = path + "/deliveries/" + encodeURIComponent(delivery.delivery_id);
  if (delivery.state === "sent" && open) {
    const actions = el("div", "", "coding-coop-actions");
    actions.append(button(coop, L("coding.coop.take"), "secondary", () => void act(coop, decide, { decision: "accept", expected_revision: delegation.revision }, L("coding.coop.taken")).then(() => coop.ports.materialsChanged())), button(coop, L("coding.coop.decline"), "ghost", () => {
      actions.replaceChildren(reasonForm(coop, L("coding.coop.decline-why"), L("coding.coop.confirm"), reason => act(coop, decide, { decision: "reject", reason, expected_revision: delegation.revision }, L("coding.coop.declined"))));
    }));
    row.append(actions);
  } else if (delivery.state !== "sent") {
    row.append(el("p", delivery.state === "accepted" ? L("coding.coop.took-at", { time: time(delivery.decided_at) }) : L("coding.coop.not-taken", { reason: delivery.reason ?? "" }), "coding-coop-note"));
  }
  return row;
}

/** A delegation this session handed to another. */
function outgoingCard(coop: Coop, delegation: Delegation) {
  const L = coop.ports.translate, word = words(L);
  const card = el("article", "", "coding-coop-card"), head = el("div", "", "coding-coop-head"), path = "/" + encodeURIComponent(delegation.delegation_id);
  head.append(el("strong", delegation.title), stateChip(L, delegation));
  const open = !ENDED.includes(delegation.state), to = el("p", "", "coding-coop-line");
  to.append(document.createTextNode(L("coding.coop.delegated-to")), sessionLink(coop, delegation.to));
  if (delegation.to?.state) to.append(el("span", L("coding.coop.there", { state: word.session[delegation.to.state] || delegation.to.state }), "coding-coop-note"));
  card.append(head, to);
  for (const delivery of delegation.deliveries) card.append(deliveryRow(coop, delegation, delivery, path, open));
  if (delegation.state === "received") card.append(button(coop, L("coding.coop.retry"), "secondary", () => void act(coop, path, { action: "deliver", expected_revision: delegation.revision })));
  if (open) card.append(button(coop, L("coding.coop.cancel"), "ghost", () => void act(coop, path, { action: "cancel", expected_revision: delegation.revision }, L("coding.coop.cancelled"))));
  card.append(receipts(coop, delegation));
  return card;
}

/** Every delegation of the session, the sessions related to it, and its messages. */
export function drawSection(coop: Coop, value: Delegations) {
  const { translate: L } = coop.ports, { section } = coop, word = words(L);
  const empty = !value.outgoing.length && !value.related.length && !value.incoming && !coop.mail.length;
  section.hidden = empty;
  section.replaceChildren();
  if (empty) return;
  section.append(el("h3", L("coding.results.cooperation")));
  for (const delegation of value.outgoing) section.append(outgoingCard(coop, delegation));
  if (value.incoming) {
    const line = el("p", "", "coding-coop-line");
    line.append(document.createTextNode(L("coding.coop.came-from")), sessionLink(coop, value.incoming.from), document.createTextNode(L("coding.coop.came-from-after", { state: word.delegation[value.incoming.state] || value.incoming.state_label })));
    section.append(line);
  }
  const others = value.related.filter(item => !value.outgoing.some(delegation => delegation.to_session === item.session_id));
  if (others.length) {
    const list = el("ul", "", "coding-coop-related");
    for (const item of others) {
      const entry = el("li");
      entry.append(sessionLink(coop, item), el("span", item.relation.join(L("coding.list.joiner")) + (item.state ? " · " + (word.session[item.state] || item.state) : ""), "coding-coop-note"));
      list.append(entry);
    }
    section.append(el("h4", L("coding.coop.related")), list);
  }
  drawMail(coop);
}
