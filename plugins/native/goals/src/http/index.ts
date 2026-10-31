import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalRelationRoutes } from "./relations.js";
import type { GoalsRoutePorts } from "./types.js";
import { goalCreateRoutes } from "./create.js";
import { goalPolicyGuidanceRoutes } from "./policy-guidance.js";
import { goalLifecycleRoutes } from "./lifecycle.js";
import { goalDecisionRoutes } from "./decisions.js";
import { goalEventDecisionRoutes } from "./event-decisions.js";
import { goalEventRoutes } from "./events.js";
import { goalDeliverableRoutes } from "./deliverables.js";
import { goalInputRoutes } from "./inputs.js";
import { goalTerminalRoutes } from "./terminals.js";

/** Every route `goalsManifest.routes` declares, one handler each (PG094-09); whoever mounts them supplies the ports. */
export function goalsRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    ...goalCreateRoutes(ports),
    ...goalPolicyGuidanceRoutes(ports),
    ...goalRelationRoutes(ports),
    ...goalLifecycleRoutes(ports),
    ...goalDecisionRoutes(ports),
    ...goalEventRoutes(ports),
    ...goalEventDecisionRoutes(ports),
    ...goalDeliverableRoutes(ports),
    ...goalInputRoutes(ports),
    ...goalTerminalRoutes(ports),
  ];
}
