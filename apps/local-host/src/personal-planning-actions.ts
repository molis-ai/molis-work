import { randomUUID } from "node:crypto";
import { resolvePlanningMethodPacks } from "@molis-ai/molis-work-module-goals";
import { createPersonalPlanningActionHandlers, PERSONAL_PLANNING_ACTIONS } from "@molis-ai/molis-work-plugin-goals";
import { ActionError, bindActionClient, type ActionRegistryPort, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/** Uses the platform's existing Catalog owner, never a second Home database. */
export class PersonalPlanningActions {
  private withCatalog?: LocalWebCatalogRunner;
  constructor(private readonly home: string, registry: ActionRegistryPort, read: () => readonly PlanningMethodPack[]) {
    registry.registerProvider({ provider: { provider_id: "io.molis.work.goals.home", title: "个人规划方法", kind: "system" },
      definitions: PERSONAL_PLANNING_ACTIONS,
      handlers: createPersonalPlanningActionHandlers({ list: () => resolvePlanningMethodPacks(read()),
        saveAvailability: () => this.withCatalog ? { available: true }
          : { available: false, code: "planning.catalog_unavailable", reason: "个人规划的 Catalog 写入服务尚未装配" },
        save: async method => {
          if (!this.withCatalog) throw new ActionError("planning.catalog_unavailable", "个人规划的 Catalog 写入服务尚未装配");
          return this.withCatalog({ homeDirectory: this.home }, catalog => catalog.personalPlanningMethods.save(method, new Date().toISOString()));
        },
      }),
    });
  }
  configure(withCatalog: LocalWebCatalogRunner): void { this.withCatalog ??= withCatalog; }
}

/** Only bound after the local HTTP channel has passed origin/control-token checks. */
export function bindPersonalPlanningWebActions(client: ActionClient) {
  return bindActionClient(client, () => ({ actor_id: "web-user", actor_kind: "user", project_id: null, audience: "user",
    permissions: ["goals:read", "goals:write"], user_action: { source: "web", conversation_ref: "web:personal-planning", message_ref: `web:${randomUUID()}` } }));
}
