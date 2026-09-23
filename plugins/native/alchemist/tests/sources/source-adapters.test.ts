// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GitHubSource } from "../../src/studio/server/sources/github-source.js";
import type { SourceHttpClient, SourceHttpResponse } from "../../src/studio/server/sources/http-source-client.js";
import { ToolifySource } from "../../src/studio/server/sources/toolify-source.js";
import { WatchaSource } from "../../src/studio/server/sources/watcha-source.js";

const fetchedAt = "2026-07-31T05:00:00.000Z";

describe("Market Pulse source adapters", () => {
  it("normalizes Toolify estimated traffic without treating it as demand", async () => {
    const source = new ToolifySource(client(fixture("toolify-trending.html"), 200));
    const result = await source.collect({ since: "2026-07-24T00:00:00.000Z", limit: 10 });

    expect(result.status).toBe("completed");
    expect(result.signals[0]).toMatchObject({
      sourceId: "toolify",
      title: "Workflow Artifact",
      nativeMetrics: [
        { name: "monthly_visits", value: 1_200_000 },
        { name: "monthly_growth", value: 360_000 },
        { name: "growth_rate", value: 42 },
      ],
      cannotProve: expect.arrayContaining(["真实采用", "收入", "留存"]),
    });
  });

  it("returns an explicit error for the Toolify Cloudflare challenge", async () => {
    const source = new ToolifySource(
      client("<title>Just a moment...</title>/cdn-cgi/challenge-platform", 403),
    );
    const result = await source.collect({ since: "2026-07-24T00:00:00.000Z", limit: 10 });

    expect(result).toMatchObject({ status: "error", errorCode: "SOURCE_CHALLENGE", signals: [] });
  });

  it("normalizes Watcha product activity as platform attention", async () => {
    const source = new WatchaSource(client(fixture("watcha-hot-products.json"), 200));
    const result = await source.collect({ since: "2026-07-24T00:00:00.000Z", limit: 10 });

    expect(result.signals[0]).toMatchObject({
      sourceId: "watcha",
      title: "未言",
      publishedAt: "2026-07-25T02:26:37.198Z",
      categories: ["通用助手", "图像生成"],
      nativeMetrics: expect.arrayContaining([expect.objectContaining({ name: "stars", value: 3 })]),
      cannotProve: expect.arrayContaining(["全市场需求", "付费"]),
    });
  });

  it("queries GitHub recent repositories and preserves rate limits", async () => {
    let requestedUrl = "";
    const source = new GitHubSource({
      async get(url) {
        requestedUrl = url;
        return response(fixture("github-repositories.json"), 200, {
          "x-ratelimit-remaining": "57",
          "x-ratelimit-reset": "1785470000",
        });
      },
    });
    const result = await source.collect({ since: "2026-07-24T00:00:00.000Z", limit: 10 });

    expect(requestedUrl).toContain("api.github.com/search/repositories");
    expect(requestedUrl).toContain("sort=stars");
    expect(result).toMatchObject({ status: "completed", rateLimitRemaining: 57 });
    expect(result.signals[0]).toMatchObject({
      sourceId: "github",
      title: "VictorTaelin/OptMem",
      nativeMetrics: expect.arrayContaining([expect.objectContaining({ name: "stars", value: 1200 })]),
      cannotProve: expect.arrayContaining(["终端用户采用", "收入"]),
    });
  });

  it("does not turn malformed source output into an empty successful result", async () => {
    const source = new WatchaSource(client("{bad json", 200));
    const result = await source.collect({ since: "2026-07-24T00:00:00.000Z", limit: 10 });

    expect(result).toMatchObject({ status: "error", errorCode: "SOURCE_INVALID_RESPONSE" });
  });
});

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/sources/${name}`, import.meta.url), "utf8");
}

function client(body: string, status: number): SourceHttpClient {
  return { get: async () => response(body, status) };
}

function response(body: string, status: number, headers: Record<string, string> = {}): SourceHttpResponse {
  return {
    body,
    status,
    headers,
    finalUrl: "https://example.com/source",
    fetchedAt,
  };
}
