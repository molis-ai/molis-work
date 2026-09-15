import type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/modules/sources";
import type { FeedSourceRecord } from "./projection.js";
import type { IntelligenceCollectResult } from "./source-ports.js";
export function sourceDedupeScope(source: FeedSourceRecord): string {
  return source.kind === "rss" ? (source.definition_id ?? source.source_id) : source.source_id;
}

export function cursorForMaterials(current: unknown, materials: IntelligenceCollectResult["materials"]): unknown {
  if (materials.length === 0) return current;
  const newest = [...materials].sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]!;
  return {
    ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
    lastCapturedAt: newest.capturedAt,
    ...(newest.publishedAt ? { lastPublishedAt: newest.publishedAt } : {}),
    lastCandidateId: newest.candidateId,
  };
}

export function rssFailureAction(
  errorCode: string,
  failures: number,
): { category: "configuration" | "provider"; retryable: boolean; user_action: "fix_configuration" | "retry" } | null {
  if (["feed_parse_failed", "provider_protocol_invalid", "plan_invalid"].includes(errorCode)) {
    return { category: "configuration", retryable: false, user_action: "fix_configuration" };
  }
  if (failures >= 3) {
    return { category: "provider", retryable: true, user_action: "retry" };
  }
  return null;
}

export function safeRssReceipt(receipt: RssFetchReceipt): Record<string, unknown> {
  return {
    status: receipt.status,
    not_modified: receipt.not_modified,
    final_url: receipt.final_url,
    validator: receipt.etag ? "etag" : receipt.last_modified ? "last_modified" : "none",
    ...(receipt.feed_title ? { feed_title: receipt.feed_title } : {}),
    ...(receipt.home_url ? { home_url: receipt.home_url } : {}),
  };
}

export function terminalErrorCode(result: IntelligenceCollectResult): string | null {
  if (!["failed", "cancelled", "reconciliation_required"].includes(result.outcome)) return null;
  const receiptCode = result.receipts
    .map((receipt) => "errorCode" in receipt ? receipt.errorCode : undefined)
    .find(isSafeCode);
  if (receiptCode) return receiptCode;
  const stopReason = result.budget.stopReason;
  if (isSafeCode(stopReason)) return stopReason;
  return result.outcome === "failed" ? "provider_failed" : result.outcome;
}

export function safeErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined;
  return isSafeCode(code) ? code : "provider_interrupted";
}

export function isSafeCode(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(value);
}

export function interruptedMessage(code: string): string {
  if (code === "feed_parse_failed") return "同步失败：源站返回的不是可解析 RSS/Atom，本次未导入内容。";
  if (code === "feed_unavailable") return "同步失败：源站不可用或返回空正文，本机已有内容未被覆盖。";
  if (code === "budget_exhausted") return "同步失败：公开搜索额度已耗尽，没有回退到模拟数据。";
  return "同步未取得可信终态，本次没有写成成功；可稍后安全重试。";
}
