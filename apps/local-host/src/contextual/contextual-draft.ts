import { FRAGMENT_OFFERS_INPUT_TYPE, type ActionView, type FragmentActionOffer } from "@molis-ai/molis-work-contracts/platform/actions";
import { CONTEXTUAL_DRAFT_LIMITS, type ContextualCandidate, type ContextualDraft, type SurfaceFocus, type SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import type { DraftMaterial, DraftTarget } from "../drafting/draft-data.js";
import { draftIntake, type DraftInput, type DraftPorts } from "../drafting/draft-service.js";
import { chosenCandidate } from "./contextual-choice.js";
import { contextualErrors, invalid, readEntry, readJudgeRequest, readString } from "./contextual-request.js";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { fragmentOffersInput, type ContextualDirectory } from "./contextual-service.js";

/**
 * Drafting for the workbench (context-program §6, quick-create §5): the creation entry a provider declared is found in the caller's
 * own directory, the provider's `prepare` runs when it has one, and the drafting service fills what is left. Nothing is created
 * here, and nothing is written: the page shows the draft, and the person's confirmation runs the entry's own action.
 */

type Intake = NonNullable<ActionView["action"]["intake"]>;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The view that declares this entry, still in the caller's directory under the identity the candidate or page named. */
function entryView(views: readonly ActionView[], reference: { capability_id: string; version: number; provider_id?: string }, intakeId: string): (ActionView & { action: { intake: Intake } }) | undefined {
  return views.find((view): view is ActionView & { action: { intake: Intake } } => view.capability_id === reference.capability_id && view.version === reference.version
    && (!reference.provider_id || view.provider.provider_id === reference.provider_id) && view.action.intake?.intake_id === intakeId);
}

function targetOf(view: ActionView & { action: { intake: Intake } }): DraftTarget {
  const { intake } = view.action;
  return { intake_id: intake.intake_id, item_kind: intake.item_kind, title: intake.title, verb: intake.verb, describe: intake.describe, examples: intake.examples,
    ...(intake.material_field ? { material_field: intake.material_field } : {}), input_schema: view.action.input_schema };
}

/** The words in hand: every selected part, in order, as the page reported them. */
const passage = (focus: SurfaceFocus): string => cutHead(focus.targets.map(target => target.text.trim()).filter(Boolean).join("\n"), CONTEXTUAL_DRAFT_LIMITS.kept);

function sourceOf(focus: SurfaceFocus): NonNullable<DraftMaterial["source"]> {
  const around = focus.surroundings;
  return { kind: focus.object.kind, ...(focus.object.title ? { title: focus.object.title } : {}),
    ...(around?.heading_path.length ? { heading_path: around.heading_path } : {}), ...(around?.before ? { before: around.before } : {}),
    ...(around?.after ? { after: around.after } : {}), ...(focus.goal ? { goal: focus.goal.title } : {}) };
}

/** What the entry's provider computes from the passage without a model: the offer of its own `prepare` query that is named like the entry. */
async function preparedBy(view: ActionView & { action: { intake: Intake } }, views: readonly ActionView[], actions: ContextualDirectory, focus: SurfaceFocus, requestId: string): Promise<DraftInput["prepared"]> {
  const { intake } = view.action;
  const reference = intake.prepare;
  const query = reference && views.find(item => item.provider.provider_id === view.provider.provider_id && item.capability_id === reference.capability_id && item.version === reference.version
    && item.operation === "query" && item.action.input_type === FRAGMENT_OFFERS_INPUT_TYPE && item.availability.available);
  if (!query) return undefined;
  const { offers } = await actions.invoke({ capability_id: query.capability_id, version: query.version, provider_id: query.provider.provider_id },
    fragmentOffersInput(focus, requestId, focus.granularity === "object")) as { offers: readonly FragmentActionOffer[] };
  const offer = offers.find(item => item.offer_id === intake.intake_id && item.action.capability_id === view.capability_id && item.action.version === view.version
    && (!item.action.provider_id || item.action.provider_id === view.provider.provider_id));
  return offer && isRecord(offer.input) ? { input: offer.input, ...(offer.summary ? { summary: offer.summary } : {}), ...(offer.editable?.length ? { editable: offer.editable } : {}) } : undefined;
}

export interface DraftRequestContext {
  readonly actions: ContextualDirectory;
  readonly ports: DraftPorts;
  readonly signal?: AbortSignal;
}

/** The draft of one chosen creation entry for what is in hand, with the sentence the person added, if they did. */
async function draftForCandidate(candidate: ContextualCandidate, focus: SurfaceFocus, said: string | undefined, requestId: string, views: readonly ActionView[], context: DraftRequestContext): Promise<ContextualDraft> {
  const view = entryView(views, candidate.action, candidate.offer_id);
  if (!view) throw contextualErrors.stale("这个去处已不在当前的候选里，请重新选择");
  const text = passage(focus);
  if (!text) throw contextualErrors.empty("没有可以放进去的内容");
  const prepared = await preparedBy(view, views, context.actions, focus, requestId);
  const outcome = await draftIntake({ target: targetOf(view), material: { text, source: sourceOf(focus), ...(said ? { said } : {}) }, request_id: requestId, ...(prepared ? { prepared } : {}) },
    context.ports, context.signal);
  return { key: candidate.key, intake_id: view.action.intake.intake_id, title: view.action.intake.verb, action: candidate.action, provider_title: candidate.provider_title, ...outcome };
}

/** The draft of a creation entry for a sentence the person wrote on the plugin's own page. */
async function draftForSentence(entry: ReturnType<typeof readEntry>, said: string, requestId: string, views: readonly ActionView[], context: DraftRequestContext): Promise<ContextualDraft> {
  const view = entryView(views, entry, entry.intake_id);
  if (!view) throw contextualErrors.stale("这个创建入口已不存在，请重新载入页面");
  if (!view.availability.available) throw contextualErrors.unavailable(view.availability.reason);
  const outcome = await draftIntake({ target: targetOf(view), material: { text: said }, request_id: requestId }, context.ports, context.signal);
  return { intake_id: view.action.intake.intake_id, title: view.action.intake.verb, provider_title: view.provider.title, ...outcome,
    action: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id } };
}

/**
 * `POST /api/contextual/draft`. With a `key`: the creation entry the person chose for what they have in hand, optionally with a sentence
 * of their own added (`said`). Without one: the entry a plugin's page names (`action`, `intake_id`) and the sentence written there.
 */
export async function draftRequest(body: Record<string, unknown>, views: readonly ActionView[], context: DraftRequestContext): Promise<ContextualDraft> {
  const requestId = readString(body.request_id, "request_id", 120);
  const said = body.said === undefined ? undefined : readString(body.said, "said", CONTEXTUAL_DRAFT_LIMITS.said);
  if (body.key === undefined) {
    if (said === undefined) throw invalid("said");
    return draftForSentence(readEntry(body), said, requestId, views, context);
  }
  const { focus, landing } = readJudgeRequest(body);
  return draftChosen(views, focus, landing, readString(body.key, "key", 80), said, requestId, context);
}

/** A destination the person chose in the bar. Only creation entries are drafted here; adding to an object is prepared elsewhere. */
export async function draftChosen(views: readonly ActionView[], focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string, said: string | undefined, requestId: string, context: DraftRequestContext): Promise<ContextualDraft> {
  const candidate = chosenCandidate(views, focus, landing, key);
  if (candidate.origin !== "intake") throw contextualErrors.not_drafted("这个去处还不能由起草服务准备");
  return draftForCandidate(candidate, focus, said, requestId, views, context);
}
