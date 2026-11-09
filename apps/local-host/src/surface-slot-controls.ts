import { randomUUID } from "node:crypto";
import { ActionError, actionEffect, bindActionClient, requireSynchronous, type ActionReference, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceItem, SurfaceItemAction } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { compileActionSchema, subjectOfferChoices, type SubjectOfferChoiceView } from "@molis-ai/molis-work-kernel";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { presentationFormFields, presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-app-workbench";
import { confirmSubjectOffer, prepareSubjectOffers, sameReference, type PreparedSubjectOffer } from "./contextual/contextual-service.js";
import { displayedRoute, homeChanged, homeOwnsView, homeReference as reference, surfaceRow, type HomeReadSample } from "./surface-home-display.js";
import { openHomeObject } from "./surface-home-open.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";

type Route = NonNullable<ReturnType<typeof displayedRoute>>;
type Choice = { source: ActionView; action: ActionView; choice: SubjectOfferChoiceView };
type Intent = { label: string; primary: boolean; warning?: SurfaceItemAction["consequence"] }
  & ({ kind: "open" | "peek" } | { kind: "action"; action: ActionView; mapping: Readonly<Record<string, string>> }
    | { kind: "offers"; choices: readonly Choice[] }
    | { kind: "offer"; selected: Choice; offer: PreparedSubjectOffer; request: string });
type Target = { route: Route; item: SurfaceItem; fields: readonly string[]; revision: string; key: string } & Intent;

export interface RetainedSlotControls {
  readonly controls: Map<string, Target>;
  readonly catalog: HomeReadSample["catalog"];
  assertCurrent(): void;
}
export type SlotPreparation = { target: Target; request: string; input: unknown; offer?: PreparedSubjectOffer };
const key = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
const safeRead = (view: ActionView) => view.operation === "query" && view.action.external !== true
  && view.action.execution?.cost !== "metered" && !view.action.permissions.includes("model:invoke")
  && (view.action.effect === undefined || view.action.effect === "read");
const consequences = (view: ActionView): SurfaceItemAction["consequence"] => [
  ...(view.action.external ? ["external" as const] : []),
  ...(view.action.execution?.cost === "metered" ? ["cost" as const] : []),
  ...(actionEffect(view.action, view.capability_id) === "irreversible" ? ["irreversible" as const] : []),
];

/** Keep only the exact controls, associated readers and their original tokens, with no HTTP request or old result values. */
export function captureSurfaceSlot(display: SurfaceHomeDisplay, sample: HomeReadSample): RetainedSlotControls {
  const controls = new Map<string, Target>();
  const rows = new Map(display.display.rows.map(row => [key(row.subject), row]));
  for (const item of display.groups.flatMap(group => group.items)) {
    const row = rows.get(key(item.subject)), route = displayedRoute(sample, item);
    if (!row || !route || !("revision" in row.read)) continue;
    const revision = row.read.revision;
    const capture = (target: Intent) => {
      const token = randomUUID();
      controls.set(token, { ...target, key: token, route, item, revision, fields: row.declaration.fields.map(field => field.key) });
    };
    const viewFor = (ref: ActionReference) => sample.directory.find(view => view.availability.available && sameReference(ref, reference(view)));
    const offers = row.read.state === "ok" ? subjectOfferChoices(sample.directory, item.subject.kind).flatMap(choice => {
      const source = viewFor(choice.source), action = viewFor(choice.action);
      return choice.availability.available && source && action && safeRead(source) && homeOwnsView(route.entry, source) && homeOwnsView(route.entry, action)
        ? [{ choice, source, action }] : [];
    }) : [];
    if (offers.length) {
      sample.retain(offers.flatMap(({ source, action }) => [source, action]));
      capture({ kind: "offers", choices: offers, label: "更多操作", primary: false });
    }
    for (const operation of item.actions) {
      if (operation.ref === "open" || operation.ref === "peek") {
        capture({ kind: operation.ref, label: operation.ref === "open" ? "打开" : "速览", primary: operation.primary });
        continue;
      }
      if (row.read.state !== "ok" || !operation.provider_id) continue;
      const view = [...sample.views].find(view => view.availability.available && `${view.capability_id}@${view.version}` === operation.ref
        && view.provider.provider_id === operation.provider_id);
      if (!view || offers.some(offer => offer.action === view)) continue;
      const mapping = operation.prepared_input ?? {};
      const required = view.action.input_schema.required;
      if (Array.isArray(required) && !required.every(field => typeof field === "string" && Object.hasOwn(mapping, field))) continue;
      capture({ kind: "action", action: view, mapping, label: view.action.title, primary: operation.primary, warning: operation.consequence });
    }
  }
  return { controls, catalog: sample.catalog, assertCurrent: sample.retainGuard() };
}

export function surfaceSlotLabels(binding: RetainedSlotControls) {
  return [...binding.controls.values()].filter(target => target.kind !== "offer").map(slotLabel);
}
const slotLabel = ({ key, item, kind, label, primary, warning }: Target) =>
  ({ key, subject: item.subject, owner: item.owner_plugin_id, kind, label, primary, ...(warning?.length ? { consequence: warning } : {}) });

export function slotOperation(context: SurfaceProjectContext, binding: RetainedSlotControls, prefix: string, assertRender: () => void) {
  const { transport, client, caller } = context;
  const current = () => {
    assertRender(); requireSynchronous(transport.assert_authority_current?.()); binding.assertCurrent();
  };
  const control = { ...transport, assert_authority_current: current, async beforeEffect() { await transport.beforeEffect(); current(); } };
  const readonly = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  const values = async ({ route, item }: Target, fields: readonly string[]) => {
    current();
    const input = { subjects: [item.subject], fields: [...fields] };
    const answer = await readonly.invoke<PresentationValuesInput, PresentationValues>({ ...route.action, ...reference(route.action) }, input, control);
    current();
    if (presentationValuesProblems(input, answer).length) throw homeChanged();
    const value = answer.items[0];
    if (!value || value.state !== "ok" && (value.state !== "stale" || !value.read_at)) throw homeChanged();
    return value;
  };
  const prepareInput = async (target: Extract<Target, { kind: "action" }>) => {
    const value = await values(target, [...new Set([...target.fields, ...Object.values(target.mapping)])]);
    if (value.state !== "ok" || value.revision !== target.revision) throw homeChanged();
    const input = Object.fromEntries(Object.entries(target.mapping).map(([field, source]) => [field, value.values?.[source]]));
    if (compileActionSchema(target.action.action.input_schema)(input) !== true) throw homeChanged();
    return input;
  };
  const offerDirectory = (source: ActionView, actions: readonly ActionView[]) => ({
    async discover() { current(); return [source, ...new Set(actions)]; },
    invoke(ref: ActionReference, input: unknown) {
      current();
      if (!sameReference(ref, reference(source))) throw homeChanged();
      return readonly.invoke({ ...source, ...reference(source) }, input, control);
    },
  });
  async function offerChoices(target: Extract<Target, { kind: "offers" }>) {
    const value = await values(target, target.fields);
    if (value.state !== "ok" || value.revision !== target.revision) throw homeChanged();
    const request = randomUUID(), choices = new Map<ActionView, Choice[]>();
    for (const choice of target.choices) choices.set(choice.source, [...choices.get(choice.source) ?? [], choice]);
    const prepared: Target[] = [];
    for (const [source, declarations] of choices) {
      const result = await prepareSubjectOffers(offerDirectory(source, declarations.map(choice => choice.action)),
        { subject: target.item.subject, request_id: request }, reference(source));
      for (const offer of result.offers) {
        const selected = declarations.find(({ action, choice }) => choice.offer_id === offer.offer_id && sameReference(offer.action, reference(action)));
        if (selected && offer.availability.available) prepared.push({ route: target.route, item: target.item, fields: target.fields, revision: target.revision,
          key: randomUUID(), kind: "offer", offer, selected, request, label: offer.title, primary: false, warning: consequences(selected.action) });
      }
    }
    current();
    for (const [key, previous] of binding.controls) if (previous.kind === "offer") binding.controls.delete(key);
    for (const offer of prepared) binding.controls.set(offer.key, offer);
    return prepared.map(slotLabel);
  }
  async function execute(view: ActionView, input: unknown) {
    current();
    const click = bindActionClient(client, () => ({ ...caller,
      user_action: { source: "web", conversation_ref: `web:${caller.project_id}`, message_ref: `web:request:${randomUUID()}` } }));
    const result = await click.invoke({ ...view, ...reference(view) }, input, control);
    try { current(); }
    catch (cause) {
      if (view.operation !== "command") throw cause;
      throw new ActionError("actions.outcome_unknown", "操作结果需要到原对象核对", { cause });
    }
    return result;
  }
  return {
    current,
    async activate(target: Target) {
      if (target.kind === "open") {
        const { route, item } = target;
        await values(target, []);
        return { result: await openHomeObject({ catalog: binding.catalog, assertCurrent: current, retain: current }, route.entry, route.reader, item.subject, client, caller, control, prefix) };
      }
      if (target.kind === "peek") {
        const { route, item } = target, form = presentationFormFields(route.object, "peek");
        if (!form) throw homeChanged();
        const value = await values(target, form.fields);
        const row: SurfaceHomeRowDisplay = surfaceRow({ ...route, ...form, subject: item.subject }, value);
        return { result: { kind: "peek", row, owner: route.entry.display } };
      }
      if (target.kind === "offers") return { choices: await offerChoices(target) };
      if (target.kind === "offer") {
        const value = await values(target, target.fields);
        if (value.state !== "ok" || value.revision !== target.revision) throw homeChanged();
        return { preparation: { target, request: target.request, input: target.offer.input, offer: target.offer } satisfies SlotPreparation };
      }
      if (target.kind !== "action") throw homeChanged();
      const input = await prepareInput(target);
      return target.action.operation === "command" ? { preparation: { target, request: randomUUID(), input } satisfies SlotPreparation }
        : { result: await execute(target.action, input) };
    },
    async confirm({ target, request, input, offer }: SlotPreparation) {
      if (target.kind === "offer" && offer) {
        const value = await values(target, target.fields);
        if (value.state !== "ok" || value.revision !== target.revision) throw homeChanged();
        const { source, action } = target.selected;
        const proof = await confirmSubjectOffer(offerDirectory(source, [action]), { subject: target.item.subject, request_id: request, offer });
        return execute(action, proof.input);
      }
      if (target.kind !== "action" || target.action.operation !== "command") throw homeChanged();
      const checked = await prepareInput(target);
      if (canonicalJsonText(checked) !== canonicalJsonText(input)) throw homeChanged();
      return execute(target.action, checked);
    },
  };
}
