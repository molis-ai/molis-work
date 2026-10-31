import type { ActionReference, ActionSubject, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ContextualCandidate, SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import { chosenCandidate } from "./contextual-choice.js";
import { contextualErrors } from "./contextual-request.js";
import { cutHead } from "../whole-units.js";

/**
 * 「放进左边」 (specs/context-program §3.4, §21.8 steps 4–6): what is in hand goes into the object open on the left, at the
 * landing its owner reported. The input is computed here without a model, from the landing and the passage, so the preview
 * the owner shows is exactly what gets written:
 *
 * - `id`: the landing object; `expected_version`: the version the landing's positions belong to (the owner compares it);
 * - `anchor`, `head`: the landing's position, for a declaration with positions;
 * - the passage, at the declaration's `material_field`;
 * - `source: { title }` when the action's input takes one: the title of what the passage came from.
 *
 * Fields the action's input does not declare are left out, so an action asks for exactly what it uses.
 */
type Actions = { discover(): Promise<readonly ActionView[]>; invoke(reference: ActionReference, input: unknown): Promise<unknown> };
/** H3's check (`confirmReferences`): whether each object is still one the person may use, read from its owner just now. */
export type ConfirmReferences = (picked: readonly ActionSubject[], kinds: readonly string[]) => Promise<boolean[]>;

const MAX_MATERIAL = 20_000;

function attachInput(view: ActionView, focus: SurfaceFocus, landing: SurfaceLanding): Record<string, unknown> {
  const attach = view.action.attach;
  const fields = (view.action.input_schema as { properties?: Record<string, unknown> }).properties ?? {};
  const target = landing.targets?.find(item => Number.isInteger(item.anchor) && Number.isInteger(item.head));
  const material = cutHead(focus.targets.map(item => item.text).join("\n\n"), MAX_MATERIAL);
  if (!attach || !material.trim()) throw contextualErrors.empty("手上没有可以放进去的文字");
  const version = typeof landing.version === "number" ? landing.version : Number(landing.version);
  const input: Record<string, unknown> = { id: landing.object.id };
  if ("expected_version" in fields && Number.isInteger(version)) input.expected_version = version;
  if (target && "anchor" in fields && "head" in fields) { input.anchor = target.anchor; input.head = target.head; }
  if (attach.material_field) input[attach.material_field] = material;
  if ("source" in fields) input.source = { title: cutHead(focus.object.title || focus.object.kind, 200) };
  return input;
}

/** The chosen attach, still a candidate of exactly this thing in hand and landing, with its complete input. */
async function chosenAttach(actions: Actions, focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string) {
  if (!landing) throw contextualErrors.stale("左边没有可以放进去的位置，请先在左边打开要放进去的内容");
  const views = await actions.discover();
  const candidate = chosenCandidate(views, focus, landing, key);
  const view = views.find(item => item.capability_id === candidate.action.capability_id && item.version === candidate.action.version && item.provider.provider_id === candidate.action.provider_id);
  if (candidate.origin !== "attach" || !view) throw contextualErrors.not_offered("这个去处不是放进左边的内容");
  return { candidate, at: landing.object, input: attachInput(view, focus, landing) };
}

/** What `prepare` answers for an attach: the action and the input it will be called with, for the owner's preview. */
export async function prepareAttach(actions: Actions, focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string) {
  const { candidate, input } = await chosenAttach(actions, focus, landing, key);
  return offerOf(candidate, input);
}

/**
 * Runs a confirmed attach through the action service, with the person's authority. Right before, the landing object is read
 * again from its owner (H3): gone, or not the person's to use now, and nothing runs; without the check nothing runs either.
 * The owner then compares the version.
 */
export async function runAttach(actions: Actions, confirm: ConfirmReferences | undefined, focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string) {
  const { candidate, at, input } = await chosenAttach(actions, focus, landing, key);
  const [usable] = confirm ? await confirm([{ kind: at.kind, id: at.id }], [at.kind]) : [false];
  if (!usable) throw contextualErrors.reference_unavailable("要放进去的内容已不存在或现在不能用，请重新选择");
  return { ...offerOf(candidate, input), output: await actions.invoke(candidate.action, input) };
}

const offerOf = (candidate: ContextualCandidate, input: Record<string, unknown>) => ({ key: candidate.key, offer_id: candidate.offer_id, title: candidate.title,
  intent: candidate.intent, apply: candidate.apply, action: candidate.action, provider_title: candidate.provider_title, input, origin: "attach" as const,
  ...(candidate.position ? { position: candidate.position } : {}) });
