import type { PluginSourceVocabulary } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { FeedSourceCatalogView } from "./projection.js";

/** The public feeds a person can register, as the Feed page lists them: the platform's catalog (`services.sourcePull.vocabulary`), enabled ones only. */
export function feedSourceCatalog(vocabulary: Pick<PluginSourceVocabulary, "catalog">): FeedSourceCatalogView[] {
  return vocabulary.catalog().filter(entry => entry.enabled).map(entry => ({ id: entry.source_id, name: entry.name, kind: "rss" as const,
    feed_url: entry.feed_url, category: entry.category, category_label: entry.category_label, limitations: [...entry.limitations] }));
}
