import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_LIMITS, type ObservationOwner, type ObservationReportInput, type ObservationReportResult } from "@molis-ai/molis-work-contracts/services/observation";
import { observationErrors } from "./errors.js";
import { entryOf, factOwned, ownerName, pendingRecord, type ObservationEnvironment } from "./records.js";
import type { ObservationWriter } from "./writer.js";

export interface ReportOptions {
  readonly env: ObservationEnvironment;
  readonly writer: ObservationWriter;
  /**
   * The Host's check that a `user` call came through its own UI-stage route and carries the entry credential that route issued for this
   * request (`webEntryDoor`'s `entryOf`). Throws when it did not. A `user` call is the shell's only through it (contract-design §4).
   */
  readonly shellEntry: (caller: ActionCallContext) => void;
}

/** Who reports, from the trusted caller only: the shell through its door, or a plugin by the Host-issued `host_plugin`. */
function reporterOf(caller: ActionCallContext, shellEntry: ReportOptions["shellEntry"]): { owner: ObservationOwner; reporter: string } {
  if (caller.audience === "user") {
    shellEntry(caller);
    return { owner: { kind: "shell" }, reporter: "shell" };
  }
  if (caller.audience === "plugin" && caller.host_plugin) {
    return { owner: { kind: "plugin", id: caller.host_plugin.plugin_id }, reporter: `install:${caller.host_plugin.install_id}` };
  }
  throw observationErrors.reporter_unknown("只有工作台界面和插件能上报工作过程");
}

const contentBytes = (input: ObservationReportInput): number => input.facts.reduce((sum, fact) =>
  sum + (fact.evidence ?? []).reduce((inner, item) => inner + (item.ref.kind === "content" ? Buffer.byteLength(item.ref.text, "utf8") : 0), 0), 0);

/**
 * `observation.report@1` (contract-design §4). A fact outside the reporter's prefix is dropped alone; a report over the size or the day's
 * quota is turned down whole, the quota counted once for the reporter (never per fact name the reporter made up). Queued, never waited on.
 */
export function handleReport(options: ReportOptions, caller: ActionCallContext, input: ObservationReportInput): ObservationReportResult {
  const { owner, reporter } = reporterOf(caller, options.shellEntry);
  const bytes = contentBytes(input);
  if (bytes > OBSERVATION_LIMITS.report_content_bytes) throw observationErrors.report_too_large("这次上报的内容超过 1 MiB，请分几次上报");
  const quotaKey = { owner: ownerName(owner), fact: "observation.report", entry: entryOf(caller), project_id: "" };
  if (!options.writer.admit(reporter, quotaKey, input.facts.length, bytes)) throw observationErrors.report_quota_exceeded("今天的上报已达上限，明天再记");
  const rejected: { index: number; code: string }[] = [];
  input.facts.forEach((fact, index) => {
    if (!factOwned(owner, fact.fact)) { rejected.push({ index, code: "observation.fact_not_owned" }); return; }
    options.writer.enqueue(pendingRecord(options.env, owner, caller, fact));
  });
  return { accepted: input.facts.length - rejected.length, rejected };
}
