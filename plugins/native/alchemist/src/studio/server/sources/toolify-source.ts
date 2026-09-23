import type { SourcePort, SourceQuery, SupplySignal } from "../../domain/discovery/source.js";
import type { SourceHttpClient, SourceHttpResponse } from "./http-source-client.js";
import { SourceHttpError } from "./http-source-client.js";
import { cleanText, parseCompactNumber, responseHash, sourceError, stableSignalId } from "./source-utils.js";

const TOOLIFY_URL = "https://www.toolify.ai/Best-trending-AI-Tools";

export class ToolifySource implements SourcePort {
  readonly sourceId = "toolify" as const;

  constructor(private readonly client: SourceHttpClient) {}

  async collect(input: SourceQuery, signal?: AbortSignal) {
    let response: SourceHttpResponse;
    try {
      response = await this.client.get(TOOLIFY_URL, { signal });
    } catch (error) {
      return sourceError(
        this.sourceId,
        TOOLIFY_URL,
        error instanceof SourceHttpError ? error.code : "SOURCE_NETWORK_ERROR",
      );
    }
    if (/cdn-cgi\/challenge-platform|Just a moment/i.test(response.body)) {
      return sourceError(this.sourceId, TOOLIFY_URL, "SOURCE_CHALLENGE", response);
    }
    if (response.status < 200 || response.status >= 300) {
      return sourceError(this.sourceId, TOOLIFY_URL, `SOURCE_HTTP_${response.status}`, response);
    }
    const signals = parseToolifyTrending(response.body, response.fetchedAt).slice(0, input.limit);
    if (signals.length === 0) {
      return sourceError(this.sourceId, TOOLIFY_URL, "SOURCE_INVALID_RESPONSE", response);
    }
    return {
      sourceId: this.sourceId,
      status: "completed" as const,
      requestUrl: TOOLIFY_URL,
      fetchedAt: response.fetchedAt,
      httpStatus: response.status,
      contentHash: responseHash(response.body),
      signals,
    };
  }
}

export function parseToolifyTrending(html: string, observedAt: string): SupplySignal[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const signals: SupplySignal[] = [];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 6) continue;
    const anchor = cells[1].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    const title = cleanText(anchor[2]);
    const url = safeHttpUrl(anchor[1]);
    if (!title || !url) continue;
    const visits = parseCompactNumber(cleanText(cells[2]));
    const growth = parseCompactNumber(cleanText(cells[3]));
    const growthRate = Number(cleanText(cells[4]).replace("%", ""));
    const nativeMetrics: SupplySignal["nativeMetrics"] = [
      ...(visits === undefined
        ? []
        : [
            {
              name: "monthly_visits",
              label: "Toolify 估算月访问",
              value: visits,
              unit: "visits" as const,
              observedAt,
              definition: "Toolify 页面展示的第三方月访问估算",
            },
          ]),
      ...(growth === undefined
        ? []
        : [
            {
              name: "monthly_growth",
              label: "Toolify 估算月增长",
              value: growth,
              unit: "visits" as const,
              observedAt,
              definition: "Toolify 页面展示的月访问估算增量",
            },
          ]),
      ...(Number.isFinite(growthRate)
        ? [
            {
              name: "growth_rate",
              label: "Toolify 估算增长率",
              value: growthRate,
              unit: "percent" as const,
              observedAt,
              definition: "Toolify 页面展示的估算月增长率",
            },
          ]
        : []),
    ];
    signals.push({
      id: stableSignalId("toolify", url),
      sourceId: "toolify",
      title: title.slice(0, 160),
      url,
      summary: cleanText(cells[5]).slice(0, 600),
      observedAt,
      categories: cells[6]
        ? cleanText(cells[6])
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
      nativeMetrics,
      supports: ["Toolify 目录内供给变化", "Toolify 展示的估算流量变化"],
      cannotProve: ["真实采用", "收入", "留存"],
    });
  }
  return signals;
}

function safeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value, TOOLIFY_URL);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
