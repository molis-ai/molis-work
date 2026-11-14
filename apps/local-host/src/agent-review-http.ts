import { pluginPageRequest } from "./plugin-page-authority.js";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewStatus, AgentGitIndexObservation, AgentReviewRequest, AgentReviewDecisionAvailability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderAgentReviewSurface, renderAgentReviewRecovery, reviewSourceSummary } from "@molis-ai/molis-work-app-workbench";
export { reviewSourceSummary };
import { format, icon, say, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { actionErrorKind, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";

import { ActionError, requireSynchronous, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { assertHumanReview, reviewProjectFor, type ComputerRoundHolder } from "./computer/computer-policy.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { responseAbortSignal, webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { webEffectControl } from "./authorization-settings-control.js";
import { webManagementAuthenticated } from "./web-sessions.js";
import { reviewProposalVersion } from "@molis-ai/molis-work-service-agent-host";

/**
 * The Host's review queue over HTTP.
 *
 * Deciding is the person's alone. Its two writes are actions (B9) that only this route's door can call: no Agent, MCP client,
 * workflow or plugin reaches them, and the route sits under `/api/`, so the local-control guard already requires same-origin,
 * the control token and a one-time key before any decision is recorded. Reading the queue stays HTTP.
 */

export interface AgentReviewHttpPorts {
  /** The Host whose action service carries the person's decision. */
  host: MolisWorkLocalHost;
  projectId: string;
  agentHost: AgentHost;
  /** Who the decision is recorded against. */
  actorId: string;
  observeGitIndex?: (request: AgentReviewRequest) => Promise<AgentGitIndexObservation>;
  /** The round holding the computer, when this process has a desk. Absent on a forwarder. */
  computerHolder?: () => ComputerRoundHolder | null;
  assertAccountCurrent?: () => void;
  /** Clock for the self-approval quiet period. Defaults to the wall clock. */
  now?: () => number;
}

/** What the route knows about one request: its ports, and the plugin page's fence when a plugin page asked. */
interface ReviewEntry { readonly ports: AgentReviewHttpPorts; readonly page: ReturnType<typeof pluginPageRequest> }
const door = webEntryDoor<ReviewEntry>("agent:reviews", () => uiText.text("workbench.agent-review.entry-refused"));
const reviewId = { type: "string", minLength: 1, maxLength: 200 } as const;
const missing = (message: string) => new ActionError("actions.missing", message);
const REVIEW_CONFLICT = "agent.review_conflict";
/** A decision or a check that cannot be recorded (decided, expired, cancelled, too soon, nothing to check against) is a conflict, not a fault. */
const conflict = (error: unknown, fallback: string) => {
  if (["forbidden", "not_found", "cancelled"].includes(actionErrorKind(error))) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const decision = (error as { details?: { review_decision?: AgentReviewDecisionAvailability } } | null)?.details?.review_decision;
  const message = decision?.available === false ? say.text(decision.reason) : error instanceof Error && error.message ? error.message : fallback;
  return new ActionError(typeof code === "string" ? code : REVIEW_CONFLICT, message, { kind: "conflict", cause: error });
};

export const agentReviewActions = {
  permission: door.define({ capability_id: "agent.reviews.permission.set", version: /* @version action.agent.reviews.permission.set */ 1, scope: "home",
    title: "保存原操作的后续工作权限", description: "本人从原审查中选择后续工作的权限方式。",
    input_schema: { type: "object", properties: { review_id: reviewId, version: reviewId,
      mode: { enum: ["read-only", "confirm", "automatic"] }, lifetime: { enum: ["work", "ongoing"] },
      expected_version: { type: "integer", minimum: 0 }, scope_version: reviewId },
      required: ["review_id", "version", "mode", "lifetime", "expected_version", "scope_version"], additionalProperties: false } },
  async (entry, input, caller) => {
    const held = await exactReviewPermission(entry.ports, input.review_id, input.version, input.lifetime);
    if (input.scope_version !== held.scopeVersion) throw new ActionError("actions.conflict", "原操作范围已变化");
    const assertCurrent = () => {
      caller.signal?.throwIfAborted();
      requireSynchronous(caller.assert_authority_current?.()); entry.page?.assertCurrent(); held.assertPending();
      if (input.mode === "automatic") held.assertCurrent();
      assertHumanReview(entry.ports.computerHolder?.() ?? null, held.session);
    };
    const beforeEffect = async () => {
      await caller.beforeEffect(); await entry.page?.beforeEffect();
      if (input.mode === "automatic") await held.beforeEffect();
      assertCurrent();
    };
    assertCurrent();
    return { permission: await held.store.grant(held.subject, { expected_version: input.expected_version,
      mode: input.mode, scopes: input.mode === "automatic" ? [held.scope] : [], expires_at: null }, { beforeEffect, assertCurrent }) };
  }),
  decide: door.define({ capability_id: "agent.reviews.decide", version: /* @version action.agent.reviews.decide */ 1, scope: "home",
    title: "决定一条待审操作", description: "本人批准或拒绝 Agent 请求的一项操作；批准不等于已经发生，回执另说。",
    input_schema: { type: "object", properties: { review_id: reviewId, version: { type: "string", minLength: 1, maxLength: 200 }, decision: { enum: ["approve", "reject"] }, note: { type: "string", maxLength: 2000 },
      remember: { enum: ["session", "app-this-round"] } }, required: ["review_id", "version", "decision"], additionalProperties: false } },
  async ({ ports, page }, input, caller) => {
    const review = ports.agentHost.reviews.get(input.review_id);
    const assertCurrent = () => {
      caller.signal?.throwIfAborted();
      requireSynchronous(caller.assert_authority_current?.());
      page?.assertCurrent();
      const holder = ports.computerHolder?.() ?? null;
      const projectId = page ? ports.projectId : reviewProjectFor(ports.projectId, review?.run?.session_id ?? null, holder);
      if (!review || review.project_id !== projectId) throw missing(uiText.text("workbench.agent-review.review-missing"));
      assertHumanReview(holder, review.run?.session_id, ports.now?.());
    };
    assertCurrent();
    await ports.agentHost.reviews.refresh(review!.project_id);
    try {
      return { receipt: await ports.agentHost.reviews.respond({ review_id: input.review_id, version: input.version, decision: input.decision, actor_id: ports.actorId,
        ...(input.note ? { note: input.note } : {}), ...(input.remember ? { remember: input.remember } : {}) }, {
        beforeEffect: async () => { await caller.beforeEffect(); await page?.beforeEffect(); }, assertCurrent,
      }) };
    } catch (error) { throw conflict(error, uiText.text("workbench.agent-review.cannot-decide")); }
  }),
  recover: door.define({ capability_id: "agent.reviews.recover", version: /* @version action.agent.reviews.recover */ 1, scope: "home",
    title: "核对一项结果未知的原操作", description: "本人按原执行记录重新核对，或在确认后记下原操作没有发生。",
    input_schema: { type: "object", properties: { review_id: reviewId, action: { enum: ["refresh", "not-happened"] }, confirmed: { type: "boolean" },
      revision: { type: "string", maxLength: 200 }, reason: { type: "string", maxLength: 2000 } }, required: ["review_id", "action"], additionalProperties: false } },
  async ({ ports, page }, input, caller) => {
    await ports.agentHost.reviews.refresh(ports.projectId);
    caller.signal?.throwIfAborted();
    page?.assertCurrent();
    if (ports.agentHost.reviews.get(input.review_id)?.project_id !== ports.projectId) throw missing(uiText.text("workbench.agent-review.operation-missing"));
    const observe = ports.observeGitIndex;
    try {
      if (!observe) throw new Error(uiText.text("workbench.agent-review.index-unavailable"));
      if (input.action === "not-happened" && input.confirmed !== true) throw new Error(uiText.text("workbench.agent-review.must-confirm"));
      return { view: await ports.agentHost.reviews.recover({ review_id: input.review_id, action: input.action, actor_id: ports.actorId,
        ...(input.revision !== undefined ? { revision: input.revision } : {}), ...(input.reason !== undefined ? { reason: input.reason } : {}) }, observe) };
    } catch (error) { throw conflict(error, uiText.text("workbench.agent-review.check-failed")); }
  }),
};
export const agentReviewProvider = () => webEntryProvider("system.agent-reviews", "审批", Object.values(agentReviewActions));
const asPerson = (request: IncomingMessage, ports: AgentReviewHttpPorts, signal: AbortSignal) => ({ host: ports.host, request, entry: { ports, page: pluginPageRequest(request) }, signal });
/** What went wrong, answered with the status its kind gives (gone 404, conflict 409, refused 403): it must not read as success. */
const refuse = (response: ServerResponse, error: unknown) => { const refusal = actionErrorResponse(error); sendLocalWebJson(response, refusal.status, refusal.body); };

async function exactReviewPermission(ports: AgentReviewHttpPorts, id: string, version: string, lifetime: "work" | "ongoing") {
  const queue = ports.agentHost.reviews;
  const request = queue.get(id);
  if (!request?.run || request.project_id !== ports.projectId) throw missing(uiText.text("workbench.agent-review.review-missing"));
  try {
    if (!(await queue.decisions(id)).approve.available) throw new ActionError("actions.conflict", "原操作已经不能决定");
    const held = queue.exactPermission(id, version), store = ports.agentHost.workDelegations("prologue");
    if (!held || !store || held.subject.kind !== "work" || held.subject.actor_id !== ports.actorId
      || held.subject.project_id !== request.project_id || held.subject.executor.plugin_id !== request.plugin_id
      || held.subject.executor.install_id !== request.reference.owner.install_id || held.subject.work.id !== request.run.session_id) {
      throw missing(uiText.text("workbench.agent-review.review-missing"));
    }
    const subject = lifetime === "work" ? held.subject : { kind: "ongoing" as const, actor_id: held.subject.actor_id,
      project_id: held.subject.project_id, executor: held.subject.executor };
    const current = await store.read(subject);
    held.assertPending();
    return { ...held, subject, current, store, session: request.run.session_id, scopeVersion: reviewProposalVersion(held.scope) };
  } catch (error) { throw conflict(error, uiText.text("workbench.agent-review.cannot-decide")); }
}

const STATUSES: readonly AgentReviewStatus[] = [
  "pending", "approved", "rejected", "cancelled", "expired",
];

export async function handleAgentReviewHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: AgentReviewHttpPorts,
): Promise<boolean> {
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/agent/reviews/permission") {
    const control = webEffectControl(request, response, ports.host, ports.assertAccountCurrent);
    try {
      control.assertCurrent();
      const page = pluginPageRequest(request);
      if (!webManagementAuthenticated(request) || request.headers["x-molis-plugin-page"] !== undefined) throw new ActionError("actions.forbidden", "只有本人可以管理工作权限");
      if (request.method === "GET") {
        const { review_id, version, lifetime } = Object.fromEntries(url.searchParams);
        if (!review_id || !version || lifetime !== "work" && lifetime !== "ongoing") throw new ActionError("actions.input_invalid", "请按原操作查看权限");
        const held = await exactReviewPermission(ports, review_id, version, lifetime);
        let automatic = true;
        try { await held.beforeEffect(); held.assertCurrent(); } catch { automatic = false; }
        control.assertCurrent(); page?.assertCurrent(); held.assertPending();
        const selected = held.current?.selections.find(row => row.id === held.current?.selection_id);
        sendLocalWebJson(response, 200, { title: held.title, scope: held.scope, automatic, scope_version: held.scopeVersion,
          storage_version: held.current?.storage_version ?? 0, selection: selected ? { mode: selected.mode, revoked_at: selected.revoked_at } : null });
      } else {
        const input = await readLocalWebBody(request);
        type Input = typeof agentReviewActions.permission.definition extends ActionDefinition<infer Value, unknown> ? Value : never;
        sendLocalWebJson(response, 200, await door.invoke({ ...asPerson(request, ports, responseAbortSignal(response)), assertCurrent: control.assertCurrent },
          agentReviewActions.permission.definition, input as Input));
      }
    } catch (error) { refuse(response, error); }
    return true;
  }
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/agent/reviews/recovery") {
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    if (request.method === "POST") {
      const body = await readLocalWebBody(request);
      if (typeof body.review_id !== "string" || body.review_id === "") { sendLocalWebJson(response, 404, { error: uiText.text("workbench.agent-review.operation-missing") }); return true; }
      if (body.action !== "refresh" && body.action !== "not-happened") { sendLocalWebJson(response, 409, { error: uiText.text("workbench.agent-review.bad-recovery-action") }); return true; }
      try {
        const { view } = await door.invoke(asPerson(request, ports, responseAbortSignal(response)), agentReviewActions.recover.definition, { review_id: body.review_id, action: body.action,
          ...(typeof body.confirmed === "boolean" ? { confirmed: body.confirmed } : {}),
          ...(typeof body.revision === "string" ? { revision: body.revision } : {}), ...(typeof body.reason === "string" ? { reason: body.reason } : {}) });
        sendLocalWebJson(response, 200, { view, html: renderAgentReviewRecovery(view, escape) });
      } catch (error) { refuse(response, error); }
      return true;
    }
    await ports.agentHost.reviews.refresh(ports.projectId);
    pluginPageRequest(request)?.assertCurrent();
    const reviewId = url.searchParams.get("review_id");
    if (typeof reviewId !== "string" || ports.agentHost.reviews.get(reviewId)?.project_id !== ports.projectId) {
      sendLocalWebJson(response, 404, { error: uiText.text("workbench.agent-review.operation-missing") }); return true;
    }
    if (!ports.observeGitIndex) { sendLocalWebJson(response, 409, { error: uiText.text("workbench.agent-review.index-unavailable") }); return true; }
    try {
      const view = await ports.agentHost.reviews.inspectRecovery(reviewId, ports.observeGitIndex);
      sendLocalWebJson(response, 200, { view, html: renderAgentReviewRecovery(view, escape) });
    } catch (error) { sendLocalWebJson(response, 409, { error: error instanceof Error ? error.message : uiText.text("workbench.agent-review.check-failed") }); }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/agent/reviews") {
    // Every run of one runtime session, without naming each: a long session's history is not a list of ids.
    const runSessionId = url.searchParams.get("run_session_id");
    const projectId = pluginPageRequest(request) ? ports.projectId : reviewProjectFor(ports.projectId, runSessionId, ports.computerHolder?.() ?? null);
    await ports.agentHost.reviews.refresh(projectId);
    const requested = url.searchParams.get("status");
    const status = STATUSES.find((entry) => entry === requested);
    const runIds = url.searchParams.getAll("run_id");
    const sessionId = url.searchParams.get("session_id");
    const workspaceId = url.searchParams.get("workspace_id");
    const limitParam = url.searchParams.get("limit"), limit = limitParam === null ? undefined : Number(limitParam);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)) {
      sendLocalWebJson(response, 400, { error: uiText.text("workbench.agent-review.bad-limit") });
      return true;
    }
    const candidates = ports.agentHost.reviews.list(projectId, status)
      .filter(review => runIds.length === 0 && !sessionId && !workspaceId && !runSessionId || review.run && runIds.includes(review.run.run_id)
        || runSessionId && review.run?.session_id === runSessionId
        || sessionId && review.operation?.session_id === sessionId || workspaceId && review.operation?.workspace_id === workspaceId);
    const projected = await ports.agentHost.reviews.readMany(candidates.map(review => review.review_id));
    pluginPageRequest(request)?.assertCurrent();
    const currentProject = pluginPageRequest(request) ? ports.projectId : reviewProjectFor(ports.projectId, runSessionId, ports.computerHolder?.() ?? null);
    const matched = currentProject === projectId ? projected.filter(row => !status || row.receipt?.status === status) : [];
    // With a limit, whatever still needs a person or a result is always kept; settled history keeps its latest entries.
    const open = (row: typeof matched[number]) => !row.receipt || row.receipt.status === "pending" || row.receipt.status === "approved" && !row.receipt.effect_settled && !row.receipt.effect_error;
    const settled = matched.filter(row => !open(row));
    const kept = limit === undefined ? null : new Set(settled.sort((a, b) => b.request.requested_at.localeCompare(a.request.requested_at)).slice(0, limit));
    const rows = (kept ? matched.filter(row => open(row) || kept.has(row)) : matched).map(row =>
      row.decisions.approve.available && ports.agentHost.reviews.hasExactPermission(row.request.review_id)
        ? { ...row, work_permission_available: true as const } : row);
    const html = renderAgentReviewSurface({ rows, primitives: {
      escape: value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!),
      icon, formatDate: value => format.date(value, "datetime-with-seconds"),
    } });
    sendLocalWebJson(response, 200, { reviews: rows, html, total: matched.length, omitted: matched.length - rows.length });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/agent/reviews/decide") {
    const body = await readLocalWebBody(request);
    const reviewId = typeof body.review_id === "string" ? body.review_id : "";
    const decision = body.decision === "approve" || body.decision === "reject"
      ? body.decision
      : null;
    if (reviewId === "" || decision === null) {
      sendLocalWebJson(response, 400, { error: uiText.text("workbench.agent-review.decision-required") });
      return true;
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000)) {
      sendLocalWebJson(response, 400, { error: uiText.text("workbench.agent-review.feedback-too-long") }); return true;
    }
    if (body.remember !== undefined && body.remember !== "session" && body.remember !== "app-this-round") {
      sendLocalWebJson(response, 400, { error: uiText.text("workbench.agent-review.bad-remember") }); return true;
    }
    try {
      // 200 carries the receipt, not a claim that the effect happened: that is `effect_settled`, and it stays false until a real result comes back.
      sendLocalWebJson(response, 200, await door.invoke(asPerson(request, ports, responseAbortSignal(response)), agentReviewActions.decide.definition, { review_id: reviewId, version: typeof body.version === "string" ? body.version : "", decision,
        ...(typeof body.note === "string" && body.note !== "" ? { note: body.note } : {}),
        ...(body.remember === "session" || body.remember === "app-this-round" ? { remember: body.remember } : {}) }));
    } catch (error) { refuse(response, error); }
    return true;
  }

  return false;
}

/**
 * Confirm cards on the project list, where no project is open.
 * Personal work stores them under the home owner. A round that holds the computer
 * still resolves to that round's project when the request names its session.
 */
export async function handleUnscopedAgentReviews(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: Pick<AgentReviewHttpPorts, "host" | "agentHost" | "actorId" | "computerHolder" | "now"> & { ready?: () => Promise<void> },
): Promise<boolean> {
  if (url.pathname !== "/api/agent/reviews" && url.pathname !== "/api/agent/reviews/decide") return false;
  await ports.ready?.();
  return handleAgentReviewHttp(request, response, url, {
    host: ports.host,
    projectId: ASSISTANT_PERSONAL_OWNER,
    agentHost: ports.agentHost,
    actorId: ports.actorId,
    computerHolder: ports.computerHolder,
    now: ports.now,
  });
}
