import { z } from "zod";
import type { Opportunity, PulseReport, PulseRun } from "../../domain/discovery/pulse.js";
import type { SourceSetting, SupplySignal } from "../../domain/discovery/source.js";
import { pulseSourceIds } from "../../domain/discovery/source.js";

export const startPulseRunRequestSchema = z
  .object({ sourceIds: z.array(z.enum(pulseSourceIds)).min(1).optional() })
  .strict();

export const pulseSourceParamsSchema = z.object({ sourceId: z.enum(pulseSourceIds) }).strict();

export const updatePulseSourceRequestSchema = z.object({ enabled: z.boolean() }).strict();

export const opportunityParamsSchema = z.object({ id: z.string().min(1) }).strict();

export interface PulseReportBundleDto {
  report: PulseReport;
  opportunities: readonly Opportunity[];
  signals: readonly SupplySignal[];
}

export interface PulseWorkspaceDto {
  latestRun?: PulseRun;
  reports: readonly PulseReportBundleDto[];
}

export type PulseRunDto = PulseRun;
export type PulseReportDto = PulseReport;
export type OpportunityDto = Opportunity;
export type SupplySignalDto = SupplySignal;
export type SourceSettingDto = SourceSetting;
