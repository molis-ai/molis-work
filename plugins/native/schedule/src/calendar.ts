import { ScheduleTaskError } from "./task-error.js";

export function assertClockTime(hour: number, minute: number): void {
  assertClockField(hour, 0, 23, "小时");
  assertClockField(minute, 0, 59, "分钟");
}

export function nextDailyLocalDue(hour: number, minute: number, from = new Date()): Date {
  assertClockTime(hour, minute);
  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function parseClockTime(value: unknown): { hour: number; minute: number } {
  const raw = typeof value === "string" ? value.trim() : "";
  const matched = /^([01]?\d|2[0-3]):([0-5]\d)$/u.exec(raw);
  if (!matched) throw new ScheduleTaskError("schedule_task_invalid", "请填写每天的时间");
  return { hour: Number(matched[1]), minute: Number(matched[2]) };
}

export function formatClockTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assertClockField(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ScheduleTaskError("schedule_task_invalid", `${label}无效`);
  }
}
