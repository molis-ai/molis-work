import { pluginPageRequest } from "./plugin-page-authority.js";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewStatus, AgentGitIndexObservation, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_PERSONAL_OWNER } from "@molis-ai/molis-work-contracts/services/assistant";
import { renderAgentReviewSurface, renderAgentReviewRecovery } from "@molis-ai/molis-work-app-workbench";
import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";

import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { confirmArrivedTooSoon, reviewProjectFor, type ComputerRoundHolder } from "./computer/computer-policy.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

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
  /** Clock for the self-approval quiet period. Defaults to the wall clock. */
  now?: () => number;
}

/** What the route knows about one request: its ports, and the plugin page's fence when a plugin page asked. */
interface ReviewEntry { readonly ports: AgentReviewHttpPorts; readonly page: ReturnType<typeof pluginPageRequest> }
const door = webEntryDoor<ReviewEntry>("agent:reviews", "审批只接受本人在审批入口的操作");
const reviewId = { type: "string", minLength: 1, maxLength: 200 } as const;
const missing = (message: string) => new ActionError("actions.missing", message);

export const agentReviewActions = {
  decide: door.define({ capability_id: "agent.reviews.decide", version: /* @version action.agent.reviews.decide */ 1, scope: "home",
    title: "决定一条待审操作", description: "本人批准或拒绝 Agent 请求的一项操作；批准不等于已经发生，回执另说。",
    input_schema: { type: "object", properties: { review_id: reviewId, decision: { enum: ["approve", "reject"] }, note: { type: "string", maxLength: 2000 },
      remember: { enum: ["session", "app-this-round"] } }, required: ["review_id", "decision"], additionalProperties: false } },
  async ({ ports, page }, input) => {
    const holder = ports.computerHolder?.() ?? null;
    const review = ports.agentHost.reviews.get(input.review_id);
    const projectId = page ? ports.projectId : reviewProjectFor(ports.projectId, review?.run?.session_id ?? null, holder);
    if (!review || review.project_id !== projectId) throw missing("找不到这条待审操作");
    if (holder?.lastInjectAt != null && review.run?.session_id === holder.sessionId && confirmArrivedTooSoon(holder.lastInjectAt, ports.now?.() ?? Date.now())) {
      throw Object.assign(new Error("这一步刚落到屏幕上，助理不能马上批准自己"), { code: "computer.self_approval" });
    }
    await ports.agentHost.reviews.refresh(projectId);
    page?.assertCurrent();
    return { receipt: await ports.agentHost.reviews.respond({ review_id: input.review_id, decision: input.decision, actor_id: ports.actorId,
      ...(input.note ? { note: input.note } : {}), ...(input.remember ? { remember: input.remember } : {}) }) };
  }),
  recover: door.define({ capability_id: "agent.reviews.recover", version: /* @version action.agent.reviews.recover */ 1, scope: "home",
    title: "核对一项结果未知的原操作", description: "本人按原执行记录重新核对，或在确认后记下原操作没有发生。",
    input_schema: { type: "object", properties: { review_id: reviewId, action: { enum: ["refresh", "not-happened"] }, confirmed: { type: "boolean" },
      revision: { type: "string", maxLength: 200 }, reason: { type: "string", maxLength: 2000 } }, required: ["review_id", "action"], additionalProperties: false } },
  async ({ ports, page }, input) => {
    await ports.agentHost.reviews.refresh(ports.projectId);
    page?.assertCurrent();
    if (ports.agentHost.reviews.get(input.review_id)?.project_id !== ports.projectId) throw missing("找不到此项目的原操作");
    if (!ports.observeGitIndex) throw new Error("当前暂存区核对尚未接通");
    if (input.action === "not-happened" && input.confirmed !== true) throw new Error("请明确确认原操作未发生");
    return { view: await ports.agentHost.reviews.recover({ review_id: input.review_id, action: input.action, actor_id: ports.actorId,
      ...(input.revision !== undefined ? { revision: input.revision } : {}), ...(input.reason !== undefined ? { reason: input.reason } : {}) }, ports.observeGitIndex) };
  }),
};
export const agentReviewProvider = () => webEntryProvider("system.agent-reviews", "审批", Object.values(agentReviewActions));
const asPerson = (request: IncomingMessage, ports: AgentReviewHttpPorts) => ({ host: ports.host, request, entry: { ports, page: pluginPageRequest(request) } });
/** A decision that cannot be recorded (gone, decided, expired, cancelled, too soon) is not a server fault and must not read as success. */
const refusal = (error: unknown) => ({ status: (error as { code?: string }).code === "actions.missing" ? 404 : 409,
  message: error instanceof Error ? error.message : "", code: (error as { code?: string }).code });

const STATUSES: readonly AgentReviewStatus[] = [
  "pending", "approved", "rejected", "cancelled", "expired",
];

export async function handleAgentReviewHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  ports: AgentReviewHttpPorts,
): Promise<boolean> {
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/agent/reviews/recovery") {
    const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    if (request.method === "POST") {
      const body = await readLocalWebBody(request);
      if (typeof body.review_id !== "string" || body.review_id === "") { sendLocalWebJson(response, 404, { error: "找不到此项目的原操作" }); return true; }
      if (body.action !== "refresh" && body.action !== "not-happened") { sendLocalWebJson(response, 409, { error: "核对动作无效" }); return true; }
      try {
        const { view } = await door.invoke(asPerson(request, ports), agentReviewActions.recover.definition, { review_id: body.review_id, action: body.action,
          ...(typeof body.confirmed === "boolean" ? { confirmed: body.confirmed } : {}),
          ...(typeof body.revision === "string" ? { revision: body.revision } : {}), ...(typeof body.reason === "string" ? { reason: body.reason } : {}) });
        sendLocalWebJson(response, 200, { view, html: renderAgentReviewRecovery(view, escape) });
      } catch (error) { const failed = refusal(error); sendLocalWebJson(response, failed.status, { error: failed.message || "无法核对原操作" }); }
      return true;
    }
    await ports.agentHost.reviews.refresh(ports.projectId);
    pluginPageRequest(request)?.assertCurrent();
    const reviewId = url.searchParams.get("review_id");
    if (typeof reviewId !== "string" || ports.agentHost.reviews.get(reviewId)?.project_id !== ports.projectId) {
      sendLocalWebJson(response, 404, { error: "找不到此项目的原操作" }); return true;
    }
    if (!ports.observeGitIndex) { sendLocalWebJson(response, 409, { error: "当前暂存区核对尚未接通" }); return true; }
    try {
      const view = await ports.agentHost.reviews.inspectRecovery(reviewId, ports.observeGitIndex);
      sendLocalWebJson(response, 200, { view, html: renderAgentReviewRecovery(view, escape) });
    } catch (error) { sendLocalWebJson(response, 409, { error: error instanceof Error ? error.message : "无法核对原操作" }); }
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
      sendLocalWebJson(response, 400, { error: "审查记录数量必须为 1–1000" });
      return true;
    }
    const matched = ports.agentHost.reviews.list(projectId, status)
      .filter(review => runIds.length === 0 && !sessionId && !workspaceId && !runSessionId || review.run && runIds.includes(review.run.run_id)
        || runSessionId && review.run?.session_id === runSessionId
        || sessionId && review.operation?.session_id === sessionId || workspaceId && review.operation?.workspace_id === workspaceId)
      .map((review) => ({
        request: review,
        // The receipt carries whether the effect really happened. A pending
        // item has none, and an approved one keeps `effect_settled: false`
        // until the Runtime returns a real result.
        receipt: ports.agentHost.reviews.receipt(review.review_id) ?? undefined,
      }));
    // With a limit, whatever still needs a person or a result is always kept; settled history keeps its latest entries.
    const open = (row: typeof matched[number]) => !row.receipt || row.receipt.status === "pending" || row.receipt.status === "approved" && !row.receipt.effect_settled && !row.receipt.effect_error;
    const settled = matched.filter(row => !open(row));
    const kept = limit === undefined ? null : new Set(settled.sort((a, b) => b.request.requested_at.localeCompare(a.request.requested_at)).slice(0, limit));
    const rows = kept ? matched.filter(row => open(row) || kept.has(row)) : matched;
    const html = renderAgentReviewSurface({ rows, primitives: {
      escape: value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!),
      icon, formatDate: value => new Date(value).toLocaleString("zh-CN"),
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
      sendLocalWebJson(response, 400, { error: "请求缺少 review_id 或 decision" });
      return true;
    }
    if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2000)) {
      sendLocalWebJson(response, 400, { error: "审查说明最多 2000 字符" }); return true;
    }
    if (body.remember !== undefined && body.remember !== "session" && body.remember !== "app-this-round") {
      sendLocalWebJson(response, 400, { error: "remember 只能是 session 或 app-this-round" }); return true;
    }
    try {
      // 200 carries the receipt, not a claim that the effect happened: that is `effect_settled`, and it stays false until a real result comes back.
      sendLocalWebJson(response, 200, await door.invoke(asPerson(request, ports), agentReviewActions.decide.definition, { review_id: reviewId, decision,
        ...(typeof body.note === "string" && body.note !== "" ? { note: body.note } : {}),
        ...(body.remember === "session" || body.remember === "app-this-round" ? { remember: body.remember } : {}) }));
    } catch (error) {
      const failed = refusal(error);
      sendLocalWebJson(response, failed.status, failed.status === 404 ? { error: failed.message }
        : { error: failed.message || "这条待审操作已经不能再决定", code: failed.code ?? "agent.review_conflict" });
    }
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
