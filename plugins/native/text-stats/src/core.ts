import { pathLabel, type FileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

/**
 * Three counts over a captured snapshot, and where it came from.
 *
 * Deliberately the smallest real consumer in the system: it reads one bound
 * input, holds no content of its own, asks for no Host Capability, and touches
 * no disk. If the platform can host this, it can host a Plugin somebody else
 * wrote.
 *
 * The three counts are separate because they disagree, and the disagreement is
 * the point: characters counts code points, bytes counts UTF-8, and neither is
 * "length" in any language with text outside ASCII.
 */

export type TextStatsPhase = "waiting" | "unavailable" | "ready";

export interface TextStatsSource {
  workspace_name: string;
  path: string;
  source_plugin_id: string;
  /** Exact Artifact version counted, so a number can be traced back. */
  content_version: number;
}

export interface TextStatsView {
  phase: TextStatsPhase;
  message: string;
  recovery?: string;
  source?: TextStatsSource;
  /** Unicode code points, not UTF-16 units: an emoji counts once. */
  characters?: number;
  utf8_bytes?: number;
  lines?: number;
}

export const TEXT_STATS_WAITING = "固定一份文件快照后，这里会显示该版本的文本统计";
export const TEXT_STATS_UNAVAILABLE = "捕获的快照已经不在了";
export const TEXT_STATS_RECOVERY = "重新捕获一次，或者在 Sources 里换一个输入";

export interface TextStatsInput {
  snapshot: FileSnapshot;
  source_plugin_id: string;
  content_version: number;
}

export function waitingStats(): TextStatsView {
  return { phase: "waiting", message: TEXT_STATS_WAITING };
}

export function unavailableStats(): TextStatsView {
  return { phase: "unavailable", message: TEXT_STATS_UNAVAILABLE, recovery: TEXT_STATS_RECOVERY };
}

export function projectTextStats(input: TextStatsInput): TextStatsView {
  const text = input.snapshot.text;
  return {
    phase: "ready",
    message: "",
    source: {
      workspace_name: input.snapshot.workspace.name,
      path: pathLabel(input.snapshot.path),
      source_plugin_id: input.source_plugin_id,
      content_version: input.content_version,
    },
    characters: countCodePoints(text),
    utf8_bytes: new TextEncoder().encode(text).byteLength,
    lines: countLines(text),
  };
}

export function countCodePoints(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; ) {
    const point = text.codePointAt(index);
    if (point === undefined) break;
    count += 1;
    index += point > 0xffff ? 2 : 1;
  }
  return count;
}

/**
 * Lines, counting the way an editor's gutter does.
 *
 * An empty file has no lines. A file ending in a newline has the same count as
 * the same file without it — the trailing newline terminates the last line, it
 * does not begin another.
 */
export function countLines(text: string): number {
  if (text === "") return 0;
  let lines = 1;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      // CRLF is one ending, not two.
      if (index + 1 < text.length && text.charCodeAt(index + 1) === 10) index += 1;
      if (index + 1 < text.length) lines += 1;
    } else if (code === 10 && index + 1 < text.length) {
      lines += 1;
    }
  }
  return lines;
}
