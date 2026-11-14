import { escapeHtml as esc, renderEmpty } from "@molis-ai/molis-work-plugin-sdk/ui";
import { blankDraft, changes, currentDraft, draftOf, readDraft, renderDraftForm, setDraft } from "./form.js";
import { loadOverview, renderOverview } from "./overview.js";
import { failureOf, isPermission, riskPage } from "./page.js";
import { text } from "./parts.js";
import { renderRecord } from "./record.js";
import { customAt, reviewAt } from "./review.js";
import type { RiskEvent, RiskHost, RiskLevel, RiskLink, RiskPage, RiskRecord, RiskReview, RiskStatus } from "./types.js";

/**
 * The risk page (specs/risk-plugin/implementation.md §4.1): the overview, one risk's record and the new-risk form on the stage; one risk,
 * compact, in the side panel. Every write goes through the risk's own actions and the page reads the record again from its answer.
 */

type RecordAnswer = { risk: RiskRecord; links: RiskLink[]; events: RiskEvent[] };
type ReviewAnswer = { state: "ok" | "unavailable"; review: RiskReview | null };
type Candidate = { kind: string; id: string; label: string; plugin_title: string; snippet: string };

let linkSlots: { dispose(): void } | null = null;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchSeq = 0;

function draw(page: RiskPage): void {
  const { state, body } = page;
  const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement.dataset.rkFocus ?? null : null;
  linkSlots?.dispose();
  linkSlots = null;
  body.innerHTML = state.view === "overview" ? renderOverview(page) : state.view === "new" ? renderDraftForm(page, "new")
    : state.view === "idle" ? renderEmpty({ icon: "shield", title: text("side.idle"), body: text("side.idle-body") }) : renderRecord(page);
  placeLinks(page);
  if (state.pop === "link") body.querySelector<HTMLInputElement>("#rk-link-query")?.focus();
  else if (state.pop === "review") body.querySelector<HTMLInputElement>("#rk-review-focus")?.focus();
  else if (focused) body.querySelector<HTMLElement>(`[data-rk-focus="${CSS.escape(focused)}"]`)?.focus();
}

/** Each linked object is drawn by the shell as its owner presents it (or says it is gone); the page holds only kind and id. */
function placeLinks(page: RiskPage): void {
  const slots = [...page.body.querySelectorAll<HTMLElement>("[data-rk-link-slot]")];
  if (!slots.length) return;
  const held = slots.map(element => {
    const subject = { kind: element.dataset.kind ?? "", id: element.dataset.id ?? "" };
    return page.host.view.surfaceSlot(element, { slot_id: "risk.links", subjects: [subject] });
  });
  linkSlots = { dispose: () => { for (const slot of held) slot.dispose(); } };
}

async function openRecord(page: RiskPage, riskId: string, options: { quiet?: boolean } = {}): Promise<void> {
  const { state } = page;
  const same = state.record?.risk.risk_id === riskId;
  Object.assign(state, { view: "record", recordError: "", editing: false, conflict: null, pop: "", ...(same ? {} : { record: null, review: null, reviewError: "", readOnly: false }), recordId: riskId });
  page.render();
  try {
    state.record = await page.call<RecordAnswer>("risk.get", { risk_id: riskId });
  } catch (error) {
    const failure = failureOf(error);
    if (failure.status === 404 || failure.status === 403) {
      // The workbench is told so it neither names it nor carries it; a reopen nobody asked for forgets it without a word.
      page.root.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: riskId } }));
      if (options.quiet && failure.status === 404) { state.view = "overview"; void loadOverview(page); return; }
    }
    state.record = null;
    state.recordError = failure.status === 404 ? text("record.missing") : (error instanceof Error ? error.message : text("error.failed"));
    page.render();
    return;
  }
  page.render();
  await loadReview(page);
}

async function loadReview(page: RiskPage): Promise<void> {
  const { state } = page;
  const riskId = state.record?.risk.risk_id;
  if (!riskId) return;
  try {
    const answer = await page.call<ReviewAnswer>("risk.review.get", { risk_id: riskId });
    if (state.record?.risk.risk_id !== riskId) return;
    state.review = answer;
    state.reviewError = "";
  } catch (error) {
    if (state.record?.risk.risk_id !== riskId) return;
    state.review = null;
    state.reviewError = error instanceof Error ? error.message : text("error.failed");
  }
  page.render();
}

/** A write refused for who-may-write reasons turns the record read-only and says so once; anything else is a toast. */
async function write<O>(page: RiskPage, capability: string, input: unknown): Promise<O | null> {
  page.state.busy = true;
  page.render();
  try { return await page.call<O>(capability, input); }
  catch (error) {
    if (isPermission(error)) { page.state.readOnly = true; page.toast(error instanceof Error ? error.message : text("record.read-only"), true); return null; }
    throw error;
  } finally { page.state.busy = false; }
}

/** After a write, the record is what the risk now says. */
async function reread(page: RiskPage, message?: string): Promise<void> {
  const riskId = page.state.record?.risk.risk_id;
  if (!riskId) return;
  page.state.record = await page.call<RecordAnswer>("risk.get", { risk_id: riskId });
  page.state.pop = "";
  if (message) page.toast(message);
  page.render();
}

async function saveEdit(page: RiskPage, form: HTMLFormElement): Promise<void> {
  const record = page.state.record;
  if (!record) return;
  const draft = readDraft(form);
  if (!draft.title.trim() || !draft.statement.trim()) { page.toast(text("form.required"), true); return; }
  const base = page.state.conflict?.current ?? record.risk;
  const changed = changes(base, draft);
  if (!Object.keys(changed).length) { page.state.editing = false; page.state.conflict = null; page.render(); return; }
  try {
    const answer = await write<{ risk: RiskRecord }>(page, "risk.update", { risk_id: base.risk_id, expected_revision: base.revision, ...changed });
    if (!answer) { page.render(); return; }
    page.state.editing = false;
    page.state.conflict = null;
    await reread(page, text("record.saved"));
  } catch (error) {
    const failure = failureOf(error);
    const current = failure.details?.current as RiskRecord | undefined;
    if (failure.code === "risk.conflict" && current) {
      // Someone else changed it: theirs and the person's draft side by side, nothing of either lost.
      page.state.conflict = { current, draft: { ...draft } };
      page.state.editing = false;
      page.render();
      return;
    }
    throw error;
  }
}

async function create(page: RiskPage, form: HTMLFormElement): Promise<void> {
  const draft = readDraft(form);
  if (!draft.title.trim() || !draft.statement.trim()) { page.toast(text("form.required"), true); return; }
  const answer = await write<{ risk: RiskRecord }>(page, "risk.create", { title: draft.title, statement: draft.statement, impact: draft.impact,
    likelihood: draft.likelihood, ...(draft.treatment.trim() ? { treatment: draft.treatment } : {}), ...(draft.owner_name.trim() ? { owner_name: draft.owner_name } : {}) });
  if (!answer) { page.render(); return; }
  setDraft(blankDraft());
  page.toast(text("form.recorded"));
  await openRecord(page, answer.risk.risk_id);
}

async function setStatus(page: RiskPage, status: RiskStatus): Promise<void> {
  const risk = page.state.record?.risk;
  if (!risk || risk.status === status) { page.state.pop = ""; page.render(); return; }
  const answer = await write<{ risk: RiskRecord; review_left?: { task_id: string | null } }>(page, "risk.status.set",
    { risk_id: risk.risk_id, expected_revision: risk.revision, status });
  if (!answer) { page.render(); return; }
  await reread(page, text("record.status-set", { status: text(`status.${status}`) }));
  // Closing archives the review; when Schedule could not be reached, the task is left and the person is told.
  if (answer.review_left?.task_id) page.toast(text("review.left"), true);
  await loadReview(page);
}

async function schedule(page: RiskPage, form: HTMLFormElement, submitter: HTMLElement | null): Promise<void> {
  const risk = page.state.record?.risk;
  if (!risk) return;
  const days = (submitter as HTMLButtonElement | null)?.value ?? "custom";
  const at = days === "custom" ? customAt((form.elements.namedItem("at") as HTMLInputElement | null)?.value ?? "") : reviewAt(Number(days));
  if (!at) { page.toast(text("review.pick-time"), true); return; }
  const focus = ((form.elements.namedItem("focus") as HTMLInputElement | null)?.value ?? "").trim();
  const answer = await write<{ review: RiskReview }>(page, "risk.review.schedule", { risk_id: risk.risk_id, at, ...(focus ? { focus } : {}) });
  if (!answer) { page.render(); return; }
  page.state.review = { state: "ok", review: answer.review };
  page.state.pop = "";
  page.toast(text("review.scheduled-at", { when: globalThis.format.date(at, "datetime") }));
  page.render();
}

async function reviewCommand(page: RiskPage, capability: "risk.review.enabled" | "risk.review.cancel", input: Record<string, unknown>): Promise<void> {
  const risk = page.state.record?.risk;
  if (!risk) return;
  const answer = await write<{ review?: RiskReview; cancelled?: boolean }>(page, capability, { risk_id: risk.risk_id, ...input });
  if (!answer) { page.render(); return; }
  if (capability === "risk.review.cancel") page.toast(text("review.cancelled"));
  await loadReview(page);
}

function searchLinks(page: RiskPage, query: string): void {
  clearTimeout(searchTimer);
  const list = page.body.querySelector<HTMLElement>("[data-rk-found]");
  if (!list) return;
  if (!query.trim()) { list.innerHTML = ""; return; }
  const seq = ++searchSeq;
  searchTimer = setTimeout(() => page.run(async () => {
    let found: Candidate[];
    try { found = (await page.call<{ candidates: Candidate[] }>("search.references", { kinds: ["goal"], query: query.trim(), limit: 8 })).candidates; }
    catch (error) {
      if (seq !== searchSeq) return;
      list.innerHTML = `<li class="rk-muted">${esc(error instanceof Error && error.message ? error.message : text("error.failed"))}</li>`;
      return;
    }
    if (seq !== searchSeq) return;
    const linked = new Set(page.state.record?.links.map(link => `${link.subject.kind}\n${link.subject.id}`));
    list.innerHTML = found.length ? found.map(item => `<li class="mw-item rk-found__item" role="button" tabindex="0" data-rk-act="link" data-rk-value="${esc(`${item.kind}\n${item.id}`)}"${
      linked.has(`${item.kind}\n${item.id}`) ? ' aria-disabled="true"' : ""}><span><strong>${esc(item.label)}</strong><small>${esc(item.snippet || item.plugin_title)}</small></span></li>`).join("")
      : `<li class="rk-muted">${esc(text("record.no-goal-found"))}</li>`;
  }), 200);
}

const subjectOf = (value: string) => { const [kind = "", id = ""] = value.split("\n"); return { kind, id }; };

async function onAct(page: RiskPage, action: string, value: string, element: HTMLElement): Promise<void> {
  const { state } = page;
  const risk = state.record?.risk;
  switch (action) {
    case "back": state.view = "overview"; state.pop = ""; await loadOverview(page); return;
    case "new": setDraft(blankDraft()); state.view = "new"; page.render(); page.body.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); return;
    case "reload": await loadOverview(page); return;
    case "more": await loadOverview(page, true); return;
    case "clear-filter": state.filter = { ...state.filter, impact: "", owner_name: "", linked: "" }; await loadOverview(page); return;
    case "filter-status": state.filter.status = value as typeof state.filter.status; await loadOverview(page); return;
    case "draft-impact": case "draft-likelihood": {
      const form = element.closest("form");
      if (form) readDraft(form);
      setDraft({ ...currentDraft(), [action === "draft-impact" ? "impact" : "likelihood"]: value as RiskLevel });
      page.render();
      return;
    }
    case "edit": if (risk) { setDraft(draftOf(risk)); state.editing = true; page.render(); page.body.querySelector<HTMLInputElement>('input[name="title"]')?.focus(); } return;
    case "cancel-edit": state.editing = false; page.render(); return;
    case "pop": state.pop = state.pop === value ? "" : value as typeof state.pop; page.render(); return;
    case "set-status": state.pop = ""; await setStatus(page, value as RiskStatus); return;
    case "use-theirs": if (state.conflict) { state.record = state.record && { ...state.record, risk: state.conflict.current }; state.conflict = null; await reread(page); } return;
    case "continue-on-theirs": if (state.conflict) { setDraft(state.conflict.draft); state.record = state.record && { ...state.record, risk: state.conflict.current }; state.conflict = null; state.editing = true; page.render(); } return;
    case "unlink": if (risk) { const answer = await write(page, "risk.links.remove", { risk_id: risk.risk_id, subject: subjectOf(value) }); if (answer) await reread(page); else page.render(); } return;
    case "link": if (risk && element.getAttribute("aria-disabled") !== "true") { const answer = await write(page, "risk.links.add", { risk_id: risk.risk_id, subject: subjectOf(value) }); if (answer) await reread(page, text("record.linked")); else page.render(); } return;
    case "expand": if (risk) page.host.openItem("risk", risk.risk_id, risk.title); return;
    // A record that could not be read is tried again by its id; only with none to try does the page go back to the overview.
    case "reload-record": if (risk ?? state.recordId) await openRecord(page, risk?.risk_id ?? state.recordId); else { state.view = "overview"; await loadOverview(page); } return;
    case "reload-review": state.reviewError = ""; page.render(); await loadReview(page); return;
    case "review-enabled": await reviewCommand(page, "risk.review.enabled", { enabled: value === "true" }); return;
    case "review-cancel": await reviewCommand(page, "risk.review.cancel", {}); return;
    // The task's reads are granted on Schedule's own page, by the person: the review opens that task there.
    case "review-grants": page.host.openItem("schedule", value); return;
  }
}

function onSubmit(page: RiskPage, event: SubmitEvent): void {
  const form = event.target as HTMLFormElement;
  const kind = form.dataset.rkForm;
  if (!kind) return;
  event.preventDefault();
  if (page.state.busy) return;
  const risk = page.state.record?.risk;
  if (kind === "new") page.run(() => create(page, form));
  else if (kind === "edit") page.run(() => saveEdit(page, form));
  else if (kind === "review") page.run(() => schedule(page, form, event.submitter));
  else if (kind === "link-search") searchLinks(page, (form.elements.namedItem("query") as HTMLInputElement).value);
  else if (kind === "note" && risk) {
    const input = form.elements.namedItem("note") as HTMLInputElement;
    const note = input.value.trim();
    if (!note) return;
    page.run(async () => { const answer = await write(page, "risk.notes.add", { risk_id: risk.risk_id, text: note }); if (answer) await reread(page); else page.render(); });
  }
}

function onSelectItem(page: RiskPage, event: Event): void {
  const detail = (event as CustomEvent<{ itemId?: unknown; quiet?: unknown } | undefined>).detail;
  if (typeof detail?.itemId !== "string" || !detail.itemId) return;
  const itemId = detail.itemId;
  page.run(() => openRecord(page, itemId, { quiet: detail.quiet === true }));
}

export function mountRisk(host: RiskHost): void {
  const page = riskPage(host, draw);
  if (!page) return;
  const { scope, root, body } = page;
  scope.listen(body, "click", event => {
    const target = event.target as Element;
    const button = target.closest<HTMLElement>("[data-rk-act]");
    if (button && body.contains(button)) {
      if (button.matches("button[type=submit]")) return;
      event.preventDefault();
      if (page.state.busy || button.getAttribute("aria-disabled") === "true") return;
      page.run(() => onAct(page, button.dataset.rkAct ?? "", button.dataset.rkValue ?? "", button));
      return;
    }
    const row = target.closest<HTMLElement>("[data-rk-open]");
    if (row) { page.run(() => openRecord(page, row.dataset.rkOpen ?? "")); return; }
    // A click outside an open popover closes it.
    if (page.state.pop && !target.closest(".rk-anchor")) { page.state.pop = ""; page.render(); }
  });
  scope.listen(body, "keydown", event => {
    const key = event as KeyboardEvent;
    const target = key.target as HTMLElement;
    if ((key.key === "Enter" || key.key === " ") && target.matches("[data-rk-open], li[data-rk-act]")) { key.preventDefault(); target.click(); return; }
    if (key.key === "Escape" && page.state.pop) { key.preventDefault(); page.state.pop = ""; page.render(); }
    else if (key.key === "Escape" && page.state.editing) { key.preventDefault(); page.state.editing = false; page.render(); }
  });
  scope.listen(body, "change", event => {
    const select = (event.target as HTMLElement).closest<HTMLSelectElement>("select[data-rk-filter]");
    if (!select) return;
    const filter = page.state.filter;
    if (select.dataset.rkFilter === "impact") filter.impact = select.value as RiskLevel | "";
    else if (select.dataset.rkFilter === "owner_name") filter.owner_name = select.value;
    else if (select.dataset.rkFilter === "linked") filter.linked = select.value === "some" || select.value === "none" ? select.value : "";
    page.run(() => loadOverview(page));
  });
  scope.listen(body, "input", event => {
    const input = event.target as HTMLInputElement;
    if (input.form?.dataset.rkForm === "link-search") searchLinks(page, input.value);
  });
  scope.listen(body, "submit", event => onSubmit(page, event as SubmitEvent));
  scope.listen(root, "molis-work:select-item", event => onSelectItem(page, event));
  scope.own(() => { linkSlots?.dispose(); clearTimeout(searchTimer); });
  if (page.side) { page.state.view = "idle"; page.render(); }
  scope.whenVisible(() => {
    if (page.state.view === "overview") page.run(() => loadOverview(page));
    // A risk changed elsewhere (the Assistant, another page) is read again here, so no stale copy stays on show (RISK-05).
    return scope.listen(window, "molis:assistant-effect", event => {
      const capability = (event as CustomEvent<{ capability_id?: unknown } | undefined>).detail?.capability_id;
      if (typeof capability !== "string" || !capability.startsWith("risk.")) return;
      if (page.state.view === "overview") page.run(() => loadOverview(page));
      else if (page.state.view === "record" && page.state.record && !page.state.editing && !page.state.conflict) page.run(() => reread(page));
    });
  });
}
