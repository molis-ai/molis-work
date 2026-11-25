import { GOALS_PLUGIN_API } from "../plugin-api.js";
import { relationWordKey } from "../relation-words.js";
import { enabledControls, failureOf, named, selectedOption } from "./dom.js";
import type { Route } from "./types.js";

export interface RelationHost {
  readonly form: HTMLFormElement | null;
  readonly route: Route;
  readonly refreshBoard: (force?: boolean) => Promise<unknown>;
  readonly requireFormFacts: (form: HTMLFormElement, errorBox: HTMLElement | null) => boolean;
  readonly requireDecisionText: (form: Element, errorBox: HTMLElement, fieldName: string, message: string) => boolean;
  readonly showFactorReceipt: (factor: string, title: string, message: string) => void;
  readonly humanDecisionError: (message: string | undefined, fallback: string) => string;
}

type RelationIntent = "needs" | "belongs" | "enables" | "contains";
const INTENTS: Readonly<Record<RelationIntent, readonly [string, string]>> = {
  needs: ["outgoing", "depends_on"],
  belongs: ["outgoing", "part_of"],
  enables: ["incoming", "depends_on"],
  contains: ["incoming", "part_of"],
};
const isIntent = (value: string): value is RelationIntent => Object.hasOwn(INTENTS, value);

/** Relations between Goals: previews, forms and their submission. */
export function relationClient(host: RelationHost) {
  const { form, route, refreshBoard, requireFormFacts, requireDecisionText, showFactorReceipt, humanDecisionError } = host;
  // A write the Host never answered: the person's input is still in the form.
  const unreachable = (error: unknown) => error instanceof TypeError || failureOf(error).code === "ui_host.outcome_unknown";
  const setValue = (relationForm: HTMLFormElement, name: string, value: string) => {
    const control = named(relationForm, name);
    if (control) control.value = value;
  };
  const updateRelationPreviews = () => {
    if (!form) return;
    const parent = selectedOption(form, "parent_goal_id");
    const parentPreview = form.querySelector("[data-parent-preview]");
    if (parentPreview) {
      parentPreview.textContent = parent?.value
        ? globalThis.t.text("goals.relation-client.preview-new-goal-part-name-tree-placement-does", { name: parent.dataset.goalName || parent.textContent })
        : globalThis.t.text("goals.relation-client.preview-new-goal-will-appear-tree-its-own");
    }
    const dependencies = [...form.querySelectorAll<HTMLInputElement>('[name="dependency_goal_ids"]:checked')];
    const dependencyPreview = form.querySelector("[data-dependency-preview]");
    if (dependencyPreview) {
      const names = dependencies.map((input) => globalThis.t.text("common.punctuation.quoted", { value: input.dataset.goalName || input.value }));
      dependencyPreview.textContent = names.length
        ? globalThis.t.text("goals.relation-client.preview-new-goal-depends-names-new-goal-cannot", { names: names.join(globalThis.t.text("common.list.separator")) })
        : globalThis.t.text("goals.relation-client.preview-there-no-execution-prerequisite-goal-can-move");
    }
  };

  const paintRelationFormPreview = (relationForm: HTMLFormElement) => {
    const preview = relationForm.querySelector("[data-relation-live-preview]");
    const type = selectedOption(relationForm, "type");
    const target = selectedOption(relationForm, "target_goal_id");
    const direction = named(relationForm, "direction")?.value || "outgoing";
    if (!preview || !type || !target) return;
    const currentName = relationForm.dataset.currentGoalName || relationForm.dataset.goalId;
    const targetName = target.dataset.goalName || target.textContent;
    const left = direction === "outgoing" ? currentName : targetName;
    const right = direction === "outgoing" ? targetName : currentName;
    const label = type.value ? globalThis.t.text(relationWordKey(type.value, "out")) : type.textContent;
    const strong = preview.querySelector("strong"), copy = preview.querySelector("p");
    if (strong) strong.textContent = left + " → " + label + " → " + right;
    if (copy) copy.textContent = type.value ? globalThis.t.text(relationWordKey(type.value, "description"))
      : globalThis.t.text("goals.relation-client.direction-and-reason-enter-history");
  };

  const updateRelationFormPreview = (relationForm: HTMLFormElement | null) => {
    if (!relationForm) return;
    const intent = named(relationForm, "relation_intent")?.value || "other";
    if (isIntent(intent)) {
      setValue(relationForm, "direction", INTENTS[intent][0]);
      setValue(relationForm, "type", INTENTS[intent][1]);
    }
    paintRelationFormPreview(relationForm);
  };

  const updateAllRelationFormPreviews = () => {
    document.querySelectorAll<HTMLFormElement>("[data-relation-form]").forEach(updateRelationFormPreview);
  };
  const languageAbort = new AbortController();
  window.addEventListener("pagehide", () => languageAbort.abort(), { once: true });
  document.addEventListener("molis-work:language-changed", () => {
    document.querySelectorAll<HTMLFormElement>("[data-relation-form]").forEach(paintRelationFormPreview);
  }, { signal: languageAbort.signal });

  const handleGoalRelationChange = (changed: Element) => {
    const relationForm = changed.closest<HTMLFormElement>("[data-relation-form]");
    if (!relationForm) return;
    const name = changed.getAttribute("name"), value = changed instanceof HTMLInputElement || changed instanceof HTMLSelectElement ? changed.value : "";
    if ((name === "direction" || name === "type") && named(relationForm, "relation_intent")) {
      setValue(relationForm, "relation_intent", "other");
    } else if (name === "relation_intent" && value === "other") {
      setValue(relationForm, "direction", "");
      setValue(relationForm, "type", "");
      const advanced = relationForm.querySelector<HTMLDetailsElement>("[data-progressive-fields]");
      if (advanced) advanced.open = true;
    }
    updateRelationFormPreview(relationForm);
  };
  const handleGoalRelationDisclosureClick = (target: Element) => {
    const openRelationDeactivate = target.closest<HTMLElement>("[data-relation-deactivate-open]");
    if (openRelationDeactivate) {
      const record = openRelationDeactivate.closest("[data-relation-id]");
      const deactivateForm = record?.querySelector<HTMLElement>("[data-relation-deactivate-form]");
      if (!deactivateForm) return true;
      deactivateForm.hidden = false;
      openRelationDeactivate.hidden = true;
      openRelationDeactivate.setAttribute("aria-expanded", "true");
      deactivateForm.querySelector("textarea")?.focus();
      return true;
    }
    const cancelRelationDeactivate = target.closest("[data-relation-deactivate-cancel]");
    if (cancelRelationDeactivate) {
      if (cancelRelationDeactivate.closest("form")?.getAttribute("aria-busy") === "true") return true;
      const record = cancelRelationDeactivate.closest(".relation-record");
      const deactivateForm = record?.querySelector<HTMLElement>("[data-relation-deactivate-form]");
      const openButton = record?.querySelector<HTMLElement>("[data-relation-deactivate-open]");
      if (deactivateForm) deactivateForm.hidden = true;
      if (openButton) {
        openButton.hidden = false;
        openButton.setAttribute("aria-expanded", "false");
        openButton.focus();
      }
      return true;
    }
    return false;
  };
  const submitRelation = async (relationForm: HTMLFormElement, event: Event) => {
    event.preventDefault();
    if (relationForm.getAttribute("aria-busy") === "true") return;
    const submit = relationForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const errorBox = relationForm.querySelector<HTMLElement>("[data-relation-error]");
    if (requireFormFacts(relationForm, errorBox) || !submit || !errorBox) return;
    const values = new FormData(relationForm);
    const relationSummary = relationForm.querySelector("[data-relation-live-preview] strong")?.textContent?.trim() || globalThis.t.text("goals.relation-client.current-goal-relationship");
    const submitLabel = submit.textContent;
    relationForm.setAttribute("aria-busy", "true");
    const controls = enabledControls(relationForm);
    controls.forEach(control => { control.disabled = true; });
    submit.textContent = globalThis.t.text("goals.relation-client.saving");
    errorBox.hidden = true;
    try {
      await molisWorkRequest(route(GOALS_PLUGIN_API + "/goals/" + encodeURIComponent(relationForm.dataset.goalId || "") + "/relations"), {
        method: "POST",
        body: {
          idempotency_key: relationForm.dataset.idempotencyKey ||= crypto.randomUUID(),
          direction: values.get("direction"),
          type: values.get("type"),
          target_goal_id: values.get("target_goal_id"),
          reason: String(values.get("reason") || "").trim(),
        },
        fallback: globalThis.t.text("goals.relation-client.create-failed"),
      });
      await refreshBoard(true);
      showFactorReceipt(
        "relations",
        globalThis.t.text("goals.relation-client.relationship-created"),
        globalThis.t.text("goals.relation-client.created-relation-exact-direction-reason-saved-full-record", { relation: relationSummary }),
      );
    } catch (error) {
      errorBox.textContent = humanDecisionError(unreachable(error) ? globalThis.t.text("goals.relation-client.could-not-reach-local-service-input-kept-please") : failureOf(error).message, globalThis.t.text("goals.relation-client.could-not-create-relationship-check-goal-direction-reason"));
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = submitLabel;
    } finally {
      relationForm.removeAttribute("aria-busy");
      controls.forEach(control => { control.disabled = false; });
    }
  };
  const submitDeactivation = async (relationDeactivateForm: HTMLFormElement, event: Event) => {
    event.preventDefault();
    if (relationDeactivateForm.getAttribute("aria-busy") === "true") return;
    const submit = relationDeactivateForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const errorBox = relationDeactivateForm.querySelector<HTMLElement>("[data-relation-deactivate-error]");
    if (!errorBox || requireDecisionText(relationDeactivateForm, errorBox, "reason", "goals.relation-client.deactivate-reason-required")) return;
    const reason = String(new FormData(relationDeactivateForm).get("reason") || "").trim();
    const relatedGoal = relationDeactivateForm.closest(".relation-record")?.querySelector(".relation-copy strong")?.textContent?.trim() || globalThis.t.text("goals.relation-client.other-goal");
    relationDeactivateForm.setAttribute("aria-busy", "true");
    const controls = enabledControls(relationDeactivateForm);
    controls.forEach(control => { control.disabled = true; });
    errorBox.hidden = true;
    try {
      await molisWorkRequest(route(GOALS_PLUGIN_API + "/relations/" + encodeURIComponent(relationDeactivateForm.dataset.relationId || "") + "/deactivate"), {
        method: "POST",
        body: { reason, idempotency_key: relationDeactivateForm.dataset.idempotencyKey ||= crypto.randomUUID() },
        fallback: globalThis.t.text("goals.relation-client.remove-failed"),
      });
      await refreshBoard(true);
      showFactorReceipt(
        "relations",
        globalThis.t.text("goals.relation-client.relationship-removed"),
        globalThis.t.text("goals.relation-client.relationship-goal-no-longer-active-its-original-direction", { goal: relatedGoal }),
      );
    } catch (error) {
      errorBox.textContent = humanDecisionError(unreachable(error) ? globalThis.t.text("goals.relation-client.could-not-reach-local-service-input-kept-please") : failureOf(error).message, globalThis.t.text("goals.relation-client.could-not-remove-relationship-check-reason-try-again"));
      errorBox.hidden = false;
      if (submit) submit.disabled = false;
    } finally {
      relationDeactivateForm.removeAttribute("aria-busy");
      controls.forEach(control => { control.disabled = false; });
    }
  };
  const handleGoalRelationSubmit = (submittedForm: EventTarget | null, event: Event) => {
    if (!(submittedForm instanceof Element)) return null;
    const relationForm = submittedForm.closest<HTMLFormElement>("[data-relation-form]");
    if (relationForm) return submitRelation(relationForm, event);
    const deactivateForm = submittedForm.closest<HTMLFormElement>("[data-relation-deactivate-form]");
    return deactivateForm ? submitDeactivation(deactivateForm, event) : null;
  };
  return { updateRelationPreviews, updateAllRelationFormPreviews, handleGoalRelationChange,
    handleGoalRelationDisclosureClick, handleGoalRelationSubmit };
}
