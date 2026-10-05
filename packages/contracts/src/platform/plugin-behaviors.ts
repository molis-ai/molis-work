const ID = /^[a-z0-9][a-z0-9-]*$/u;

export interface PluginBehaviorDeclaration {
  readonly behavior_id: string;
  readonly title: string;
  readonly effect: "read" | "write";
  readonly subject_kinds: readonly string[];
}

export interface PluginFunctionSceneDeclaration {
  readonly scene_id: string;
  readonly title: string;
  readonly subject_kinds: readonly string[];
}

export interface PluginJudgmentSubjectDeclaration {
  readonly subject_kind: string;
  readonly title: string;
}

export function inspectBehaviors(_pluginId: string, behaviors: PluginBehaviorDeclaration[] | undefined): string[] {
  if (behaviors === undefined) return [];
  if (!Array.isArray(behaviors)) return ["behaviors 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of behaviors) {
    if (!entry || typeof entry !== "object") {
      problems.push("behaviors 条目不合法");
      continue;
    }
    if (typeof entry.behavior_id !== "string" || !ID.test(entry.behavior_id)) {
      problems.push("behaviors 的 behavior_id 不合法");
      continue;
    }
    if (seen.has(entry.behavior_id)) {
      problems.push(`behaviors 重复：${entry.behavior_id}`);
      continue;
    }
    seen.add(entry.behavior_id);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`behaviors ${entry.behavior_id} 缺少标题`);
    }
    if (entry.effect !== "read" && entry.effect !== "write") {
      problems.push(`behaviors ${entry.behavior_id} 的 effect 必须是 read 或 write`);
    }
    if (!Array.isArray(entry.subject_kinds) || entry.subject_kinds.length === 0
      || entry.subject_kinds.some((kind) => typeof kind !== "string" || kind.trim() === "")) {
      problems.push(`behaviors ${entry.behavior_id} 必须声明 subject_kinds`);
    }
  }
  return problems;
}

export function inspectFunctionScenes(scenes: PluginFunctionSceneDeclaration[] | undefined): string[] {
  if (scenes === undefined) return [];
  if (!Array.isArray(scenes)) return ["function_scenes 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of scenes) {
    if (!entry || typeof entry !== "object") {
      problems.push("function_scenes 条目不合法");
      continue;
    }
    if (typeof entry.scene_id !== "string" || !/^[a-z0-9][a-z0-9.-]*$/u.test(entry.scene_id)) {
      problems.push("function_scenes 的 scene_id 不合法");
      continue;
    }
    if (seen.has(entry.scene_id)) {
      problems.push(`function_scenes 重复：${entry.scene_id}`);
      continue;
    }
    seen.add(entry.scene_id);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`function_scenes ${entry.scene_id} 缺少标题`);
    }
    if (!Array.isArray(entry.subject_kinds) || entry.subject_kinds.length === 0) {
      problems.push(`function_scenes ${entry.scene_id} 必须声明 subject_kinds`);
    }
  }
  return problems;
}

export function inspectJudgmentSubjects(subjects: PluginJudgmentSubjectDeclaration[] | undefined): string[] {
  if (subjects === undefined) return [];
  if (!Array.isArray(subjects)) return ["judgment_subjects 必须为数组"];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of subjects) {
    if (!entry || typeof entry !== "object") {
      problems.push("judgment_subjects 条目不合法");
      continue;
    }
    if (typeof entry.subject_kind !== "string" || entry.subject_kind.trim() === "") {
      problems.push("judgment_subjects 缺少 subject_kind");
      continue;
    }
    if (seen.has(entry.subject_kind)) {
      problems.push(`judgment_subjects 重复：${entry.subject_kind}`);
      continue;
    }
    seen.add(entry.subject_kind);
    if (typeof entry.title !== "string" || entry.title.trim() === "") {
      problems.push(`judgment_subjects ${entry.subject_kind} 缺少标题`);
    }
  }
  return problems;
}
