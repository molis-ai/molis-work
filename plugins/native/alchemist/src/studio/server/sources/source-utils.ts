import { createHash } from "node:crypto";
import type { PulseSourceId, SourceCollectionResult } from "../../domain/discovery/source.js";
import type { SourceHttpResponse } from "./http-source-client.js";

export function stableSignalId(sourceId: PulseSourceId, subject: string): string {
  return `signal_${sourceId}_${createHash("sha256").update(subject).digest("hex").slice(0, 16)}`;
}

export function responseHash(body: string): string {
  return `sha256:${createHash("sha256").update(body).digest("hex")}`;
}

export function sourceError(
  sourceId: PulseSourceId,
  requestUrl: string,
  errorCode: string,
  response?: SourceHttpResponse,
): SourceCollectionResult {
  return {
    sourceId,
    status: "error",
    requestUrl,
    fetchedAt: response?.fetchedAt ?? new Date().toISOString(),
    ...(response ? { httpStatus: response.status, contentHash: responseHash(response.body) } : {}),
    errorCode,
    signals: [],
  };
}

export function cleanText(value: string): string {
  return decodeEntities(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function parseCompactNumber(value: string): number | undefined {
  const normalized = value.trim().replace(/,/g, "").toUpperCase();
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  const multiplier =
    match[2] === "K" ? 1_000 : match[2] === "M" ? 1_000_000 : match[2] === "B" ? 1_000_000_000 : 1;
  return Number.isFinite(number) ? number * multiplier : undefined;
}
