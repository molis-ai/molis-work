import { createSearchRuntime, type SearchRuntime } from "@adeptify/search-evidence-layer";
import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import {
  createPortBackedNodeSearchHost,
  type SearchHostContentPort,
  type SearchHostTransportPort,
} from "@adeptify/search-evidence-layer/host/node";
import { createAnySearchProvider } from "@adeptify/search-evidence-layer/providers/anysearch";
import {
  createEvidenceContentStore, createFileSecretStore, evidenceContentRef,
  type EvidenceContentStore, type SecretStore, type SqliteDatabase,
} from "@molis-ai/molis-work-storage";
import { createIntelligenceCollectAdapter, type IntelligenceCollectAdapter } from "./search-intelligence-client.js";
import { createWebQueryRouteResolver } from "./search-query-routes.js";
import { ANYSEARCH_TRANSPORT_PROFILE_ID, createAnySearchTransport } from "./anysearch-transport.js";
import { PRODUCT_VERSION } from "./product-version.js";

const APP_ID = "molis-work";

export interface SearchEvidenceRuntime {
  intelligenceCollect: IntelligenceCollectAdapter;
  content: EvidenceContentStore;
  shutdown(): Promise<void>;
}

/** Host composition over SEL. An optional source contributes its own routes and provider runtime. */
export function createSearchEvidenceRuntime(options: {
  db: SqliteDatabase;
  beforeDispatch?: () => Promise<void>;
  assertCurrent?: () => void;
  secretStore?: SecretStore;
  content?: EvidenceContentStore;
  /** Told each evidence body's reference before the body is written; see `createSearchContentPort`. */
  beforeContentWrite?: (contentRef: string) => Promise<void>;
  /** Test seam. Production never passes it: the one way to reach AnySearch is `anysearch-transport.ts`. */
  queryTransport?: SearchHostTransportPort;
  /** Lifecycle ownership is transferred to this composition. */
  source?: { runtime: SearchRuntime; routeResolver: SearchIntentRouteResolverV1 };
}): SearchEvidenceRuntime {
  if (options.source && options.source.runtime.app.id !== APP_ID) {
    throw new Error("exact SearchRuntime app ids must match");
  }
  const secretStore = options.secretStore ?? createFileSecretStore();
  const content = options.content ?? createEvidenceContentStore({ secretStore });
  const hostContent = createSearchContentPort(content, options.assertCurrent, options.beforeContentWrite);
  const transport = options.queryTransport ?? createAnySearchTransport(options);
  // Own fallible transport cleanup here: SEL memoizes a rejected host shutdown permanently.
  const queryHost = createPortBackedNodeSearchHost({
    appId: APP_ID, transport: { async execute(call) {
      await options.beforeDispatch?.(); options.assertCurrent?.(); return transport.execute(call);
    } }, content: hostContent,
  });
  const queryRuntime = createAnySearchRuntime(queryHost.host);
  const source = options.source;
  const searchRuntime: SearchRuntime = source ? {
    app: queryRuntime.app,
    providers: {
      doctor: providerId => (providerId === "anysearch" ? queryRuntime : source.runtime).providers.doctor(providerId),
    },
    operations: {
      create: (plan, executeOptions) => ((plan as { providerId?: string }).providerId === "anysearch"
        ? queryRuntime : source.runtime).operations.create(plan, executeOptions),
    },
    async shutdown() { /* The composition below owns both runtimes. */ },
  } : queryRuntime;
  const queryRoutes = createWebQueryRouteResolver();
  const intelligenceCollect = createIntelligenceCollectAdapter({
    db: options.db, secretStore, searchRuntime, assertCurrent: options.assertCurrent,
    routeResolver: { resolveExact: input => (input.input.kind === "query" || !source
      ? queryRoutes : source.routeResolver).resolveExact(input) },
  });
  let closing: Promise<void> | undefined;
  const pending = new Set([intelligenceCollect, queryRuntime, { shutdown: async () => { await transport.shutdown?.(); } }, ...(source ? [source.runtime] : [])]);
  return {
    intelligenceCollect, content,
    shutdown() {
      return closing ??= (async () => {
        const results = await Promise.allSettled([...pending].map(async resource => {
          await resource.shutdown(); pending.delete(resource);
        }));
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) throw failure.reason;
      })().catch(error => { closing = undefined; throw error; });
    },
  };
}

function createAnySearchRuntime(
  host: Parameters<typeof createSearchRuntime>[0]["host"],
): SearchRuntime {
  return createSearchRuntime({
    app: { id: APP_ID, version: PRODUCT_VERSION, dataCompatibilityVersion: 1 },
    host,
    providers: [
      {
        revision: 1,
        provider: createAnySearchProvider(),
        transportProfileId: ANYSEARCH_TRANSPORT_PROFILE_ID,
      },
    ],
  });
}

/**
 * `beforeWrite` is told each body's reference before the body is written and the write waits for it: the caller records that it holds
 * the body first (the Feed content ledger's order, so a body is never on disk with nobody having said it holds it).
 */
export function createSearchContentPort(store: EvidenceContentStore, assertCurrent?: () => void, beforeWrite?: (contentRef: string) => Promise<void>): SearchHostContentPort {
  return {
    async write({ appId, markdown }) {
      if (appId !== APP_ID || typeof markdown !== "string") {
        throw new Error("search evidence content rejected");
      }
      assertCurrent?.();
      if (beforeWrite) { await beforeWrite(evidenceContentRef(markdown)); assertCurrent?.(); }
      return store.write(markdown);
    },
    async read({ appId, contentRef }) {
      if (appId !== APP_ID || !/^molis-work-feed\/sha256\/[0-9a-f]{64}$/u.test(contentRef)) {
        throw new Error("search evidence content reference rejected");
      }
      return store.read(contentRef);
    },
  };
}
