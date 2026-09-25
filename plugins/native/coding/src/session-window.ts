import { createHash } from "node:crypto";
import { isTerminalAgentPhase, type AgentRunUsage, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { originalTask } from "./continuation.js";

/**
 * Reading a long session without rereading all of it.
 *
 * The conversation refreshes several times a second while a round runs, so one refresh must cost the same at round
 * 300 as at round 3. A refresh carries the latest rounds in full; every earlier round is a one-line summary, sent only
 * when the summaries changed; the rounds a person scrolls back to are read a page at a time. Totals over the whole
 * session come from the summaries, so nothing is dropped from them because it is not on screen.
 */

/** Rounds a refresh carries in full. */
export const SESSION_WINDOW = 6;
/** Rounds one page back carries. */
export const SESSION_PAGE = 10;

/** One earlier round as the session's navigation, totals and results list need it; never its transcript. */
export interface CodingRunSummary {
  light: true;
  ref: AgentRunView["ref"];
  phase: AgentRunView["phase"];
  started_at: string;
  ended_at: string | null;
  task: string;
  frozen: Pick<AgentRunView["frozen"], "role_id" | "model_id"> & { character?: { title: string }; directory?: { canonical_path: string }; text_materials: Array<{ source_artifact_id: string; source_version: number }> };
  usage: AgentRunUsage;
  command_outputs: Array<{ call_id: string; run_id?: string; target: string }>;
  stop_reason?: string;
}

export function codingRunSummary(run: AgentRunView): CodingRunSummary {
  const task = originalTask(run).trim();
  return {
    light: true, ref: run.ref, phase: run.phase, started_at: run.started_at, ended_at: run.ended_at ?? null,
    task: task.length > 300 ? task.slice(0, 300) + "…" : task,
    frozen: { role_id: run.frozen.role_id, model_id: run.frozen.model_id, ...(run.frozen.character ? { character: { title: run.frozen.character.title } } : {}),
      ...(run.frozen.directory ? { directory: { canonical_path: run.frozen.directory.canonical_path } } : {}),
      text_materials: run.frozen.text_materials.map(item => ({ source_artifact_id: item.source_artifact_id, source_version: item.source_version })) },
    usage: run.usage,
    command_outputs: (run.command_outputs ?? []).map(ref => ({ ...ref, target: run.activity.find(item => item.call_id === ref.call_id)?.target ?? "" })),
    ...(run.stop_reason ? { stop_reason: run.stop_reason } : {}),
  };
}

/** A settled round's summary never changes, so it is computed once; a live one is recomputed on every read. */
export function summaryCache() {
  const settled = new Map<string, CodingRunSummary>();
  return {
    async read(session: string, refs: ReadonlyArray<AgentRunView["ref"]>, load: (ref: AgentRunView["ref"]) => Promise<AgentRunView>): Promise<CodingRunSummary[]> {
      return Promise.all(refs.map(async ref => {
        const key = `${session}:${ref.run_id}`, known = settled.get(key);
        if (known) return known;
        const summary = codingRunSummary(await load(ref));
        if (isTerminalAgentPhase(summary.phase)) settled.set(key, summary);
        return summary;
      }));
    },
  };
}

export function summariesFingerprint(summaries: readonly CodingRunSummary[]): string {
  return createHash("sha256").update(JSON.stringify(summaries)).digest("hex").slice(0, 32);
}

/**
 * What the whole session has used so far. A round whose usage is not fully known is counted as far as it is known and
 * named, so the total never reads as more complete than it is.
 */
export interface CodingSessionUsage {
  rounds: number;
  tokens: { input: number; output: number; cached_input?: number };
  cost_usd?: number;
  /** Rounds whose usage is partly unknown or estimated. */
  uncertain_rounds: number;
  /** Model calls that wrote the session's digests: counted in the tokens above, not as rounds. */
  digests?: { calls: number; tokens: { input: number; output: number } };
}

export function codingSessionUsage(usages: readonly AgentRunUsage[], digests?: CodingSessionUsage["digests"] | null): CodingSessionUsage {
  let input = 0, output = 0, cached: number | undefined, cost: number | undefined, uncertain = 0;
  for (const usage of usages) {
    input += usage.tokens.input; output += usage.tokens.output;
    if (usage.tokens.cached_input !== undefined) cached = (cached ?? 0) + usage.tokens.cached_input;
    if (usage.cost_usd !== undefined) cost = (cost ?? 0) + usage.cost_usd;
    if (usage.unavailable_reason) uncertain++;
  }
  if (digests?.calls) { input += digests.tokens.input; output += digests.tokens.output; }
  return { rounds: usages.length, tokens: { input, output, ...(cached === undefined ? {} : { cached_input: cached }) }, ...(cost === undefined ? {} : { cost_usd: cost }), uncertain_rounds: uncertain,
    ...(digests?.calls ? { digests } : {}) };
}

/** The lines of tool output the timeline shows; the rest is counted, not sent. */
const SHOWN_LINES: Record<string, number> = { reasoning: 120 };
const SHOWN_CHARS = 6_000;

/**
 * A run as the conversation draws it: tool output cut to what the timeline shows, with the hidden count kept. The run
 * itself is untouched; this is only what travels to the page, fingerprinted so an unchanged one need not travel again.
 */
export function codingRunForDisplay(run: AgentRunView): AgentRunView & { fingerprint: string } {
  const activity = run.activity.map(item => {
    if (!item.output) return item;
    const all = item.output.replace(/\n$/, "").split("\n"), limit = SHOWN_LINES[item.name] ?? 24;
    let kept = all.slice(0, limit).join("\n");
    if (kept.length > SHOWN_CHARS) kept = kept.slice(0, SHOWN_CHARS);
    return kept.length === item.output.length ? item : { ...item, output: kept, output_hidden_lines: Math.max(0, all.length - limit) };
  });
  const shown = { ...run, activity };
  return { ...shown, fingerprint: createHash("sha256").update(JSON.stringify(shown)).digest("hex").slice(0, 20) };
}
