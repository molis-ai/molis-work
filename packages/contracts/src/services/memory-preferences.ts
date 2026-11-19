import type { MemoryClassRestriction, MemoryConsumer, MemoryKind, MemoryScope } from "./memory.js";

/** Marker namespace for a single preference profile, including its revision and durable request receipts. */
export const memoryPreferenceMarkerPrefix = (profile: string): string => "settings/" + JSON.stringify(profile) + "/";

/** Switches of one scope: the person's (personal memories), or one project's. */
export interface MemoryPrefs {
  /** 总开关；关闭仍允许本人管理读取与清除，不允许新写或恢复。 */
  enabled: boolean;
  /** 自动为当前任务读取；关闭不影响 Host 确认的显式回忆。 */
  task_recall: boolean;
  /** 允许记住: off, nothing new is kept and no candidates are made (existing ones are still used). */
  form: boolean;
  /** 自动记住低风险的偏好与经验: off, what would be written automatically waits for the person instead. */
  auto: boolean;
  /** 从工作里提出建议. */
  learn_from_work: boolean;
  /** 从界面操作里学习. */
  learn_from_ui: boolean;
  /** 谁可以用. `mcp` is off by default for personal memories. */
  consumers: Record<MemoryConsumer, boolean>;
  /** Per plugin: whether it may read, and which kinds. Absent: plugins follow `consumers.plugin` with preferences and conventions only. */
  plugins: Record<string, { allowed: boolean; kinds: MemoryKind[] }>;
  /** Replaces this profile’s restrictions; omission from an update preserves them. */
  class_restrictions: MemoryClassRestriction[];
}

export type MemoryPreset = "off" | "manual" | "reviewed" | "assisted";

/** Exactly one source of changes; the recipe is not another persisted setting. */
export type MemoryPrefsWriteRequest = { scope?: MemoryScope } &
  ({ prefs: Partial<MemoryPrefs>; preset?: never } | { preset: MemoryPreset; prefs?: never });

export interface MemoryPrefsView {
  scope: MemoryScope;
  project_id: string | null;
  prefs: MemoryPrefs;
}
