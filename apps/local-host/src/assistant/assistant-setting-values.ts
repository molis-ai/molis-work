import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { OVERVIEW_SUMMARY_FIELDS, type OverviewSummaryField } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assistantErrors } from "./assistant-errors.js";

export const LOOKBACK_KEY = "assistant.lookback";
export const DAILY_CAP_KEY = "assistant.daily_tokens";
export const LOOKBACK_DEFAULT = { count: 48, unit: "hours" } as const;
const unitHours = { hours: 1, days: 24, weeks: 168 } as const;

export function lookbackHours(value: SandboxJson): number {
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.unit !== "string" || !Object.hasOwn(unitHours, value.unit)
    || typeof value.count !== "number" || !Number.isSafeInteger(value.count) || value.count < 1)
    throw assistantErrors.setting_invalid("回看范围需要正整数和小时、天或周");
  const hours = value.count * unitHours[value.unit as keyof typeof unitHours];
  if (!Number.isSafeInteger(hours * 3_600_000) || hours * 3_600_000 > 8.64e15) throw assistantErrors.setting_invalid("回看范围超出支持的日期");
  return hours;
}

export function dailyTokenLimit(input: unknown): number | null {
  const value = input === null || input === "" || input === undefined ? null : Number(input);
  if (value !== null && (!Number.isSafeInteger(value) || value < 1000)) throw assistantErrors.invalid("每日上限至少 1000 tokens，或留空表示不限");
  return value;
}

/**
 * The person's grants to the assistant for reading the cross-project overview (`overview-readers`, batch 108): which projects, and which
 * summary fields there. None by default: the assistant reads no other project's overview until the person grants it one.
 */
export const OVERVIEW_GRANTS_KEY = "assistant.overview_grants";
export const OVERVIEW_GRANTS_DEFAULT: SandboxJson = { grants: [] };
/** The most projects one person grants; more than this many projects are granted by choosing again, not by a longer list. */
export const OVERVIEW_GRANTS_LIMIT = 500;

/** The grants a saved value holds, or a refusal: each project once, each with at least one known summary field, each field once. */
export function overviewGrants(value: SandboxJson): { readonly partition_id: string; readonly fields: readonly OverviewSummaryField[] }[] {
  const refuse = () => assistantErrors.setting_invalid("跨项目总览授权要列出项目和其中允许的摘要字段");
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.grants) || value.grants.length > OVERVIEW_GRANTS_LIMIT
    || Object.keys(value).some(key => key !== "grants")) throw refuse();
  const seen = new Set<string>();
  return value.grants.map(grant => {
    if (!grant || typeof grant !== "object" || Array.isArray(grant) || Object.keys(grant).some(key => key !== "partition_id" && key !== "fields")) throw refuse();
    const id = grant.partition_id, fields = grant.fields;
    if (typeof id !== "string" || id.length < 1 || id.length > 200 || seen.has(id) || !Array.isArray(fields) || fields.length < 1) throw refuse();
    seen.add(id);
    const kept = new Set<string>();
    for (const field of fields) {
      if (typeof field !== "string" || !(OVERVIEW_SUMMARY_FIELDS as readonly string[]).includes(field) || kept.has(field)) throw refuse();
      kept.add(field);
    }
    return { partition_id: id, fields: [...kept] as OverviewSummaryField[] };
  });
}
