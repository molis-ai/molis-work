import { createHash } from "node:crypto";
import { actionEffect, isSubjectReader, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualCandidate, SurfaceFocus, SurfaceLanding, SurfacePlace } from "@molis-ai/molis-work-contracts/services/contextual";

/**
 * Where the thing in hand can be put (context-program §3.3, §3.4): the commands that declare `intake` (create an Item) or
 * `attach` (add to the object open on the left), read from one authorized directory snapshot like every other candidate.
 * Nothing here knows a plugin: a destination exists because a provider declared it, and goes when the provider is disabled.
 */

/** How many destinations go to the judgment; the rest of the budget is for the actions on the thing itself. */
export const MAX_JUDGED_DESTINATIONS = 8;

export const isDestination = (candidate: Pick<ContextualCandidate, "origin">): boolean => candidate.origin === "intake" || candidate.origin === "attach";

/** Fixed identity that fits Jev's 64-character option key; the words and the landing are not identity. */
function destinationKey(kind: "intake" | "attach", view: ActionView, id: string): string {
  return `${kind}.` + createHash("sha256").update(JSON.stringify([view.provider.provider_id, view.capability_id, view.version, id])).digest("hex").slice(0, 57);
}

const placeOf = (focus: SurfaceFocus): SurfacePlace => focus.place ?? "main";
const ownerOf = (view: ActionView) => view.provider.plugin_id ?? view.provider.provider_id;

function candidateOf(kind: "intake" | "attach", view: ActionView, declared: { title: string; verb: string; describe: string }, id: string, position?: SurfaceLanding["position"]): ContextualCandidate {
  const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  // Irreversible commands cannot be declared (the plugin SDK refuses them), but a directory is only a snapshot: never offer one.
  const unavailable = !view.availability.available ? view.availability.reason
    : actionEffect(view.action, view.capability_id) === "irreversible" ? "不可撤回的动作不在情境推荐里提供" : undefined;
  return { key: destinationKey(kind, view, id), offer_id: id, title: declared.verb, intent: "capture", apply: "record", hint: declared.describe,
    source: reference, action: reference, provider_title: view.provider.title, available: unavailable === undefined, ...(unavailable ? { reason: unavailable } : {}),
    origin: kind, ...(position ? { position } : {}) };
}

/**
 * The destinations for what is in hand. A creation entry fits anything the person has in hand (not the bare page). An append
 * needs the thing to be somewhere other than the left, a landing on the left that is one of the provider's own kinds, and a
 * position the declaration accepts: a declaration without positions is for the landing being the object itself.
 */
export function destinationCandidates(directory: readonly ActionView[], focus: SurfaceFocus, landing?: SurfaceLanding | null): ContextualCandidate[] {
  if (focus.granularity === "page") return [];
  const place = placeOf(focus);
  const here = (places?: readonly SurfacePlace[]) => !places || places.includes(place);
  return directory.flatMap(view => {
    const { intake, attach } = view.action;
    const found: ContextualCandidate[] = [];
    if (intake && here(intake.places)) found.push(candidateOf("intake", view, intake, intake.intake_id));
    if (attach && place !== "main" && landing && landing.object.kind === attach.item_kind && landing.plugin_id === ownerOf(view) && here(attach.places)
      && (attach.positions ? landing.position !== "object" && attach.positions.includes(landing.position) : landing.position === "object")) {
      found.push(candidateOf("attach", view, attach, attach.attach_id, landing.position));
    }
    return found;
  });
}

/** The object kinds whose readers sit at Home scope: a person's own space, whose content never goes to a judgment (spec §4.2). */
export function privateObjectKinds(directory: readonly ActionView[]): ReadonlySet<string> {
  return new Set(directory.filter(view => view.action.scope === "home" && isSubjectReader(view.action)).flatMap(view => view.action.subject_kinds));
}
