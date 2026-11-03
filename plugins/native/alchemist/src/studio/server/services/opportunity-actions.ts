import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistStateErrors } from "../../errors.js";
import type { Direction } from "../../domain/discovery/direction.js";
import { type Opportunity } from "../../domain/discovery/pulse.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqliteDirectionRepository } from "../db/direction-repository.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";

interface Dependencies {
  database: SqliteDatabase;
  workspaceId: string;
  clock: Clock;
  idFactory: IdFactory;
  pulse: SqlitePulseRepository;
  directions: SqliteDirectionRepository;
}

export interface OpportunityActions {
  saveForLater(id: string): Opportunity;
  convert(id: string): { opportunity: Opportunity; direction: Direction; created: boolean };
}

export function createOpportunityActions(dependencies: Dependencies): OpportunityActions {
  return {
    saveForLater(id) {
      try {
        return dependencies.pulse.opportunities.saveOpportunityForLater(id, dependencies.clock.now());
      } catch (error) {
        throw mapError(error);
      }
    },
    convert(id) {
      const opportunity = dependencies.pulse.opportunities.getOpportunity(id);
      if (!opportunity) throw alchemistStateErrors.opportunity_not_found("alchemist.opportunity_not_found");
      if (opportunity.convertedDirectionId) {
        const direction = dependencies.directions.get(opportunity.convertedDirectionId);
        if (!direction) throw alchemistStateErrors.opportunity_direction_not_found("alchemist.opportunity_direction_not_found");
        return { opportunity, direction, created: false };
      }
      const report = dependencies.pulse.reports.getReport(opportunity.reportId);
      if (!report) throw alchemistStateErrors.pulse_report_not_found("alchemist.pulse_report_not_found");
      try {
        return dependencies.database.transaction(() => {
          const now = dependencies.clock.now();
          const direction = dependencies.directions.create({
            id: dependencies.idFactory.next("direction"),
            workspaceId: dependencies.workspaceId,
            title: opportunity.title,
            description: [
              opportunity.highlight,
              `为什么值得探索：${opportunity.rationale}`,
              `待验证的需求推断：${opportunity.demandInference}`,
            ].join("\n\n"),
            source: {
              kind: "pulse_opportunity",
              opportunityId: opportunity.id,
              pulseReportId: report.id,
            },
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
          const converted = dependencies.pulse.opportunities.convertOpportunity(opportunity.id, direction.id, now);
          return { opportunity: converted, direction, created: true };
        })();
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}

function mapError(error: unknown): ActionError {
  if (error instanceof ActionError && [
    "alchemist.opportunity_not_found", "alchemist.opportunity_direction_not_found", "alchemist.pulse_report_not_found", "alchemist.opportunity_action_failed",
    "alchemist.opportunity_already_converted", "alchemist.opportunity_cannot_be_saved", "alchemist.opportunity_cannot_be_dismissed", "alchemist.opportunity_cannot_be_converted",
  ].includes(error.code)) return error;
  if (error instanceof Error) {
    switch (error.message) {
      case "alchemist.opportunity_not_found": return alchemistStateErrors.opportunity_not_found(error.message);
      case "alchemist.opportunity_direction_not_found": return alchemistStateErrors.opportunity_direction_not_found(error.message);
      case "alchemist.opportunity_action_failed": return alchemistStateErrors.opportunity_action_failed(error.message);
    }
  }
  return alchemistStateErrors.opportunity_action_failed("alchemist.opportunity_action_failed");
}
