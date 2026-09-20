import type { IncomingMessage, ServerResponse } from "node:http";

import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentReviewStatus } from "@molis-ai/molis-work-contracts/services/agent-host";
import { renderAgentReviewSurface } from "@molis-ai/molis-work-app-workbench";
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
  if (request.method === "GET" && url.pathname === "/api/agent/reviews") {
    await ports.agentHost.reviews.refresh(ports.boardId);
    const requested = url.searchParams.get("status");
    const status = STATUSES.find((entry) => entry === requested);
    const runIds = url.searchParams.getAll("run_id");
    const rows = ports.agentHost.reviews.list(ports.boardId, status)
      .filter(review => runIds.length === 0 || runIds.includes(review.run.run_id))
      .map((review) => ({
        request: review,
        // The receipt carries whether the effect really happened. A pending
        // item has none, and an approved one keeps `effect_settled: false`
        // until the Runtime returns a real result.
        receipt: ports.agentHost.reviews.receipt(review.review_id) ?? undefined,
      }));
    const html = renderAgentReviewSurface({ rows, primitives: {
      escape: value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!),
      icon, formatDate: value => new Date(value).toLocaleString("zh-CN"),
    } });
    sendLocalWebJson(response, 200, { reviews: rows, html });
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
