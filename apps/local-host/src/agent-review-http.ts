import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewStatus, AgentGitIndexObservation, AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { renderAgentReviewSurface, renderAgentReviewRecovery } from "@molis-ai/molis-work-app-workbench";
import { icon } from "@molis-ai/molis-work-design-system";

import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";

/**
 * The Host's review queue over HTTP.
 *
 * Deciding lives here and only here. It is not a Capability, so no Plugin can
 * reach it; it sits under `/api/`, so the existing local-control guard already
 * requires same-origin, the control token and a one-time key before any
 * decision is recorded.
 */

export interface AgentReviewHttpPorts {
  boardId: string;
  agentHost: AgentHost;
  /** Who the decision is recorded against. */
  actorId: string;
  observeGitIndex?: (request: AgentReviewRequest) => Promise<AgentGitIndexObservation>;
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
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/api/agent/reviews/recovery") {
    await ports.agentHost.reviews.refresh(ports.boardId);
    const body = request.method === "POST" ? await readLocalWebBody(request) : {};
    const reviewId = request.method === "POST" ? body.review_id : url.searchParams.get("review_id");
    if (typeof reviewId !== "string" || ports.agentHost.reviews.get(reviewId)?.board_id !== ports.boardId) {
      sendLocalWebJson(response, 404, { error: "找不到此项目的原操作" }); return true;
    }
    if (!ports.observeGitIndex) { sendLocalWebJson(response, 409, { error: "当前暂存区核对尚未接通" }); return true; }
    try {
      if (request.method === "POST" && body.action !== "refresh" && body.action !== "not-happened") throw new Error("核对动作无效");
      if (request.method === "POST" && body.action === "not-happened" && body.confirmed !== true) throw new Error("请明确确认原操作未发生");
      const view = request.method === "GET" ? await ports.agentHost.reviews.inspectRecovery(reviewId, ports.observeGitIndex)
        : await ports.agentHost.reviews.recover({ review_id: reviewId, action: body.action as "refresh" | "not-happened", actor_id: ports.actorId,
          ...(typeof body.revision === "string" ? { revision: body.revision } : {}), ...(typeof body.reason === "string" ? { reason: body.reason } : {}) }, ports.observeGitIndex);
      sendLocalWebJson(response, 200, { view, html: renderAgentReviewRecovery(view, value => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)) });
    } catch (error) { sendLocalWebJson(response, 409, { error: error instanceof Error ? error.message : "无法核对原操作" }); }
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/agent/reviews") {
    await ports.agentHost.reviews.refresh(ports.boardId);
    const requested = url.searchParams.get("status");
    const status = STATUSES.find((entry) => entry === requested);
    const runIds = url.searchParams.getAll("run_id");
    const sessionId = url.searchParams.get("session_id");
    const workspaceId = url.searchParams.get("workspace_id");
    // Every run of one runtime session, without naming each: a long session's history is not a list of ids.
    const runSessionId = url.searchParams.get("run_session_id");
    const limitParam = url.searchParams.get("limit"), limit = limitParam === null ? undefined : Number(limitParam);
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)) {
      sendLocalWebJson(response, 400, { error: "审查记录数量必须为 1–1000" });
      return true;
    }
    const matched = ports.agentHost.reviews.list(ports.boardId, status)
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
    await ports.agentHost.reviews.refresh(ports.boardId);
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
    if (body.remember !== undefined && body.remember !== "session") {
      sendLocalWebJson(response, 400, { error: "remember 只能是 session" }); return true;
    }
    if (ports.agentHost.reviews.get(reviewId)?.board_id !== ports.boardId) {
      sendLocalWebJson(response, 404, { error: "找不到这条待审操作" });
      return true;
    }
    try {
      const receipt = await ports.agentHost.reviews.respond({
        review_id: reviewId,
        decision,
        actor_id: ports.actorId,
        ...(typeof body.note === "string" && body.note !== "" ? { note: body.note } : {}),
        ...(body.remember === "session" ? { remember: "session" as const } : {}),
      });
      // 200 carries the receipt, not a claim that the effect happened: that is
      // `effect_settled`, and it stays false until a real result comes back.
      sendLocalWebJson(response, 200, { receipt });
    } catch (error) {
      // A decision that cannot be recorded — already decided, expired, cancelled
      // — is a conflict, not a server fault, and it must not read as success.
      sendLocalWebJson(response, 409, {
        error: error instanceof Error ? error.message : "这条待审操作已经不能再决定",
        code: (error as { code?: string }).code ?? "agent.review_conflict",
      });
    }
    return true;
  }

  return false;
}
