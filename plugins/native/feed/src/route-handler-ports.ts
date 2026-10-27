import type { FeedSourceCatalogView } from "./projection.js";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export interface FeedRouteHandlerPorts {
  /** Feed's own actions, called as the person who made the request. */
  actions: Pick<BoundActionClient, "invoke">;
  sourceCatalog(): FeedSourceCatalogView[];
}
