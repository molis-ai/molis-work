import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ActionError, type ActionReference, type ActionView, type FragmentActionOffer } from "@molis-ai/molis-work-contracts/platform/actions";
import { FUNCTIONS_DEFAULT_MODEL } from "@molis-ai/molis-work-contracts/modules/functions";
import type { ContextualJudgeRequest, SurfaceFocus, SurfaceLanding } from "@molis-ai/molis-work-contracts/services/contextual";
import { contextualCandidates, type JudgmentWording } from "@molis-ai/molis-work-kernel/contextual";
import { TYPESAFE_SYSTEMONE_URL } from "@molis-ai/molis-work-module-functions";
import { screenModelMaterial } from "@molis-ai/molis-work-service-agent-host";
import { registeredInstructionBody, registeredInstructionRevision } from "../agent-definitions/instructions.js";
import { CONTEXTUAL_NEXT, CONTEXTUAL_SURFACE } from "../agent-definitions/system-prompts.js";
import { draftPorts } from "../drafting/draft-wiring.js";
import { resolvePrologueInference } from "../prologue-inference-host.js";
import { typeSafeConfiguration, typeSafeCredential } from "../typesafe-connection.js";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "../web-http.js";
import { prepareAttach, runAttach, type ConfirmReferences } from "./contextual-attach.js";
import { chosenCandidate, intakeKey } from "./contextual-choice.js";
import { createChosen, undoCreated } from "./contextual-create.js";
import { draftRequest } from "./contextual-draft.js";
import { contextualErrors, cutHead, invalid, readJudgeRequest, readString } from "./contextual-request.js";
import { fragmentOffersInput, prepareSubjectOffer, sameReference } from "./contextual-service.js";
import { createContextualJudgmentService, type ContextualJudgmentService } from "./judgment-service.js";

/**
 * Workbench transport for context-driven interaction (specs/archive/contextual-interaction §4, §7). Candidates and their
 * prepared inputs come from the directory under the local person's own authority in this project; the judgment only
 * ranks them, through Jev on the Home's TypeSafe connection via Prologue. A chosen action runs here only when the person
 * confirmed it at its landing (`attach`), or it is a creation entry its owner can undo (`create`, and `undo` takes it back);
 * otherwise the page that owns the object runs it after the person confirms (P1), or the Assistant does through its cards (P2).
 */
interface ContextualActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ActionReference, input: unknown, signal?: AbortSignal): Promise<unknown>;
}

export interface ContextualHttpPorts {
  /** Home whose TypeSafe connection and Prologue inference the judgment uses; absent means rules only. */
  readonly homeDirectory?: string;
  /** Separates panes of different projects served by one process. */
  readonly scope: string;
  /** The person whose authority `actions()` carries: an undo kept for them is theirs only (S-40). */
  readonly actor_id: string;
  /** The local person's authority in this project, bound for this request. */
  actions(): ContextualActions;
  /** Whether each object is still one the person may use in this project, read from its owner now (H3); absent refuses 「放进左边」. */
  readonly confirmReferences?: ConfirmReferences;
}

type Caller = { readonly scope: string; readonly actions: ContextualActions };

const DIRECTORY_TTL_MS = 3_000;
const services = new Map<string, ContextualJudgmentService<Caller>>();
const directories = new Map<string, { at: number; views: Promise<readonly ActionView[]> }>();

// A selection change asks twice (rules at once, the judgment shortly after) and may recall and report: one discovery serves all.
const directory = (caller: Caller): Promise<readonly ActionView[]> => {
  const cached = directories.get(caller.scope);
  if (cached && Date.now() - cached.at < DIRECTORY_TTL_MS) return cached.views;
  const views = caller.actions.discover();
  directories.set(caller.scope, { at: Date.now(), views });
  views.catch(() => { if (directories.get(caller.scope)?.views === views) directories.delete(caller.scope); });
  return views;
};

/** The platform memory's capability when this directory has it; absent means no memory here, and nothing changes. */
const memoryAction = (views: readonly ActionView[], capabilityId: "memory.recall" | "memory.signals.report") =>
  views.find(view => view.capability_id === capabilityId && view.version === 1 && view.availability.available);

/**
 * Preferences and conventions for this situation, through `memory.recall` (P3): a few short items, matched by plugin,
 * object kind and Goal, and recorded by the memory service as used for ranking these actions.
 */
export async function recallForJudgment(focus: SurfaceFocus, caller: Caller): Promise<{ state: "ok" | "off"; items: readonly { kind: string; text: string }[] }> {
  const view = memoryAction(await directory(caller), "memory.recall");
  if (!view) return { state: "ok", items: [] };
  const query = cutHead([focus.surroundings?.heading_path.at(-1), ...focus.targets.map(target => target.text)].filter(Boolean).join(" "), 300);
  const out = await caller.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {
    query, situation: { plugin_id: focus.plugin_id, object_kind: focus.object.kind, ...(focus.goal ? { goal_id: focus.goal.id } : {}) },
    limit: 6, budget_chars: 800, used_for: "给选中的内容排动作" }) as { state?: string; items?: readonly { kind?: unknown; text?: unknown }[] };
  if (out.state === "off") return { state: "off", items: [] };
  return { state: "ok", items: (out.items ?? []).filter(item => typeof item.text === "string" && item.text)
    .map(item => ({ kind: typeof item.kind === "string" ? item.kind : "memory", text: cutHead(String(item.text), 300) })) };
}

const SIGNALS: ReadonlySet<string> = new Set(["accepted", "ignored", "rewritten", "undone"]);
const WHERE: Readonly<Record<string, string>> = { word: "选中的词", range: "选中的文字", block: "这一段", blocks: "选中的几段", objects: "选中的几份内容" };

/**
 * What the person did with an offered action (P3), for the memory service to count: the capability and its title only,
 * never the content. Nothing is reported when this directory has no memory, and a stale key is refused.
 */
async function reportSignal(focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string, signal: string, eventId: string, caller: Caller) {
  const views = await directory(caller);
  const view = memoryAction(views, "memory.signals.report");
  if (!view) return { state: "unavailable" as const };
  const candidate = contextualCandidates(views, focus, landing).find(item => item.key === key);
  if (!candidate) throw contextualErrors.stale("这个动作已不在当前内容的候选里");
  const surface = views.find(item => (item.provider.plugin_id ?? item.provider.provider_id) === focus.plugin_id)?.provider.title;
  const where = focus.activity === "completed" ? "刚完成的一步" : focus.activity === "editing" ? "正在写的段落" : WHERE[focus.granularity] ?? "选中的内容";
  return caller.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {
    event_id: eventId, signal, subject: { capability_id: candidate.action.capability_id, label: cutHead(candidate.title, 40) },
    situation: { plugin_id: focus.plugin_id, object_kind: focus.object.kind, label: cutHead(`${surface ? surface + " 里" : ""}${where}`, 40) },
    occurrence: cutHead(focus.context_id, 120) });
}

/**
 * The wording of the two questions the bar puts to the judgment service, as the person left it in 设置 › 提示词. The judgment service reads the
 * revision on every judgment to know whether a cached answer was asked under the same words (a read of the register that records nothing),
 * and the text only when it really asks (one recorded use of each question).
 */
const WORDING_CALLER = "contextual.judgment";

/** One short string that changes whenever the person saves or restores either question; `-` stands for the default. */
export const judgmentWordingRevision = (home: string): string =>
  `${registeredInstructionRevision(home, CONTEXTUAL_NEXT) ?? "-"}.${registeredInstructionRevision(home, CONTEXTUAL_SURFACE) ?? "-"}`;

export const judgmentWording = (home: string): JudgmentWording =>
  ({ next: registeredInstructionBody(home, CONTEXTUAL_NEXT, WORDING_CALLER), surface: registeredInstructionBody(home, CONTEXTUAL_SURFACE, WORDING_CALLER) });

/** One service per Home: per-pane cancellation and the judgment cache outlive a single request. */
function serviceFor(home: string | undefined): ContextualJudgmentService<Caller> {
  const key = home ? path.resolve(home) : "";
  let service = services.get(key);
  if (service) return service;
  service = createContextualJudgmentService<Caller>({
    directory,
    ...(home ? { evaluate: jevEvaluator(home), configured: () => Boolean(credential(home)),
      wording: { revision: () => judgmentWordingRevision(home), text: () => judgmentWording(home) } } : {}),
    recall: (focus, caller) => recallForJudgment(focus, caller),
    screen: screenModelMaterial,
  });
  services.set(key, service);
  return service;
}

/** The judgment's TypeSafe key: the process override the other TypeSafe callers honour, else the Home's selected connection. */
const credential = (home: string) => process.env.TYPESAFE_API_KEY?.trim() || typeSafeCredential(home);

/** Multi-question Jev through the Home's Prologue inference; the key never leaves this process's memory. */
function jevEvaluator(home: string): NonNullable<Parameters<typeof createContextualJudgmentService>[0]["evaluate"]> {
  return async ({ state, questions, signal }) => {
    if (!credential(home)) throw new Error("这个 Home 没有可用的 TypeSafe 连接");
    const configuration = JSON.stringify(typeSafeConfiguration(home));
    const inference = await resolvePrologueInference(home);
    const credential_ref = "typesafe:contextual";
    const body = await inference.evaluateTypeSafe({ endpoint: TYPESAFE_SYSTEMONE_URL, model: FUNCTIONS_DEFAULT_MODEL, state, questions,
      credential_ref, signal, timeout_ms: 30_000,
      // The connection may be changed while the question waits; an answer is only used from the one it was asked on.
      resolveCredential: ref => ref !== credential_ref ? null
        : JSON.stringify(typeSafeConfiguration(home)) === configuration ? credential(home) : null });
    const model = typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : FUNCTIONS_DEFAULT_MODEL;
    return { body, basis: "jev", model: `Jev · ${model}` };
  };
}

/** Runs `work` with a signal that fires when the page stopped waiting for the answer (the person moved on). */
async function whileWaited<T>(response: ServerResponse, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const aborted = new AbortController();
  const stop = () => { if (!response.writableFinished) aborted.abort(); };
  response.once("close", stop);
  try { return await work(aborted.signal); } finally { response.off("close", stop); }
}

export async function handleContextualHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: ContextualHttpPorts): Promise<boolean> {
  // Which object kind each surface opens, from the plugins' own search-source declarations: when a surface opens an
  // item but does not name it itself, the workbench names it. Only a surface that opens exactly one kind is listed.
  if (url.pathname === "/api/contextual/surfaces") {
    if (request.method !== "GET") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
    try { sendJson(response, 200, { surfaces: surfaceKinds(await ports.actions().discover()) }); }
    catch (error) { const failure = actionErrorResponse(error); sendJson(response, failure.status, failure.body); }
    return true;
  }
  const match = /^\/api\/contextual\/(candidates|judge|cancel|prepare|signal|draft|attach|create|undo)$/u.exec(url.pathname);
  if (!match) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  const route = match[1]!;
  const service = serviceFor(ports.homeDirectory);
  try {
    const body = await readBody(request);
    // A draft is asked by a pane that has something in hand, or by a plugin's own page with a sentence: it needs no pane of its own.
    if (route === "draft") {
      const actions = ports.actions();
      sendJson(response, 200, await whileWaited(response, async signal => draftRequest(body, await actions.discover(), { actions, ports: draftPorts(ports.homeDirectory), signal })));
      return true;
    }
    // A creation entry chosen on the bar: created at once when its owner declared how it is undone, else drafted for a card.
    if (route === "create") {
      const actions = ports.actions(), { focus, landing } = readJudgeRequest(body);
      // A page that names the entry by the id its owner declared (`intake_id`) instead of a key it never saw listed.
      sendJson(response, 200, await whileWaited(response, async signal => {
        const views = await actions.discover();
        const key = body.intake_id === undefined ? readString(body.key, "key", 80) : intakeKey(views, focus, landing, readString(body.intake_id, "intake_id", 80));
        return createChosen({ project: ports.scope, actor: ports.actor_id }, views, focus, landing, key, readString(body.request_id, "request_id", 120),
          { actions, ports: draftPorts(ports.homeDirectory), signal });
      }));
      return true;
    }
    // The page only hands back the token: a body that names anything else (an undo, its input) is refused (S-40).
    if (route === "undo") {
      if (Object.keys(body).some(field => field !== "undo_token")) throw invalid("撤销请求");
      sendJson(response, 200, await undoCreated({ project: ports.scope, actor: ports.actor_id }, readString(body.undo_token, "undo_token", 80), ports.actions()));
      return true;
    }
    const pane = `${ports.scope}\u0000${readString(body.pane_id, "pane_id", 80)}`;
    if (route === "cancel") { service.cancel(pane); sendJson(response, 200, { ok: true }); return true; }
    const caller: Caller = { scope: ports.scope, actions: ports.actions() };
    const judgeRequest: ContextualJudgeRequest = { ...readJudgeRequest(body), pane_id: pane };
    if (route === "candidates") { sendJson(response, 200, await service.candidates(judgeRequest, caller)); return true; }
    if (route === "judge") {
      // The page gave up on this context (the person moved on): stop waiting on the model for it.
      sendJson(response, 200, await whileWaited(response, signal => service.judge(judgeRequest, caller, signal)));
      return true;
    }
    if (route === "signal") {
      const signal = readString(body.signal, "signal", 20);
      if (!SIGNALS.has(signal)) throw invalid("signal");
      sendJson(response, 200, await reportSignal(judgeRequest.focus, judgeRequest.landing, readString(body.key, "key", 80), signal, readString(body.event_id, "event_id", 120), caller));
      return true;
    }
    // A confirmed 「放进左边」: the owner showed the preview and the person confirmed it there.
    sendJson(response, 200, await whileWaited(response, signal => {
      const actions: ContextualActions = { discover: () => caller.actions.discover(), invoke: (reference, input) => caller.actions.invoke(reference, input, signal) };
      return route === "attach"
        ? runAttach(actions, ports.confirmReferences, judgeRequest.focus, judgeRequest.landing, readString(body.key, "key", 80))
        : prepare(judgeRequest.focus, judgeRequest.landing, readString(body.key, "key", 80), readString(body.request_id, "request_id", 120), { ...caller, actions });
    }));
  } catch (error) {
    const failure = actionErrorResponse(error);
    sendJson(response, failure.status, failure.body);
  }
  return true;
}

/**
 * The chosen offer's complete input, prepared by the provider that declared it for exactly this fragment. Preparing
 * writes nothing; the offer must still be a candidate of this context and name the same action it did when judged.
 */
async function prepare(focus: SurfaceFocus, landing: SurfaceLanding | undefined, key: string, requestId: string, caller: Caller) {
  const candidate = chosenCandidate(await caller.actions.discover(), focus, landing, key);
  // An attach is computed from the landing and the passage, without a model (contextual-attach.ts).
  if (candidate.origin === "attach") return prepareAttach(caller.actions, focus, landing, key);
  // An intake is not prepared by an offers query that the provider answers: the person's passage is drafted into its input (`/api/contextual/draft`).
  if (candidate.origin === "intake") throw contextualErrors.not_drafted("这个去处的参数要由起草服务准备，这里还不能直接准备");
  // One of the object's subject offers: prepared exactly as the Home / Dock prepares it, by the query that declared it.
  if (candidate.origin === "subject") {
    const notOffered = () => contextualErrors.not_offered(`${candidate.provider_title} 没有为这件事项准备「${candidate.title}」`);
    const offer = await prepareSubjectOffer(caller.actions, { kind: focus.object.kind, id: focus.object.id }, requestId, candidate.source,
      item => item.recommendation_key === candidate.key).catch(error => { throw error instanceof ActionError && error.code === "actions.offer_changed" ? notOffered() : error; });
    if (!sameReference(offer.action, candidate.action)) throw notOffered();
    if (!offer.availability.available) throw contextualErrors.unavailable(offer.availability.reason);
    return { key, offer_id: candidate.offer_id, title: offer.title, intent: candidate.intent, apply: candidate.apply,
      action: candidate.action, provider_title: candidate.provider_title, input: offer.input, origin: "subject" as const };
  }
  // A whole-object action (整篇) is prepared for the object itself: the provider reads its own current content.
  const whole = candidate.scope === "object" || focus.granularity === "object";
  const input = fragmentOffersInput(focus, requestId, whole);
  const { offers } = await caller.actions.invoke(candidate.source, input) as { offers: readonly FragmentActionOffer[] };
  const offer = offers.find(item => item.offer_id === candidate.offer_id);
  if (!offer || offer.action.capability_id !== candidate.action.capability_id || offer.action.version !== candidate.action.version
    || (offer.action.provider_id && offer.action.provider_id !== candidate.action.provider_id)) {
    throw contextualErrors.not_offered(`${candidate.provider_title} 没有为这段内容准备「${candidate.title}」`);
  }
  return { key, offer_id: candidate.offer_id, title: candidate.title, intent: candidate.intent, apply: candidate.apply,
    action: candidate.action, provider_title: candidate.provider_title, input: offer.input, ...(whole ? { scope: "object" as const } : {}),
    ...(offer.summary ? { summary: offer.summary } : {}), ...(offer.editable?.length ? { editable: offer.editable } : {}), ...(offer.missing?.length ? { missing: offer.missing } : {}) };
}

/** surface → the one kind it opens and the plugin that owns it; surfaces claimed by several kinds or plugins are left out. */
export function surfaceKinds(directory: readonly ActionView[]): Record<string, { kind: string; plugin_id: string }> {
  const claims = new Map<string, Set<string>>();
  for (const view of directory) {
    const source = (view.action as { search_source?: { kinds?: readonly { kind: string; surface?: string }[] } }).search_source;
    const owner = view.provider.plugin_id ?? view.provider.provider_id;
    for (const entry of source?.kinds ?? []) {
      if (!entry.surface) continue;
      const claim = claims.get(entry.surface) ?? new Set<string>();
      claim.add(JSON.stringify([entry.kind, owner]));
      claims.set(entry.surface, claim);
    }
  }
  const out: Record<string, { kind: string; plugin_id: string }> = {};
  for (const [surface, claim] of claims) {
    if (claim.size !== 1) continue;
    const [kind, plugin_id] = JSON.parse([...claim][0]!) as [string, string];
    out[surface] = { kind, plugin_id };
  }
  return out;
}
