/** Provider-owned execution facts. Omitted cost means unknown, never free. */
export interface ActionExecutionPolicy {
  readonly timeout_ms?: number;
  readonly cost?: "none" | "metered" | "unknown";
  /** Accepted invocations per actor + project + installation, over a rolling minute. */
  readonly max_calls_per_minute?: number;
}

export function validActionExecutionPolicy(value: unknown): value is ActionExecutionPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).some(key => !["timeout_ms", "cost", "max_calls_per_minute"].includes(key))) return false;
  const positive = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
  return (policy.timeout_ms === undefined || (positive(policy.timeout_ms) && Number(policy.timeout_ms) <= 2_147_483_647))
    && (policy.max_calls_per_minute === undefined || positive(policy.max_calls_per_minute))
    && (policy.cost === undefined || (typeof policy.cost === "string" && ["none", "metered", "unknown"].includes(policy.cost)));
}
