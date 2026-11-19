import type { SandboxJson, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { assertSandboxMatches, isTimeZone } from "@molis-ai/molis-work-plugin-sdk";
import { assistantErrors } from "./assistant-errors.js";

export const REPORT_SCHEDULE_KEY = "assistant.report_schedule";
export const reportScheduleSchema: SandboxSchema = {
  type: "object", additionalProperties: false, required: ["enabled", "frequency", "time", "time_zone"],
  properties: {
    enabled: { type: "boolean" }, frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
    time: { type: "string", minLength: 5, maxLength: 5 }, time_zone: { type: "string", minLength: 1, maxLength: 100 },
    weekday: { type: "integer", minimum: 1, maximum: 7 }, month_day: { type: "integer", minimum: 1, maximum: 31 },
  },
};

export function defaultReportSchedule() {
  return { enabled: false, frequency: "daily", time: "09:00", time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

export function validateReportSchedule(value: SandboxJson) {
  assertSandboxMatches(reportScheduleSchema, value, (_kind, message) => { throw assistantErrors.setting_invalid(message); });
  const record = value as Record<string, SandboxJson>;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(record.time))) throw assistantErrors.setting_invalid("报告时间需要 24 小时制时刻");
  if (!isTimeZone(String(record.time_zone))) throw assistantErrors.setting_invalid("无法识别报告的时区");
  if ((record.frequency === "weekly") !== Object.hasOwn(record, "weekday") || (record.frequency === "monthly") !== Object.hasOwn(record, "month_day"))
    throw assistantErrors.setting_invalid("周报需要指定星期几，月报需要指定每月几号，其他周期不填写该项");
}
