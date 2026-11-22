/** The event forms of a Goal's document: which route each one writes to, and the body it sends. */

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const q = <T extends Element = Field>(node: ParentNode, selector: string) => node.querySelector<T>(selector);

/** Marks the field a refusal names, or clears every mark when `fieldId` is empty. */
export const fieldError = (form: HTMLFormElement, fieldId: string | undefined, message: string) => {
  form.querySelectorAll<HTMLElement>("[data-field-error]").forEach((node) => {
    node.hidden = true;
    node.textContent = "";
  });
  if (!fieldId) return;
  const node = q<HTMLElement>(form, '[data-field-error="' + CSS.escape(fieldId) + '"]');
  const input = q(form, '[name="' + CSS.escape(fieldId) + '"]');
  if (node) {
    node.hidden = false;
    node.textContent = message;
  }
  if (input?.setCustomValidity) {
    input.setCustomValidity(message);
    input.reportValidity();
  }
};
const checkedValues = (form: ParentNode, name: string) => [...form.querySelectorAll<HTMLInputElement>('[name="' + name + '"]:checked')].map((input) => input.value);

/** The fields a record template declares, as its form lists them. */
export const typeFields = (form: ParentNode) => [...form.querySelectorAll(".type-field-row")].map((row) => ({
  field_id: q(row, '[name="field_id"]')?.value.trim(),
  name: q(row, '[name="field_name"]')?.value.trim(),
  purpose: q(row, '[name="field_purpose"]')?.value.trim(),
  format: q(row, '[name="field_format"]')?.value || "text",
  required: q<HTMLInputElement>(row, '[name="field_required"]')?.checked === true,
})).filter((field) => field.field_id && field.name && field.purpose);

const FORM_PATHS: Readonly<Record<string, string>> = {
  report: "/event-report", note: "/event-note", type: "/event-configure", "type-edit": "/event-configure",
  progress: "/event-progress",
  concern: "/event-concern", decision: "/event-decision", closure: "/event-close",
  resume: "/event-resume", agreement: "/event-agree",
};
/** The Goal route an event form writes to. */
export const formPath = (kind: string) => (Object.hasOwn(FORM_PATHS, kind) ? FORM_PATHS[kind] : "/event-report");

const words = (value: string) => value.split(/[\s,]+/).filter(Boolean);

const concernPayload = (form: HTMLFormElement, text: (name: string) => string) => {
  const action = text("action") || "open";
  const payload: Record<string, unknown> = { action, concern_id: text("concern_id") || undefined, title: text("title") || undefined, statement: text("statement") || undefined, reason: text("reason") || undefined, cited_decision_id: text("cited_decision_id") || undefined, blocks_closure: q<HTMLInputElement>(form, '[name="blocks_closure"]')?.checked === true };
  if (action === "open") {
    payload.scope = {
      requirement_ids: checkedValues(form, "requirement_ids"),
      event_ids: text("event_ids") ? words(text("event_ids")) : [],
      concern_ids: [],
      action: text("scope_action") || null,
    };
  } else if (action === "resolve" || action === "overturn") {
    payload.supporting_event_ids = words(text("supporting_event_ids"));
  }
  return payload;
};

const decisionPayload = (form: HTMLFormElement, text: (name: string) => string) => {
  const agreementChoice = q<HTMLInputElement>(form, '[name="agreement_change_decision"]:checked')?.value;
  if (q(form, '[name="agreement_change_decision"]')) {
    return {
      request_id: text("request_id") || undefined,
      conclusion: text("conclusion"),
      effects: agreementChoice === "authorize"
        ? [{ kind: "authorize_agreement_change" }]
        : [{ kind: "deny_action", action: "set_agreement" }],
    };
  }
  const pendingAction = form.dataset.pendingAction || text("action");
  const effects = [...form.querySelectorAll<HTMLInputElement>('[name="effect"]:checked')].map((input) => {
    if (input.value === "authorize_action" || input.value === "deny_action") return { kind: input.value, action: pendingAction || undefined };
    return { kind: input.value };
  });
  return { request_id: text("request_id") || undefined, selected_option_id: text("selected_option_id") || undefined, conclusion: text("conclusion"), effects, scope: { requirement_ids: checkedValues(form, "requirement_ids"), concern_ids: checkedValues(form, "concern_ids"), action: pendingAction || null } };
};

/** The body an event form sends, read from what the person entered. */
export const buildPayload = (form: HTMLFormElement, kind: string, article: HTMLElement | null): Record<string, unknown> => {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) || "").trim();
  if (kind === "report") {
    const fields: Record<string, string> = Object.create(null);
    form.querySelectorAll<Field>("[data-report-field]").forEach((input) => { fields[input.name] = input.value; });
    const title = q(form, "[data-event-title]")?.value.trim() || text("event_title");
    return { events: [{ type_id: form.dataset.typeId, type_version: Number(form.dataset.typeVersion), title, fields }] };
  }
  if (kind === "note") return { body: text("note") };
  if (kind === "type" || kind === "type-edit") {
    return {
      expected_version: Number(form.dataset.configVersion || article?.dataset.configVersion || 0),
      types: [{ type_id: text("type_id"), version: Number(text("version") || 1), name: text("name"), purpose: text("purpose"), semantic_family: text("semantic_family") || undefined, fields: typeFields(form) }],
    };
  }
  if (kind === "progress") return { summary: text("summary"), next_step: text("next_step") || undefined, next_actor: text("next_actor") || undefined, based_on_cursor: Number(data.get("based_on_cursor") || article?.dataset.goalEventCursor || 0) };
  if (kind === "concern") return concernPayload(form, text);
  if (kind === "decision") return decisionPayload(form, text);
  if (kind === "agreement") {
    return {
      outcome: text("outcome") || undefined,
      expected_config_version: Number(data.get("expected_config_version")),
      expected_agreement_version: Number(data.get("expected_agreement_version")),
    };
  }
  if (kind === "closure") {
    return { kind: text("kind"), result: text("result") || undefined, reason: text("reason"), expected_config_version: Number(data.get("expected_config_version")), expected_agreement_version: Number(data.get("expected_agreement_version")) };
  }
  if (kind === "resume") return { reason: text("reason") };
  return {};
};

/** Keeps a concern form's rows in step with whether it opens a new concern or acts on one already raised. */
export const syncConcernForm = (form: HTMLFormElement, changed: string) => {
  const existing = Boolean(q(form, '[name="concern_id"]')?.value);
  const action = q<HTMLSelectElement>(form, '[name="action"]');
  if (!action) return;
  if (changed === "concern_id") action.value = existing ? "resolve" : "open";
  form.querySelectorAll<HTMLElement>("[data-concern-new]").forEach(row => { row.hidden = existing; });
  form.querySelectorAll<HTMLElement>("[data-concern-existing]").forEach(row => { row.hidden = !existing; });
  const require = (name: string, required: boolean) => {
    const field = q(form, '[name="' + name + '"]');
    if (field) field.required = required;
  };
  require("title", !existing);
  require("statement", !existing);
  require("reason", existing);
  const open = q<HTMLOptionElement>(action, 'option[value="open"]');
  if (open) open.hidden = existing;
  form.querySelectorAll<HTMLElement>("[data-concern-decision]").forEach(row => { row.hidden = !existing; });
  form.querySelectorAll<HTMLElement>("[data-concern-accept]").forEach(row => { row.hidden = action.value !== "accept"; });
  const evidenceRequired = existing && (action.value === "resolve" || action.value === "overturn");
  form.querySelectorAll<HTMLElement>("[data-concern-evidence]").forEach(row => { row.hidden = !evidenceRequired; });
  const evidence = q(form, '[name="supporting_event_ids"]');
  if (evidence) evidence.required = evidenceRequired && !q(form, '[name="cited_decision_id"]')?.value;
  const decision = q(form, '[name="cited_decision_id"]');
  if (decision) decision.required = action.value === "accept";
};
