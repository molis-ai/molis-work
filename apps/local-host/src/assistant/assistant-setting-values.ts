import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
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
