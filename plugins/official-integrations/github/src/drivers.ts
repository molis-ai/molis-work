import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { readResearchRepository } from "./repository-read.js";

/** What GitHub declares the Host does for it (D3 A): reading a published research library at a pinned revision. */
export const drivers: IntegrationDrivers = Object.freeze({
  repository: { read: readResearchRepository },
});
