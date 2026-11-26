import { GOALS_PLUGIN_API } from "../plugin-api.js";
import { GOALS_DECISION_ACTIONS, type RetainedDecision } from "./decision-actions.js";
import { elementOf, failureOf, messageOf } from "./dom.js";
import { eventDeliverables } from "./event-deliverables.js";
import { buildPayload, fieldError, formPath, syncConcernForm, typeFields } from "./event-forms.js";
import { appendTimelineItems, applyLaneFilter, conflictLines, escapeText, type EventState, type TimelineItem, typeFieldRow } from "./event-timeline.js";
import type { Route } from "./types.js";

/** Where a reader of the event document was, so a re-read of the document opens it in the same place. */
export interface EventRestore {
  readonly goal?: string;
  readonly item?: string;
  readonly reader?: string;
  readonly filter?: string;
  readonly form?: string;
  readonly infoOpen?: boolean | null;
}

export interface EventDocumentHost {
  readonly documentPane: HTMLElement;
  readonly route: Route;
  readonly isAbortError: (error: unknown) => boolean;
  readonly showError?: (message: string) => void;
  readonly showStatus?: (message: string) => void;
  /** Reads the Goal's document again: `true` replaced it, `null` a newer read took over, `false` it could not be read. */
  readonly reloadDocument: (goalId: string, restore: EventRestore) => Promise<boolean | null>;
}

interface Reading { goal: string; item: string; filter: string; reader: string; form: string; infoOpen: boolean | null; hold: string }
interface FormReply {
  readonly code?: string;
  readonly error?: string;
  readonly event_id?: string;
  readonly details?: { readonly field_id?: string };
  readonly completion_applied?: boolean;
  readonly unmet_reasons?: readonly { readonly message: string }[];
  readonly result?: FormReply;
  readonly record?: { readonly decision_id?: string };
}

const READERS = new Set(["planning", "description", "requirements"]);
const OPPOSITE_EFFECT: Readonly<Record<string, string>> = { accept_concerns: "reject_concerns", reject_concerns: "accept_concerns", authorize_action: "deny_action", deny_action: "authorize_action" };
const narrow = () => matchMedia("(max-width: 760px)").matches;
const newKey = () => globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random());

function createCitedSurfaceNamer(documentPane: HTMLElement, route: Route, keepAlive: () => boolean): () => void {
  let citedSurfaces: Promise<Map<string, string> | null> | null = null;
  return () => {
    if (!keepAlive()) return;
    const pending = [...documentPane.querySelectorAll<HTMLButtonElement>("[data-goal-cited]:not([data-goal-cited-ready])")];
    if (!pending.length) return;
    citedSurfaces ??= molisWorkRequest<{ surfaces?: Record<string, { kind: string }> } | null>(route("/api/contextual/surfaces")).then((answer) => {
      const by = new Map<string, string[]>();
      for (const [surface, { kind }] of Object.entries(answer?.surfaces ?? {})) by.set(kind, [...(by.get(kind) ?? []), surface]);
      return new Map([...by].filter(([, surfaces]) => surfaces.length === 1).map(([kind, surfaces]) => [kind, surfaces[0] ?? ""]));
    }).catch(() => {
      citedSurfaces = null;
      return null;
    });
    // Not read is not none: the buttons wait unnamed, and the next change to the document asks again.
    void citedSurfaces.then((surfaces) => surfaces && pending.forEach((button) => {
      if (!button.isConnected) return;
      button.dataset.goalCitedReady = "";
      const surface = surfaces.get(button.dataset.kind || "");
      if (!surface) {
        button.disabled = true;
        return;
      }
      const label = document.querySelector<HTMLElement>('[data-work-surface="' + CSS.escape(surface) + '"]')?.dataset.workSurfaceLabel;
      button.dataset.workbenchItemPlugin = surface;
      button.dataset.workbenchItemId = button.dataset.id;
      const name = button.querySelector("[data-goal-cited-label]");
      if (label && name) name.textContent = label;
    }));
  };
}

function createDecisionPoster(route: Route, goalId: () => string, disconnected: () => Error) {
  const decisions = new WeakMap<HTMLFormElement, RetainedDecision>();
  return {
    clearDecision(form: HTMLFormElement) { decisions.delete(form); },
    async postDecision(form: HTMLFormElement, goal: string, draft: Record<string, unknown>, key: string) {
      if (!form.dataset.reviewVersion) throw disconnected();
      const body = { ...draft, goal_id: goal, idempotency_key: key, observed_version: form.dataset.reviewVersion };
      const encoded = JSON.stringify(body);
      let retained = decisions.get(form);
      if (retained?.encoded !== encoded) {
        const response = await molisWorkRequest<Response>(route("/api/project-approvals/request"), { method: "POST", as: "response",
          body: { action: GOALS_DECISION_ACTIONS.decide, request_id: (typeof draft.request_id === "string" && draft.request_id) || key, draft: body } });
        if (!response.ok) return response;
        const { reference } = await response.json() as { reference: unknown };
        if (!form.isConnected || goalId() !== goal) throw disconnected();
        retained = { encoded, reference };
        decisions.set(form, retained);
      }
      return molisWorkRequest<Response>(route("/api/project-approvals/decide"), { method: "POST", as: "response",
        body: { reference: retained.reference, choice_id: "apply", request_key: key } });
    },
  };
}

/** The event document of a Goal: its readers, forms and decisions. */
export function eventDocumentClient(host: EventDocumentHost) {
  const { documentPane, route, isAbortError, showError, showStatus, reloadDocument } = host;
  let selectedRequest = 0;
  let moreRequest = 0;
  let returnFocusTarget: HTMLElement | null = null;
  const reading: Reading = { goal: "", item: "", filter: "all", reader: "", form: "", infoOpen: null, hold: "" };
  const root = () => documentPane.querySelector<HTMLElement>("[data-goal-event-document]");
  const goalId = () => root()?.dataset.goalView || "";
  const goalPath = (goal: string, path: string) => route(GOALS_PLUGIN_API + "/goals/" + encodeURIComponent(goal) + path);
  const { loadDeliverables, saveDeliverables } = eventDeliverables({ route, goalId });
  const disconnected = () => new Error(globalThis.t.text("goals.event-document-client.read-disconnected"));

  // A form's own write; its 409 and field errors read the answer itself. One the Host never answered keeps the input, and says so.
  const postForm = (goal: string, path: string, body: Record<string, unknown>) => molisWorkRequest<Response>(goalPath(goal, path), {
    method: "POST", headers: { accept: "application/json" }, body, as: "response",
  }).catch((error: unknown) => {
    if (failureOf(error).code === "ui_host.outcome_unknown") throw new Error(globalThis.t.text("goals.event-document-client.could-not-reach-local-service-input-kept-please"));
    throw error;
  });
  const { postDecision, clearDecision } = createDecisionPoster(route, goalId, disconnected);
  const captureRestore = (): EventRestore => ({
    goal: reading.goal || goalId(),
    item: reading.item,
    reader: reading.reader,
    filter: reading.filter || "all",
    form: reading.form,
    infoOpen: root()?.querySelector<HTMLDetailsElement>("[data-goal-info]")?.open,
  });
  const resetReading = (nextGoal: string) => {
    selectedRequest += 1;
    Object.assign(reading, { goal: nextGoal, item: "", filter: "all", reader: "", form: "", infoOpen: null, hold: "" });
    returnFocusTarget = null;
  };
  const clearHold = (form: HTMLElement | null | undefined) => {
    if (!form || form.dataset.eventForm !== "closure" || !reading.hold) return;
    reading.hold = "";
    const note = form.querySelector<HTMLElement>("[data-form-status]");
    if (note) {
      note.hidden = true;
      note.textContent = "";
    }
  };
  const readBreak = (status: HTMLElement | null, error: unknown) => {
    if (!status) return;
    status.hidden = false;
    status.innerHTML = escapeText((messageOf(error) || globalThis.t.text("goals.event-document-client.read-disconnected")) + " · " + globalThis.t.text("goals.event-document-client.saved-retry-reading-will-not-write-another-record"))
      + '<button type="button" class="mw-btn mw-btn--secondary" data-retry-read>' + escapeText(globalThis.t.text("goals.event-document-client.retry-reading")) + "</button>";
  };
  /** Reads the document again; a read that could not happen is an error, one a newer read took over is not. */
  const reread = async (goal: string, restore: EventRestore) => {
    const replaced = await reloadDocument(goal, restore);
    if (replaced === false) throw disconnected();
    return replaced;
  };

  const syncPanelPresence = () => {
    const article = root();
    if (!article) return;
    const editing = article.classList.contains("is-editing-goal");
    article.querySelector(".goal-workspace-hero")?.toggleAttribute("inert", editing && narrow());
    const frame = article.closest("[data-goal-node-workspace]");
    if (frame?.querySelector("[data-goal-work-main]")) {
      article.dispatchEvent(new CustomEvent("molis-work:record-panel-presence", { bubbles: true }));
    } else frame?.querySelector("[data-tui-pane]")?.toggleAttribute("inert", editing);
    article.querySelector(".timeline-pane")?.toggleAttribute("inert", editing && narrow());
  };
  const hidePanels = (restoreFocus = false) => {
    const article = root();
    if (!article) return;
    article.querySelector("[data-event-reader-root]")?.setAttribute("hidden", "");
    article.querySelectorAll<HTMLElement>("[data-event-form]").forEach((form) => { form.hidden = true; });
    const sheet = article.querySelector<HTMLElement>("[data-event-sheet]");
    if (sheet) sheet.hidden = !reading.item;
    article.classList.remove("is-editing-goal", "is-editing-record");
    syncPanelPresence();
    if (restoreFocus) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (root() !== article || article.classList.contains("is-editing-goal")) return;
      const target = returnFocusTarget?.isConnected ? returnFocusTarget : article.querySelector<HTMLElement>("[data-record-menu] > summary, [data-goal-info] > summary");
      target?.focus({ preventScroll: true });
    }));
  };
  const showDetail = (showing: boolean) => {
    root()?.querySelector("[data-goal-layout]")?.classList.toggle("is-showing-detail", showing);
    root()?.classList.toggle("is-showing-detail", showing);
  };
  const renderEventHtml = (html: string) => {
    const sheet = root()?.querySelector<HTMLElement>("[data-event-sheet]");
    if (!sheet) return;
    sheet.hidden = false;
    sheet.innerHTML = html;
  };
  const timelineItems = () => [...(root()?.querySelectorAll<HTMLElement>("[data-timeline-item]") || [])];

  const loadEventBody = async (item: HTMLElement | null, explicit = false) => {
    const requestId = ++selectedRequest;
    const currentGoal = goalId();
    if (reading.goal && reading.goal !== currentGoal) return;
    if (!reading.goal) reading.goal = currentGoal;
    const itemId = item?.dataset.timelineItem;
    if (itemId) reading.item = itemId;
    if (explicit) {
      reading.reader = "";
      reading.form = "";
    } else if (reading.form || reading.reader) {
      return;
    }
    timelineItems().forEach((node) => {
      const on = String(node.dataset.timelineItem === itemId);
      node.setAttribute("aria-current", on);
      node.setAttribute("aria-expanded", on);
    });
    const sheet = root()?.querySelector("[data-event-sheet]");
    const anchor = root()?.querySelector('[data-timeline-item="' + CSS.escape(itemId || "") + '"]');
    if (sheet) {
      if (anchor) anchor.after(sheet);
      else root()?.querySelector("[data-event-timeline]")?.prepend(sheet);
    }
    showDetail(true);
    hidePanels();
    if (!itemId) return;
    renderEventHtml("<p class=\"no-results\">" + escapeText(globalThis.t.text("goals.event-document-client.loading-original-text")) + "</p>");
    const stale = () => requestId !== selectedRequest || goalId() !== currentGoal || reading.goal !== currentGoal || (!explicit && Boolean(reading.form || reading.reader));
    try {
      const body = await molisWorkRequest<{ html?: string } | null>(goalPath(currentGoal, "/history/" + encodeURIComponent(itemId)), { fallback: globalThis.t.text("goals.event-document-client.could-not-read-event") }) ?? {};
      if (stale()) return;
      renderEventHtml(body.html || "");
    } catch (error) {
      if (isAbortError(error) || stale()) return;
      renderEventHtml("<p class=\"no-results\" role=\"alert\">" + escapeText(messageOf(error) || globalThis.t.text("goals.event-document-client.could-not-read-event")) + "</p><button type=\"button\" class=\"mw-btn mw-btn--link\" data-retry-event>" + escapeText(globalThis.t.text("goals.event-document-client.retry-loading-event")) + "</button>");
    }
  };

  const locateHistory = async (itemId: string) => {
    if (!itemId || reading.form || reading.reader || (reading.goal && reading.goal !== goalId())) return;
    reading.item = itemId;
    const existing = root()?.querySelector<HTMLElement>('[data-timeline-item="' + CSS.escape(itemId) + '"]')
      || root()?.querySelector<HTMLElement>('[data-event-id="' + CSS.escape(itemId) + '"]');
    if (existing) {
      void loadEventBody(existing);
      return;
    }
    const fake = document.createElement("button");
    fake.dataset.timelineItem = itemId;
    fake.dataset.eventId = itemId;
    fake.dataset.source = "event_work";
    await loadEventBody(fake);
  };

  const showReader = (article: HTMLElement, name: string) => {
    article.querySelector("[data-event-reader-root]")?.removeAttribute("hidden");
    article.querySelectorAll<HTMLElement>("[data-event-panel]").forEach((panel) => { panel.hidden = panel.dataset.eventPanel !== name; });
    const title = article.querySelector<HTMLElement>("[data-reader-title]");
    if (title) {
      title.textContent = name === "planning" ? globalThis.t.text("goals.event-document-client.record-templates") : name === "description" ? globalThis.t.text("goals.event-document-client.goal-requirements") : globalThis.t.text("goals.event-document-client.completion-requirement");
      title.tabIndex = -1;
      requestAnimationFrame(() => { if (title.isConnected && reading.reader === name) title.focus({ preventScroll: true }); });
    }
  };
  const showForm = (name: string, typeId?: string, trigger?: HTMLElement) => {
    const article = root();
    if (!article) return;
    const origin = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const menu = origin?.closest<HTMLDetailsElement>("[data-record-menu], .goal-more");
    if (trigger || !article.classList.contains("is-editing-goal")) returnFocusTarget = menu?.querySelector<HTMLElement>("summary") || origin;
    if (menu) menu.open = false;
    const isReader = READERS.has(name);
    reading.reader = isReader ? name : "";
    reading.form = isReader ? "" : name;
    hidePanels();
    article.classList.add("is-editing-goal", "is-editing-record");
    syncPanelPresence();
    const sheet = article.querySelector<HTMLElement>("[data-event-sheet]");
    if (sheet) sheet.hidden = true;
    if (isReader) {
      showReader(article, name);
      showDetail(true);
      return;
    }
    const form = typeId && (name === "type-edit" || name === "report")
      ? article.querySelector<HTMLFormElement>('[data-event-form="' + name + '"][data-type-id="' + CSS.escape(typeId) + '"]')
      : article.querySelector<HTMLFormElement>('[data-event-form="' + CSS.escape(name) + '"]');
    if (form) {
      form.hidden = false;
      if (name === "closure") {
        void loadDeliverables(form);
        if (reading.hold) {
          const note = form.querySelector<HTMLElement>("[data-form-status]");
          if (note) {
            note.hidden = false;
            note.innerHTML = reading.hold;
          }
        }
      }
      requestAnimationFrame(() => {
        if (!form.isConnected || form.hidden || reading.form !== name) return;
        [...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input:not([type="hidden"]), textarea, select')]
          .find((field) => !field.disabled && field.getClientRects().length)?.focus({ preventScroll: true });
      });
    }
    showDetail(true);
  };

  const readEventState = async (goal: string): Promise<EventState> => {
    try { return await molisWorkRequest<EventState | null>(goalPath(goal, "/event-state")) ?? {}; } catch { /* The conflict still shows; only its current values are left out. */ return {}; }
  };
  const showStatusText = (status: HTMLElement | null, text: string) => { if (status) {
    status.hidden = false;
    status.textContent = text;
  } };
  /** Whether a form may be sent as it stands; a refusal says why in the form's status line. */
  const readyToSend = (form: HTMLFormElement, kind: string, status: HTMLElement | null) => {
    if ((kind === "type" || kind === "type-edit") && !typeFields(form).length) {
      showStatusText(status, globalThis.t.text("goals.event-document-client.keep-least-one-field"));
      return false;
    }
    if (kind === "decision" && form.querySelector('[name="agreement_change_decision"]')) {
      const choice = form.querySelector<HTMLInputElement>('[name="agreement_change_decision"]:checked')?.value;
      if (choice !== "authorize" && choice !== "deny") {
        showStatusText(status, globalThis.t.text("goals.event-document-client.must-approve-reject-agreement-change"));
        return false;
      }
    }
    return true;
  };
  /** A 409: a version conflict keeps the input and shows the current versions; any other refusal reads the document back. */
  const answerConflict = async (form: HTMLFormElement, kind: string, body: FormReply, currentGoal: string, restore: EventRestore, status: HTMLElement | null, conflict: HTMLElement | null) => {
    const versionConflict = kind === "decision" && body.code === "actions.conflict" || /version_conflict|stale_version/.test(String(body.code || ""));
    if (!versionConflict) {
      showStatusText(status, body.error || globalThis.t.text("goals.event-document-client.saved-reading-current-facts-back"));
      try { await reread(currentGoal, restore); } catch (readError) { readBreak(status, readError); }
      return;
    }
    const current = await readEventState(currentGoal);
    if (goalId() !== currentGoal || !form.isConnected) return;
    if (conflict) {
      conflict.hidden = false;
      conflict.innerHTML = "<p>" + escapeText(body.error || globalThis.t.text("goals.event-document-client.current-agreement-has-changed-input-kept")) + "</p>"
        + conflictLines(current)
        + '<button type="button" class="mw-btn mw-btn--secondary" data-conflict-retry>' + escapeText(globalThis.t.text("goals.event-document-client.review-against-current-version-then-submit")) + "</button>";
    }
    form.setAttribute("data-live-dirty", "true");
  };
  /** After a saved write: reads the document back, and closes the form unless the closure did not take effect. */
  const afterSaved = async (form: HTMLFormElement, kind: string, body: FormReply, currentGoal: string, restore: EventRestore, status: HTMLElement | null) => {
    form.dataset.writeReceipt = body.event_id || "recorded";
    const refused = kind === "closure" && body.completion_applied === false && Boolean(body.unmet_reasons?.length);
    if (refused) {
      reading.hold = escapeText(globalThis.t.text("goals.event-document-client.close-out-did-not-take-effect")) + "<ul>" + (body.unmet_reasons || []).map((item) => "<li>" + escapeText(item.message) + "</li>").join("") + "</ul>";
      if (status) {
        status.hidden = false;
        status.innerHTML = reading.hold;
      }
    }
    try {
      const replaced = await reread(currentGoal, { ...restore, form: body.completion_applied === false ? restore.form : "" });
      if (!replaced) return;
      form.removeAttribute("data-live-dirty");
    } catch (readError) {
      if (status?.isConnected) reading.hold = "";
      readBreak(status, readError);
      showError?.(globalThis.t.text("goals.event-document-client.saved-but-page-has-not-read-back-yet"));
      return;
    }
    delete form.dataset.idempotencyKey;
    if (goalId() !== currentGoal) return;
    if (refused) {
      showStatus?.(globalThis.t.text("goals.event-document-client.close-out-did-not-take-effect-top-now"));
      return;
    }
    showStatus?.(globalThis.t.text("goals.event-document-client.saved-top-now-shows-current-authoritative-state"));
    reading.form = "";
    reading.reader = "";
    hidePanels(true);
  };

  const submitForm = async (form: HTMLFormElement) => {
    if (form.getAttribute("aria-busy") === "true") return;
    const article = root();
    const currentGoal = goalId();
    const kind = form.dataset.eventForm || "";
    if (kind === "closure") reading.hold = "";
    const status = form.querySelector<HTMLElement>("[data-form-status]");
    const conflict = article?.querySelector<HTMLElement>("[data-event-conflict]") ?? null;
    if (conflict) {
      conflict.hidden = true;
      conflict.textContent = "";
    }
    if (status) {
      status.hidden = true;
      status.textContent = "";
    }
    fieldError(form, "", "");
    if (!readyToSend(form, kind, status)) return;
    const key = form.dataset.idempotencyKey || newKey();
    form.dataset.idempotencyKey = key;
    form.setAttribute("data-live-dirty", "true");
    form.setAttribute("aria-busy", "true");
    const fields = form.querySelector<HTMLElement>(".event-form-body");
    if (fields) fields.inert = true;
    const buttons = [...form.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    buttons.forEach(button => { button.disabled = true; });
    const submit = form.querySelector<HTMLElement>("[type=submit]");
    const submitLabel = submit?.textContent ?? "";
    if (submit) submit.textContent = globalThis.t.text("goals.event-document-client.saving");
    const restore: EventRestore = { ...captureRestore(), form: kind };
    try {
      if (kind === "closure") await saveDeliverables(form, currentGoal);
      const payload = buildPayload(form, kind, article);
      const response = kind === "decision" ? await postDecision(form, currentGoal, payload, key)
        : await postForm(currentGoal, formPath(kind), { ...payload, idempotency_key: key });
      const reply = await response.json().catch(() => ({})) as FormReply;
      const body: FormReply = kind === "decision" && response.ok ? reply.result ?? { event_id: reply.record?.decision_id } : reply;
      if (goalId() !== currentGoal) return;
      if (response.status === 409) {
        await answerConflict(form, kind, body, currentGoal, restore, status, conflict);
        return;
      }
      if (!response.ok) {
        fieldError(form, body.details?.field_id, body.error || globalThis.t.text("goals.event-document-client.could-not-save"));
        showStatusText(status, body.error || globalThis.t.text("goals.event-document-client.could-not-save"));
        return;
      }
      await afterSaved(form, kind, body, currentGoal, restore, status);
    } catch (error) {
      const message = error instanceof TypeError ? globalThis.t.text("goals.event-document-client.could-not-reach-local-service-input-kept-please") : messageOf(error) || globalThis.t.text("goals.event-document-client.could-not-save");
      if (status) showStatusText(status, message);
      else showError?.(message);
    } finally {
      form.removeAttribute("aria-busy");
      if (fields) fields.inert = false;
      buttons.forEach(button => { button.disabled = false; });
      if (submit) submit.textContent = submitLabel;
      if (form.isConnected && !form.hidden) (form.querySelector<HTMLElement>(":invalid") || submit)?.focus();
    }
  };

  const retryRead = async (button: HTMLElement) => {
    const status = button.closest("[data-event-form]")?.querySelector<HTMLElement>("[data-form-status]") ?? null;
    try {
      if (await reread(goalId(), captureRestore())) showStatus?.(globalThis.t.text("goals.event-document-client.saved-top-now-shows-current-authoritative-state"));
    } catch (error) {
      const message = messageOf(error) || globalThis.t.text("goals.event-document-client.read-disconnected");
      showStatusText(status, message);
      showError?.(message);
    }
  };
  const retryAgainstCurrent = async (article: HTMLElement) => {
    const currentGoal = goalId();
    let state: EventState;
    try {
      state = await molisWorkRequest<EventState | null>(goalPath(currentGoal, "/event-state")) ?? {};
    } catch (error) {
      if (isAbortError(error) || goalId() !== currentGoal || !article.isConnected) return;
      const message = messageOf(error) || globalThis.t.text("goals.event-document-client.read-disconnected");
      const activeForm = article.querySelector<HTMLFormElement>("[data-event-form]:not([hidden])");
      const status = activeForm?.querySelector<HTMLElement>("[data-form-status]") ?? null;
      if (status) showStatusText(status, message);
      else showError?.(message);
      return;
    }
    if (goalId() !== currentGoal || !article.isConnected) return;
    const form = article.querySelector<HTMLFormElement>("[data-event-form]:not([hidden])");
    if (!form || !form.isConnected) return;
    const config = form.querySelector<HTMLInputElement>('[name="expected_config_version"]');
    const agreement = form.querySelector<HTMLInputElement>('[name="expected_agreement_version"]');
    if (config) config.value = String(state.config?.version ?? 0);
    if (agreement) agreement.value = String(state.agreement?.version ?? 0);
    form.dataset.configVersion = String(state.config?.version ?? 0);
    form.dataset.agreementVersion = String(state.agreement?.version ?? 0);
    if (typeof state.review_version === "string" && state.review_version) {
      form.dataset.reviewVersion = state.review_version;
    }
    clearDecision(form);
    delete form.dataset.idempotencyKey;
    const box = article.querySelector<HTMLElement>("[data-event-conflict]");
    if (box) {
      box.hidden = false;
      box.innerHTML = "<p>" + escapeText(globalThis.t.text("goals.event-document-client.switched-current-version-check-inputs-before-submitting")) + "</p>" + conflictLines(state);
    }
  };
  const loadMore = async (more: HTMLButtonElement) => {
    const requestId = ++moreRequest;
    const currentGoal = goalId();
    more.disabled = true;
    try {
      const body = await molisWorkRequest<{ items?: TimelineItem[]; next_cursor?: unknown } | null>(goalPath(currentGoal, "/event-timeline?before_cursor=" + encodeURIComponent(more.dataset.nextCursor || "") + "&limit=40"), { fallback: globalThis.t.text("goals.event-document-client.could-not-load-earlier-records-please-retry") }) ?? {};
      if (requestId !== moreRequest || goalId() !== currentGoal) return;
      const nav = root()?.querySelector<HTMLElement>("[data-event-timeline]");
      if (nav) appendTimelineItems(nav, body.items || [], reading);
      if (!body.next_cursor) {
        more.hidden = true;
        more.dataset.nextCursor = "";
      }
      else more.dataset.nextCursor = String(body.next_cursor);
    } catch (error) {
      if (requestId === moreRequest && goalId() === currentGoal) showError?.(messageOf(error) || globalThis.t.text("goals.event-document-client.could-not-load-earlier-records-please-retry"));
    } finally { more.disabled = false; }
  };
  const removeTypeField = (button: HTMLElement) => {
    const form = button.closest("form");
    if ((form?.querySelectorAll(".type-field-row").length ?? 0) < 2) {
      showStatusText(form?.querySelector<HTMLElement>("[data-form-status]") ?? null, globalThis.t.text("goals.event-document-client.keep-least-one-field"));
      return;
    }
    button.closest(".type-field-row")?.remove();
  };
  const toggleTimelineItem = (article: HTMLElement, item: HTMLElement) => {
    const sheet = article.querySelector<HTMLElement>("[data-event-sheet]");
    if (item.getAttribute("aria-expanded") === "true" && sheet && !sheet.hidden && !reading.form && !reading.reader) {
      selectedRequest += 1;
      item.setAttribute("aria-expanded", "false");
      item.setAttribute("aria-current", "false");
      reading.item = "";
      sheet.hidden = true;
    } else void loadEventBody(item, true);
  };
  const stepEvent = (direction: number) => {
    const items = timelineItems().filter((item) => !item.hidden);
    const current = items.findIndex((item) => item.getAttribute("aria-current") === "true");
    const next = items[Math.min(items.length - 1, Math.max(0, current + direction))];
    if (next) void loadEventBody(next, true);
  };

  /** The click handlers, first match wins: each names the element it acts on. */
  const clicks: ReadonlyArray<readonly [string, (target: HTMLElement, article: HTMLElement) => void]> = [
    ["[data-timeline-item]", (item, article) => toggleTimelineItem(article, item)],
    ["[data-retry-event]", () => { void locateHistory(reading.item); }],
    ["[data-action=timeline]", () => showDetail(false)],
    ["[data-event-back]", () => {
      reading.reader = "";
      reading.form = "";
      hidePanels(true);
    }],
    ["[data-previous-event]", () => stepEvent(-1)],
    ["[data-next-event]", () => stepEvent(1)],
    ["[data-retry-read]", (button) => { void retryRead(button); }],
    ["[data-conflict-retry]", (_button, article) => { void retryAgainstCurrent(article); }],
    ["[data-load-more-timeline]", (button) => { if (button instanceof HTMLButtonElement) void loadMore(button); }],
    // The requirements are the platform's: 「逐项审阅」 asks the page for its requirement column on this Goal.
    ["[data-acceptance-review]", (review) => {
      let subject: unknown = null;
      try { subject = JSON.parse(review.dataset.acceptanceReview || "null"); } catch { /* A subject the page did not write opens nothing. */ }
      if (subject) document.dispatchEvent(new CustomEvent("molis:acceptance-review-requested", { detail: { subject } }));
    }],
    ["[data-locate-event]", (locate) => {
      if (locate.dataset.locateEvent) void locateHistory(locate.dataset.locateEvent);
      else if (locate.dataset.boundType) showForm("report", locate.dataset.boundType);
    }],
    ["[data-reconcile-deliverables]", (reconcile) => {
      const form = reconcile.closest<HTMLElement>("[data-event-form]");
      if (!form || !(reconcile instanceof HTMLButtonElement)) return;
      reconcile.disabled = true;
      void loadDeliverables(form, true).finally(() => { reconcile.disabled = false; });
    }],
    ["[data-event-reader]", (reader) => showForm(reader.dataset.eventReader || "", undefined, reader)],
    ["[data-event-form-open]", (open) => showForm(open.dataset.eventFormOpen || "", open.dataset.typeId, open)],
    ["[data-event-report]", (report) => showForm("report", report.dataset.eventReport, report)],
    ["[data-add-type-field]", (add) => { add.closest("form")?.querySelector("[data-type-fields]")?.append(typeFieldRow()); }],
    ["[data-remove-type-field]", (remove) => removeTypeField(remove)],
  ];
  const onClick = (event: MouseEvent) => {
    const target = elementOf(event);
    const article = target?.closest<HTMLElement>("[data-goal-event-document]");
    if (!target || !article || article !== root()) return;
    if (article.querySelector('[data-event-form][aria-busy="true"]')) {
      event.preventDefault();
      return;
    }
    for (const [selector, act] of clicks) {
      const hit = target.closest<HTMLElement>(selector);
      if (hit) {
        act(hit, article);
        return;
      }
    }
  };
  const onSubmit = (event: SubmitEvent) => {
    const form = elementOf(event)?.closest<HTMLFormElement>("[data-event-form]");
    if (!form || form.closest("[data-goal-event-document]") !== root()) return;
    event.preventDefault();
    void submitForm(form);
  };
  const onKeydown = (event: KeyboardEvent) => {
    const target = elementOf(event);
    if (!target) return;
    if (event.key === "Escape") {
      const menu = target.closest<HTMLDetailsElement>("[data-record-menu][open], .goal-more[open]");
      if (menu) {
        event.preventDefault();
        menu.open = false;
        menu.querySelector<HTMLElement>("summary")?.focus();
        return;
      }
    }
    if (!target.closest("[data-event-timeline]")) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (target.matches("input, textarea, select")) return;
    const items = timelineItems().filter((item) => !item.hidden);
    const current = items.findIndex((item) => item.getAttribute("aria-current") === "true");
    const next = items[event.key === "ArrowDown" ? Math.min(items.length - 1, current + 1) : Math.max(0, current - 1)];
    if (next) {
      event.preventDefault();
      void loadEventBody(next, true);
      next.focus();
    }
  };
  const onChange = (event: Event) => {
    const input = elementOf(event);
    const form = input?.closest<HTMLFormElement>("[data-event-form]");
    if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement) || !form || form.closest("[data-goal-event-document]") !== root()) return;
    clearHold(form);
    if (input instanceof HTMLInputElement && input.name === "effect" && input.checked) {
      const opposite = Object.hasOwn(OPPOSITE_EFFECT, input.value) ? OPPOSITE_EFFECT[input.value] : undefined;
      const other = opposite ? form.querySelector<HTMLInputElement>('[name="effect"][value="' + opposite + '"]') : null;
      if (other) other.checked = false;
    }
    if (form.dataset.eventForm === "concern" && (input.name === "concern_id" || input.name === "action" || input.name === "cited_decision_id")) syncConcernForm(form, input.name);
  };

  // The objects a concern cites carry only kind and id: each is named by the surface that opens its kind (the plugins' own
  // declarations), and then opens through the workbench like any other item (an item side view first). A kind no surface opens stays text.
  const lifecycle = new AbortController();
  let wasConnected = documentPane.isConnected;
  let observer: MutationObserver | null = null;
  const dispose = () => {
    lifecycle.abort();
    observer?.disconnect();
    observer = null;
  };
  const keepAlive = () => {
    if (documentPane.isConnected) {
      wasConnected = true;
      return true;
    }
    if (wasConnected) {
      dispose();
      return false;
    }
    return true;
  };

  const nameCited = createCitedSurfaceNamer(documentPane, route, keepAlive);

  document.addEventListener("click", (event) => {
    if (!keepAlive()) return;
    const target = elementOf(event);
    root()?.querySelectorAll<HTMLDetailsElement>("[data-record-menu][open], .goal-more[open]").forEach((menu) => {
      if (!target || !menu.contains(target)) menu.open = false;
    });
  }, { signal: lifecycle.signal });
  documentPane.addEventListener("click", onClick, { signal: lifecycle.signal });
  documentPane.addEventListener("change", onChange, { signal: lifecycle.signal });
  documentPane.addEventListener("input", (event) => clearHold(elementOf(event)?.closest<HTMLElement>("[data-event-form]")), { signal: lifecycle.signal });
  documentPane.addEventListener("submit", onSubmit, { signal: lifecycle.signal });
  documentPane.addEventListener("keydown", onKeydown, { signal: lifecycle.signal });
  documentPane.addEventListener("toggle", (event) => {
    const target = elementOf(event);
    if (target instanceof HTMLDetailsElement && target.matches("[data-goal-info]") && target.closest("[data-goal-event-document]") === root()) reading.infoOpen = target.open;
  }, { capture: true, signal: lifecycle.signal });
  window.addEventListener("resize", () => {
    if (!keepAlive()) return;
    requestAnimationFrame(() => {
      if (!keepAlive()) return;
      syncPanelPresence();
    });
  }, { signal: lifecycle.signal });
  observer = new MutationObserver(nameCited);
  observer.observe(documentPane, { childList: true, subtree: true });

  return {
    dispose,
    openEventReader(name: string) { showForm(name); },
    bindGoalEventDocument(restore?: EventRestore | null) {
      const article = root();
      const current = goalId();
      const restoreForGoal = restore && (!restore.goal || restore.goal === current) ? restore : null;
      if (reading.goal !== current) resetReading(current);
      const info = article?.querySelector<HTMLDetailsElement>("[data-goal-info]");
      if (info && !info.dataset.initialized) {
        info.open = restoreForGoal?.infoOpen ?? reading.infoOpen ?? !narrow();
        info.dataset.initialized = "true";
      }
      if (restoreForGoal?.item) reading.item = restoreForGoal.item;
      if (restoreForGoal?.filter) reading.filter = restoreForGoal.filter;
      if (restoreForGoal?.reader) reading.reader = restoreForGoal.reader;
      if (restoreForGoal?.form !== undefined) reading.form = restoreForGoal.form;
      hidePanels();
      timelineItems().forEach((node) => applyLaneFilter(node, reading.filter || "all"));
      if (reading.item) timelineItems().forEach((node) => node.setAttribute("aria-current", String(node.dataset.timelineItem === reading.item)));
      if (reading.form) showForm(reading.form);
      else if (reading.reader) showForm(reading.reader);
      else if (reading.item) void locateHistory(reading.item);
    },
  };
}
