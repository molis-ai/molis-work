export class ScheduleTaskError extends Error {
  constructor(
    readonly code: "schedule_task_invalid" | "schedule_task_not_found",
    message: string,
  ) {
    super(message);
    this.name = "ScheduleTaskError";
  }
}
