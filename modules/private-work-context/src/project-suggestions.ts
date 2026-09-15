import type { ProjectRecord as MolisWorkProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeProjectSuggestionClueKind, RuntimeProjectSuggestionClue } from "@molis-ai/molis-work-contracts/modules/private-work-context";

const RUNTIME_PROJECT_SUGGESTION_KINDS = new Set<RuntimeProjectSuggestionClueKind>([
  "workspace",
  "path",
  "directory",
  "repository",
  "session_title",
  "runtime",
  "recent_project",
  "project_name",
]);

const RUNTIME_PROJECT_SUGGESTION_REASONS: Record<RuntimeProjectSuggestionClueKind, string> = {
  workspace: "宿主提供的工作空间线索与项目名称相近",
  path: "宿主提供的工作位置线索与项目名称相近",
  directory: "宿主提供的工作位置线索与项目名称相近",
  repository: "宿主提供的工作位置线索与项目名称相近",
  session_title: "宿主提供的会话标题线索与项目名称相近",
  runtime: "宿主提供的 Runtime 线索与项目名称相近",
  recent_project: "最近确认项目线索",
  project_name: "宿主提供的项目名称线索与项目名称相近",
};

export function normalizeRuntimeProjectSuggestionClues(
  clues: readonly RuntimeProjectSuggestionClue[],
): RuntimeProjectSuggestionClue[] {
  const normalized: RuntimeProjectSuggestionClue[] = [];
  for (const clue of clues) {
    if (!clue || typeof clue.kind !== "string" || typeof clue.value !== "string") continue;
    if (!RUNTIME_PROJECT_SUGGESTION_KINDS.has(clue.kind as RuntimeProjectSuggestionClueKind)) continue;
    const value = clue.value.trim();
    if (!value) continue;
    normalized.push({ kind: clue.kind as RuntimeProjectSuggestionClueKind, value });
  }
  return normalized;
}

export function scoreProjectSuggestion(
  project: MolisWorkProjectRecord,
  clues: readonly RuntimeProjectSuggestionClue[],
): { score: number; reasons: string[] } | null {
  const normalizedProjectName = normalizeSuggestionText(project.display_name);
  if (!normalizedProjectName) return null;
  let score = 0;
  const reasons = new Set<string>();
  for (const clue of clues) {
    const relevance = projectSuggestionRelevance(project, normalizedProjectName, clue);
    if (relevance === 0) continue;
    score += relevance;
    reasons.add(RUNTIME_PROJECT_SUGGESTION_REASONS[clue.kind]);
  }
  return score > 0 ? { score, reasons: [...reasons] } : null;
}

function projectSuggestionRelevance(
  project: MolisWorkProjectRecord,
  normalizedProjectName: string,
  clue: RuntimeProjectSuggestionClue,
): number {
  if (clue.kind === "recent_project") return clue.value.trim() === project.project_id ? 100 : 0;
  const fragments = suggestionTextFragments(clue.value);
  if (fragments.includes(normalizedProjectName)) return 50;
  // A one-character containment match creates too much noise in ordinary
  // titles. Exact one-character project names still work through equality.
  return fragments.some(
    (fragment) =>
      fragment.length >= 2 &&
      normalizedProjectName.length >= 2 &&
      (normalizedProjectName.includes(fragment) || fragment.includes(normalizedProjectName)),
  )
    ? 20
    : 0;
}

function normalizeSuggestionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function suggestionTextFragments(value: string): string[] {
  const whole = normalizeSuggestionText(value);
  const parts = value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map(normalizeSuggestionText)
    .filter(Boolean);
  return [...new Set([whole, ...parts].filter(Boolean))];
}
