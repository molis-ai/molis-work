import type { MolisWorkSettingsView } from "@molis-ai/molis-work-app-workbench";
import { MIN_CALL_ID_PREFIX, type ActionCallLog, type ActionCallRecord } from "./action-call-log.js";

/** An id is 36 characters; what is pasted into the box is shown back on the page, so a longer text (an address pasted whole) is cut. */
const MAX_QUERY = 64;
const FOUND = 50;
const RECENT = 20;

/** The rows as the page shows them: the number that was asked for is the one on a row that holds several operations. */
function matched(row: ActionCallRecord, wanted: string): ActionCallRecord & { matched_call_id: string } {
  return { ...row, matched_call_id: [row.call_id, ...(row.call_ids ?? [])].find(id => id.toLowerCase().startsWith(wanted)) ?? row.call_id };
}

/**
 * What 设置 › 诊断 shows of the call log: the rows of the operation whose 诊断编号 (or its first six characters or more) is in `?call=`,
 * and, when none is asked for, the newest calls of any project that failed or were turned away. The rows are the log's own; they hold
 * no input and no result.
 */
export function callDiagnosticsView(log: ActionCallLog | undefined, url: URL): Pick<MolisWorkSettingsView, "call_query" | "recent_calls"> {
  const text = (url.searchParams.get("call") ?? "").trim().slice(0, MAX_QUERY);
  if (text === "") return { call_query: { text, min_length: MIN_CALL_ID_PREFIX }, recent_calls: log?.recent(RECENT, { failedOnly: true }) ?? [] };
  const wanted = text.toLowerCase();
  return { call_query: { text, min_length: MIN_CALL_ID_PREFIX, ...(text.length < MIN_CALL_ID_PREFIX ? {} : { matches: (log?.find(wanted, FOUND) ?? []).map(row => matched(row, wanted)) }) } };
}
