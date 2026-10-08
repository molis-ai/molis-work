import { createAllowlistedRssTransport } from "@molis-ai/molis-work-integration-rss/host";
import { createSearchRuntime } from "@adeptify/search-evidence-layer";
import { createPortBackedNodeSearchHost, type SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import { createRssProvider } from "@adeptify/search-evidence-layer/providers/rss";
import {
  createEvidenceContentStore, createFileSecretStore,
  type EvidenceContentStore, type SecretStore, type SqliteDatabase,
} from "@molis-ai/molis-work-storage";
import { createFeedExactRouteResolver } from "@molis-ai/molis-work-plugin-feed";
import {
  listFeedUrls, listRegisterableFeeds, readRssHttpState, type RssFetchReceipt,
  CUSTOM_RSS_DEFINITION_ID, customRssFeedHost, isCustomRssFeedUrl,
} from "@molis-ai/molis-work-integration-rss";
import {
  YOUTUBE_CHANNEL_DEFINITION_ID, YOUTUBE_PUBLIC_FEED_HOST, isYouTubePublicFeedUrl,
} from "@molis-ai/molis-work-integration-youtube";
import { createSearchContentPort, createSearchEvidenceRuntime, type SearchEvidenceRuntime } from "./search-evidence-runtime.js";

const APP_ID = "molis-work";
const APP_VERSION = "0.2.0";

type FetchPort = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface FeedSourceRuntime extends SearchEvidenceRuntime {
  publicFeedReceipt?(): RssFetchReceipt | null;
  /** Evidence bodies this runtime has written, whether or not its pull reached a result. */
  writtenContentRefs?(): readonly string[];
}

/** Feed contributes source selection, HTTP cursors and receipts to the common SEL composition. */
export function createFeedSourceRuntime(options: {
  db: SqliteDatabase;
  fetch?: FetchPort;
  secretStore?: SecretStore;
  content?: EvidenceContentStore;
  sourceCursor?: unknown;
  /** Composition-owned query transport; the normal Feed path remains pinned by SEL. */
  queryTransport?: SearchHostTransportPort;
}): FeedSourceRuntime {
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
  const httpState = readRssHttpState(options.sourceCursor);
  let publicFeedReceipt: RssFetchReceipt | null = null;
  const rssHost = createPortBackedNodeSearchHost({
    appId: APP_ID,
    transport: createAllowlistedRssTransport(listFeedUrls(), options.fetch ?? globalThis.fetch, {
      isPublicChannelFeed: isYouTubePublicFeedUrl,
      userAgent: `Molis Work/${APP_VERSION} (+local feed ingest)`,
      allowCustomPublicFeeds: true,
      conditional: { etag: httpState.etag, lastModified: httpState.last_modified },
      onReceipt(receipt) { publicFeedReceipt = receipt; },
    }),
    content: createSearchContentPort(content),
  });
  const rssRuntime = createSearchRuntime({
    app: { id: APP_ID, version: APP_VERSION, dataCompatibilityVersion: 1 },
    host: rssHost.host,
    providers: [{ revision: 1, provider: createRssProvider({ appId: APP_ID }), transportProfileId: "molis-work-rss-allowlist-v1" }],
  });
  const shared = createSearchEvidenceRuntime({
    db: options.db, secretStore, content, queryTransport: options.queryTransport,
    source: {
      runtime: rssRuntime,
      routeResolver: createFeedExactRouteResolver({
        listCatalog: listRegisterableFeeds,
        customRss: { id: CUSTOM_RSS_DEFINITION_ID, acceptsUrl: isCustomRssFeedUrl, host: customRssFeedHost },
        youtube: { id: YOUTUBE_CHANNEL_DEFINITION_ID, host: YOUTUBE_PUBLIC_FEED_HOST, acceptsUrl: isYouTubePublicFeedUrl },
      }),
    },
  });
  return { ...shared, publicFeedReceipt() { return publicFeedReceipt; }, writtenContentRefs() { return [...written]; } };
}
