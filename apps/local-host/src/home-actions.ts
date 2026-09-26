import { homeTalkActions, createHomeTalkHandlers } from "./home-talk-actions.js";
import { homeOfferActions, createHomeOfferHandlers, type HomeActionOffer, type HomeActionOffers } from "./home-offer-actions.js";
import { homeEventActions, createHomeEventHandlers } from "./home-event-actions.js";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { judgmentRecommendationKeys, subjectOfferCompatibilityReason } from "@molis-ai/molis-work-kernel";
import { ActionError, ACTION_SUBJECT_SCHEMA, resolveActionSubject, type ActionSubject, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionProviderRegistration, type ActionReference,
  type ActionSceneBinding, type ActionSceneClient, type ActionSceneDefinition, type ActionSceneHandlerBinding, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { HOME_DOCK_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { withFunctionsService } from "./functions-host.js";
import type { InboxSceneServices } from "./inbox-scene.js";

export type HomeSubject = ActionSubject;
interface HomeSubjectContext extends HomeSubject { content: string; revision: string; reader: ActionReference }
interface HomeSubjectState extends HomeSubjectContext { request_id: string; offers: HomeActionOffer[] }
export interface HomeJudgmentState {
  function_key: string | null; functions: { function_key: string; name: string }[];
  capabilities: ActionView[]; binding: ActionSceneBinding | null;
}
export interface HomeRecommendations { judgments: JudgmentRecord[] }
const empty = { type: "object", properties: {}, additionalProperties: false };
const text = { type: "string" };
const subjectSchema = ACTION_SUBJECT_SCHEMA;
const judgmentProperties = { judgment_id: text, function_key: text, function_version: { type: "integer" },
  subject: { type: "object", properties: { kind: { type: "string", minLength: 1 }, id: text, board_id: text }, required: ["kind", "id", "board_id"] },
  scene_id: { const: HOME_DOCK_SCENE_ID }, outcome: { enum: ["ok", "needs_review"] },
  suggested_behavior_ids: { type: "array", items: text }, error_code: { type: ["string", "null"] }, created_at: text };
const resultSchema = { type: "object", properties: { judgments: { type: "array", items: { type: "object", properties: judgmentProperties, required: Object.keys(judgmentProperties) } } }, required: ["judgments"] };

export const homeDockScene: ActionSceneDefinition = {
  scene_id: HOME_DOCK_SCENE_ID, version: 1, title: "首页下一步",
  description: "根据首页事项内容推荐下一步，保留判断记录，由用户选择执行。",
  trigger: "插件事项到达或用户重新判断；按所选规则声明的对象类型适用", scope: "project", subject_kinds: [],
  permissions: ["home:read", "model:invoke"], configuration_permissions: ["home:write"], event_schema: subjectSchema,
  input_schema: { type: "object", properties: { content: { type: "string", minLength: 1, maxLength: 8000 } }, required: ["content"], additionalProperties: false },
  result_type: "molis.behavior-recommendation.v1", recommendation_source: "subject-offers",
  // The shared scene service checks the rule's complete finite set against the
  // current declared choices. The consumer checks actual object inputs as well.
  result_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] },
    suggested_behavior_ids: { type: "array", items: {} } }, required: ["status", "suggested_behavior_ids"] },
};
const define = <I, O>(id: string, title: string, operation: "query" | "command", input: Record<string, unknown>, output: Record<string, unknown>, permissions: string[], requiredScene?: { scene_id: string; version: number }): ActionDefinition<I, O> => ({
  capability_id: id, version: 1, operation, action: { title, description: title, kind: operation === "query" ? "query" : "operation",
    scope: "project", audiences: ["user", "agent", "workflow", "mcp"], permissions, ...(requiredScene ? { required_scene: requiredScene } : {}), subject_kinds: [], input_schema: input, output_schema: output },
});
export const homeActions = {
  ...homeEventActions,
  ...homeTalkActions,
  ...homeOfferActions,
  readJudgment: define<Record<string, never>, HomeJudgmentState>("home.judgment.read", "首页判断规则", "query", empty, {
    type: "object", properties: { function_key: { type: ["string", "null"] }, functions: { type: "array", items: { type: "object", properties: { function_key: text, name: text }, required: ["function_key", "name"] } },
      capabilities: { type: "array", items: { type: "object" } }, binding: { type: ["object", "null"] } }, required: ["function_key", "functions", "capabilities", "binding"],
  }, ["home:read"]),
  writeJudgment: define<{ function_key: string | null }, { function_key: string | null }>("home.judgment.write", "设置首页判断", "command", {
    type: "object", properties: { function_key: { type: ["string", "null"] } }, required: ["function_key"], additionalProperties: false,
  }, { type: "object", properties: { function_key: { type: ["string", "null"] } }, required: ["function_key"] }, ["home:write"]),
  evaluate: define<{ subjects: HomeSubject[] }, HomeRecommendations>("home.judgment.evaluate", "重新判断首页事项", "command", {
    type: "object", properties: { subjects: { type: "array", minItems: 1, maxItems: 20, items: subjectSchema } }, required: ["subjects"], additionalProperties: false,
  }, resultSchema, [...homeDockScene.permissions], homeDockScene),
  recommendations: define<Record<string, never>, HomeRecommendations>("home.recommendations.read", "当前首页建议", "query", empty, resultSchema, ["home:read"]),
};
export const HOME_ACTION_PERMISSIONS = ["home:read", "home:write", "feed:read", "inbox:read", "model:invoke", "functions:invoke"] as const;
export const homeDockBindingId = (project: string) => `${HOME_DOCK_SCENE_ID}:${project}`;

/** Home owns its consumption contract; Functions remains the owner of saved bindings and history. */
export function homeActionProvider(home: string, projectId: string, boardId: string, services: InboxSceneServices, onRecorded: (judgment: JudgmentRecord, caller: ActionCallContext) => void): ActionProviderRegistration {
  const read = <T>(operation: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, operation, services.functions);
  const published = () => read(service => service.list().filter(rule => rule.status === "published" && rule.version));
  const legacyKey = (value: ActionSceneBinding) => published().find(rule => {
    const action = publishedFunctionAction(rule);
    return value.function.capability_id === action.capability_id && value.function.version === action.version;
  })?.function_key ?? "";
  const bindingFor = (key: string, version: number): ActionSceneBinding => ({ binding_id: homeDockBindingId(projectId), scene_id: HOME_DOCK_SCENE_ID,
    scene_version: 1, project_id: projectId, function: { capability_id: `functions.published.${key}`, version, provider_id: "system.functions" }, enabled: true,
    title: "首页下一步", href: `/projects/${encodeURIComponent(projectId)}/` });
  const binding = (): ActionSceneBinding | null => read(service => {
    const current = service.actionSceneBinding(HOME_DOCK_SCENE_ID, boardId);
    if (current) return current;
    const old = service.sceneBinding(HOME_DOCK_SCENE_ID, boardId);
    if (!old) return null;
    return { ...bindingFor(old.function_key, service.list().find(rule => rule.function_key === old.function_key)?.version ?? 1),
      revision: service.sceneBindingRevision(HOME_DOCK_SCENE_ID, boardId) };
  });
  const resolve = async (subject: HomeSubject, caller: ActionCallContext): Promise<HomeSubjectContext> => {
    const { context, reader } = await resolveActionSubject(services.actions, caller, subject);
    // Pin both original reader identity and the actual content. The owner revision
    // can include related objects and must not stand in for provider identity.
    const revision = createHash("sha256").update(JSON.stringify([reader.capability_id, reader.version, reader.provider_id,
      context.subject.kind, context.subject.id, context.revision, context.title, context.content, context.truncated,
      [...context.goal_ids].sort(), context.session_id])).digest("hex");
    return { ...subject, content: [context.title, context.content].filter(Boolean).join("\n").slice(0, 8000), revision, reader };
  };
  const assertSubjectFits = async (subject: HomeSubject, caller: ActionCallContext) => {
    const value = binding();
    if (!value?.enabled) throw new ActionError("actions.binding_missing", "未找到启用的首页判断规则");
    const fn = (await services.actions.discover(caller)).find(action => action.capability_id === value.function.capability_id
      && action.version === value.function.version && (!value.function.provider_id || action.provider.provider_id === value.function.provider_id));
    if (!fn?.availability.available) throw new ActionError("actions.binding_changed", "首页判断规则当前不可用");
    if (fn.action.subject_kinds.length && !fn.action.subject_kinds.includes(subject.kind)) throw new ActionError("actions.subject_incompatible", "所选首页判断规则不适用于此类事项");
    return fn;
  };
  const prepareOffers = async (subject: HomeSubject, caller: ActionCallContext, request_id: string): Promise<HomeActionOffer[]> => {
    const result = await services.actions.invoke(caller, homeOfferActions.offers, { subject: { kind: subject.kind, id: subject.id }, request_id }) as HomeActionOffers;
    return result.offers.filter(offer => offer.availability.available && offer.recommendation_key);
  };
  const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, ordered(value)])) : value;
  const offerRevision = (offers: HomeActionOffer[]) => createHash("sha256").update(JSON.stringify(ordered(offers
    .map(({ recommendation_key, source, action, input, title }) => ({ recommendation_key, source, action, input, title }))
    .sort((a, b) => a.recommendation_key!.localeCompare(b.recommendation_key!))))).digest("hex");
  const sameBinding = (left: ActionSceneBinding | null, right: ActionSceneBinding) => !!left?.enabled && left.binding_id === right.binding_id
    && left.revision === right.revision && left.function.capability_id === right.function.capability_id
    && left.function.version === right.function.version && left.function.provider_id === right.function.provider_id;
  const referenceAvailable = (directory: readonly ActionView[], reference: ActionReference) => directory.some(action =>
    action.capability_id === reference.capability_id && action.version === reference.version
    && action.provider.provider_id === reference.provider_id && action.availability.available);
  const record = async (caller: ActionCallContext, state: HomeSubjectState, value: ActionSceneBinding,
    result: { status: "ok" | "needs_review"; suggested_behavior_ids: string[]; error_code?: string }) => {
    const selected = result.status === "ok" ? [...new Set(result.suggested_behavior_ids)] : [];
    if (selected.some(key => !state.offers.some(offer => offer.recommendation_key === key))) {
      result = { status: "needs_review", suggested_behavior_ids: [], error_code: "actions.recommendation_unavailable" };
    }
    const chosen = state.offers.filter(offer => result.status === "ok" && selected.includes(offer.recommendation_key!));
    const usage = (await services.scenes.usages(caller)).find(current => current.binding_id === value.binding_id && current.scene_id === HOME_DOCK_SCENE_ID);
    if (!usage?.availability.available) throw new ActionError("actions.binding_changed", "首页判断能力或绑定已不可用，请重新判断");
    const current = await resolve(state, caller).catch(error => {
      if (error instanceof ActionError && error.code === "actions.subject_unavailable") throw new ActionError("actions.subject_changed", "首页事项或原始内容已不可用，请重新载入");
      throw error;
    });
    if (current.revision !== state.revision) throw new ActionError("actions.subject_changed", "首页事项或原始内容已变化，请重新判断");
    const currentOffers = await prepareOffers(state, caller, state.request_id);
    if (chosen.some(offer => !currentOffers.some(current => current.recommendation_key === offer.recommendation_key
      && isDeepStrictEqual(current, offer)))) throw new ActionError("actions.offer_changed", "判断期间可用动作或参数已变化，请重新判断");
    await caller.validate_authority?.(state.reader);
    await caller.validate_authority?.(value.function);
    for (const offer of chosen) { await caller.validate_authority?.(offer.source); await caller.validate_authority?.(offer.action); }
    const directory = await services.actions.discover(caller);
    if (!referenceAvailable(directory, state.reader) || !referenceAvailable(directory, value.function)) throw new ActionError("actions.provider_changed", "判断或原事项的提供方已不可用");
    if (!sameBinding(binding(), value)) throw new ActionError("actions.binding_changed", "首页判断绑定已变化，请重新判断");
    const fn = directory.find(action => action.capability_id === value.function.capability_id && action.version === value.function.version)!;
    if (subjectOfferCompatibilityReason(fn, directory)) throw new ActionError("actions.binding_changed", "规则引用的动作选项已失效，请重新配置");
    const judgment = read(service => service.recordSceneJudgment({ function_key: legacyKey(value) || value.function.capability_id,
      function_version: value.function.version, subject: { kind: state.kind, id: state.id, board_id: boardId }, scene_id: HOME_DOCK_SCENE_ID,
      outcome: result.status, suggested_behavior_ids: result.status === "ok" ? selected : [], error_code: result.error_code ?? null,
      scene_provenance: { binding_id: value.binding_id, binding_revision: value.revision!, function: value.function, subject_revision: state.revision,
        offer_request_id: state.request_id, offer_revision: offerRevision(chosen) },
    }));
    onRecorded(judgment, caller);
    return judgment;
  };
  const handler: ActionSceneHandlerBinding = {
    scene_id: HOME_DOCK_SCENE_ID, version: 1, bindings: () => { const value = binding(); return value ? [value] : []; },
    targets: () => { const value = binding(); return [{ binding_id: homeDockBindingId(projectId), title: "首页下一步",
      href: `/projects/${encodeURIComponent(projectId)}/`, revision: value?.revision ?? null }]; },
    bind: (caller, value, options) => {
      if (!caller.permissions.includes("home:write")) throw new ActionError("actions.forbidden", "缺少首页规则配置权限");
      if (value.binding_id !== homeDockBindingId(projectId)) throw new ActionError("actions.binding_invalid", "首页只接受当前项目的绑定");
      read(service => service.saveActionSceneBinding(boardId, value, legacyKey(value), options?.expected_revision));
    },
    prepare: async (caller, event) => {
      const subject = event as HomeSubject;
      const fn = await assertSubjectFits(subject, caller);
      const keys = judgmentRecommendationKeys(fn)!;
      const context = await resolve(subject, caller);
      const request_id = randomUUID();
      const offers = (await prepareOffers(subject, caller, request_id)).filter(offer => keys.includes(offer.recommendation_key!));
      if (!offers.length) throw new ActionError("actions.subject_unavailable", "此事项当前没有规则可推荐的动作");
      const options = "\n\n当前可选动作：\n" + offers.map(offer => `${offer.recommendation_key}: ${offer.title}`).join("\n");
      if (options.length >= 8000) throw new ActionError("actions.input_too_large", "当前动作选项超出判断输入容量，请缩小规则的推荐范围");
      const content = context.content.slice(0, Math.max(0, 8000 - options.length)) + options;
      return { input: { content }, state: { ...context, request_id, offers } satisfies HomeSubjectState };
    },
    consume: (caller, _input, result, execution) => record(caller, execution.state as HomeSubjectState, execution.binding,
      result as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] }),
    failed: (caller, _input, error, execution) => record(caller, execution.state as HomeSubjectState, execution.binding,
      { status: "needs_review", suggested_behavior_ids: [], error_code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "actions.judgment_failed" }),
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, caller: ActionCallContext) => O | Promise<O>): ActionHandlerBinding => ({
    ...definition, handle: (caller, input) => handle(input as I, caller),
  });
  return { provider: { provider_id: "system.home", title: "首页", kind: "system", project_id: projectId },
    definitions: Object.values(homeActions), scenes: [homeDockScene], scene_handlers: [handler], handlers: [
      ...createHomeTalkHandlers(projectId, services.actions),
      ...createHomeOfferHandlers(services.actions),
      ...createHomeEventHandlers(services.actions, homeActions.recommendations),
      bind(homeActions.readJudgment, async (_input, caller) => {
        const capabilities: ActionView[] = [];
        for (const action of (await services.actions.discover(caller)).filter(action => action.action.kind === "judgment")) {
          if ((await services.scenes.discoverScenes(caller, action)).some(scene => scene.definition.scene_id === HOME_DOCK_SCENE_ID && scene.compatible)) capabilities.push(action);
        }
        const current = binding();
        return { function_key: current?.enabled ? legacyKey(current) || null : null, binding: current, capabilities,
          functions: published().filter(rule => capabilities.some(action => action.capability_id === publishedFunctionAction(rule).capability_id && action.version === rule.version))
            .map(rule => ({ function_key: rule.function_key, name: rule.name })) };
      }),
      bind(homeActions.writeJudgment, async (input, caller) => {
        const key = input.function_key?.trim() || null;
        if (!key) { const current = binding(); if (current) await services.scenes.bind(caller, { ...current, enabled: false }); }
        else {
          const rule = published().find(rule => rule.function_key === key);
          if (!rule) throw new ActionError("actions.binding_invalid", "请选择已发布的判断规则");
          await services.scenes.bind(caller, bindingFor(key, rule.version!));
        }
        return { function_key: key };
      }),
      bind(homeActions.evaluate, async (input, caller) => {
        const subjects = [...new Map(input.subjects.map(subject => [JSON.stringify([subject.kind, subject.id]), subject])).values()];
        for (const subject of subjects) { await assertSubjectFits(subject, caller); await resolve(subject, caller); }
        const judgments: JudgmentRecord[] = [];
        for (const subject of subjects) judgments.push(await services.scenes.runScene(caller, homeDockScene, homeDockBindingId(projectId), subject) as JudgmentRecord);
        return { judgments };
      }),
      bind(homeActions.recommendations, async (_input, caller) => {
        const usage = (await services.scenes.usages(caller)).find(value => value.scene_id === HOME_DOCK_SCENE_ID && value.binding_id === homeDockBindingId(projectId));
        if (!usage?.enabled || !usage.availability.available) return { judgments: [] };
        if (!sameBinding(binding(), usage)) return { judgments: [] };
        const candidates = read(service => service.latestSceneJudgments(boardId, HOME_DOCK_SCENE_ID));
        const judgments: JudgmentRecord[] = [];
        const readers = new Map<string, ActionReference>();
        const selectedOffers = new Map<string, HomeActionOffer[]>();
        for (const latest of candidates) {
          const provenance = latest.scene_provenance;
          if (!provenance?.offer_request_id || !provenance.offer_revision || provenance.binding_id !== usage.binding_id || provenance.binding_revision !== usage.revision
            || provenance.function.capability_id !== usage.function.capability_id || provenance.function.version !== usage.function.version
            || provenance.function.provider_id !== usage.function.provider_id) continue;
          try {
            await assertSubjectFits(latest.subject, caller);
            const current = await resolve(latest.subject, caller);
            const offers = (await prepareOffers(latest.subject, caller, provenance.offer_request_id)).filter(offer => latest.suggested_behavior_ids.includes(offer.recommendation_key!));
            if (current.revision === provenance.subject_revision && offers.length === latest.suggested_behavior_ids.length
              && offerRevision(offers) === provenance.offer_revision) {
              judgments.push(latest); readers.set(latest.judgment_id, current.reader); selectedOffers.set(latest.judgment_id, offers);
            }
          } catch {
            caller.signal?.throwIfAborted();
            // Missing, changed or ungranted source objects remain history only.
          }
        }
        const authorized: JudgmentRecord[] = [];
        for (const judgment of judgments) {
          try {
            await caller.validate_authority?.(readers.get(judgment.judgment_id)!);
            await caller.validate_authority?.(usage.function);
            for (const offer of selectedOffers.get(judgment.judgment_id)!) {
              await caller.validate_authority?.(offer.source); await caller.validate_authority?.(offer.action);
            }
            authorized.push(judgment);
          }
          catch { caller.signal?.throwIfAborted(); }
        }
        const directory = await services.actions.discover(caller);
        if (!referenceAvailable(directory, usage.function)) return { judgments: [] };
        if (subjectOfferCompatibilityReason(directory.find(action => action.capability_id === usage.function.capability_id && action.version === usage.function.version)!, directory)) return { judgments: [] };
        if (!sameBinding(binding(), usage)) return { judgments: [] };
        return { judgments: authorized.filter(judgment => referenceAvailable(directory, readers.get(judgment.judgment_id)!)) };
      }),
    ] };
}

export function createHomeJudgmentTrigger(options: { scenes: ActionSceneClient; context(): ActionCallContext; boardId: string }) {
  return async (event: HomeSubject & { board_id: string }, explicitCaller?: ActionCallContext): Promise<void> => {
    if (event.board_id !== options.boardId) throw new ActionError("actions.scope_mismatch", "首页事件不属于当前项目");
    const caller = explicitCaller ?? options.context();
    const usage = (await options.scenes.usages(caller)).find(value => value.scene_id === HOME_DOCK_SCENE_ID && value.binding_id === homeDockBindingId(caller.project_id!));
    if (!usage?.enabled || !usage.availability.available) return;
    try { await options.scenes.runScene(caller, homeDockScene, usage.binding_id, { kind: event.kind, id: event.id }); }
    catch (error) {
      if (error instanceof ActionError && ["actions.binding_changed", "actions.binding_missing", "actions.provider_changed", "actions.subject_changed", "actions.subject_unavailable", "actions.subject_incompatible"].includes(error.code)) return;
      const current = (await options.scenes.usages(caller)).find(value => value.binding_id === usage.binding_id);
      if (!current?.enabled || !current.availability.available) return;
      throw error;
    }
  };
}
