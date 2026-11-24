import { fingerprintSearchIntentExactV1, validateSearchIntentExactV1 } from "@adeptify/intelligence-client";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SourcePullRequest } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { builtinPublicFeedDriver } from "./builtin-drivers.js";
import type { PublicFeedDriver } from "./public-feed-driver.js";
import type { IntelligenceCollectRequest } from "./search-intelligence-client.js";

// The request a plugin's pull becomes (`services.sourcePull`, S-97 provisional). The plugin names an address, a channel, a catalog entry or
// a query; the budget and the source policy are made here, and where a public feed may go is the public-feed driver's answer (M10).
// The platform owns the plan used by both the pure fingerprint query and the actual pull.

const WEB_QUERY_DEFINITION_ID = "anysearch";
const DEFAULT_MAX_MATERIALS = 20;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_DEADLINE_MS = 15_000;

function normalizeQuery(value: string): string {
  const query = value.trim().replace(/\s+/gu, " ");
  const length = Array.from(query).length;
  if (length < 2 || length > 500) throw new ActionError("actions.input_invalid", "网页查询需要 2–500 个字符");
  return query;
}

export function buildSourcePullIntent(request: SourcePullRequest, driver: PublicFeedDriver = builtinPublicFeedDriver()): IntelligenceCollectRequest {
  const webQuery = request.kind === "web_query";
  const budget = {
    maxProviderCalls: 1,
    maxFetchExtractCalls: webQuery ? 3 : 0,
    maxModelInputTokens: 0,
    maxModelOutputTokens: 0,
    maxMaterials: webQuery ? 5 : DEFAULT_MAX_MATERIALS,
    maxBytes: DEFAULT_MAX_BYTES,
    maxConcurrency: 1,
    deadlineMs: webQuery ? 30_000 : DEFAULT_DEADLINE_MS,
  };
  if (request.kind === "web_query") {
    const query = normalizeQuery(request.query);
    return validateSearchIntentExactV1({
      schema: /* @version type.search-intent "search-intent-v{version}" */ "search-intent-v1",
      operationId: request.operation_id,
      goal: `同步网页查询来源「${request.source_name}」到 Molis Work`,
      taskProfile: "latest_monitoring",
      mode: "exact",
      input: { kind: "query", query },
      sourcePolicy: {
        required: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
        allowed: [
          { kind: "provider", value: "anysearch" },
          { kind: "channel", value: "web" },
          { kind: "source_definition", namespace: "app", value: WEB_QUERY_DEFINITION_ID },
        ],
      },
      budget,
      partialPolicy: "allow_partial",
      resultProfile: "materials_v1",
    });
  }
  const { feed_url: feedUrl, definition_id: definitionId, domain } = driver.target(request.definition_id, request.address);
  return validateSearchIntentExactV1({
    schema: /* @version type.search-intent "search-intent-v{version}" */ "search-intent-v1",
    operationId: request.operation_id,
    goal: `同步公开来源「${request.source_name}」到 Molis Work`,
    taskProfile: "exact_rss_ingest",
    mode: "exact",
    input: { kind: "feed", url: feedUrl },
    sourcePolicy: {
      required: [
        { kind: "url", value: feedUrl },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
      allowed: [
        { kind: "domain", value: domain },
        { kind: "source_definition", namespace: "app", value: definitionId },
      ],
    },
    budget,
    partialPolicy: "allow_partial",
    resultProfile: "materials_v1",
  });
}

/** The fingerprint of the pull the request would make, with nothing fetched or written. */
export function sourcePullFingerprint(request: SourcePullRequest, driver?: PublicFeedDriver): string {
  return fingerprintSearchIntentExactV1(buildSourcePullIntent(request, driver));
}
