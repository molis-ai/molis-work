import { createSearchRuntime } from "@adeptify/search-evidence-layer";
import { createPortBackedNodeSearchHost } from "@adeptify/search-evidence-layer/host/node";
import { createRssProvider } from "@adeptify/search-evidence-layer/providers/rss";
import {
  createEvidenceContentStore, createFileSecretStore,
  type EvidenceContentStore, type SecretStore, type SqliteDatabase,
} from "@molis-ai/molis-work-storage";
import type { RssFetchReceipt } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { builtinPublicFeedDriver } from "./builtin-drivers.js";
import type { PublicFeedDriver } from "./public-feed-driver.js";
import { createSearchContentPort, createSearchEvidenceRuntime, type SearchEvidenceRuntime } from "./search-evidence-runtime.js";
import { PRODUCT_VERSION } from "./product-version.js";

const APP_ID = "molis-work";

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SourcePullRuntime extends SearchEvidenceRuntime {
  publicFeedReceipt?(): RssFetchReceipt | null;
  /** Evidence bodies this runtime has written, whether or not its pull reached a result. */
  writtenContentRefs?(): readonly string[];
}

/** The platform's public-feed pull: the public-feed driver's transport, routes and HTTP cursor (M10), composed with the common SEL runtime. */
export function createSourcePullRuntime(options: {
  db: SqliteDatabase;
  fetch?: FetchPort;
  secretStore?: SecretStore;
  content?: EvidenceContentStore;
  sourceCursor?: unknown;
  /** The platform's pull service: told each evidence body's reference before the body is written, and stops the pull when the call is no longer current. */
  beforeContentWrite?: (contentRef: string) => Promise<void>;
  assertCurrent?: () => void;
  /** Awaited right before a web query leaves for the search service. */
  beforeDispatch?: () => Promise<void>;
  /** The public-feed driver; absent: the one the built-in integrations register. */
  driver?: PublicFeedDriver;
}): SourcePullRuntime {
  const driver = options.driver ?? builtinPublicFeedDriver();
  const secretStore = options.secretStore ?? createFileSecretStore();
  const store = options.content ?? createEvidenceContentStore({ secretStore });
  const written = new Set<string>();
  const content: EvidenceContentStore = {
    ...store,
    write(markdown) {
      const stored = store.write(markdown);
      written.add(stored.contentRef);
      return stored;
    },
  };
  let publicFeedReceipt: RssFetchReceipt | null = null;
  const rssTransport = driver.createTransport(options.fetch ?? globalThis.fetch, {
    userAgent: `Molis Work/${PRODUCT_VERSION} (+local feed ingest)`,
    conditional: driver.conditional(options.sourceCursor),
    onReceipt(receipt) { publicFeedReceipt = receipt; },
  });
  const rssHost = createPortBackedNodeSearchHost({
    appId: APP_ID,
    transport: {
      async execute(call) {
        await options.beforeDispatch?.();
        options.assertCurrent?.();
        return rssTransport.execute(call);
      },
      ...(rssTransport.shutdown ? { shutdown: () => rssTransport.shutdown!() } : {}),
    },
    content: createSearchContentPort(content, options.assertCurrent, options.beforeContentWrite),
  });
  const rssRuntime = createSearchRuntime({
    app: { id: APP_ID, version: PRODUCT_VERSION, dataCompatibilityVersion: /* @version format.search-evidence.data-compatibility */ 1 },
    host: rssHost.host,
    providers: [{ revision: 1, provider: createRssProvider({ appId: APP_ID }), transportProfileId: /* @version type.molis-work-rss-allowlist "molis-work-rss-allowlist-v{version}" */ "molis-work-rss-allowlist-v1" }],
  });
  const shared = createSearchEvidenceRuntime({
    db: options.db, secretStore, content, assertCurrent: options.assertCurrent, beforeDispatch: options.beforeDispatch, beforeContentWrite: options.beforeContentWrite,
    source: {
      runtime: rssRuntime,
      routeResolver: driver.routeResolver(),
    },
  });
  return { ...shared, publicFeedReceipt() { return publicFeedReceipt; }, writtenContentRefs() { return [...written]; } };
}
