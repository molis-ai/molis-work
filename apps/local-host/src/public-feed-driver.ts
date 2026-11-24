import type { SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import type { SearchIntentRouteResolverV1 } from "@adeptify/search-evidence-layer/intent";
import type { PublicFeedDriver as DeclaredPublicFeedDriver } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

/** The public-feed driver as the Host runs it: the declared driver, its transport and routes typed as the search layer's. */
export type PublicFeedDriver = DeclaredPublicFeedDriver<SearchHostTransportPort, SearchIntentRouteResolverV1>;
