import type { Direction } from "../../domain/discovery/direction.js";
import type { Opportunity } from "../../domain/discovery/pulse.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { SqliteDirectionRepository } from "../db/direction-repository.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";

export class OpportunityActionError extends Error {
  readonly name = "OpportunityActionError";
}

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
        return dependencies.pulse.saveOpportunityForLater(id, dependencies.clock.now());
      } catch (error) {
        throw mapError(error);
      }
    },
    convert(id) {
      const opportunity = dependencies.pulse.getOpportunity(id);
      if (!opportunity) throw new OpportunityActionError("OPPORTUNITY_NOT_FOUND");
      if (opportunity.convertedDirectionId) {
        const direction = dependencies.directions.get(opportunity.convertedDirectionId);
        if (!direction) throw new OpportunityActionError("OPPORTUNITY_DIRECTION_NOT_FOUND");
        return { opportunity, direction, created: false };
      }
      const report = dependencies.pulse.getReport(opportunity.reportId);
      if (!report) throw new OpportunityActionError("PULSE_REPORT_NOT_FOUND");
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
          const converted = dependencies.pulse.convertOpportunity(opportunity.id, direction.id, now);
          return { opportunity: converted, direction, created: true };
        })();
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}

function mapError(error: unknown): OpportunityActionError {
  if (error instanceof OpportunityActionError) return error;
  if (error instanceof Error && error.message.startsWith("OPPORTUNITY_")) {
    return new OpportunityActionError(error.message);
  }
  return new OpportunityActionError("OPPORTUNITY_ACTION_FAILED");
}
