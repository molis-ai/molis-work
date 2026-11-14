import type { BriefRefreshed, BriefSaved } from "../actions.js";
import { renderBrief, renderPersonal, shownOf } from "./brief.js";
import { briefPage, failureOf } from "./page.js";
import { text } from "./parts.js";
import type { BriefPage, BriefView, NextMark, PersonalView, WorkBriefHost } from "./types.js";

/**
 * The brief page (docs/design/work-brief-core): the project's brief on the stage, with its versions, the bases after each sentence,
 * the person's own changes, a waiting proposal and the next steps; and the personal brief beside it. Every write goes through
 * Work Brief's own actions and the page reads the brief again from their answer. Objects of other plugins are drawn by the shell.
 */

const SLOTS = { cite: "work-brief.cite", attention: "work-brief.attention", changed: "work-brief.changed", next: "work-brief.next" } as const;
let placed: { dispose(): void }[] = [];

function draw(page: BriefPage): void {
  const { state, body } = page;
  const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement) ? document.activeElement.dataset.wbFocus ?? null : null;
  const scroll = body.scrollTop;
  for (const held of placed) held.dispose();
  body.innerHTML = state.mode === "personal" ? renderPersonal(page) : renderBrief(page);
  placed = [...body.querySelectorAll<HTMLElement>("[data-wb-slot]")].map(element => page.host.view.surfaceSlot(element, {
    slot_id: SLOTS[element.dataset.wbSlot as keyof typeof SLOTS], subjects: [{ kind: element.dataset.kind ?? "", id: element.dataset.id ?? "" }] }));
  // A repaint (a background refresh, an answer arriving) keeps the place and the field in hand.
  body.scrollTop = scroll;
  if (state.editing) { const editor = body.querySelector<HTMLTextAreaElement>('[data-wb-focus="editor"]'); if (editor && focused !== "editor") { editor.focus(); editor.setSelectionRange(editor.value.length, editor.value.length); } }
  if (focused) body.querySelector<HTMLElement>(`[data-wb-focus="${CSS.escape(focused)}"]`)?.focus();
}

/** The current version, then what changed since the one before it. The page shows the first answer at once. */
async function loadHead(page: BriefPage, options: { quiet?: boolean } = {}): Promise<void> {
  const { state } = page;
  if (!options.quiet) { state.loading = true; page.render(); }
  try {
    const head = await page.call<BriefView>("work-brief.briefs.get", {});
    state.head = head;
    state.error = "";
    state.picks = Object.fromEntries(Object.entries(state.picks).filter(([id]) => head.proposal?.conflicts.some(conflict => conflict.claim_id === id)));
    state.loading = false;
    page.render();
    const base = head.version?.base_version;
    if (!head.brief || !base) return;
    const compared = await page.call<BriefView>("work-brief.briefs.get", { brief_id: head.brief.brief_id, compare_with: base });
    if (state.head === head && compared.version?.version === head.version?.version) { state.head = { ...head, changes: compared.changes ?? [] }; page.render(); }
  } catch (error) {
    state.loading = false;
    // A failed background read leaves what is on show; only a first read with nothing to show says so in place.
    if (state.head && options.quiet) return;
    state.error = error instanceof Error && error.message ? error.message : text("error.failed");
    page.render();
  }
}

async function loadPersonal(page: BriefPage): Promise<void> {
  const { state } = page;
  try { state.personal = await page.call<PersonalView>("work-brief.personal.get", {}); state.personalError = ""; }
  catch (error) { state.personalError = error instanceof Error && error.message ? error.message : text("error.failed"); }
  page.render();
}

/** A write on the brief: the page is busy while it runs; a conflict means someone else moved the brief, so it is read again and said. */
async function write<O>(page: BriefPage, capability: string, input: Record<string, unknown>): Promise<O | null> {
  page.state.busy = "write";
  page.render();
  try { return await page.call<O>(capability, input); }
  catch (error) {
    if (failureOf(error).code !== "work_brief.conflict") throw error;
    page.toast(text("conflict.reread"), true);
    await loadHead(page, { quiet: true });
    return null;
  } finally { page.state.busy = ""; }
}

const briefOf = (page: BriefPage) => page.state.head?.brief ?? null;

async function refresh(page: BriefPage): Promise<void> {
  const { state } = page;
  state.busy = "refresh";
  state.pop = "";
  page.render();
  try {
    const answer = await page.call<BriefRefreshed>("work-brief.briefs.refresh", briefOf(page) ? { brief_id: briefOf(page)!.brief_id } : {});
    state.delta = { changed: answer.changed, version: answer.version.version, changes: answer.changes };
    state.old = null;
  } finally { state.busy = ""; }
  await loadHead(page, { quiet: true });
}

async function openVersion(page: BriefPage, version: number): Promise<void> {
  const { state } = page, brief = briefOf(page);
  if (!brief) return;
  state.pop = "";
  if (version === brief.current_version) { state.old = null; page.render(); return; }
  state.old = await page.call<BriefView>("work-brief.briefs.get", { brief_id: brief.brief_id, version });
  state.thenNow = "then";
  state.editing = "";
  page.render();
}

async function saveClaim(page: BriefPage, claimId: string, value: string | null): Promise<void> {
  const brief = briefOf(page);
  if (!brief) return;
  if (value !== null && !value.trim()) { page.toast(text("claim.empty"), true); return; }
  const answer = await write<BriefSaved>(page, "work-brief.briefs.edit", { brief_id: brief.brief_id, expected_revision: brief.revision, ...(claimId === "+" ? {} : { claim_id: claimId }), text: value === null ? null : value.trim() });
  if (!answer) { page.render(); return; }
  page.state.editing = "";
  page.state.delta = null;
  await loadHead(page, { quiet: true });
}

async function resolve(page: BriefPage, discard: boolean): Promise<void> {
  const brief = briefOf(page), proposal = page.state.head?.proposal;
  if (!brief || !proposal) return;
  const choices = proposal.conflicts.map(conflict => ({ claim_id: conflict.claim_id, take: page.state.picks[conflict.claim_id] }));
  if (!discard && choices.some(choice => !choice.take)) { page.toast(text("proposal.pick-all"), true); return; }
  const answer = await write<BriefSaved>(page, "work-brief.proposals.resolve", { brief_id: brief.brief_id, proposal_id: proposal.proposal_id, expected_revision: brief.revision, ...(discard ? { discard: true } : { choices }) });
  if (!answer) { page.render(); return; }
  page.state.picks = {};
  page.toast(text(discard ? "proposal.dropped" : "proposal.done"));
  await loadHead(page, { quiet: true });
}

async function fix(page: BriefPage, version: number): Promise<void> {
  const brief = briefOf(page);
  if (!brief) return;
  page.state.pop = "";
  const answer = await write(page, "work-brief.versions.fix", { brief_id: brief.brief_id, version, expected_revision: brief.revision });
  if (!answer) { page.render(); return; }
  page.toast(text("fixed.toast"));
  await loadHead(page, { quiet: true });
  if (page.state.old) await openVersion(page, version);
}

/** A next step: run the prepared action as the person, set it aside, take that back, or hand it to the Assistant with the brief it is from. */
async function nextStep(page: BriefPage, action: string, optionId: string): Promise<void> {
  const head = page.state.head, brief = head?.brief, option = head?.version?.next.find(entry => entry.option_id === optionId);
  if (!brief || !option) return;
  const input = { brief_id: brief.brief_id, option_id: optionId };
  if (action === "run-next") {
    page.state.busy = "write";
    page.render();
    try {
      const { mark } = await page.call<{ mark: NextMark }>("work-brief.next.run", input);
      page.toast(text(mark.state === "done" ? "next.done-toast" : mark.state === "unknown" ? "next.unknown-toast" : "next.failed-toast"), mark.state !== "done");
    } finally { page.state.busy = ""; await loadHead(page, { quiet: true }); }
    return;
  }
  if (action === "hand-next") {
    await write(page, "work-brief.next.set", { ...input, state: "handed" });
    // The platform's delegation message: the Assistant takes the step with the brief as what it is about; only the person's press sent it.
    window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: { message_id: `work-brief-${optionId}`, purpose: "delegate", source: { surface: "work-brief", title: text("page.title") },
      object: { kind: "brief", id: brief.brief_id, title: brief.title || text("page.title"), version: head.version?.version ?? null }, text: `${option.text}\n${option.why}` } }));
    page.toast(text("next.handed-toast"));
  } else {
    await write(page, "work-brief.next.set", { ...input, state: action === "skip-next" ? "later" : null });
    if (action === "skip-next") page.toast(text("next.skipped-toast"));
  }
  await loadHead(page, { quiet: true });
}

/** Opens the Assistant with the brief in hand; nothing is written for the person and nothing is sent. */
function ask(page: BriefPage): void {
  const brief = briefOf(page);
  document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail: { new: true, source: { surface: "work-brief", title: text("page.title") },
    ...(brief ? { object: { kind: "brief", id: brief.brief_id, title: brief.title || text("page.title") } } : {}) } }));
}

async function onAct(page: BriefPage, action: string, value: string): Promise<void> {
  const { state } = page;
  switch (action) {
    case "mode": state.mode = value === "personal" ? "personal" : "project"; state.pop = ""; page.render(); if (state.mode === "personal") await loadPersonal(page); return;
    case "pop": state.pop = state.pop === value ? "" : value; page.render(); return;
    case "then-now": state.thenNow = value === "now" ? "now" : "then"; page.render(); return;
    case "back": state.old = null; state.pop = ""; page.render(); return;
    case "reload": state.error = ""; await loadHead(page); return;
    case "reload-personal": state.personalError = ""; state.personal = null; page.render(); await loadPersonal(page); return;
    case "refresh": await refresh(page); return;
    case "refresh-personal": {
      state.busy = "refresh"; page.render();
      try { state.personal = await page.call<PersonalView>("work-brief.personal.refresh", {}); state.personalError = ""; } finally { state.busy = ""; page.render(); }
      return;
    }
    case "version": await openVersion(page, Number(value)); return;
    case "fix": await fix(page, Number(value)); return;
    case "edit-claim": state.editing = value; state.pop = ""; page.render(); return;
    case "cancel-edit": state.editing = ""; page.render(); return;
    case "remove-claim": await saveClaim(page, value, null); return;
    case "pick": { const at = value.indexOf(":"), take = value.slice(0, at), claimId = value.slice(at + 1); if (claimId && (take === "mine" || take === "theirs")) state.picks[claimId] = take; page.render(); return; }
    case "resolve": await resolve(page, false); return;
    case "discard": await resolve(page, true); return;
    case "run-next": case "hand-next": case "skip-next": case "undo-next": await nextStep(page, action, value); return;
    case "ask": ask(page); return;
    default: return;
  }
}

export function mountWorkBrief(host: WorkBriefHost): void {
  const page = briefPage(host, draw);
  if (!page) return;
  const { scope, body, state } = page;
  scope.listen(body, "click", event => {
    const target = event.target as Element;
    const button = target.closest<HTMLElement>("[data-wb-act]");
    if (button && body.contains(button)) {
      if (button.matches("button[type=submit]")) return;
      event.preventDefault();
      if (button.getAttribute("aria-disabled") === "true" || (button as HTMLButtonElement).disabled) return;
      page.run(() => onAct(page, button.dataset.wbAct ?? "", button.dataset.wbValue ?? ""));
      return;
    }
    // A click outside an open popover closes it.
    if (state.pop && !target.closest(".wb-anchor")) { state.pop = ""; page.render(); }
  });
  scope.listen(body, "keydown", event => {
    const key = event as KeyboardEvent;
    if (key.key !== "Escape") return;
    if (state.pop) { key.preventDefault(); state.pop = ""; page.render(); }
    else if (state.editing) { key.preventDefault(); state.editing = ""; page.render(); }
  });
  scope.listen(body, "submit", event => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('form[data-wb-form="claim"]');
    if (!form) return;
    event.preventDefault();
    if (state.busy) return;
    const value = new FormData(form).get("text");
    page.run(() => saveClaim(page, form.dataset.wbValue ?? "+", typeof value === "string" ? value : ""));
  });
  scope.own(() => { for (const held of placed) held.dispose(); placed = []; });
  page.render();
  // Opening the page reads what is saved and nothing else: no model, no refresh of the sources, no task (WBR-24).
  scope.whenVisible(() => {
    page.run(() => state.mode === "personal" ? loadPersonal(page) : loadHead(page, { quiet: Boolean(shownOf(page)) }));
    // A brief the Assistant just saved (or anything of Work Brief changed elsewhere) is read again; an open editor is not disturbed.
    return scope.listen(window, "molis:assistant-effect", event => {
      const capability = (event as CustomEvent<{ capability_id?: unknown } | undefined>).detail?.capability_id;
      if (typeof capability !== "string" || !capability.startsWith("work-brief.") || state.editing || state.busy) return;
      page.run(() => state.mode === "personal" ? loadPersonal(page) : loadHead(page, { quiet: true }));
    });
  });
}
