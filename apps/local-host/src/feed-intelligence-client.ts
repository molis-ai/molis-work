import { createFeedExactRouteResolver } from "@molis-ai/molis-work-plugin-feed";
/**
 * Embedded Intelligence Client exact path over the shared RSS SearchRuntime.
 *
 * Storage foundation is created lazily on first executeExact so Host bootstrap
 * stays synchronous. Trusted caller context is fixed here — never from the body.
 */
import {
  createIntelligenceIntentClientV1,
  type IntelligenceIntentClientV1,
  type SearchIntentExactResultV1,
} from "@adeptify/intelligence-client";
import { createEmbeddedIntelligenceIntentTransportV1 } from "@adeptify/intelligence-client/embedded";
import {
  createSearchIntentRuntimeV1,
  type SearchIntentRuntimeV1,
} from "@adeptify/search-evidence-layer/intent";
import {
  createSearchIntentPersistenceV1,
  createSearchIntentScopeAuthorityV1,
  createSearchStorageFoundation,
  type SearchStorageFoundationHandle,
} from "@adeptify/search-evidence-layer/host/node";
import { type SearchRuntime } from "@adeptify/search-evidence-layer";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

import { createFileSecretStore, type SecretStore } from "@molis-ai/molis-work-storage";
import {
  YOUTUBE_CHANNEL_DEFINITION_ID,
  YOUTUBE_PUBLIC_FEED_HOST,
  isYouTubePublicFeedUrl,
} from "@molis-ai/molis-work-integration-youtube";
import {
  CUSTOM_RSS_DEFINITION_ID,
  customRssFeedHost,
  isCustomRssFeedUrl,
} from "@molis-ai/molis-work-integration-rss";
import {
  listRegisterableFeeds,
} from "@molis-ai/molis-work-integration-rss";
import {
  createFeedSearchAead,
  createFeedSearchOpaqueBlobStore,
  createFeedSearchSecretStore,
} from "@molis-ai/molis-work-storage";

const APP_ID = "molis-work";
// v2 intentionally leaves the old opaque v1 ledger untouched. Some migrated
// project databases contain v1 control state without the matching local
// SecretStore key, which must not make public Feed sync permanently unusable.
const KEY_NAMESPACE = "feed-intent-v2";
const TENANT_ID = "solo";
const PRINCIPAL_REF = "molis-work:local";
const WEB_QUERY_PROVIDER_ID = "anysearch";

/** Composition-root only. Never accept identity from request bodies. */
const MOLIS_WORK_TRUSTED_CALLER_CONTEXT = Object.freeze({
  kind: "molis-work-composition-root" as const,
  appId: APP_ID,
});

import type { IntelligenceCollectRequest, IntelligenceCollectResult } from "@molis-ai/molis-work-plugin-feed";
export type { IntelligenceCollectRequest, IntelligenceCollectResult } from "@molis-ai/molis-work-plugin-feed";

export interface IntelligenceCollectAdapter {
  executeExact(request: IntelligenceCollectRequest, options?: { signal?: AbortSignal }): Promise<IntelligenceCollectResult>;
  shutdown(): Promise<void>;
}

export function createIntelligenceCollectAdapter(options: {
  readonly db: SqliteDatabase;
  readonly secretStore?: SecretStore;
  readonly searchRuntime: SearchRuntime;
  /** Optional AnySearch runtime for exact web-query Inbox Sources. */
  readonly querySearchRuntime?: SearchRuntime;
}): IntelligenceCollectAdapter {
  let ready: Promise<ReadyState> | null = null;
  let shutDown = false;

  const ensureReady = (): Promise<ReadyState> => {
    if (shutDown) {
      return Promise.reject(new Error("intelligence collect adapter shut down"));
    }
    if (!ready) {
      ready = bootstrapReady(
        options.db,
        options.secretStore ?? createFileSecretStore(),
        options.searchRuntime,
        options.querySearchRuntime,
      ).catch((error) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  };

  return {
    async executeExact(request, executeOptions) {
      assertExactRequestHasNoCallerIdentity(request);
      const state = await ensureReady();
      const result = await state.client.executeExact(
        request as IntelligenceCollectRequest,
        executeOptions,
      );
      return toPublicResult(result);
    },

    async shutdown() {
      shutDown = true;
      if (!ready) return;
      try {
        const state = await ready;
        await state.foundation.shutdown();
      } finally {
        ready = null;
      }
    },
  };
}

interface ReadyState {
  readonly client: IntelligenceIntentClientV1;
  readonly foundation: SearchStorageFoundationHandle;
  readonly intentRuntime: SearchIntentRuntimeV1;
}

async function bootstrapReady(
  db: SqliteDatabase,
  secretStore: SecretStore,
  searchRuntime: SearchRuntime,
  querySearchRuntime?: SearchRuntime,
): Promise<ReadyState> {
  const blobStore = createFeedSearchOpaqueBlobStore(db);
  const foundation = await createSearchStorageFoundation({
    appId: APP_ID,
    keyNamespace: KEY_NAMESPACE,
    aead: createFeedSearchAead(),
    secretStore: createFeedSearchSecretStore(secretStore),
    operationStore: blobStore,
    contentStore: blobStore,
  });
  const persistence = createSearchIntentPersistenceV1(foundation);
  const scopeAuthority = createSearchIntentScopeAuthorityV1({
    appId: APP_ID,
    resolver: {
      async resolve(callerContext) {
        if (!isTrustedCallerContext(callerContext)) {
          throw new Error("untrusted caller context");
        }
        return Object.freeze({
          appId: APP_ID,
          tenantId: TENANT_ID,
          principalRef: PRINCIPAL_REF,
        });
      },
    },
  });
  const intentRuntime = createSearchIntentRuntimeV1({
    searchRuntime: multiplexExactSearchRuntime(searchRuntime, querySearchRuntime),
    routeResolver: createFeedExactRouteResolver({
      listCatalog: listRegisterableFeeds,
      customRss: { id: CUSTOM_RSS_DEFINITION_ID, acceptsUrl: isCustomRssFeedUrl, host: customRssFeedHost },
      youtube: { id: YOUTUBE_CHANNEL_DEFINITION_ID, host: YOUTUBE_PUBLIC_FEED_HOST, acceptsUrl: isYouTubePublicFeedUrl },
    }),
    persistence,
    scopeAuthority,
  });
  const client = createIntelligenceIntentClientV1({
    transport: createEmbeddedIntelligenceIntentTransportV1({
      runtime: intentRuntime,
      callerContext: MOLIS_WORK_TRUSTED_CALLER_CONTEXT,
    }),
  });
  return { client, foundation, intentRuntime };
}

/**
 * Catalog RSS exact routes, pinned YouTube official feeds, pinned custom
 * HTTPS RSS/Atom URLs, and pinned AnySearch web-query exact routes. Fail
 * closed before network unless the matching selector set is present.
 */
function multiplexExactSearchRuntime(
  feedRuntime: SearchRuntime,
  queryRuntime?: SearchRuntime,
): SearchRuntime {
  if (!queryRuntime) return feedRuntime;
  if (queryRuntime.app.id !== feedRuntime.app.id) {
    throw new Error("exact SearchRuntime app ids must match");
  }
  return {
    app: feedRuntime.app,
    providers: {
      doctor: (providerId) =>
        providerId === WEB_QUERY_PROVIDER_ID
          ? queryRuntime.providers.doctor(providerId)
          : feedRuntime.providers.doctor(providerId),
    },
    operations: {
      create: (plan, options) =>
        (plan as { providerId?: string }).providerId === WEB_QUERY_PROVIDER_ID
          ? queryRuntime.operations.create(plan, options)
          : feedRuntime.operations.create(plan, options),
    },
    shutdown: async () => {
      // Parent composition owns lifecycle of both runtimes.
    },
  };
}

function isTrustedCallerContext(value: unknown): boolean {
  if (value === MOLIS_WORK_TRUSTED_CALLER_CONTEXT) return true;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.kind === MOLIS_WORK_TRUSTED_CALLER_CONTEXT.kind
    && record.appId === APP_ID
  );
}

/** Project Client result onto the frozen Molis Work public field whitelist. */
function toPublicResult(result: SearchIntentExactResultV1): IntelligenceCollectResult {
  return Object.freeze({
    operationId: result.operationId,
    intentFingerprint: result.intentFingerprint,
    outcome: result.outcome,
    requirementMet: result.requirementMet,
    materials: result.materials,
    receipts: result.receipts,
    warnings: result.warnings,
    budget: result.budget,
  });
}

const FORBIDDEN_CALLER_KEYS = ["appId", "tenantId", "principalRef"] as const;

function assertExactRequestHasNoCallerIdentity(
  request: unknown,
): asserts request is IntelligenceCollectRequest {
  if (request === null || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("exact request must be a plain object without caller identity");
  }
  const record = request as Record<string, unknown>;
  for (const key of FORBIDDEN_CALLER_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key) || key in record) {
      throw new Error(`exact request must not include ${key}`);
    }
  }
}
