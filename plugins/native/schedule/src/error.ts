import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { ScheduleError } from "@molis-ai/molis-work-contracts/services/scheduler";

/**
 * Schedule's own error codes, every one `schedule.<reason>`. The kind is the sort of failure; the Host's edge turns it into the status
 * (plugin SDK `actionHttpStatus`), so Schedule keeps no status table of its own. Every status is the one Schedule's route answered for the
 * code's old name: a task or an alarm that is not there 404, a request that cannot be done 400.
 */
export const scheduleErrors = defineErrorCodes("schedule", {
  /** The conversation task's title, instructions or time cannot be used, or the request does not suit the task. */
  task_invalid: "invalid",
  task_not_found: "not_found",
  /** The request about an alarm, reminder or timed operation cannot be done as asked (a time that passed, a stale confirmation, a plugin not installed). */
  job_invalid: "invalid",
  job_not_found: "not_found",
});

/**
 * The scheduler service's refusals reach a caller of Schedule's actions as Schedule's own declared failures, with the same message: the job it
 * has no record of is not found, every other refusal (an interval that is too short, a path it refuses, no handler) is a request that cannot be done.
 */
export function scheduleFailure(error: unknown): unknown {
  if (!(error instanceof ScheduleError)) return error;
  return error.code === "scheduler.job_not_found" ? scheduleErrors.job_not_found(error.message) : scheduleErrors.job_invalid(error.message);
}
