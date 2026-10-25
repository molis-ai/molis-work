import type { createMolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

/** One settlement the Host told its call log about: what ran, for whom, and how it ended. */
export interface Settlement {
  capability_id: string;
  operation: string;
  actor_id: string;
  audience: string | undefined;
  ok: boolean;
  code: string | undefined;
}

/**
 * Every call a Home settles reaches `callLog.record`, queries and refusals included (the file keeps only some of them). The list
 * fills as calls settle; a test empties it (`length = 0`) to look at the calls that follow.
 */
export function watchSettlements(host: ReturnType<typeof createMolisWorkLocalHost>): Settlement[] {
  const seen: Settlement[] = [];
  const log = host.callLog!;
  const record = log.record.bind(log);
  log.record = (caller, action, outcome) => {
    seen.push({ capability_id: action.capability_id, operation: action.operation, actor_id: caller.actor_id, audience: caller.audience,
      ok: outcome.ok, code: outcome.ok ? undefined : outcome.code });
    record(caller, action, outcome);
  };
  return seen;
}
