import type { NativeMetric, SourcePort, SourceQuery, SupplySignal } from "../../domain/discovery/source.js";
import type { SourceHttpClient, SourceHttpResponse } from "./http-source-client.js";
import { SourceHttpError } from "./http-source-client.js";
import { responseHash, sourceError, stableSignalId } from "./source-utils.js";

const GITHUB_SEARCH_URL = "https://api.github.com/search/repositories";

interface GitHubRepository {
  id?: number;
  full_name?: string;
  html_url?: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  topics?: string[];
}

export class GitHubSource implements SourcePort {
  readonly sourceId = "github" as const;

  constructor(
    private readonly client: SourceHttpClient,
    private readonly token?: string,
  ) {}

  async collect(input: SourceQuery, signal?: AbortSignal) {
    const since = input.since.slice(0, 10);
    const params = new URLSearchParams({
      q: `AI created:>=${since}`,
      sort: "stars",
      order: "desc",
      per_page: String(Math.min(input.limit, 50)),
    });
    const requestUrl = `${GITHUB_SEARCH_URL}?${params.toString()}`;
    let response: SourceHttpResponse;
    try {
      response = await this.client.get(requestUrl, {
        signal,
        headers: {
          accept: "application/vnd.github+json",
          "x-github-api-version": "2026-03-10",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
      });
    } catch (error) {
      return sourceError(
        this.sourceId,
        requestUrl,
        error instanceof SourceHttpError ? error.code : "SOURCE_NETWORK_ERROR",
      );
    }
    const remaining = parseHeaderNumber(response.headers["x-ratelimit-remaining"]);
    const reset = response.headers["x-ratelimit-reset"];
    if (response.status === 403 || response.status === 429) {
      return {
        ...sourceError(this.sourceId, requestUrl, "SOURCE_RATE_LIMITED", response),
        ...(remaining === undefined ? {} : { rateLimitRemaining: remaining }),
        ...(reset ? { rateLimitReset: reset } : {}),
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return sourceError(this.sourceId, requestUrl, `SOURCE_HTTP_${response.status}`, response);
    }
    try {
      const body = JSON.parse(response.body) as { items?: GitHubRepository[] };
      if (!Array.isArray(body.items)) throw new Error("invalid shape");
      const signals = body.items
        .slice(0, input.limit)
        .filter(isCompleteGitHubRepository)
        .map((repository) => normalizeGitHubRepository(repository, response.fetchedAt));
      return {
        sourceId: this.sourceId,
        status: "completed" as const,
        requestUrl,
        fetchedAt: response.fetchedAt,
        httpStatus: response.status,
        contentHash: responseHash(response.body),
        ...(remaining === undefined ? {} : { rateLimitRemaining: remaining }),
        ...(reset ? { rateLimitReset: reset } : {}),
        signals,
      };
    } catch {
      return sourceError(this.sourceId, requestUrl, "SOURCE_INVALID_RESPONSE", response);
    }
  }
}

function normalizeGitHubRepository(
  repository: Required<Pick<GitHubRepository, "id" | "full_name" | "html_url">> & GitHubRepository,
  observedAt: string,
): SupplySignal {
  const metrics: NativeMetric[] = [];
  for (const [name, label, value] of [
    ["stars", "GitHub Stars", repository.stargazers_count],
    ["forks", "GitHub Forks", repository.forks_count],
    ["open_issues", "GitHub 开放 Issue 与 PR", repository.open_issues_count],
  ] as const) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    metrics.push({
      name,
      label,
      value,
      unit: "count",
      observedAt,
      definition: `GitHub Repository Search API 的 ${name} 观察值`,
    });
  }
  return {
    id: stableSignalId("github", String(repository.id)),
    sourceId: "github",
    title: repository.full_name.slice(0, 160),
    url: repository.html_url,
    summary: (repository.description ?? "GitHub 近期公开仓库").slice(0, 600),
    observedAt,
    ...(repository.created_at ? { publishedAt: repository.created_at } : {}),
    categories: [repository.language, ...(repository.topics ?? [])].filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    ),
    nativeMetrics: metrics,
    supports: ["近期公开开发者供给", "GitHub 平台注意力与参与"],
    cannotProve: ["终端用户采用", "收入", "付费", "留存"],
  };
}

function isCompleteGitHubRepository(
  repository: GitHubRepository,
): repository is Required<Pick<GitHubRepository, "id" | "full_name" | "html_url">> & GitHubRepository {
  return typeof repository.id === "number" && Boolean(repository.full_name) && Boolean(repository.html_url);
}

function parseHeaderNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
