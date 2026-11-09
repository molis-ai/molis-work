import { format, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { BackgroundTask, Coop, Delegation, Delegations, Delivery, Mail, Side } from "./cooperation-types.js";
import { el, errorMessage } from "./dom.js";
import type { Translate } from "./types.js";

type Variant = "secondary" | "ghost" | "";

const time = (value: number | undefined) => value ? format.date(new Date(value).toISOString(), "datetime") : "";
const ENDED = ["completed", "rejected", "cancelled", "failed"];

/** The words and tones of every state the panels name. */
function words(_L: Translate) {
  return {
    event: { submitted: uiText.text("coding.coop.event.submitted"), delivered: uiText.text("coding.coop.event.delivered"), accepted: uiText.text("coding.coop.event.accepted"), started: uiText.text("coding.coop.event.started"), "delivery-sent": uiText.text("coding.coop.event.delivery-sent"), "delivery-accepted": uiText.text("coding.coop.event.delivery-accepted"), "delivery-rejected": uiText.text("coding.coop.event.delivery-rejected"), completed: uiText.text("coding.coop.event.completed"), rejected: uiText.text("coding.coop.event.rejected"), cancelled: uiText.text("coding.state.cancelled"), failed: uiText.text("coding.timeline.failed") } as Readonly<Record<string, string>>,
    session: { idle: uiText.text("coding.state.idle"), running: uiText.text("coding.state.running"), paused: uiText.text("coding.state.paused"), "waiting-answer": uiText.text("coding.state.waiting-answer"), "waiting-approval": uiText.text("coding.state.waiting-approval"), failed: uiText.text("coding.state.failed"), stopped: uiText.text("coding.phase.stopped"), cancelled: uiText.text("coding.state.cancelled"), "reconcile-required": uiText.text("coding.coop.state.reconcile"), queued: uiText.text("coding.state.queued"), done: uiText.text("coding.state.done") } as Readonly<Record<string, string>>,
    delegation: { received: uiText.text("coding.coop.state.received"), delivered: uiText.text("coding.coop.state.delivered"), accepted: uiText.text("coding.coop.state.accepted"), committing: uiText.text("coding.coop.state.committing"), completed: uiText.text("coding.coop.state.completed"), rejected: uiText.text("coding.coop.state.rejected"), cancelled: uiText.text("coding.coop.state.cancelled"), failed: uiText.text("coding.coop.state.failed") } as Readonly<Record<string, string>>,
    mailKind: { request: uiText.text("coding.coop.mail.request"), reply: uiText.text("coding.coop.mail.reply"), notice: uiText.text("coding.coop.mail.notice"), handoff: uiText.text("coding.coop.mail.handoff") } as Readonly<Record<string, string>>,
    mailState: { queued: uiText.text("coding.coop.mail.queued"), delivered: uiText.text("coding.coop.mail.delivered"), accepted: uiText.text("coding.coop.event.accepted"), completed: uiText.text("coding.board.phase.completed"), rejected: uiText.text("coding.coop.event.rejected"), cancelled: uiText.text("coding.coop.mail.cancelled"), expired: uiText.text("coding.coop.mail.expired") } as Readonly<Record<string, string>>,
    task: { running: uiText.text("coding.coop.task.running"), succeeded: uiText.text("coding.coop.task.succeeded"), failed: uiText.text("coding.timeline.failed"), stopped: uiText.text("coding.phase.stopped"), interrupted: uiText.text("coding.coop.task.interrupted") } as Readonly<Record<string, string>>,
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
  const readText = coop.ports.translate, word = words(readText).event;
  const details = el("details", "", "coding-coop-receipts"), list = el("ol");
  for (const receipt of delegation.receipts) {
    const item = el("li");
    item.append(el("span", word[receipt.event] || receipt.event, "coding-coop-event"), el("time", time(receipt.at)));
    if (receipt.note) item.append(el("span", receipt.note, "coding-coop-note"));
    if (receipt.recorded_only) item.append(el("span", uiText.text("coding.coop.late"), "coding-coop-late"));
    list.append(item);
  }
  details.append(el("summary", uiText.text("coding.coop.receipts", { count: delegation.receipts.length })), list);
  return details;
}

function stateChip(readText: Translate, delegation: Delegation) {
  const chip = el("span", words(readText).delegation[delegation.state] || delegation.state_label, "mw-status mw-status--plain");
  chip.dataset.tone = TONE[delegation.state] || "idle";
  chip.dataset.mwState = RING[delegation.state] || "verify";
  return chip;
}

const sessionLink = (coop: Coop, side: Side | null | undefined) => side?.title
  ? button(coop, uiText.text("coding.coop.quoted", { title: side.title }), "ghost", () => void coop.ports.openSession(side.session_id, side.title ?? ""))
  : el("span", uiText.text("coding.coop.gone"), "coding-coop-gone");

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
  const { translate: readText } = coop.ports, section = coop.backgroundSection, word = words(readText).task;
  section.hidden = !coop.commands.length && !coop.backgroundUnknown;
  section.replaceChildren();
  if (section.hidden) return;
  section.append(el("h3", uiText.text("coding.results.background")));
  if (coop.backgroundUnknown) section.append(el("p", uiText.text("coding.coop.state-unreadable")));
  const list = el("ol", "", "coding-coop-mail coding-background-list");
  for (const task of coop.commands.slice().reverse()) list.append(backgroundItem(coop, task, word));
  section.append(list);
}

function backgroundItem(coop: Coop, task: BackgroundTask, word: Readonly<Record<string, string>>) {
  const item = el("li"), head = el("div", "", "coding-coop-head"), chip = el("span", word[task.state] || task.state, "mw-status mw-status--plain");
  chip.dataset.tone = TASK_TONE[task.state] || "idle";
  chip.dataset.mwState = task.state === "succeeded" ? "done" : task.state;
  item.dataset.state = task.state;
  head.append(el("code", task.summary, "coding-background-command"), chip);
  const line = el("p", "", "coding-coop-line");
  line.append(el("span", (task.exit_code === undefined ? "" : "exit " + task.exit_code + " · ") + uiText.text("coding.coop.started-at", { time: time(task.started_at_ms) }) + (task.ended_at_ms ? " · " + uiText.text("coding.coop.ended-at", { time: time(task.ended_at_ms) }) : ""), "coding-coop-note"));
  item.append(head, line);
  if (task.state === "running") item.append(button(coop, uiText.text("coding.coop.stop"), "ghost", () => post(coop, "/background/" + encodeURIComponent(task.task_id) + "/stop", uiText.text("coding.coop.stopped-command"))));
  return item;
}

/** A work-in-progress hand-off the other session delivered: the choice of which round and which result to deliver. */
function deliverForm(coop: Coop, incoming: Delegation, path: string) {
  const { lifetime } = coop.ports, finished = coop.ports.rounds().filter(round => round.phase === "completed");
  const form = el("form", "", "coding-coop-deliver"), choice = el("select", "", "mw-select"), kind = el("select", "", "mw-select"), note = el("input", "", "mw-input"), send = el("button", uiText.text("coding.coop.deliver"), "mw-btn mw-btn--secondary");
  for (const round of finished.slice().reverse()) {
    const option = el("option", uiText.text("coding.turn.number", { number: round.number }));
    option.value = round.run_id;
    choice.append(option);
  }
  for (const [value, label] of [["report", uiText.text("coding.coop.kind.report")], ["changeset", uiText.text("coding.coop.kind.changeset")]] as const) {
    const option = el("option", label);
    option.value = value;
    kind.append(option);
  }
  choice.setAttribute("aria-label", uiText.text("coding.coop.which-turn"));
  kind.setAttribute("aria-label", uiText.text("coding.coop.which-result"));
  note.placeholder = uiText.text("coding.coop.note-optional");
  note.maxLength = 2000;
  note.setAttribute("aria-label", uiText.text("coding.coop.note"));
  send.type = "submit";
  form.append(choice, kind, note, send);
  lifetime.listen(form, "submit", event => {
    event.preventDefault();
    send.disabled = true;
    void act(coop, path + "/deliveries", { run_id: choice.value, kind: kind.value, note: note.value, expected_revision: incoming.revision }, uiText.text("coding.coop.delivered"));
  });
  return form;
}

/** What the incoming delegation is waiting for while it is being carried out. */
function committing(coop: Coop, incoming: Delegation, path: string) {
  const { banner } = coop, finished = coop.ports.rounds().filter(round => round.phase === "completed");
  const pending = incoming.deliveries.find(item => item.state === "sent");
  if (pending) {
    const number = coop.ports.rounds().find(round => round.run_id === pending.run_id)?.number || "?";
    banner.append(el("p", pending.kind === "report" ? uiText.text("coding.coop.delivered-report", { number }) : uiText.text("coding.coop.delivered-change", { number }), "coding-coop-note"));
  } else if (!finished.length) {
    banner.append(el("p", uiText.text("coding.coop.deliver-later"), "coding-coop-note"));
  } else {
    banner.append(deliverForm(coop, incoming, path));
  }
  for (const delivery of incoming.deliveries.filter(item => item.state === "rejected").slice(-1)) banner.append(el("p", uiText.text("coding.coop.last-rejected", { reason: delivery.reason ?? "" }), "coding-coop-rejected"));
}

/** The accept and reject buttons of a delegation that has arrived. */
function answerRow(coop: Coop, incoming: Delegation, path: string) {
  const row = el("div", "", "coding-coop-actions");
  const reject = (why: string) => reasonForm(coop, why, uiText.text("coding.coop.reject-ok"), reason => act(coop, path, { action: "reject", reason, expected_revision: incoming.revision }, uiText.text("coding.coop.rejected")));
  if (incoming.state === "delivered") {
    row.append(button(coop, uiText.text("coding.coop.accept"), "secondary", () => void act(coop, path, { action: "accept", expected_revision: incoming.revision }, uiText.text("coding.coop.accepted")).then(() => coop.ports.prefill(incoming.task))), button(coop, uiText.text("coding.coop.reject"), "ghost", () => {
      row.replaceChildren(reject(uiText.text("coding.coop.reject-why-seen")));
      row.querySelector("textarea")?.focus();
    }));
  } else {
    row.append(button(coop, uiText.text("coding.coop.reject"), "ghost", () => row.replaceChildren(reject(uiText.text("coding.coop.reject-why")))));
  }
  return row;
}

/** The delegation another session handed to this one: what it asks, and what can be done with it now. */
export function drawBanner(coop: Coop, incoming: Delegation | null) {
  const { translate: readText } = coop.ports, { banner } = coop;
  banner.hidden = !incoming;
  banner.replaceChildren();
  if (!incoming) return;
  const head = el("div", "", "coding-coop-head");
  head.append(el("strong", uiText.text("coding.coop.incoming")), stateChip(readText, incoming));
  const from = el("p", "", "coding-coop-line");
  from.append(document.createTextNode(uiText.text("coding.coop.from")), sessionLink(coop, incoming.from), document.createTextNode(" · " + incoming.title));
  const ended = ENDED.includes(incoming.state);
  banner.classList.toggle("is-ended", ended);
  if (ended) {
    head.append(from);
    banner.append(head, receipts(coop, incoming));
    return;
  }
  const task = el("details", "", "coding-coop-task");
  task.append(el("summary", uiText.text("coding.coop.task")), el("p", incoming.task));
  banner.append(head, from, task);
  const path = "/" + encodeURIComponent(incoming.delegation_id);
  if (incoming.state === "delivered") {
    banner.append(el("p", uiText.text("coding.coop.accept-note"), "coding-coop-note"), answerRow(coop, incoming, path));
  } else if (incoming.state === "accepted") {
    banner.append(el("p", uiText.text("coding.coop.accepted-note"), "coding-coop-note"), answerRow(coop, incoming, path));
  } else if (incoming.state === "committing") {
    committing(coop, incoming, path);
  } else {
    banner.append(el("p", incoming.state === "completed" ? uiText.text("coding.coop.completed") : (incoming.receipts.at(-1)?.note || words(readText).delegation[incoming.state] || incoming.state_label), "coding-coop-note"));
  }
  banner.append(receipts(coop, incoming));
}

/** One message between sessions. */
function mailItem(coop: Coop, message: Mail, word: ReturnType<typeof words>) {
  const item = el("li"), head = el("div", "", "coding-coop-head"), line = el("p", "", "coding-coop-line");
  item.dataset.state = message.state;
  const failed = message.state === "cancelled" && (message.history || []).some(entry => entry.event === "failed");
  const chip = el("span", failed ? uiText.text("coding.coop.mail.failed") : (word.mailState[message.state] || message.state), "mw-status mw-status--plain");
  chip.dataset.tone = failed ? "blocked" : (MAIL_TONE[message.state] || "idle");
  chip.dataset.mwState = failed ? "failed" : MAIL_RING[message.state] || "verify";
  const kind = word.mailKind[message.kind] || message.kind;
  head.append(el("strong", (message.outgoing ? uiText.text("coding.coop.mail.sent", { kind }) : uiText.text("coding.coop.mail.received", { kind })) + (message.await_reply ? uiText.text("coding.coop.mail.awaiting") : "")), chip);
  line.append(document.createTextNode(message.outgoing ? uiText.text("coding.coop.mail.to") : uiText.text("coding.coop.mail.from")), message.peer ? sessionLink(coop, message.peer) : el("span", uiText.text("coding.coop.quoted", { title: (message.outgoing ? message.to_title : message.from_title) ?? "" })), el("time", time(message.sent_at_ms)));
  const body = el("details", "", "coding-coop-task");
  body.append(el("summary", message.body.split("\n")[0]?.slice(0, 80) ?? ""), el("p", message.body));
  item.append(head, line, body);
  if (message.outgoing && ["queued", "delivered", "accepted"].includes(message.state)) item.append(button(coop, uiText.text("coding.coop.withdraw"), "ghost", () => post(coop, "/messages/" + encodeURIComponent(message.message_id) + "/cancel", uiText.text("coding.coop.withdrawn"))));
  return item;
}

function drawMail(coop: Coop) {
  if (!coop.mail.length) return;
  const word = words(coop.ports.translate), list = el("ol", "", "coding-coop-mail");
  for (const message of coop.mail.slice().reverse()) list.append(mailItem(coop, message, word));
  coop.section.append(el("h4", uiText.text("coding.coop.mail")), list);
}

/** One delivery of a delegation this session handed out: what came back, and the buttons to take or decline it. */
function deliveryRow(coop: Coop, delegation: Delegation, delivery: Delivery, path: string, open: boolean) {
  const { openArtifact } = coop.ports, row = el("div", "", "coding-coop-delivery");
  row.dataset.state = delivery.state;
  row.append(el("p", uiText.text("coding.coop.delivery", { kind: delivery.kind === "report" ? uiText.text("coding.coop.report") : uiText.text("coding.coop.change") }) + " · " + delivery.title + (delivery.note ? " · " + delivery.note : "") + " · " + time(delivery.sent_at)));
  const artifact = delivery.artifact;
  if (artifact && openArtifact) row.append(button(coop, delivery.kind === "report" ? uiText.text("coding.coop.open-report") : uiText.text("coding.coop.open-change"), "ghost", () => openArtifact(artifact, delivery.title)));
  const decide = path + "/deliveries/" + encodeURIComponent(delivery.delivery_id);
  if (delivery.state === "sent" && open) {
    const actions = el("div", "", "coding-coop-actions");
    actions.append(button(coop, uiText.text("coding.coop.take"), "secondary", () => void act(coop, decide, { decision: "accept", expected_revision: delegation.revision }, uiText.text("coding.coop.taken")).then(() => coop.ports.materialsChanged())), button(coop, uiText.text("coding.coop.decline"), "ghost", () => {
      actions.replaceChildren(reasonForm(coop, uiText.text("coding.coop.decline-why"), uiText.text("coding.coop.confirm"), reason => act(coop, decide, { decision: "reject", reason, expected_revision: delegation.revision }, uiText.text("coding.coop.declined"))));
    }));
    row.append(actions);
  } else if (delivery.state !== "sent") {
    row.append(el("p", delivery.state === "accepted" ? uiText.text("coding.coop.took-at", { time: time(delivery.decided_at) }) : uiText.text("coding.coop.not-taken", { reason: delivery.reason ?? "" }), "coding-coop-note"));
  }
  return row;
}

/** A delegation this session handed to another. */
function outgoingCard(coop: Coop, delegation: Delegation) {
  const readText = coop.ports.translate, word = words(readText);
  const card = el("article", "", "coding-coop-card"), head = el("div", "", "coding-coop-head"), path = "/" + encodeURIComponent(delegation.delegation_id);
  head.append(el("strong", delegation.title), stateChip(readText, delegation));
  const open = !ENDED.includes(delegation.state), to = el("p", "", "coding-coop-line");
  to.append(document.createTextNode(uiText.text("coding.coop.delegated-to")), sessionLink(coop, delegation.to));
  if (delegation.to?.state) to.append(el("span", uiText.text("coding.coop.there", { state: word.session[delegation.to.state] || delegation.to.state }), "coding-coop-note"));
  card.append(head, to);
  for (const delivery of delegation.deliveries) card.append(deliveryRow(coop, delegation, delivery, path, open));
  if (delegation.state === "received") card.append(button(coop, uiText.text("coding.coop.retry"), "secondary", () => void act(coop, path, { action: "deliver", expected_revision: delegation.revision })));
  if (open) card.append(button(coop, uiText.text("coding.coop.cancel"), "ghost", () => void act(coop, path, { action: "cancel", expected_revision: delegation.revision }, uiText.text("coding.coop.cancelled"))));
  card.append(receipts(coop, delegation));
  return card;
}

/** Every delegation of the session, the sessions related to it, and its messages. */
export function drawSection(coop: Coop, value: Delegations) {
  const { translate: readText } = coop.ports, { section } = coop, word = words(readText);
  const empty = !value.outgoing.length && !value.related.length && !value.incoming && !coop.mail.length;
  section.hidden = empty;
  section.replaceChildren();
  if (empty) return;
  section.append(el("h3", uiText.text("coding.results.cooperation")));
  for (const delegation of value.outgoing) section.append(outgoingCard(coop, delegation));
  if (value.incoming) {
    const line = el("p", "", "coding-coop-line");
    line.append(document.createTextNode(uiText.text("coding.coop.came-from")), sessionLink(coop, value.incoming.from), document.createTextNode(uiText.text("coding.coop.came-from-after", { state: word.delegation[value.incoming.state] || value.incoming.state_label })));
    section.append(line);
  }
  const others = value.related.filter(item => !value.outgoing.some(delegation => delegation.to_session === item.session_id));
  if (others.length) {
    const list = el("ul", "", "coding-coop-related");
    for (const item of others) {
      const entry = el("li");
      entry.append(sessionLink(coop, item), el("span", item.relation.join(uiText.text("coding.list.joiner")) + (item.state ? " · " + (word.session[item.state] || item.state) : ""), "coding-coop-note"));
      list.append(entry);
    }
    section.append(el("h4", uiText.text("coding.coop.related")), list);
  }
  drawMail(coop);
}
