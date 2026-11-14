import { mountRisk } from "./client.js";
import type { RiskHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: RiskHost;

mountRisk(host);
