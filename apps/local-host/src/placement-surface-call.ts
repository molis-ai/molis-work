import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, WORKFLOW_CONTENT_SCHEMAS, type ActionClient, type ActionExecutionContext, type ActionSubjectContext, type ActionView, type WorkflowItemRef } from "@molis-ai/molis-work-contracts/platform/actions";
import { placementActions, PLACEMENT_PROVIDER_ID, type PlacedObject } from "@molis-ai/molis-work-contracts/services/placement";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import type { PlacementPorts } from "@molis-ai/molis-work-service-placement";
import { sameReference } from "./contextual/contextual-service.js";
import { placementCallPorts } from "./placement-call.js";
import { homeChanged, homeReference as ref } from "./surface-home-display.js";

export type SurfaceReceiver = { action: ActionView; reader: ActionView; station: string; kind: string };
type Effect = "describe" | "link" | "convert";
export type SurfacePlacementCall = {
  effect: Effect; source: PlacedObject; reader: ActionView; receiver?: SurfaceReceiver;
  client: ActionClient; actor: string; project: string; revision?: string;
  beforeWrite?(): void;
  checkedRevision?: string; committed?: true; consumed?: true;
};

const selection = new AsyncLocalStorage<SurfacePlacementCall>();
const sameItem = (a: { kind: string; id: string }, b: { kind: string; id: string }) => a.kind === b.kind && a.id === b.id;
const receiverResult = compileActionSchema(WORKFLOW_CONTENT_SCHEMAS.receive.output);

export async function withSurfacePlacementCall<Result>(bound: SurfacePlacementCall, run: () => Promise<Result>): Promise<Result> {
  try {
    const result = await selection.run(bound, run);
    if (!bound.consumed) throw homeChanged();
    return result;
  } catch (cause) {
    if (!bound.committed || cause instanceof ActionError && cause.code === "actions.outcome_unknown") throw cause;
    throw new ActionError("actions.outcome_unknown", "接收方已处理，请到原处核对结果", { cause });
  }
}

/** Called by the existing placement handler. This projection can enter once and only for the original action and caller. */
export function surfacePlacementCallPorts(ports: PlacementPorts, origin: ActionExecutionContext, alive: () => boolean): PlacementPorts {
  const bound = selection.getStore();
  if (!bound || bound.consumed || origin.actor_id !== bound.actor || origin.project_id !== bound.project || origin.audience !== "user"
    || !origin.current_action || !sameReference(origin.current_action, { ...placementActions[bound.effect], provider_id: PLACEMENT_PROVIDER_ID }))
    return placementCallPorts(ports, origin, alive);
  bound.consumed = true;
  const { source, reader, receiver, client } = bound;
  let created: PlacedObject | undefined;
  const sourceRead = async (caller: ActionExecutionContext) => {
    const read = await client.invoke({ ...caller, query_only: true, read_only_effects: true }, ref(reader), { subject_id: source.id }) as ActionSubjectContext;
    if (!sameItem(read.subject, source) || bound.revision !== undefined && read.revision !== bound.revision) throw homeChanged();
    bound.checkedRevision = read.revision;
    return read;
  };
  const safe = placementCallPorts({ ...ports, surfaceSource: source, async scope(project) {
    const forSource = project === source.project_id, forReceiver = receiver && project === bound.project;
    if (!forSource && !forReceiver) throw homeChanged();
    return { caller: origin, client: {
      discover: () => [...new Set([...(forSource ? [reader] : []), ...(forReceiver ? [receiver.action, receiver.reader] : [])])],
      async invoke(caller, reference, input) {
        if (forSource && sameReference(reference, ref(reader)) && isRecord(input) && input.subject_id === source.id)
          return sourceRead({ ...origin, ...caller });
        if (forReceiver && sameReference(reference, ref(receiver.action))) {
          let admitted = false, effectChecked = false, effectAllowed = false;
          const guarded = { ...caller, async validate_authority(target: typeof reference) {
            await caller.validate_authority?.(target);
            await sourceRead(origin);
            bound.beforeWrite?.();
            // The shared gateway validates at admission, then again when the receiver asks beforeEffect.
            if (sameReference(target, ref(receiver.action))) { effectChecked ||= admitted; admitted = true; }
          }, assert_authority_current(target?: typeof reference, permissions?: readonly string[]) {
            caller.assert_authority_current?.(target, permissions);
            if (!bound.committed) bound.beforeWrite?.();
            if (effectChecked && target && sameReference(target, ref(receiver.action))) effectAllowed = true;
          } };
          let result: unknown;
          try { result = await client.invoke(guarded, ref(receiver.action), input); }
          catch (error) {
            // A late refusal or disconnect after a successful effect check cannot establish that the owner made no write.
            if (effectAllowed || error instanceof ActionError && error.code === "actions.output_invalid_after_effect") bound.committed = true;
            throw error;
          }
          bound.committed = true;
          if (receiverResult(result) !== true || !isRecord(result) || result.plugin !== receiver.station
            || typeof result.item_id !== "string" || !result.item_id.trim() || result.item_id.length > 200) throw homeChanged();
          const item: WorkflowItemRef = { plugin: receiver.station, item_id: result.item_id, title: String(result.title) };
          created = { kind: receiver.kind, id: item.item_id, project_id: bound.project };
          return item;
        }
        if (forReceiver && created && sameReference(reference, ref(receiver.reader)) && isRecord(input) && input.subject_id === created.id) {
          const result = await client.invoke({ ...caller, query_only: true, read_only_effects: true }, ref(receiver.reader), input) as ActionSubjectContext;
          if (!sameItem(result.subject, created)) throw homeChanged();
          return result;
        }
        throw homeChanged();
      },
    } };
  } }, origin, alive);
  return { ...safe, async beforeEffect() {
    await safe.beforeEffect?.();
    if (bound.effect === "link") { await sourceRead(origin); bound.beforeWrite?.(); }
  } };
}
