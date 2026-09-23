import type { NativeMetric, SourcePort, SourceQuery, SupplySignal } from "../../domain/discovery/source.js";
import type { SourceHttpClient, SourceHttpResponse } from "./http-source-client.js";
import { SourceHttpError } from "./http-source-client.js";
import { responseHash, sourceError, stableSignalId } from "./source-utils.js";

const WATCHA_URL = "https://watcha.cn/api/v2/hot/products";

interface WatchaProduct {
  id?: number;
  name?: string;
  slug?: string;
  slogan?: string;
  categories?: Array<{ name?: string }>;
  stats?: Record<string, unknown> & { update_at?: string };
  create_at?: string;
  update_at?: string;
}

export class WatchaSource implements SourcePort {
  readonly sourceId = "watcha" as const;

  constructor(private readonly client: SourceHttpClient) {}

  async collect(input: SourceQuery, signal?: AbortSignal) {
    let response: SourceHttpResponse;
    try {
      response = await this.client.get(`${WATCHA_URL}?limit=${Math.min(input.limit, 50)}`, { signal });
    } catch (error) {
      return sourceError(
        this.sourceId,
        WATCHA_URL,
        error instanceof SourceHttpError ? error.code : "SOURCE_NETWORK_ERROR",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      return sourceError(this.sourceId, WATCHA_URL, `SOURCE_HTTP_${response.status}`, response);
    }
    try {
      const body = JSON.parse(response.body) as { statusCode?: number; data?: { items?: WatchaProduct[] } };
      if (body.statusCode !== 200 || !Array.isArray(body.data?.items)) throw new Error("invalid shape");
      const signals = body.data.items
        .slice(0, input.limit)
        .filter(isCompleteWatchaProduct)
        .map((product) => normalizeWatchaProduct(product, response.fetchedAt));
      return {
        sourceId: this.sourceId,
        status: "completed" as const,
        requestUrl: WATCHA_URL,
        fetchedAt: response.fetchedAt,
        httpStatus: response.status,
        contentHash: responseHash(response.body),
        signals,
      };
    } catch {
      return sourceError(this.sourceId, WATCHA_URL, "SOURCE_INVALID_RESPONSE", response);
    }
  }
}

function normalizeWatchaProduct(
  product: Required<Pick<WatchaProduct, "id" | "name" | "slug">> & WatchaProduct,
  observedAt: string,
): SupplySignal {
  const metrics: NativeMetric[] = [];
  const metricSpecs = [
    ["upvotes", "观猹赞同", "count"],
    ["stars", "观猹收藏", "count"],
    ["review_count", "观猹评测数", "count"],
    ["hot_score", "观猹热度", "score"],
  ] as const;
  for (const [name, label, unit] of metricSpecs) {
    const value = product.stats?.[name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    metrics.push({
      name,
      label,
      value,
      unit,
      observedAt: product.stats?.update_at ?? observedAt,
      definition: `观猹公开热门产品接口的 ${name} 字段`,
    });
  }
  const url = `https://watcha.cn/products/${product.slug}`;
  return {
    id: stableSignalId("watcha", String(product.id)),
    sourceId: "watcha",
    title: product.name.slice(0, 160),
    url,
    summary: (product.slogan ?? "观猹热门产品").slice(0, 600),
    observedAt,
    ...(product.create_at ? { publishedAt: product.create_at } : {}),
    categories: (product.categories ?? []).flatMap((category) => (category.name ? [category.name] : [])),
    nativeMetrics: metrics,
    supports: ["观猹站内产品供给", "观猹站内注意力与互动"],
    cannotProve: ["全市场需求", "付费", "收入", "留存"],
  };
}

function isCompleteWatchaProduct(
  product: WatchaProduct,
): product is Required<Pick<WatchaProduct, "id" | "name" | "slug">> & WatchaProduct {
  return typeof product.id === "number" && Boolean(product.name) && Boolean(product.slug);
}
