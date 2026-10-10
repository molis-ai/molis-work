import { createSearchRuntime, type SearchRuntime } from "@adeptify/search-evidence-layer";
import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import {
  createPortBackedNodeSearchHost,
  type SearchHostContentPort,
  type SearchHostTransportPort,
} from "@adeptify/search-evidence-layer/host/node";
import { createAnySearchProvider } from "@adeptify/search-evidence-layer/providers/anysearch";
import {
  createEvidenceContentStore, createFileSecretStore,
  type EvidenceContentStore, type SecretStore, type SqliteDatabase,
} from "@molis-ai/molis-work-storage";
import { createIntelligenceCollectAdapter, type IntelligenceCollectAdapter } from "./search-intelligence-client.js";
import { createWebQueryRouteResolver } from "./search-query-routes.js";
import { ANYSEARCH_TRANSPORT_PROFILE_ID, createAnySearchTransport } from "./anysearch-transport.js";

const APP_ID = "molis-work";
const APP_VERSION = "0.2.0";

export interface SearchEvidenceRuntime {
  intelligenceCollect: IntelligenceCollectAdapter;
  content: EvidenceContentStore;
  shutdown(): Promise<void>;
}

/** Host composition over SEL. An optional source contributes its own routes and provider runtime. */
export function createSearchEvidenceRuntime(options: {
  db: SqliteDatabase;
  secretStore?: SecretStore;
  content?: EvidenceContentStore;
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
  const hostContent = createSearchContentPort(content);
  const queryHost = createPortBackedNodeSearchHost({
    appId: APP_ID, transport: options.queryTransport ?? createAnySearchTransport(), content: hostContent,
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
    db: options.db, secretStore, searchRuntime,
    routeResolver: { resolveExact: input => (input.input.kind === "query" || !source
      ? queryRoutes : source.routeResolver).resolveExact(input) },
  });
  let closing: Promise<void> | undefined;
  return {
    intelligenceCollect, content,
    shutdown() {
      return closing ??= (async () => {
        const results = await Promise.allSettled([
          intelligenceCollect.shutdown(), queryRuntime.shutdown(), ...(source ? [source.runtime.shutdown()] : []),
        ]);
        const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
        if (failure) throw failure.reason;
      })();
    },
  };
}

function createAnySearchRuntime(
  host: Parameters<typeof createSearchRuntime>[0]["host"],
): SearchRuntime {
  return createSearchRuntime({
    app: { id: APP_ID, version: APP_VERSION, dataCompatibilityVersion: 1 },
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

export function createSearchContentPort(store: EvidenceContentStore): SearchHostContentPort {
  return {
    async write({ appId, markdown }) {
      if (appId !== APP_ID || typeof markdown !== "string") {
        throw new Error("search evidence content rejected");
      }
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
