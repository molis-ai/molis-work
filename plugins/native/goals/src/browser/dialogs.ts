import { GOALS_PLUGIN_ID } from "../identity.js";
import { GOALS_PLUGIN_API } from "../plugin-api.js";
import { elementOf, messageOf } from "./dom.js";
import type { Route } from "./types.js";

export interface DialogsHost {
  readonly dialog: HTMLDialogElement | null;
  readonly form: HTMLFormElement | null;
  readonly route: Route;
  readonly refreshBoard: (force?: boolean) => Promise<unknown> | unknown;
  readonly updateRelationPreviews: () => void;
  readonly clearCollectionUiState: () => void;
  readonly clearCurrentGoalUiState: () => void;
  readonly navigate: (url: string) => void;
}

/** What the create form held when the board was drawn again, so the redraw keeps it. */
export interface CreateDraft {
  readonly values: Record<string, string | string[]>;
  readonly focus: { name: string; value: string; start: number | null; end: number | null; direction: "forward" | "backward" | "none" | null } | null;
}

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement;
const isControl = (item: Element): item is FormControl => item instanceof HTMLInputElement || item instanceof HTMLSelectElement
  || item instanceof HTMLTextAreaElement || item instanceof HTMLButtonElement;
const textField = (form: HTMLFormElement | null, name: string) => {
  const item = form?.elements.namedItem(name);
  return item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement ? item : null;
};

/** The create and trash dialogs of the Goals page. */
export function dialogsClient(host: DialogsHost) {
  const { dialog, form, route, refreshBoard, updateRelationPreviews, clearCollectionUiState, clearCurrentGoalUiState, navigate } = host;
  const formError = document.querySelector<HTMLElement>("[data-create-error]");
  const trashDialog = document.querySelector<HTMLDialogElement>("[data-goal-trash-dialog]");
  const trashForm = document.querySelector<HTMLFormElement>("[data-goal-trash-form]");
  const trashError = document.querySelector<HTMLElement>("[data-goal-trash-error]");
  const trashSubmit = document.querySelector<HTMLButtonElement>("[data-goal-trash-submit]");
  const trashReason = () => textField(trashForm, "reason");
  let trashIntent: { goalId: string; goalTitle: string; trashed: boolean } | null = null;
  let trashTrigger: HTMLElement | null = null;
  let trashPending = false;
  const setText = (selector: string, text: string) => {
    const node = trashDialog?.querySelector(selector);
    if (node) node.textContent = text;
  };
  const setTrashPending = (pending: boolean) => {
    trashPending = pending;
    trashForm?.setAttribute("aria-busy", String(pending));
    if (trashSubmit) {
      trashSubmit.disabled = pending;
      trashSubmit.textContent = pending ? globalThis.t.text("goals.dialogs-client.saving") : globalThis.t.text(trashIntent?.trashed ? "goals.dialogs-client.move-trash" : "goals.dialogs-client.restore-goal-tree");
    }
    const reason = trashReason();
    if (reason) reason.readOnly = pending;
    trashDialog?.querySelectorAll<HTMLButtonElement>("[data-close-goal-trash]").forEach((button) => { button.disabled = pending; });
  };
  trashDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeGoalTrashDialog();
  });
  // A close that did not go through closeGoalTrashDialog leaves no stale trigger behind; the event may land after a
  // reopen, so a dialog that is open again keeps the trigger its own open just set.
  trashDialog?.addEventListener("close", () => {
    if (!trashDialog.open) trashTrigger = null;
  });
  // Whichever way the dialog closes short of a confirmed trash or restore, the close binds its own return point, and
  // focus goes back to it once the board's refresh has settled: to it while it is still shown, else to the page's
  // visible create entry — and only while the person has not already settled focus somewhere visible of their own and
  // no dialog (a reopened trash dialog, the create dialog) holds focus. A stale hidden remnant (the folded-away entry
  // the menu hides, the old dialog's own focus) does not block the way back. A confirmed trash or restore navigates.
  // Shown is more than a box: the focus a closing dialog hands back can still carry geometry from menu content its
  // fold has already closed, so every closed details ancestor decides — only a detail's own first summary line shows.
  // An inert subtree or a disabled control is not a way back either, and none of this opens a hidden page.
  const shown = (element: Element | null | undefined): HTMLElement | null => {
    if (!(element instanceof HTMLElement) || !element.isConnected || (element as Partial<HTMLButtonElement>).disabled
      || element.getAttribute?.("aria-disabled") === "true"
      || !element.getClientRects().length || element.closest("[hidden],[inert]")) return null;
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      if (!(ancestor instanceof HTMLDetailsElement) || ancestor.open) continue;
      const summary = [...ancestor.children].find((child) => child.tagName === "SUMMARY");
      if (!summary || !summary.contains(element)) return null;
    }
    return element;
  };
  const settleTrashFocus = (back: HTMLElement | null, goalId: string) => {
    if (!back || trashDialog?.open || document.querySelector("dialog[open]")) return;
    const current = document.activeElement;
    // Unset focus — none, the body, the root — is not a choice the person made: the way back stays open.
    const chosen = current instanceof Element && current !== document.body && current !== document.documentElement
      && current !== back && shown(current);
    if (chosen) return;
    // A redrawn board may have taken the saved return point: the same Goal's own info summary is the way back on a
    // Goal's page (the package's own convention when an original entry is lost), and a list page without one falls
    // to a genuinely usable create entry.
    const info = goalId ? document.querySelector('[data-goal-view="' + CSS.escape(goalId) + '"] [data-goal-info] > summary') : null;
    (shown(back) || shown(info) || shown(document.querySelector("[data-open-create]")))?.focus({ preventScroll: true });
  };
  const openGoalTrashDialog = (trigger: HTMLElement, trashed: boolean) => {
    if (!trashDialog || !trashForm || trashPending) return;
    const goalId = String(trigger.dataset.goalId || "").trim();
    const goalTitle = String(trigger.dataset.goalTitle || goalId).trim();
    if (!goalId) return;
    // The way back is a point that is shown: the menu summary the entry folded out of, else the entry itself —
    // never a button that closing the menu hides. Only the originating goal menu is the menu; a direct restore
    // entry outside one never closes an outer fold such as the Goal information disclosure.
    const menu = trigger.closest<HTMLDetailsElement>("details.goal-more");
    trashTrigger = shown(menu && menu.querySelector(":scope > summary")) || shown(trigger);
    trashIntent = { goalId, goalTitle, trashed };
    if (trashError) {
      trashError.hidden = true;
      trashError.textContent = "";
    }
    const reason = trashReason();
    if (reason) reason.value = "";
    setText("[data-goal-trash-title]", trashed ? globalThis.t.text("goals.dialogs-client.move-trash") : globalThis.t.text("goals.dialogs-client.restore-goal"));
    setText("[data-goal-trash-description]", trashed
      ? globalThis.t.text("goals.dialogs-client.confirm-goal-reason-action")
      : globalThis.t.text("goals.dialogs-client.confirm-restoring-goal-everyday-goal-tree"));
    setText("[data-goal-trash-target-title]", goalTitle);
    setText("[data-goal-trash-target-id]", goalId);
    setText("[data-goal-trash-note]", trashed
      ? globalThis.t.text("goals.dialogs-client.can-be-undone-goal-history-kept-currently-active")
      : globalThis.t.text("goals.dialogs-client.restore-does-not-create-new-goal-does-not"));
    setText("[data-goal-trash-reason-label]", trashed ? globalThis.t.text("goals.dialogs-client.why-move") : globalThis.t.text("goals.dialogs-client.why-restore"));
    if (reason) reason.placeholder = trashed
      ? globalThis.t.text("goals.dialogs-client.say-why-goal-should-leave-everyday-list-now")
      : globalThis.t.text("goals.dialogs-client.say-why-goal-should-come-back-now");
    if (trashSubmit) {
      trashSubmit.classList.toggle("mw-btn--danger", trashed);
      trashSubmit.classList.toggle("mw-btn--primary", !trashed);
      trashSubmit.textContent = trashed ? globalThis.t.text("goals.dialogs-client.move-trash") : globalThis.t.text("goals.dialogs-client.restore-goal-tree");
    }
    // The menu that offered this action must not stay open: the host rightly reads an open menu as an active
    // interaction and skips the board refresh a close settles on. Only the nearest menu fold closes — the Goal
    // information fold above it stays as it is — and its summary, the visible way back, takes the focus so the
    // dialog's native return lands there too.
    if (menu && menu.open) {
      menu.open = false;
      shown(menu.querySelector(":scope > summary"))?.focus({ preventScroll: true });
    }
    trashDialog.showModal();
    if (!matchMedia("(max-width: 760px)").matches) {
      requestAnimationFrame(() => trashReason()?.focus());
    }
  };

  const closeGoalTrashDialog = () => {
    if (!trashDialog?.open || trashPending) return;
    // This close binds its own return point and Goal: a dialog opened before its refresh settles neither inherits
    // nor clears them.
    const back = trashTrigger;
    const goalId = String(trashIntent?.goalId || "");
    trashTrigger = null;
    trashDialog.close();
    trashIntent = null;
    void Promise.resolve(refreshBoard()).finally(() => settleTrashFocus(back, goalId));
  };

  const submitGoalTrashForm = async () => {
    if (!trashIntent || !trashForm || !trashError || !trashSubmit || trashPending) return;
    const reason = String(new FormData(trashForm).get("reason") || "").trim();
    if (!reason) {
      trashError.textContent = globalThis.t.text("goals.dialogs-client.give-reason-action");
      trashError.hidden = false;
      trashReason()?.focus();
      return;
    }
    trashError.hidden = true;
    const intent = { ...trashIntent };
    setTrashPending(true);
    let redirecting = false;
    try {
      const result = await molisWorkRequest<{ status?: string }>(route(GOALS_PLUGIN_API + "/goals/" + encodeURIComponent(intent.goalId) + "/trash"), {
        method: "POST",
        body: {
          trashed: intent.trashed,
          reason,
          user_confirmed: true,
        },
        fallback: globalThis.t.text("goals.dialogs-client.action-failed"),
      });
      const expected = intent.trashed
        ? ["trashed", "already_trashed"]
        : ["restored", "already_active"];
      if (!expected.includes(String(result?.status))) throw new Error(globalThis.t.text("goals.dialogs-client.molis-work-returned-unrecognized-trash-state"));
      redirecting = true;
      // Navigation replaces the page, so the trigger is dropped here and no focus is restored on the way out.
      trashTrigger = null;
      trashDialog?.close();
      clearCollectionUiState();
      navigate(route((intent.trashed ? "/trash/goals/" : "/goals/") + encodeURIComponent(intent.goalId)));
    } catch (error) {
      trashError.textContent = messageOf(error) || globalThis.t.text("goals.dialogs-client.action-failed-check-try-again");
      trashError.hidden = false;
    } finally {
      if (!redirecting) setTrashPending(false);
    }
  };

  const composeExample = dialog?.querySelector<HTMLElement>("[data-create-example]");
  const composeOutcome = dialog?.querySelector<HTMLElement>(".create-compose-outcome");
  const titleField = () => textField(form, "title");
  const syncExample = () => {
    if (composeExample) composeExample.hidden = Boolean(titleField()?.value.trim());
  };
  // An HTML maxlength counts UTF-16 units and stopped a title of two-unit characters at 60 while the route counts 120 characters;
  // the box is cut here, to whole characters, before the form reads it.
  const capComposeTitle = () => {
    const title = titleField();
    if (!title || title.value.length <= 120) return;
    const chars = [...title.value];
    if (chars.length > 120) title.value = chars.slice(0, 120).join("");
  };
  const prepareCompose = () => {
    if (composeOutcome) {
      composeOutcome.style.height = "";
      (window as Window & { molisFit?: (node: HTMLElement) => void }).molisFit?.(composeOutcome);
    }
    syncExample();
  };
  titleField()?.addEventListener("input", () => {
    capComposeTitle();
    syncExample();
  });

  const readCreateDraft = (): CreateDraft | null => {
    if (!form) return null;
    const values: Record<string, string | string[]> = {};
    [...form.elements].filter(isControl).forEach((control) => {
      if (!control.name) return;
      if (control instanceof HTMLInputElement && control.type === "checkbox") {
        const list = Array.isArray(values[control.name]) ? values[control.name] as string[] : [];
        values[control.name] = list;
        if (control.checked) list.push(control.value);
        return;
      }
      values[control.name] = control.value;
    });
    const active = document.activeElement;
    return {
      values,
      focus: (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) && form.contains(active) && active.name
        ? { name: active.name, value: active.value, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }
        : null,
    };
  };

  const applyCreateDraft = (draft: CreateDraft | null) => {
    if (!form || !draft) return;
    [...form.elements].filter(isControl).forEach((control) => {
      if (!control.name || !(control.name in draft.values)) return;
      const saved = draft.values[control.name];
      if (control instanceof HTMLInputElement && control.type === "checkbox") {
        control.checked = Array.isArray(saved) && saved.includes(control.value);
        return;
      }
      if (typeof saved === "string" && control.value !== saved) control.value = saved;
    });
    updateRelationPreviews();
    const focus = draft.focus;
    if (!focus) return;
    const focused = [...form.elements].filter(isControl).find((control) =>
      control.name === focus.name &&
      (!(control instanceof HTMLInputElement && control.type === "checkbox") || control.value === focus.value)
    );
    if (!focused) return;
    focused.focus({ preventScroll: true });
    if ((focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) && focus.start != null) {
      focused.setSelectionRange(focus.start, focus.end, focus.direction ?? undefined);
    }
  };

  const refreshCreateChoices = (nextDialog: Element, draft: unknown) => {
    const parent = form?.elements.namedItem("parent_goal_id");
    const nextParent = nextDialog.querySelector('[name="parent_goal_id"]');
    if (parent instanceof Element && nextParent) parent.innerHTML = nextParent.innerHTML;
    const choices = form?.querySelector(".goal-choice-list"), nextChoices = nextDialog.querySelector(".goal-choice-list");
    if (choices && nextChoices) choices.innerHTML = nextChoices.innerHTML;
    applyCreateDraft(draft as CreateDraft | null);
  };
  const openCreate = () => {
    if (!dialog || !form || dialog.open) return;
    if (formError) formError.hidden = true;
    dialog.showModal();
    updateRelationPreviews();
    prepareCompose();
    requestAnimationFrame(() => titleField()?.focus());
  };
  document.addEventListener("molis-work:select-item", (event) => {
    const detail = (event as CustomEvent<{ panel?: string } | undefined>).detail;
    if (detail?.panel === "create-dialog" && elementOf(event)?.closest?.('[data-plugin-owner="' + GOALS_PLUGIN_ID + '"]')) openCreate();
  }, true);
  const handleGoalDialogClick = (target: Element) => {
    if (target.closest("[data-open-create]")) {
      openCreate();
      return true;
    }
    if (target.closest("[data-close-create]")) {
      dialog?.close();
      void refreshBoard();
      return true;
    }
    const trashAction = target.closest<HTMLElement>("[data-open-goal-trash]");
    if (trashAction) {
      openGoalTrashDialog(trashAction, true);
      return true;
    }
    const restoreAction = target.closest<HTMLElement>("[data-open-goal-restore]");
    if (restoreAction) {
      openGoalTrashDialog(restoreAction, false);
      return true;
    }
    if (target.closest("[data-close-goal-trash]")) {
      closeGoalTrashDialog();
      return true;
    }
    return false;
  };
  const handleGoalTrashSubmit = (submittedForm: EventTarget | null, event: Event) => {
    if (!(submittedForm instanceof Element) || !submittedForm.closest("[data-goal-trash-form]")) return null;
    event.preventDefault();
    return submitGoalTrashForm();
  };
  const bindGoalCreateEvents = () => {
    form?.addEventListener("change", updateRelationPreviews);
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submit) submit.disabled = true;
      if (formError) formError.hidden = true;
      const values = new FormData(form);
      const payload = {
        goal_id: String(values.get("goal_id") || "").trim() || undefined,
        title: String(values.get("title") || "").trim(),
        outcome: String(values.get("outcome") || "").trim(),
        why: String(values.get("why") || "").trim(),
        business_logic: String(values.get("business_logic") || "").trim(),
        priority: Number(values.get("priority") || 0),
        parent_goal_id: String(values.get("parent_goal_id") || "").trim() || undefined,
        dependency_goal_ids: values.getAll("dependency_goal_ids").map(String),
        acceptance_criteria: String(values.get("acceptance_criteria") || "").split("\n").map((line) => line.trim()).filter(Boolean),
      };
      try {
        const key = form.dataset.idempotencyKey || (globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random()));
        form.dataset.idempotencyKey = key;
        const result = await molisWorkRequest<{ goal_path: string }>(route(GOALS_PLUGIN_API + "/goals"), {
          method: "POST",
          body: { ...payload, idempotency_key: key },
          fallback: globalThis.t.text("goals.dialogs-client.create-failed"),
        });
        delete form.dataset.idempotencyKey;
        clearCurrentGoalUiState();
        // The reply names the Goal inside Goals' own pages; the project prefix is the page's to join (BL-386).
        navigate(route(result.goal_path));
      } catch (error) {
        if (formError) {
          formError.textContent = messageOf(error) || globalThis.t.text("goals.dialogs-client.create-failed-retry");
          formError.hidden = false;
        }
        if (submit) submit.disabled = false;
      }
    });
  };
  const handleGoalDialogEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && dialog?.open) {
      dialog.close();
      void refreshBoard();
    }
    if (event.key === "Escape" && trashDialog?.open) closeGoalTrashDialog();
  };
  return { readCreateDraft, refreshCreateChoices, openCreate, handleGoalDialogClick, handleGoalTrashSubmit,
    bindGoalCreateEvents, handleGoalDialogEscape };
}
