import { createHash } from "node:crypto";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
export function normalizeIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/u.test(key)) {
    throw new FeedDomainError("同步需要 8–128 位幂等键", "feed_source_idempotency_required");
  }
  return key;
}

export function normalizeQuery(value: string): string {
  const query = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(query).length;
  if (length < 2 || length > 500) {
    throw new FeedDomainError("网页查询需要 2–500 个字符", "feed_source_query_invalid");
  }
  return query;
}

export function stableId(prefix: string, value: string): string {
  return `${prefix}-${sha256(value).slice(0, 32)}`;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function bounded(value: string, max: number): string {
  const characters = Array.from(value.trim());
  return characters.length <= max ? characters.join("") : `${characters.slice(0, max).join("")}…`;
}

export function sameHttpsUrl(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    a.hash = "";
    b.hash = "";
    return a.protocol === "https:" && b.protocol === "https:" && a.toString() === b.toString();
  } catch {
    return false;
  }
}
