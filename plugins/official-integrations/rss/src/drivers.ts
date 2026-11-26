import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { createRssPublicFeedDriver } from "./driver.js";
import { createRssIntegrationPlugin } from "./index.js";

/** What RSS declares the Host does for it (D3 A, M10): its source, and public-feed pulls, YouTube channel feeds and custom feeds included. */
export const drivers: IntegrationDrivers = Object.freeze({
  order: 10,
  integrations: ({ now }) => [createRssIntegrationPlugin({ now })],
  public_feed: createRssPublicFeedDriver,
} satisfies IntegrationDrivers);
