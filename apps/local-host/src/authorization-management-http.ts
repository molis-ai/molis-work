import { reviewSourceSummary } from "./agent-review-http.js";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { say, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import type { ProjectDecisionHistory, ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { agentAuthorizationActions } from "@molis-ai/molis-work-contracts/services/agent-host";
import { authorizationOwnerTitles } from "./authorization-action-owners.js";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { invokeAuthorizationManagement, type AuthorizationManagementPorts } from "./authorization-management.js";
import type { WebRequestContext } from "./web-route-table.js";
import { molisWorkHostProjectReference } from "./project-host.js";
import { webManagementAuthenticated } from "./web-sessions.js";
import { readLocalWebBody, respondLocalWebRefusal, sendLocalWebJson } from "./web-http.js";
import { projectRulesFromSettings } from "./project-review-entry.js";

const historyLimit = 100;

function projectDecisionSource(project: string, record: ProjectDecisionHistory | ProjectTrustedDecision): ReturnType<typeof reviewSourceSummary> {
  if ("kind" in record) {
    const original = record.original;
    return { id: record.decision_id, project_id: project, title: String(original.conclusion ?? original.reason ?? record.decision_id),
      phase: t.text("workbench.authorization.project-review-history"), decision: null,
      source: t.text(original.authority_source === "web" || original.authority_source === "management"
        ? "workbench.agent-review.source-person" : "workbench.agent-review.source-unrecorded"),
      person: typeof original.actor_id === "string" ? original.actor_id : null, at: record.recorded_at, detail: null };
  }
  const chosen = record.presentation?.choices.find(row => row.id === record.decision);
  return { id: record.decision_id, project_id: project, title: record.presentation?.summary ?? record.review.target.subject.id,
    phase: t.text("workbench.authorization.project-review-recorded"), decision: chosen ? say.text(chosen.label) : record.decision,
    source: t.text("workbench.agent-review.source-person"), person: record.actor_id, at: record.decided_at,
    detail: record.note };
}

export async function handleAuthorizationManagementHttp(context: WebRequestContext): Promise<boolean> {
  const { request, response, url, serverOptions, localHost: host } = context;
  const history = url.pathname === "/api/settings/authorizations/reviews";
  const rules = url.pathname === "/api/settings/authorizations/project-rules";
  if (!rules && !history && url.pathname !== "/api/settings/authorizations") return false;
  const home = serverOptions.homeDirectory, assistant = host.assistantStore;
  const control = authorizationSettingsControl(request, response, host, serverOptions.assertAccountCurrent);
  try {
    control.assertCurrent();
    if (!webManagementAuthenticated(request)) {
      throw new ActionError("actions.forbidden", "只有本机授权管理入口能读取这些记录");
    }
    if (!home) throw new ActionError("actions.service_unavailable", "授权管理暂时不可用");
    const list = await context.composition.withCatalog({ homeDirectory: home }, catalog => catalog.listProjects());
    const projects = new Map(list.map(project => [project.project_id, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path })]));
    const projectId = url.searchParams.get("project") || null;
    if (projectId && !projects.has(projectId)) throw new ActionError("actions.missing", "找不到这份授权所在的项目");
    if (rules) {
      if (request.method !== "GET" && request.method !== "POST") { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
      const project = projectId ? projects.get(projectId) : undefined;
      if (!project) throw new ActionError("actions.project_required", "请选择项目");
      const id = url.searchParams.get("before_id"), order = url.searchParams.get("before_order");
      const cursor = id === null && order === null ? undefined : { id, order: Number(order) };
      if (cursor && (!cursor.id?.trim() || !order || !/^[1-9]\d*$/u.test(order) || !Number.isSafeInteger(cursor.order))) {
        throw new ActionError("actions.input_invalid", "审批规则分页位置无效");
      }
      const answer = await projectRulesFromSettings({ host, project, request, assertCurrent: control.assertCurrent },
        request.method === "POST" ? await readLocalWebBody(request) : undefined, cursor?.id ? { id: cursor.id, order: cursor.order } : undefined);
      const names = await authorizationOwnerTitles(host, project);
      const rulesWithTitles = answer.rules.map(rule => {
        const owner = rule.scope.owner, id = owner ? ("plugin_id" in owner ? owner.plugin_id : owner.provider_id) : undefined;
        const owner_title = id ? (names.get(id) ?? id) : undefined;
        return owner_title ? { ...rule, owner_title } : rule;
      });
      control.assertCurrent();
      sendLocalWebJson(response, 200, { ...answer, rules: rulesWithTitles });
      return true;
    }
    if (history) {
      if (request.method !== "GET") { sendLocalWebJson(response, 405, { error: "不支持此方法" }); return true; }
      await context.agentReady();
      const queue = context.agentHost.reviews;
      const scopes = url.searchParams.has("project") ? [projectId ?? ASSISTANT_PERSONAL_OWNER] : [ASSISTANT_PERSONAL_OWNER, ...projects.keys()];
      await Promise.all(scopes.map(scope => queue.refresh(scope).catch(() => undefined)));
      const seenReviews = new Set<string>();
      const candidates = scopes.flatMap(scope => queue.list(scope)).filter(review => !seenReviews.has(review.review_id) && Boolean(seenReviews.add(review.review_id)));
      const targetProjects = url.searchParams.has("project") ? (projectId ? [projects.get(projectId)!] : []) : [...projects.values()];
      let platformTotal = 0;
      const platformRows: ReturnType<typeof reviewSourceSummary>[] = [];
      for (const project of targetProjects) {
        const part = await host.withProject(project, runtime => {
          const decisions = projectReviewDecisions(runtime.store.db, project.project_id);
          return { rows: decisions.recent(historyLimit).map(record => projectDecisionSource(project.project_id, record)), total: decisions.count() };
        });
        platformTotal += part.total;
        platformRows.push(...part.rows);
      }
      const rows = [...candidates.slice(-historyLimit).map(review => reviewSourceSummary({
        request: review, receipt: queue.receipt(review.review_id) ?? undefined,
      })), ...platformRows]
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, historyLimit);
      control.assertCurrent();
      sendLocalWebJson(response, 200, { rows, omitted: Math.max(candidates.length + platformTotal - rows.length, 0) });
      return true;
    }
    if (!assistant) throw new ActionError("actions.service_unavailable", "授权管理暂时不可用");
    const ports: AuthorizationManagementPorts = { host, home, assistant, projects, contextProject: projectId,
      clientNames: context.runtimeIntegrations.clientDescriptors(), agents: async () => { await context.agentReady(); return context.agentHost; } };
    const run = async <Input, Output>(definition: ActionDefinition<Input, Output>, input: unknown) => {
      const answer = await invokeAuthorizationManagement({ host, request, entry: ports, assertCurrent: control.assertCurrent }, definition, input as Input);
      control.assertCurrent();
      sendLocalWebJson(response, 200, answer);
    };
    if (request.method === "POST") await run(agentAuthorizationActions.change, await readLocalWebBody(request));
    else if (request.method === "GET" && url.searchParams.has("id")) await run(agentAuthorizationActions.read, {
      owner: url.searchParams.get("owner"), id: url.searchParams.get("id"),
    });
    else if (request.method === "GET") {
      const owners = url.searchParams.getAll("owner"), client = url.searchParams.get("client");
      await run(agentAuthorizationActions.list, { ...(owners.length ? { owners } : {}), ...(client ? { client_id: client } : {}),
        ...(url.searchParams.has("project") ? { project_id: projectId } : {}) });
    } else { sendLocalWebJson(response, 405, { error: "不支持此方法" }); }
  } catch (error) {
    if (!response.destroyed) respondLocalWebRefusal({ respond: (status, body) => sendLocalWebJson(response, status, body) }, error);
  }
  return true;
}
