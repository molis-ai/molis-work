import { hostErrors } from "./host-errors.js";
import { randomUUID } from "node:crypto";
import { resolvePlanningMethodPacks } from "@molis-ai/molis-work-plugin-goals/module";
import { createPersonalPlanningActionHandlers, PERSONAL_PLANNING_ACTIONS } from "@molis-ai/molis-work-plugin-goals";
import { bindActionClient, type ActionRegistryPort, type ActionClient, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Uses the platform's existing Catalog owner, never a second Home database. */
export class PersonalPlanningActions {
  private withCatalog?: LocalWebCatalogRunner;
  constructor(private readonly home: string, registry: ActionRegistryPort, read: () => readonly PlanningMethodPack[]) {
    registry.registerProvider({ provider: { provider_id: "io.molis.work.goals.home", title: "个人规划方法", kind: "system" },
      definitions: PERSONAL_PLANNING_ACTIONS,
      handlers: createPersonalPlanningActionHandlers({ list: () => resolvePlanningMethodPacks(read()),
        saveAvailability: () => {
          if (this.withCatalog) return { available: true };
          const error = hostErrors.catalog_unavailable("个人规划的 Catalog 写入服务尚未装配");
          return { available: false, code: error.code, kind: error.kind, reason: error.message };
        },
        save: async method => {
          if (!this.withCatalog) throw hostErrors.catalog_unavailable("个人规划的 Catalog 写入服务尚未装配");
          return this.withCatalog({ homeDirectory: this.home }, catalog => catalog.personalPlanningMethods.save(method, new Date().toISOString()));
        },
      }),
    });
  }
  configure(withCatalog: LocalWebCatalogRunner): void { this.withCatalog = withCatalog; }
}

/** Only bound after the local HTTP channel has passed origin/control-token checks. */
export function bindPersonalPlanningWebActions(client: ActionClient) {
  return bindActionClient(client, () => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: null, audience: "user",
    permissions: ["goals:read", "goals:write"], user_action: { source: "web", conversation_ref: "web:personal-planning", message_ref: `web:${randomUUID()}` } }));
}
