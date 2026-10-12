/** I0 demonstration only. No production input, Run, receipt or task identities. */
export type Layout = "assistant" | "coding";
export type QuestionState = "open" | "submitting" | "received" | "expired" | "replaced" | "cancelled" | "failed";
export type ExecutionState = "ready" | "running" | "done" | "failed" | "unknown" | "stale";
export type Outcome = "done" | "failed" | "unknown";
export interface Reference { kind: string; id: string; label: string }
export interface Values {
  format: number[];
  topics: number[];
  notes: string;
  minutes: string;
  date: string;
  when: string;
  references: Reference[];
}
export type Field = keyof Values;
/** What the person typed into the two halves of the start time; `values.when` is the composed answer. */
export interface WhenParts { date: string; time: string }
export interface DemoState {
  layout: Layout;
  values: Values;
  whenParts: WhenParts;
  /** Composer text not yet handed to the question; sending it appends to `notes`. */
  draft: string;
  edited: Set<Field>;
  /** Untouched fields the last background update changed, shown until the person edits them. */
  refreshed: Field[];
  errors: Partial<Record<Field, string>>;
  question: QuestionState;
  execution: ExecutionState;
  version: number;
  objectVersion: number;
  epoch: number;
  received: Values | null;
  preview: Values | null;
  previewVersion: number | null;
  conflict: string | null;
  dismissedSuggestion: string | null;
  questionClosed: boolean;
  answerAttempts: number;
  effectAttempts: number;
  notice: string;
}
export interface DemoAnswer {
  question: number;
  indexes?: number[];
  value?: string | number | Reference[];
}
export const references: readonly Reference[] = [
  { kind: "goal", id: "sample-review", label: "秋季工作台 · 内部试用" },
  { kind: "document", id: "sample-notes", label: "10 月试用反馈摘录" },
  { kind: "document", id: "sample-design", label: "交互验收清单" },
];
export const formats = [
  { label: "一起复盘", description: "先对齐体验，再定下一步", recommended: true },
  { label: "异步审阅", description: "先读材料，在文档里留判断", recommended: false },
];
export const topics = ["首次使用", "失败与恢复", "交互细节"];
export const fieldOrder: Field[] = ["format", "topics", "notes", "minutes", "date", "when", "references"];
export const labels: Record<Field, string> = {
  format: "沟通方式", topics: "重点看什么", notes: "补充要求", minutes: "预计时长",
  date: "准备截止", when: "开始时间", references: "关联材料",
};
/** The demo's fixed zone; the answer carries its offset, the person never types it. */
export const zone = { offset: "-07:00", label: "洛杉矶时间 · UTC−07:00" };
export const timeLimits = { minMinutes: 15, maxMinutes: 120, step: 5, maxReferences: 2 };
export function composeWhen(parts: WhenParts): string {
  const time = parts.time.trim();
  const clock = time.match(/^(\d{1,2}):(\d{2})$/);
  return `${parts.date.trim()}T${clock ? `${clock[1]!.padStart(2, "0")}:${clock[2]}` : time}${zone.offset}`;
}
export function createDemo(layout: Layout): DemoState {
  const whenParts = { date: "2026-10-16", time: "10:00" };
  return {
    layout, values: { format: [0], topics: [0, 1], notes: "", minutes: "30",
      date: "2026-10-15", when: composeWhen(whenParts), references: [] },
    whenParts, draft: "", edited: new Set(), refreshed: [], errors: {}, question: "open", execution: "ready",
    version: 1, objectVersion: 1, epoch: 0, received: null, preview: null, previewVersion: null,
    conflict: null, dismissedSuggestion: null, questionClosed: false,
    answerAttempts: 0, effectAttempts: 0, notice: "预填只是起点，提交前不会发送。",
  };
}
export function cloneValues(values: Values): Values {
  return { ...values, format: [...values.format], topics: [...values.topics],
    references: values.references.map(ref => ({ ...ref })) };
}
