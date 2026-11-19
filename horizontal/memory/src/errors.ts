import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const memoryErrors = defineErrorCodes("memory", {
  invalid: "invalid", not_found: "not_found", forbidden: "forbidden", scope: "forbidden",
  limit: "conflict", conflict: "conflict", off: "invalid", unavailable: "unavailable",
  setting_invalid: "invalid", setting_conflict: "conflict",
});
export type MemoryErrorCode = `memory.${keyof typeof memoryErrors}`;
