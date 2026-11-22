/**
 * Requirements and acceptance on the page (specs/proactive-assistant §7.3.1, PWA-144～147): the summary an event card shows for
 * the objects behind it, and the column that opens beside the work surface to go through the requirements one by one. Everything
 * shown is `acceptance.read@1` as the person; an accept, a return or a change of what is asked goes back through the person's own
 * doors (`/api/acceptance/*`) with the versions that were on screen, and what comes back is drawn. While the column is open the
 * Assistant's dialog is put away (the column stands beside the work, not over a conversation) and comes back when the column
 * closes; a dialog opened meanwhile closes the column. A part of the work bar's bundle.
 */
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { ACCEPTANCE_READ_MAX, type AcceptanceReadResult, type AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { renderAcceptanceOverview, renderRequirementColumn, type RequirementColumnUi } from "../work-acceptance-parts.js";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";

export interface AcceptanceTarget { provider_id: string; subject: ActionSubject }
export interface AcceptanceOverview { update(): void; destroy(): void }

export function installAcceptance(route: (path: string) => string, request: UiRequest, dialog: (open: boolean) => void): { overview(slot: HTMLElement, targets: () => AcceptanceTarget[]): AcceptanceOverview; refresh(): void } {
  const keyOf = (target: AcceptanceTarget) => `${target.provider_id}\u001f${target.subject.kind}\u001f${target.subject.id}`;
  const known = new Map<string, { target: AcceptanceTarget; view: AcceptanceView }>(), slots = new Set<() => void>();
  const post = (path: string, body: unknown) => request(route(`/api/acceptance/${path}`), { body }) as Promise<AcceptanceView>;
  // Every read asked for in the same turn (each card on the line, the open column) goes out as one request, each object once, so a
  // page of cards costs one call and one look at the store, not one per object.
  let queued = new Map<string, { target: AcceptanceTarget; reply: Promise<AcceptanceView>; done(view: AcceptanceView): void; failed(error: unknown): void }>();
  const flush = () => {
    const batch = [...queued.values()]; queued = new Map();
    for (let at = 0; at < batch.length; at += ACCEPTANCE_READ_MAX) {
      const part = batch.slice(at, at + ACCEPTANCE_READ_MAX);
      (request(route("/api/acceptance/read"), { body: { subjects: part.map(one => one.target) } }) as Promise<AcceptanceReadResult>).then(
        ({ views }) => part.forEach((one, index) => { known.set(keyOf(one.target), { target: one.target, view: views[index]! }); one.done(views[index]!); }),
        error => part.forEach(one => one.failed(error)));
    }
  };
  const read = (target: AcceptanceTarget): Promise<AcceptanceView> => {
    const key = keyOf(target), waiting = queued.get(key);
    if (waiting) return waiting.reply;
    if (!queued.size) queueMicrotask(flush);
    let done!: (view: AcceptanceView) => void, failed!: (error: unknown) => void;
    const reply = new Promise<AcceptanceView>((resolve, reject) => { done = resolve; failed = reject; });
    queued.set(key, { target, reply, done, failed });
    return reply;
  };

  const column = document.createElement("aside");
  column.className = "work-reqs"; column.hidden = true; column.dataset.acceptanceColumn = ""; column.setAttribute("aria-label", uiText.text("workbench.acceptance.title"));
  document.body.append(column);
  let open: string | null = null, opener: HTMLElement | null = null, back = false, watched = false, drawn = "", ui: RequirementColumnUi = { returning: null, editing: null, adding: false, busy: false, error: "" };
  // The column stands where the work surface stands: between whatever chrome this width puts above and below it.
  const place = () => {
    const stage = [...document.querySelectorAll<HTMLElement>("[data-plugin-stage]")].find(one => one.getClientRects().length)?.getBoundingClientRect();
    if (stage) { column.style.setProperty("--acceptance-top", `${stage.top}px`); column.style.setProperty("--acceptance-bottom", `${innerHeight - stage.bottom}px`); }
  };
  addEventListener("resize", () => { if (open) place(); });
  const draw = () => {
    const now = open ? known.get(open) : undefined;
    if (now && column.hidden) place();
    column.hidden = !now; document.body.dataset.acceptanceOpen = String(Boolean(now));
    if (now?.view.review_reference) { column.dataset.reviewReference = now.view.review_reference.id; column.dataset.reviewVersion = now.view.review_reference.version; }
    else { delete column.dataset.reviewReference; delete column.dataset.reviewVersion; }
    const html = now ? renderRequirementColumn(now.view, ui) : "";
    if (html === drawn) return;
    // A redraw keeps the place in the list: an answer to the fifth item does not throw the person back to the first.
    const at = column.querySelector(".work-reqs-list")?.scrollTop ?? 0;
    drawn = html; column.innerHTML = html;
    const list = column.querySelector(".work-reqs-list");
    if (list) list.scrollTop = at;
    column.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  };
  const show = (key: string | null, from?: HTMLElement) => {
    const was = open;
    open = key; ui = { returning: null, editing: null, adding: false, busy: false, error: "" };
    if (key) {
      const panel = document.querySelector<HTMLElement>("[data-assistant-panel]");
      opener = from ?? null; back = panel?.hidden === false; dialog(false);
      // The dialog opened over an open column (a press on the line): the column gives way and nothing is brought back.
      if (panel && !watched) { watched = true; new MutationObserver(() => { if (open && !panel.hidden) { open = null; back = false; opener = null; draw(); } }).observe(panel, { attributes: true, attributeFilter: ["hidden"] }); }
      draw(); column.querySelector("[data-lead]")?.scrollIntoView({ block: "nearest" });
      column.querySelector<HTMLElement>("[data-lead] [data-acceptance-accept], [data-acceptance-close]")?.focus();
    } else { draw(); if (back) dialog(true); back = false;
      // Back where it was opened from: the same button, the one drawn in its place since, or (its card gone) what opens the conversation.
      const again = opener?.isConnected ? opener : [...document.querySelectorAll<HTMLElement>("[data-acceptance-open]")].find(one => one.dataset.acceptanceOpen === was && one.getClientRects().length > 0);
      (again ?? document.querySelector<HTMLElement>("[data-work-line] [data-dialog-open]"))?.focus(); opener = null;
    }
  };
  /** One write as the person; whatever happens the column shows what stands afterwards, with the refusal's own words when there is one. */
  const act = async (work: (now: { target: AcceptanceTarget; view: AcceptanceView }) => Promise<AcceptanceView>) => {
    const now = open ? known.get(open) : undefined;
    if (!now || ui.busy) return;
    ui = { ...ui, busy: true, error: "" }; draw();
    try { now.view = await work(now); ui = { returning: null, editing: null, adding: false, busy: false, error: "" }; }
    catch (error) { ui = { ...ui, busy: false, error: error instanceof Error ? error.message : String(error) }; await read(now.target).catch(() => undefined); }
    draw(); for (const paint of slots) paint();
  };
  /** A new requirement after the ones that stand, with an id of its own; nothing is sent without its words. */
  const add = (field: HTMLTextAreaElement) => {
    const words = field.value.trim();
    if (!words) { field.focus(); return; }
    const id = `req-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
    void act(now => post("requirements", { subject: now.target, requirements: [...now.view.requirements.map(each =>
      ({ id: each.id, statement: each.statement, ...(each.expected ? { expected: each.expected } : {}), ...(each.part ? { part: each.part } : {}), requires_person: each.requires_person })),
    { id, statement: words, requires_person: false }] }));
  };
  const item = (from: Element) => { const card = from.closest<HTMLElement>("[data-requirement]"); return card ? { id: card.dataset.requirement!, version: Number(card.dataset.requirementVersion) } : null; };
  const send = (from: Element) => {
    const one = item(from), field = from.closest("[data-requirement]")?.querySelector<HTMLTextAreaElement>("textarea"), words = field?.value.trim() ?? "";
    if (!one || !field) return;
    // Nothing is sent without the words: the field asks for them.
    if (!words) { field.focus(); return; }
    if (ui.returning) void act(now => post("decide", { subject: now.target, version: now.view.version, accepts: [], returns: [{ ...one, note: words }] }));
    else void act(now => post("requirements", { subject: now.target, requirements: now.view.requirements.map(each =>
      ({ id: each.id, statement: each.id === one.id ? words : each.statement, ...(each.expected ? { expected: each.expected } : {}), ...(each.part ? { part: each.part } : {}), requires_person: each.requires_person })) }));
  };
  column.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("button") : null, one = target ? item(target) : null;
    if (!target) return;
    if (target.matches("[data-acceptance-close]")) show(null);
    else if (target.matches("[data-acceptance-cancel]")) { ui = { ...ui, returning: null, editing: null, adding: false, error: "" }; draw(); }
    else if (target.matches("[data-acceptance-add]")) { ui = { ...ui, adding: true, returning: null, editing: null, error: "" }; draw(); }
    else if (target.matches("[data-acceptance-new-send]")) { const field = column.querySelector<HTMLTextAreaElement>("[data-acceptance-new]"); if (field) add(field); }
    else if (target.matches("[data-acceptance-note-send], [data-acceptance-text-send]")) send(target);
    else if (!one) return;
    else if (target.matches("[data-acceptance-accept]")) void act(now => post("decide", { subject: now.target, version: now.view.version, accepts: [one], returns: [] }));
    else if (target.matches("[data-acceptance-return]")) { ui = { ...ui, returning: one.id, editing: null, adding: false, error: "" }; draw(); }
    else if (target.matches("[data-acceptance-edit]")) { ui = { ...ui, editing: one.id, returning: null, adding: false, error: "" }; draw(); }
  });
  column.addEventListener("keydown", event => {
    const field = event.target instanceof HTMLTextAreaElement ? event.target : null;
    if (event.key === "Escape") { event.stopPropagation(); if (ui.returning || ui.editing || ui.adding) { ui = { ...ui, returning: null, editing: null, adding: false }; draw(); } else show(null); }
    else if (field && event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (field.matches("[data-acceptance-new]")) add(field); else send(field); }
  });
  document.addEventListener("click", event => {
    const from = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-acceptance-open]") : null;
    if (from && known.has(from.dataset.acceptanceOpen ?? "")) show(from.dataset.acceptanceOpen!, from);
  });
  // A page that shows an object's requirements in its own words (a Goal page) asks for the column on that object: it is read as the
  // person first, so what opens is what stands now, and the press that asked gets the focus back when the column closes.
  document.addEventListener("molis:acceptance-review-requested", event => {
    const detail = (event as CustomEvent<{ subject?: AcceptanceTarget }>).detail, target = detail?.subject;
    if (!target || typeof target.provider_id !== "string" || typeof target.subject?.kind !== "string" || typeof target.subject.id !== "string") return;
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    void read(target).then(() => show(keyOf(target), from), () => undefined);
  });

  return {
    overview(slot, targets) {
      let html = "", gone = false;
      const paint = () => {
        const next = targets().map(target => known.get(keyOf(target))).map(now => now ? renderAcceptanceOverview(now.view, keyOf(now.target)) : "").join("");
        if (next === html) return;
        // Drawn again while the way in has the focus, the new one takes it.
        const held = slot.contains(document.activeElement);
        html = next; slot.hidden = !next; slot.innerHTML = next;
        if (held) slot.querySelector<HTMLElement>("[data-acceptance-open]")?.focus();
      };
      slots.add(paint);
      // What is known already is shown at once (a card drawn again does not blink); the read then brings what stands now.
      return { update() { paint(); void Promise.all(targets().map(target => read(target).catch(() => undefined))).then(() => { if (!gone) paint(); }); }, destroy() { gone = true; slots.delete(paint); } };
    },
    // What stands may have moved (a report came in, rework was delivered): the open column is read again, unless the person is writing in it.
    refresh() {
      const now = open ? known.get(open) : undefined;
      if (now && !ui.busy && !ui.returning && !ui.editing && !ui.adding) void read(now.target).then(draw, () => undefined);
    },
  };
}
