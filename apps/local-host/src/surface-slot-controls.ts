import { randomUUID } from "node:crypto";
import { ActionError, bindActionClient, requireSynchronous, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceItem, SurfaceItemAction } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { presentationFormFields, presentationValuesProblems } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { SurfaceHomeDisplay, SurfaceHomeRowDisplay } from "@molis-ai/molis-work-design-system";
import { startSurfaceRead } from "@molis-ai/molis-work-service-surfaces";
import { displayedFallback, displayedRoute, homeChanged, homeOwnsView, homeReference as reference, surfaceRow, type HomeReadSample } from "./surface-home-display.js";
import { openHomeObject, openProvedHomeObject, rereadSurfaceFallback } from "./surface-home-open.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";
import { offerConsequences, surfaceOfferOperation, surfaceOfferSources, type HeldSurfaceOffer } from "./surface-offer-operation.js";
import { bindSurfacePlacement, isPlacementKind, prepareSurfacePlacement, type SurfacePlacementTarget } from "./surface-placement.js";
import { observeSurfaceCommand } from "./surface-command-delivery.js";
import type { PositionChoice } from "./surface-position-offers.js";

type Route = NonNullable<ReturnType<typeof displayedRoute>>;
type Intent = { label: string; primary: boolean; warning?: SurfaceItemAction["consequence"] }
  & ({ kind: "open" | "peek" } | { kind: "action"; action: ActionView; mapping: Readonly<Record<string, string>> }
    | { kind: "offers"; choices: ReturnType<typeof surfaceOfferSources> }
    | { kind: "offer"; held: HeldSurfaceOffer } | { kind: "placement"; bound: SurfacePlacementTarget }
    | { kind: "placement-choice"; choice: PositionChoice });
type DeclaredTarget = { route: Route; item: SurfaceItem; fields: readonly string[]; revision: string; key: string } & Intent;
type FallbackTarget = { kind: "fallback-open"; route: Pick<Route, "entry" | "reader">; item: SurfaceItem; key: string; label: string; primary: boolean; warning?: undefined };
type Target = DeclaredTarget | FallbackTarget;

export interface RetainedSlotControls {
  readonly controls: Map<string, Target>;
  readonly catalog: HomeReadSample["catalog"];
  assertCurrent(): void;
}
export type SlotPreparation = { target: DeclaredTarget; input: unknown };
const key = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);

/** Keep only the exact controls, associated readers and their original tokens, with no HTTP request or old result values. */
export function captureSurfaceSlot(display: SurfaceHomeDisplay, sample: HomeReadSample, project: string,
  metadata: SurfaceProjectContext["metadata"]): RetainedSlotControls {
  const controls = new Map<string, Target>();
  const rows = new Map(display.display.rows.map(row => [key(row.subject), row]));
  for (const item of display.groups.flatMap(group => group.items)) {
    const row = rows.get(key(item.subject));
    if (!row) continue;
    if (row.fallback) {
      const fallback = displayedFallback(sample, item);
      if (fallback && item.actions.some(action => action.ref === "open")) {
        const token = randomUUID();
        controls.set(token, { key: token, kind: "fallback-open", label: "打开", primary: false, item,
          route: { entry: fallback.entry, reader: fallback.proof.reader } });
      }
      continue;
    }
    const route = displayedRoute(sample, item);
    if (!route || !("revision" in row.read)) continue;
    const revision = row.read.revision;
    const capture = (target: Intent) => {
      const token = randomUUID();
      controls.set(token, { ...target, key: token, route, item, revision, fields: row.declaration.fields.map(field => field.key) });
    };
    const offers = row.read.state === "ok" ? surfaceOfferSources(sample.directory, item.subject.kind, view => homeOwnsView(route.entry, view)) : [];
    if (offers.length) {
      sample.retain(offers.flatMap(({ source, action }) => [source, action]));
      capture({ kind: "offers", choices: offers, label: "更多操作", primary: false });
    }
    for (const operation of item.actions) {
      if (operation.ref === "open" || operation.ref === "peek") {
        capture({ kind: operation.ref, label: operation.ref === "open" ? "打开" : "速览", primary: operation.primary });
        continue;
      }
      if (row.read.state !== "ok") continue;
      if (isPlacementKind(operation.ref)) {
        const bound = bindSurfacePlacement(sample, route, item, operation.ref, revision, project, metadata);
        if (bound) capture({ kind: "placement", bound, label: operation.ref === "place" ? "用于项目" : "交给", primary: false });
        continue;
      }
      if (!operation.provider_id) continue;
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
  return [...binding.controls.values()].filter(target => target.kind !== "offer" && target.kind !== "placement-choice").map(slotLabel);
}
function slotLabel(target: Target) {
  const { key, item, kind, label, primary, warning } = target;
  const command = target.kind === "offers" ? "offers" : target.kind === "placement" ? target.bound.receivers ? "hand_off" : "place"
    : target.kind === "action" && target.action.operation === "command" ? JSON.stringify(reference(target.action)) : undefined;
  return { key, subject: item.subject, owner: item.owner_plugin_id, kind: kind === "fallback-open" ? "open" : kind, label, primary, ...(command ? { command } : {}),
    ...(warning?.length ? { consequence: warning } : {}) };
}

export function slotOperation(context: SurfaceProjectContext, binding: RetainedSlotControls, prefix: string, assertRender: () => void) {
  const { transport, client, caller } = context;
  const current = () => {
    assertRender(); requireSynchronous(transport.assert_authority_current?.()); binding.assertCurrent();
  };
  const control = { ...transport, assert_authority_current: current, async beforeEffect() { await transport.beforeEffect(); current(); } };
  const offers = surfaceOfferOperation(context, current);
  const readonly = bindActionClient(client, () => ({ ...caller, query_only: true, read_only_effects: true }));
  const values = async ({ route, item }: DeclaredTarget, fields: readonly string[]) => {
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
  async function offerChoices(target: Extract<Target, { kind: "offers" }>) {
    const { item, route, revision, fields } = target;
    const prepared: Target[] = (await offers.prepare({ subject: item.subject, values: route.action, fields, revision }, target.choices)).map(held =>
      ({ route, item, fields, revision, key: held.key, kind: "offer", held, label: held.offer.title, primary: false, warning: offerConsequences(held.choice.action) }));
    return selectChoices(prepared);
  }
  function selectChoices(prepared: readonly Target[]) {
    for (const [key, previous] of binding.controls) if (previous.kind === "offer" || previous.kind === "placement-choice") binding.controls.delete(key);
    for (const target of prepared) binding.controls.set(target.key, target);
    return prepared.map(slotLabel);
  }
  async function execute(view: ActionView, input: unknown) {
    current();
    let observed: ReturnType<typeof observeSurfaceCommand> | undefined, returned = false;
    const click = bindActionClient({ ...client, invoke(caller, ref, input) {
      if (view.operation !== "command") return client.invoke(caller, ref, input);
      observed = observeSurfaceCommand(caller, ref);
      return client.invoke(observed.caller, ref, input);
    } }, () => ({ ...caller, user_action: { source: "web", conversation_ref: `web:${caller.project_id}`, message_ref: `web:request:${randomUUID()}` } }));
    try {
      const result = await click.invoke({ ...view, ...reference(view) }, input, control);
      returned = true; current();
      return result;
    } catch (cause) {
      if (view.operation !== "command" || !returned && !observed?.mayHaveWritten(cause)) throw cause;
      if (cause instanceof ActionError && cause.code === "actions.outcome_unknown") throw cause;
      throw new ActionError("actions.outcome_unknown", "操作结果需要到原对象核对", { cause });
    }
  }
  return {
    current,
    async activate(target: Target) {
      if (target.kind === "fallback-open") {
        const { route, item } = target, deadline = startSurfaceRead(control.signal);
        try {
          const proof = await rereadSurfaceFallback(route.reader, item.subject, client, caller, control, deadline, current);
          return { result: openProvedHomeObject(binding.catalog, route.entry, proof, prefix) };
        } finally { deadline.dispose(); }
      }
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
      if (target.kind === "placement") {
        const prepared = await prepareSurfacePlacement(context, target.bound, current);
        const choices = selectChoices(prepared.choices.map(choice => ({ ...target, key: choice.key, kind: "placement-choice",
          label: choice.label, warning: choice.consequence, choice })));
        return { choices, description: prepared.description };
      }
      if (target.kind === "placement-choice") {
        binding.controls.delete(target.key);
        return { preparation: { target, input: undefined } satisfies SlotPreparation };
      }
      if (target.kind === "offer") {
        await offers.version(target.held.target);
        return { preparation: { target, input: target.held.offer.input } satisfies SlotPreparation };
      }
      if (target.kind !== "action") throw homeChanged();
      const input = await prepareInput(target);
      return target.action.operation === "command" ? { preparation: { target, input } satisfies SlotPreparation }
        : { result: await execute(target.action, input) };
    },
    async confirm({ target, input }: SlotPreparation) {
      if (target.kind === "placement-choice") return target.choice.confirm(context, current);
      if (target.kind === "offer") return offers.confirm(target.held);
      if (target.kind !== "action" || target.action.operation !== "command") throw homeChanged();
      const checked = await prepareInput(target);
      if (canonicalJsonText(checked) !== canonicalJsonText(input)) throw homeChanged();
      return execute(target.action, checked);
    },
  };
}
