import type { PluginSourceVocabulary } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationRegistry } from "./integration-registry.js";
import type { PublicFeedDriver } from "./public-feed-driver.js";

/**
 * `services.sourcePull.vocabulary`'s Host side: the public-feed driver's catalog, addressed definitions, address normal forms and HTTP
 * cursor (M10: the integration declares them; the Host names none), and source presentations from the running integration registry.
 * Pure over the driver: no I/O, no state, so the same input is the same answer.
 */
export function createSourceVocabulary(driver: PublicFeedDriver, registry?: () => Promise<IntegrationRegistry>): PluginSourceVocabulary {
  return Object.freeze<PluginSourceVocabulary>({
    presentation: async (id, input) => {
      if (!registry) throw pluginErrors.integration_unavailable("此来源词汇没有运行中的集成登记表");
      return (await registry()).presentSource(id, input);
    },
    catalog: () => driver.catalog(),
    addressed: () => driver.addressed(),
    normalizeAddress: (definitionId, value) => driver.normalizeAddress(definitionId, value),
    feedFailureCount: cursor => driver.failureCount(cursor),
    feedCursorAfterFailure: cursor => driver.cursorAfterFailure(cursor),
    feedCursorAfterSuccess: (cursor, receipt, completedAt) => driver.cursorAfterSuccess(cursor, receipt, completedAt),
  });
}
