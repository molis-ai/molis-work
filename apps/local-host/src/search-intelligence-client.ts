/**
 * Embedded Intelligence Client over a Host-composed SearchRuntime and explicit exact routes.
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
  type SearchIntentRouteResolverV1,
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
  createSearchAead,
  createSearchOpaqueBlobStore,
  createSearchSecretStore,
} from "@molis-ai/molis-work-storage";

const APP_ID = "molis-work";
// v2 intentionally leaves the old opaque v1 ledger untouched. Some migrated
// project databases contain v1 control state without the matching local
// SecretStore key, which must not make public Feed sync permanently unusable.
const KEY_NAMESPACE = "feed-intent-v2";
const TENANT_ID = "solo";
const PRINCIPAL_REF = "molis-work:local";

/** Composition-root only. Never accept identity from request bodies. */
const MOLIS_WORK_TRUSTED_CALLER_CONTEXT = Object.freeze({
  kind: "molis-work-composition-root" as const,
  appId: APP_ID,
});

export type IntelligenceCollectRequest = Parameters<IntelligenceIntentClientV1["executeExact"]>[0];
export type IntelligenceCollectResult = Readonly<Pick<SearchIntentExactResultV1, "operationId" | "intentFingerprint" | "outcome" | "requirementMet" | "materials" | "receipts" | "warnings" | "budget">>;

export interface IntelligenceCollectAdapter {
  executeExact(request: IntelligenceCollectRequest, options?: { signal?: AbortSignal }): Promise<IntelligenceCollectResult>;
  shutdown(): Promise<void>;
}

export function createIntelligenceCollectAdapter(options: {
  readonly db: SqliteDatabase;
  readonly secretStore?: SecretStore;
  readonly searchRuntime: SearchRuntime;
  readonly routeResolver: SearchIntentRouteResolverV1;
}): IntelligenceCollectAdapter {
  let ready: Promise<ReadyState> | null = null;
  let shutDown = false;
  let closing: Promise<void> | undefined;
  const stop = new AbortController();
  const active = new Set<Promise<IntelligenceCollectResult>>();

  const ensureReady = (): Promise<ReadyState> => {
    if (shutDown) {
      return Promise.reject(new Error("intelligence collect adapter shut down"));
    }
    if (!ready) {
      ready = bootstrapReady(
        options.db,
        options.secretStore ?? createFileSecretStore(),
        options.searchRuntime,
        options.routeResolver,
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
      const signal = AbortSignal.any([stop.signal, ...(executeOptions?.signal ? [executeOptions.signal] : [])]);
      const work = (async () => {
        signal.throwIfAborted();
        const state = await ensureReady();
        signal.throwIfAborted();
        const result = await state.client.executeExact(request, { signal });
        signal.throwIfAborted();
        return toPublicResult(result);
      })();
      active.add(work);
      try { return await work; } finally { active.delete(work); }
    },

    shutdown() {
      shutDown = true;
      stop.abort(new Error("Search service stopped"));
      return closing ??= (async () => {
        await Promise.allSettled([...active]);
        if (!ready) return;
        try { const state = await ready; await state.foundation.shutdown(); }
        finally { ready = null; }
      })();
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
  routeResolver: SearchIntentRouteResolverV1,
): Promise<ReadyState> {
  const blobStore = createSearchOpaqueBlobStore(db);
  const foundation = await createSearchStorageFoundation({
    appId: APP_ID,
    keyNamespace: KEY_NAMESPACE,
    aead: createSearchAead(),
    secretStore: createSearchSecretStore(secretStore),
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
    searchRuntime,
    routeResolver,
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
