import { matchDeclaredPageRoute, type DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import { shippedParts } from "./plugin-registry.js";

/**
 * The page route some plugin declares (`ui.page_routes`, T-116 / PG-060) that answers this request, with the parameters it declares
 * and nothing else of the request. One matcher over every registered plugin's Manifest; the Host knows no plugin by name for it, and
 * a plugin reads what its own route means. The project's scope is already off `url.pathname`.
 */
export function matchPageRoute(url: URL): DeclaredPageRouteMatch | null {
  return matchDeclaredPageRoute(shippedParts().map(entry => entry.manifest), url.pathname, url.searchParams);
}
