import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { mcpErrors } from "./mcp-errors.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { readLocalWebBody as readBody, respondLocalWebRefusal, sendLocalWebJson as sendJson } from "./web-http.js";
import { renderMcpAccessRows } from "@molis-ai/molis-work-app-workbench";
import { t as uiText, escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { judgmentRecommendationKeys, subjectOfferChoices } from "@molis-ai/molis-work-kernel";
import { readText, listJoin } from "./web-locale.js";
import { readMcpActionAccess } from "./mcp-action-access.js";
import { actionClientAudience, createMcpActionGrant, openByDefault, resolveMcpActionContext } from "./mcp-action-grants.js";
import { actionGrantKey, readMcpToolPreference, writeMcpActionGrants, type McpActionGrantExpected, type McpGrantIdentity, type McpToolPreference } from "./mcp-settings-store.js";
import { isTaskGrantSubject } from "./task-grant-subjects.js";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

type GrantEntry = ExactActionReference & { readonly expected: McpActionGrantExpected };
type GrantChange = GrantEntry & { readonly enabled: boolean; readonly with?: readonly GrantEntry[] };
type GrantControl = { beforeEffect(): void | Promise<void>; assertCurrent(): void };

function isExpected(value: unknown): value is McpActionGrantExpected {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.keys(value).length !== 1) return false;
  return "expected_generation" in value ? typeof value.expected_generation === "string" && value.expected_generation.trim() !== ""
    : "expected_absent" in value && value.expected_absent === true;
}

function isGrantEntry(value: unknown): value is GrantEntry {
  if (typeof value !== "object" || !value || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.capability_id === "string" && row.capability_id.trim() !== "" && typeof row.provider_id === "string" && row.provider_id.trim() !== ""
    && Number.isSafeInteger(row.version) && Number(row.version) > 0 && isExpected(row.expected);
}

function readGrantChange(input: Record<string, unknown>): GrantChange {
  const keys = ["client_id", "project_id", "capability_id", "version", "provider_id", "enabled", "expected", "with"];
  const { with: peers, enabled } = input;
  if (!isGrantEntry(input) || Object.keys(input).some(key => !keys.includes(key)) || typeof enabled !== "boolean"
    || (peers !== undefined && (!enabled || !Array.isArray(peers) || peers.length > 16 || !peers.every(row => isGrantEntry(row) && Object.keys(row).length === 4)))) {
    throw mcpErrors.grant_invalid("每项授权必须带当前版本；权限来自能力声明");
  }
  return { capability_id: input.capability_id, version: input.version, provider_id: input.provider_id, expected: input.expected, enabled, ...(peers ? { with: peers } : {}) };
}

const identity = (caller: ActionCallContext, { capability_id, version, provider_id }: ExactActionReference): McpGrantIdentity =>
  ({ client_id: caller.actor_id, project_id: caller.project_id, capability_id, version, provider_id });

/** Original MCP owner shared by local settings and the unified manager. */
export async function changeMcpActionAccess(home: string, host: MolisWorkLocalHost, caller: ActionCallContext, input: GrantChange,
  control: GrantControl, preference: McpToolPreference, project: () => Promise<LocalHostProjectReference | undefined>) {
  const main = identity(caller, input), key = actionGrantKey(main);
  const changes = [input, ...input.with ?? []];
  const expected = new Map(changes.map(row => [actionGrantKey(identity(caller, row)), row.expected]));
  if (expected.size !== changes.length) throw mcpErrors.grant_invalid("同一项授权只能选择一次");
  const save = async (grants: Parameters<typeof writeMcpActionGrants>[1], owner = control, read?: ReadonlyMap<string, McpActionGrantExpected>) => {
    const written = await writeMcpActionGrants(home, grants, { by: { ...caller, actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user" }, expected, control: owner, read });
    return written.action_grants.find(row => actionGrantKey(row) === key)!;
  };
  const previous = preference.action_grants.find(grant => actionGrantKey(grant) === key);
  if (!input.enabled && previous) return save([{ ...main, permissions: previous.permissions, enabled: false }]);

  const reference = await project();
  const projectCurrent = reference && host.holdAuthorizationProject(reference);
  const all = await host.inspectActions(caller, reference);
  const catalog = new Map(all.filter(view => view.action.scope === (caller.project_id ? "project" : "home")).map(view =>
    [actionGrantKey(identity(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })), view]));
  const views = changes.map(row => {
    const view = catalog.get(actionGrantKey(identity(caller, row)));
    if (!view) throw new ActionError("actions.missing", "能力、版本或提供方已失效，请刷新目录");
    return view;
  });
  if (!input.enabled && !openByDefault(views[0]!, caller)) throw mcpErrors.grant_missing("没有这项授权记录");
  const grants = views.map(view => createMcpActionGrant(caller.actor_id, caller.project_id, view, input.enabled));
  if (!input.enabled) return save(grants, { beforeEffect: control.beforeEffect, assertCurrent: () => { control.assertCurrent(); projectCurrent?.(); } });

  const proposed = { ...preference, action_grants: [...preference.action_grants.filter(row => !expected.has(actionGrantKey(row))), ...grants] };
  const context = resolveMcpActionContext(caller, all, proposed);
  const service = reference ? host.actionClient(reference) : host.homeActionClient();
  const allowed = new Set(context.allowed_actions?.map(ref => actionGrantKey(identity(caller, { ...ref, provider_id: ref.provider_id ?? "" }))));
  const availableActions = all.filter(view => allowed.has(actionGrantKey(identity(caller, {
    capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id,
  }))));
  const dependencies = new Set(views);
  const scenes = new Map<string, ReturnType<typeof host.holdRequiredScene>>();
  let offers: ReturnType<typeof subjectOfferChoices> | undefined;
  const addDependency = (needed: { capability_id: string; version: number; provider_id?: string }) => {
    const dependency = availableActions.find(view => view.capability_id === needed.capability_id && view.version === needed.version
      && (!needed.provider_id || view.provider.provider_id === needed.provider_id));
    if (dependency) dependencies.add(dependency);
    return dependency;
  };
  // This is a closure over the actual grant references, including scene rules and their declared subject offers.
  for (const view of dependencies) {
    for (const needed of view.action.required_actions ?? []) addDependency(needed);
    for (const role of view.action.required_roles ?? []) {
      for (const candidate of availableActions) {
        if (candidate.action.input_type === role.input_type && candidate.action.output_type === role.output_type) dependencies.add(candidate);
      }
    }
    const scene = view.action.required_scene;
    if (!scene) continue;
    const key = JSON.stringify([scene.scene_id, scene.version]);
    if (scenes.has(key)) continue;
    const held = host.holdRequiredScene(context, scene, reference);
    scenes.set(key, held);
    for (const binding of held.bindings) {
      const fn = addDependency(binding.function);
      if (!fn || held.definition.recommendation_source !== "subject-offers") continue;
      const keys = judgmentRecommendationKeys(fn) ?? [];
      offers ??= subjectOfferChoices(availableActions);
      for (const offer of offers) if (keys.includes(offer.key)) { addDependency(offer.source); addDependency(offer.action); }
    }
  }
  const accepted = await service.discover(context);
  for (const view of views) assertGrantAvailable(view, accepted, context);
  const saved = new Map(preference.action_grants.map(row => [actionGrantKey(row), row]));
  const read = new Map<string, McpActionGrantExpected>();
  for (const view of dependencies) {
    const key = actionGrantKey({ ...identity(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }),
      project_id: view.action.scope === "home" ? null : caller.project_id });
    const previous = saved.get(key);
    if (!expected.has(key)) read.set(key, previous ? { expected_generation: previous.generation } : { expected_absent: true });
  }
  return save(grants, { beforeEffect: control.beforeEffect, assertCurrent: () => {
    control.assertCurrent();
    projectCurrent?.();
    for (const scene of scenes.values()) scene.assertCurrent();
    const latest = new Map(host.inspectActionMetadata(caller, reference).map(view =>
      [actionGrantKey(identity(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })), view]));
    for (const view of dependencies) {
      const current = latest.get(actionGrantKey(identity(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })));
      if (current?.action !== view.action || current.provider !== view.provider) throw new ActionError("actions.provider_changed", "能力或提供方已变化，请重新查看授权");
    }
  } }, read);
}

function assertGrantAvailable(view: ActionView, accepted: readonly ActionView[], context: ActionCallContext): void {
  const state = accepted.find(row => row.capability_id === view.capability_id && row.version === view.version && row.provider.provider_id === view.provider.provider_id)?.availability;
  if (state?.available) return;
  const missing = (view.action.required_actions ?? []).filter(need => !(context.allowed_actions ?? []).some(allowed => allowed.capability_id === need.capability_id
    && allowed.version === need.version && (!need.provider_id || allowed.provider_id === need.provider_id)));
  if (missing.length) throw mcpErrors.grant_requires(uiText.text("workbench.mcp-action-settings.action-also-needs-these-actions-granted-actions", { actions: listJoin(missing.map(need => need.capability_id)) }));
  throw new ActionError(state && !state.available ? state.code : "mcp.grant_unavailable", state && !state.available ? state.reason : "能力尚不可用，请检查权限和方法开关",
    state && !state.available && state.kind ? { kind: state.kind } : undefined);
}

/** Called only behind the local Web origin/control-token gate. Clients cannot authorize themselves. */
export async function handleMcpActionSettingsHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  homeDirectory: string | undefined, host: MolisWorkLocalHost, withCatalog: LocalWebCatalogRunner, accountCurrent?: () => void): Promise<boolean> {
  if (url.pathname !== "/api/settings/mcp/actions") return false;
  if (!homeDirectory) { sendJson(response, 400, { error: "缺少本机目录" }); return true; }
  if (request.method !== "GET" && request.method !== "POST") { sendJson(response, 405, { error: "不支持此方法" }); return true; }
  const control = authorizationSettingsControl(request, response, host, accountCurrent);
  try {
    control.assertCurrent();
    const input = request.method === "POST" ? await readBody(request) : Object.fromEntries(url.searchParams);
    const clientId = input.client_id;
    const projectId = input.project_id === null || input.project_id === "" || input.project_id === undefined ? null : input.project_id;
    if (typeof clientId !== "string" || !clientId.trim() || (projectId !== null && (typeof projectId !== "string" || !projectId.trim()))) {
      throw mcpErrors.grant_invalid("请选择客户端和有效范围");
    }
    // A task's grant subject is given only what `agent.task_grants.set` records for the categories the person turned on; here it is no client.
    if (isTaskGrantSubject(clientId)) throw mcpErrors.grant_invalid("任务能读的数据在任务里设置，不在对外接入里");
    const caller: ActionCallContext = { actor_id: clientId, project_id: projectId, audience: actionClientAudience(clientId), permissions: [] };
    const preference = await readMcpToolPreference(homeDirectory);
    let scopeMissing = false;
    const project = () => projectId ? withCatalog({ homeDirectory }, catalog => {
      try { const record = catalog.getProject(projectId); return molisWorkHostProjectReference({ projectId, databasePath: record.database_path }); }
      catch (error) { if (request.method === "GET" && (error as { code?: string }).code === "catalog.project_not_found") { scopeMissing = true; return undefined; } throw error; }
    }) : Promise.resolve(undefined);
    if (request.method === "GET") {
      const reference = await project();
      const access = await readMcpActionAccess(homeDirectory, host, caller, reference, scopeMissing, preference);
      sendJson(response, 200, url.searchParams.get("format") === "html" ? { html: renderMcpAccessRows({ entries: access.entries,
        query: url.searchParams.get("q") ?? "", filter: url.searchParams.get("filter") ?? "" }, { readText, escapeHtml: value => escapeHtml(String(value ?? "")) }) } : access);
      return true;
    }
    control.assertCurrent();
    const grant = await changeMcpActionAccess(homeDirectory, host, caller, readGrantChange(input), control, preference, project);
    sendJson(response, 200, grant);
  } catch (error) {
    respondLocalWebRefusal({ respond: (status, body) => sendJson(response, status, body) }, error);
  }
  return true;
}
