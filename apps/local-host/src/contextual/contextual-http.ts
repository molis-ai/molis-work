import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ActionError, FRAGMENT_GRANULARITIES, FRAGMENT_ROLES, type ActionReference, type ActionView, type FragmentActionOffer, type FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { FUNCTIONS_DEFAULT_MODEL } from "@molis-ai/molis-work-contracts/modules/functions";
import type { ContextualJudgeRequest, SurfaceActivity, SurfaceFocus, SurfaceFocusTarget } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates } from "@molis-ai/molis-work-kernel";
import { TYPESAFE_SYSTEMONE_URL } from "@molis-ai/molis-work-module-functions";
import { screenModelMaterial } from "@molis-ai/molis-work-service-agent-host";
import { resolvePrologueInference } from "../prologue-inference-host.js";
import { typeSafeConfiguration, typeSafeCredential } from "../typesafe-connection.js";
import { readLocalWebBody as readBody, sendLocalWebJson as sendJson } from "../web-http.js";
import { createContextualJudgmentService, type ContextualJudgmentService } from "./judgment-service.js";

/**
 * Workbench transport for context-driven interaction (specs/contextual-interaction §4, §7). Candidates and their
 * prepared inputs come from the directory under the local person's own authority in this project; the judgment only
 * ranks them, through Jev on the Home's TypeSafe connection via Prologue. Nothing here runs a chosen action: the page
 * that owns the object runs it after the person confirms (P1), or the Assistant does through its cards (P2).
 */
export interface ContextualActions {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ActionReference, input: unknown): Promise<unknown>;
}

export interface ContextualHttpPorts {
  /** Home whose TypeSafe connection and Prologue inference the judgment uses; absent means rules only. */
  readonly homeDirectory?: string;
  /** Separates panes of different projects served by one process. */
  readonly scope: string;
  /** The local person's authority in this project, bound for this request. */
  actions(): ContextualActions;
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
  const query = [focus.surroundings?.heading_path.at(-1), ...focus.targets.map(target => target.text)].filter(Boolean).join(" ").slice(0, 300);
  const out = await caller.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {
    query, situation: { plugin_id: focus.plugin_id, object_kind: focus.object.kind, ...(focus.goal ? { goal_id: focus.goal.id } : {}) },
    limit: 6, budget_chars: 800, used_for: "给选中的内容排动作" }) as { state?: string; items?: readonly { kind?: unknown; text?: unknown }[] };
  if (out.state === "off") return { state: "off", items: [] };
  return { state: "ok", items: (out.items ?? []).filter(item => typeof item.text === "string" && item.text)
    .map(item => ({ kind: typeof item.kind === "string" ? item.kind : "memory", text: String(item.text).slice(0, 300) })) };
}

const SIGNALS: ReadonlySet<string> = new Set(["accepted", "ignored", "rewritten", "undone"]);
const WHERE: Readonly<Record<string, string>> = { word: "选中的词", range: "选中的文字", block: "这一段", blocks: "选中的几段", objects: "选中的几份内容" };

/**
 * What the person did with an offered action (P3), for the memory service to count: the capability and its title only,
 * never the content. Nothing is reported when this directory has no memory, and a stale key is refused.
 */
async function reportSignal(focus: SurfaceFocus, key: string, signal: string, eventId: string, caller: Caller) {
  const views = await directory(caller);
  const view = memoryAction(views, "memory.signals.report");
  if (!view) return { state: "unavailable" as const };
  const candidate = fragmentCandidates(views, focus).find(item => item.key === key);
  if (!candidate) throw new ContextualRequestError(409, "contextual.stale", "这个动作已不在当前内容的候选里");
  const surface = views.find(item => (item.provider.plugin_id ?? item.provider.provider_id) === focus.plugin_id)?.provider.title;
  const where = focus.activity === "completed" ? "刚完成的一步" : focus.activity === "editing" ? "正在写的段落" : WHERE[focus.granularity] ?? "选中的内容";
  return caller.actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {
    event_id: eventId, signal, subject: { capability_id: candidate.action.capability_id, label: candidate.title.slice(0, 40) },
    situation: { plugin_id: focus.plugin_id, object_kind: focus.object.kind, label: `${surface ? surface + " 里" : ""}${where}`.slice(0, 40) },
    occurrence: focus.context_id.slice(0, 120) });
}

/** One service per Home: per-pane cancellation and the judgment cache outlive a single request. */
function serviceFor(home: string | undefined): ContextualJudgmentService<Caller> {
  const key = home ? path.resolve(home) : "";
  let service = services.get(key);
  if (service) return service;
  service = createContextualJudgmentService<Caller>({
    directory,
    ...(home ? { evaluate: jevEvaluator(home), configured: () => Boolean(credential(home)) } : {}),
    recall: (focus, caller) => recallForJudgment(focus, caller),
    screen: screenModelMaterial,
  });
  services.set(key, service);
  return service;
}

/** The judgment's TypeSafe key: the process override the other TypeSafe callers honour, else the Home's selected connection. */
const credential = (home: string) => process.env.TYPESAFE_API_KEY?.trim() || typeSafeCredential(home, "functions");

/** Multi-question Jev through the Home's Prologue inference; the key never leaves this process's memory. */
function jevEvaluator(home: string): NonNullable<Parameters<typeof createContextualJudgmentService>[0]["evaluate"]> {
  return async ({ state, questions, signal }) => {
    if (!credential(home)) throw new Error("这个 Home 没有可用的 TypeSafe 连接");
    const configuration = JSON.stringify(typeSafeConfiguration(home, "functions"));
    const inference = await resolvePrologueInference(home);
    const credential_ref = "typesafe:contextual";
    const body = await inference.evaluateTypeSafe({ endpoint: TYPESAFE_SYSTEMONE_URL, model: FUNCTIONS_DEFAULT_MODEL, state, questions,
      credential_ref, signal, timeout_ms: 30_000,
      // The connection may be changed while the question waits; an answer is only used from the one it was asked on.
      resolveCredential: ref => ref !== credential_ref ? null
        : JSON.stringify(typeSafeConfiguration(home, "functions")) === configuration ? credential(home) : null });
    const model = typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : FUNCTIONS_DEFAULT_MODEL;
    return { body, basis: "jev", model: `Jev · ${model}` };
  };
}

export async function handleContextualHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: ContextualHttpPorts): Promise<boolean> {
  // Which object kind each surface opens, from the plugins' own search-source declarations: when a surface opens an
  // item but does not name it itself, the workbench names it. Only a surface that opens exactly one kind is listed.
  if (url.pathname === "/api/contextual/surfaces") {
    if (request.method !== "GET") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
    try { sendJson(response, 200, { surfaces: surfaceKinds(await ports.actions().discover()) }); }
    catch { sendJson(response, 500, { code: "contextual.failed", error: "暂时处理不了，请稍后重试" }); }
    return true;
  }
  const match = /^\/api\/contextual\/(candidates|judge|cancel|prepare|signal)$/u.exec(url.pathname);
  if (!match) return false;
  if (request.method !== "POST") { sendJson(response, 405, { error: "请求方法不受支持" }); return true; }
  const route = match[1]!;
  const service = serviceFor(ports.homeDirectory);
  try {
    const body = await readBody(request);
    const pane = `${ports.scope}\u0000${readString(body.pane_id, "pane_id", 80)}`;
    if (route === "cancel") { service.cancel(pane); sendJson(response, 200, { ok: true }); return true; }
    const caller: Caller = { scope: ports.scope, actions: ports.actions() };
    const judgeRequest: ContextualJudgeRequest = { ...readJudgeRequest(body), pane_id: pane };
    if (route === "candidates") { sendJson(response, 200, await service.candidates(judgeRequest, caller)); return true; }
    if (route === "judge") {
      // The page gave up on this context (the person moved on): stop waiting on the model for it.
      const aborted = new AbortController();
      const stop = () => { if (!response.writableFinished) aborted.abort(); };
      response.once("close", stop);
      try { sendJson(response, 200, await service.judge(judgeRequest, caller, aborted.signal)); } finally { response.off("close", stop); }
      return true;
    }
    if (route === "signal") {
      const signal = readString(body.signal, "signal", 20);
      if (!SIGNALS.has(signal)) throw invalid("signal");
      sendJson(response, 200, await reportSignal(judgeRequest.focus, readString(body.key, "key", 80), signal, readString(body.event_id, "event_id", 120), caller));
      return true;
    }
    sendJson(response, 200, await prepare(judgeRequest.focus, readString(body.key, "key", 80), readString(body.request_id, "request_id", 120), caller));
  } catch (error) {
    const status = error instanceof ContextualRequestError ? error.status
      : error instanceof ActionError ? (error.code === "actions.forbidden" ? 403 : error.code === "actions.input_invalid" ? 400 : 409) : 500;
    sendJson(response, status, { code: error instanceof ActionError ? error.code : error instanceof ContextualRequestError ? error.code : "contextual.failed",
      error: error instanceof ContextualRequestError || error instanceof ActionError ? error.message : "暂时处理不了，请稍后重试" });
  }
  return true;
}

/**
 * The chosen offer's complete input, prepared by the provider that declared it for exactly this fragment. Preparing
 * writes nothing; the offer must still be a candidate of this context and name the same action it did when judged.
 */
async function prepare(focus: SurfaceFocus, key: string, requestId: string, caller: Caller) {
  const candidate = fragmentCandidates(await caller.actions.discover(), focus).find(item => item.key === key);
  if (!candidate) throw new ContextualRequestError(409, "contextual.stale", "这个动作已不在当前内容的候选里，请重新选择");
  if (!candidate.available) throw new ContextualRequestError(409, "contextual.unavailable", candidate.reason ?? "这个动作现在不可用");
  const input: FragmentOffersInput = { request_id: requestId, fragment: { object: focus.object,
    granularity: focus.granularity as FragmentOffersInput["fragment"]["granularity"],
    // The fragment contract takes at most eight parts: the ones the person selected first.
    targets: focus.targets.slice(0, 8).map(({ kind, role, ref, text, truncated }) => ({ kind, ...(role ? { role } : {}), ...(ref ? { ref } : {}), text, ...(truncated ? { truncated } : {}) })),
    ...(focus.surroundings?.heading_path.length ? { heading_path: focus.surroundings.heading_path } : {}),
    ...(focus.goal ? { goal: { id: focus.goal.id, title: focus.goal.title } } : {}) } };
  const { offers } = await caller.actions.invoke(candidate.source, input) as { offers: readonly FragmentActionOffer[] };
  const offer = offers.find(item => item.offer_id === candidate.offer_id);
  if (!offer || offer.action.capability_id !== candidate.action.capability_id || offer.action.version !== candidate.action.version
    || (offer.action.provider_id && offer.action.provider_id !== candidate.action.provider_id)) {
    throw new ContextualRequestError(409, "contextual.not_offered", `${candidate.provider_title} 没有为这段内容准备「${candidate.title}」`);
  }
  return { key, offer_id: candidate.offer_id, title: candidate.title, intent: candidate.intent, apply: candidate.apply,
    action: candidate.action, provider_title: candidate.provider_title, input: offer.input,
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

class ContextualRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

const invalid = (field: string) => new ContextualRequestError(400, "contextual.input_invalid", `情境请求的 ${field} 不合法`);
const ACTIVITIES: ReadonlySet<string> = new Set<SurfaceActivity>(["browsing", "selecting", "editing", "comparing", "completed"]);
const GRANULARITIES: ReadonlySet<string> = new Set(["page", "object", ...FRAGMENT_GRANULARITIES]);
const ROLES: ReadonlySet<string> = new Set(FRAGMENT_ROLES);
const MAX_TARGETS = 24;
const MAX_TARGET_TEXT = 4_000;

function readString(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value || value.length > max) throw invalid(field);
  return value;
}

function readRef(value: unknown, field: string): SurfaceFocus["object"] {
  if (!value || typeof value !== "object") throw invalid(field);
  const ref = value as Record<string, unknown>;
  const version = ref.version;
  if (version !== undefined && typeof version !== "string" && typeof version !== "number") throw invalid(`${field}.version`);
  return { kind: readString(ref.kind, `${field}.kind`, 80), id: readString(ref.id, `${field}.id`, 200),
    ...(version !== undefined ? { version } : {}), ...(typeof ref.title === "string" ? { title: ref.title.slice(0, 200) } : {}) };
}

/** A page's claim about what the person has in hand, bounded before anything else reads it. */
function readJudgeRequest(body: Record<string, unknown>): Omit<ContextualJudgeRequest, "pane_id"> {
  const raw = body.focus;
  if (!raw || typeof raw !== "object") throw invalid("focus");
  const focus = raw as Record<string, unknown>;
  const activity = readString(focus.activity, "focus.activity", 20);
  const granularity = readString(focus.granularity, "focus.granularity", 20);
  if (!ACTIVITIES.has(activity)) throw invalid("focus.activity");
  if (!GRANULARITIES.has(granularity)) throw invalid("focus.granularity");
  if (!Array.isArray(focus.targets) || focus.targets.length > MAX_TARGETS) throw invalid("focus.targets");
  const targets = focus.targets.map((item: unknown, index): SurfaceFocusTarget => {
    if (!item || typeof item !== "object") throw invalid(`focus.targets[${index}]`);
    const target = item as Record<string, unknown>;
    if (target.kind !== "text_range" && target.kind !== "block" && target.kind !== "object") throw invalid(`focus.targets[${index}].kind`);
    if (target.role !== undefined && !ROLES.has(String(target.role))) throw invalid(`focus.targets[${index}].role`);
    if (typeof target.text !== "string") throw invalid(`focus.targets[${index}].text`);
    const cut = target.text.length > MAX_TARGET_TEXT;
    return { kind: target.kind, ...(target.role !== undefined ? { role: target.role as SurfaceFocusTarget["role"] } : {}),
      ...(target.ref !== undefined ? { ref: readRef(target.ref, `focus.targets[${index}].ref`) } : {}),
      text: cut ? target.text.slice(0, MAX_TARGET_TEXT) : target.text, ...(cut || target.truncated === true ? { truncated: true } : {}),
      ...(Number.isInteger(target.anchor) ? { anchor: target.anchor as number } : {}), ...(Number.isInteger(target.head) ? { head: target.head as number } : {}) };
  });
  const surroundings = focus.surroundings && typeof focus.surroundings === "object" ? focus.surroundings as Record<string, unknown> : null;
  const goal = focus.goal && typeof focus.goal === "object" ? focus.goal as Record<string, unknown> : null;
  const strings = (value: unknown, max: number) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, max).map(item => item.slice(0, 200)) : [];
  return {
    focus: {
      context_id: readString(focus.context_id, "focus.context_id", 240), plugin_id: readString(focus.plugin_id, "focus.plugin_id", 120),
      activity: activity as SurfaceActivity, granularity: granularity as SurfaceFocus["granularity"], object: readRef(focus.object, "focus.object"), targets,
      ...(surroundings ? { surroundings: { heading_path: strings(surroundings.heading_path, 6),
        ...(typeof surroundings.before === "string" ? { before: surroundings.before.slice(-300) } : {}),
        ...(typeof surroundings.after === "string" ? { after: surroundings.after.slice(0, 300) } : {}) } } : {}),
      ...(focus.unsaved === true ? { unsaved: true } : {}),
      ...(goal && typeof goal.id === "string" && typeof goal.title === "string" ? { goal: { id: goal.id.slice(0, 200), title: goal.title.slice(0, 200),
        ...(typeof goal.state === "string" ? { state: goal.state.slice(0, 40) } : {}) } } : {}),
    },
    recent: strings(body.recent, 3),
    pinned: strings(body.pinned, 8),
    dismissed: strings(body.dismissed, 32),
    ...(body.previous && typeof body.previous === "object" && typeof (body.previous as Record<string, unknown>).context_id === "string"
      ? { previous: { context_id: String((body.previous as Record<string, unknown>).context_id).slice(0, 240), primary: strings((body.previous as Record<string, unknown>).primary, 8) } } : {}),
  };
}
