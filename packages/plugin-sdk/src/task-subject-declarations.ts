import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

// The shape of a Manifest's `task_subjects` (specs/proactive-assistant/task-grants-platform-area.md §5.1, decided 2026-11-06): which
// of this plugin's own object kinds its task grant subjects are, so the page where a person reviews grants can show each task's title.
// The platform reads that title through this Manifest's own search source for the kind, as the person, so the kind must be one such a
// source lists and the source must be open to `user`. `parsePluginManifest` is the one caller.

const FIELDS = new Set(["kind"]);

export function taskSubjectDeclarationProblems(subjects: unknown, actions: readonly ActionDefinition[] | undefined): string[] {
  if (subjects === undefined) return [];
  if (!isRecord(subjects)) return ["task_subjects 必须是对象，只写 kind 一项"];
  const problems: string[] = [];
  const extra = Object.keys(subjects).filter(field => !FIELDS.has(field));
  if (extra.length > 0) problems.push(`task_subjects 不认这些字段：${extra.join("、")}`);
  const kind = subjects.kind;
  if (typeof kind !== "string" || kind.trim().length === 0) return [...problems, "task_subjects 的 kind 要写本插件的一种对象"];
  // A malformed action is the action checks' to report (they run in the same pass); here it simply lists no kind.
  const sources = (Array.isArray(actions) ? actions as readonly unknown[] : []).map(sourceListing).filter(source => source.kinds.includes(kind));
  if (sources.length === 0) problems.push(`task_subjects 的 kind ${kind} 要是本插件某个搜索来源列出的对象种类`);
  else if (!sources.some(source => source.openToUser)) problems.push(`task_subjects 的 kind ${kind} 所在的搜索来源要对 user 开放（以本人身份取标题）`);
  return problems;
}

/** The kinds an action lists as a search source, and whether the person may call it; nothing for anything not shaped like one. */
function sourceListing(value: unknown): { kinds: readonly string[]; openToUser: boolean } {
  const metadata = isRecord(value) && isRecord(value.action) ? value.action : undefined;
  const source = metadata && isRecord(metadata.search_source) ? metadata.search_source : undefined;
  const kinds = Array.isArray(source?.kinds) ? source.kinds.flatMap(entry => isRecord(entry) && typeof entry.kind === "string" ? [entry.kind] : []) : [];
  return { kinds, openToUser: Array.isArray(metadata?.audiences) && metadata.audiences.includes("user") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
