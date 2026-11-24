import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { createRssPublicFeedDriver } from "./driver.js";

/** What RSS declares the Host does for it (D3 A, M10): public-feed pulls, YouTube channel feeds and custom feeds included. */
export const drivers: IntegrationDrivers = Object.freeze({
  public_feed: createRssPublicFeedDriver,
});
