/**
 * Optional localized text reader for common action field labels, list separators and booleans.
 * Keeps contracts free of SDK/runtime dependencies; callers with an active UI locale pass a reader (e.g. `t.text`).
 */
export type ActionFieldTextReader = (key: string) => string | undefined;

/** Stable `common.action-field.*` keys for common input field names. */
export const COMMON_ACTION_FIELD_KEYS: Readonly<Record<string, string>> = {
  title: "common.action-field.title", name: "common.action-field.name", text: "common.action-field.content", body: "common.action-field.body",
  content: "common.action-field.content", notes: "common.action-field.notes", note: "common.action-field.notes", description: "common.action-field.description",
  summary: "common.action-field.summary", kind: "common.action-field.type", type: "common.action-field.type", status: "common.action-field.status",
  priority: "common.action-field.priority", category_id: "common.action-field.category", tags: "common.action-field.tags", url: "common.action-field.url",
  date: "common.action-field.date", start_date: "common.action-field.start-date", end_date: "common.action-field.end-date", due_date: "common.action-field.due-date",
  start_time: "common.action-field.start-time", end_time: "common.action-field.end-time", time_zone: "common.action-field.time-zone",
  starts_at: "common.action-field.starts-at", ends_at: "common.action-field.ends-at", remind_at: "common.action-field.remind-at",
  expected_revision: "common.action-field.expected-version", expected_version: "common.action-field.expected-version", id: "common.action-field.object",
  item: "common.action-field.content", markdown: "common.action-field.body", folder_id: "common.action-field.folder",
  project_id: "common.action-field.project", starred: "common.action-field.starred",
};

/**
 * How a person reads an input field that its schema did not title: the common names in plain words. A capability's own
 * `title` always wins; this only covers the fields most business actions share.
 */
const COMMON_FIELD_LABELS: Readonly<Record<string, string>> = {
  title: "标题", name: "名称", text: "内容", body: "正文", content: "内容", notes: "备注", note: "备注", description: "说明", summary: "摘要",
  kind: "类型", type: "类型", status: "状态", priority: "优先级", category_id: "分类", tags: "标签", url: "链接",
  date: "日期", start_date: "开始日期", end_date: "结束日期", due_date: "截止日期", start_time: "开始时间", end_time: "结束时间", time_zone: "时区",
  starts_at: "开始时间", ends_at: "结束时间", remind_at: "提醒时间", expected_revision: "基于的版本", expected_version: "基于的版本", id: "对象", item: "内容",
  markdown: "正文", folder_id: "文件夹", project_id: "项目", starred: "加星标",
};

/** The stable `common.action-field.*` key for a common schema field name, or `undefined` when it is not a common field. */
export function actionFieldLabelKey(key: string): string | undefined {
  return Object.hasOwn(COMMON_ACTION_FIELD_KEYS, key) ? COMMON_ACTION_FIELD_KEYS[key] : undefined;
}

export function actionFieldLabelSource(key: string, declared?: { title?: string; description?: string }, readText?: ActionFieldTextReader): { label: string; defaultKey?: string } {
  if (declared?.title) return { label: declared.title };
  if (Object.hasOwn(COMMON_FIELD_LABELS, key)) {
    return { label: readText?.(COMMON_ACTION_FIELD_KEYS[key]!) || COMMON_FIELD_LABELS[key]!, defaultKey: key };
  }
  return { label: declared?.description && declared.description.length <= 24 ? declared.description : key };
}

export function actionFieldLabel(key: string, declared?: { title?: string; description?: string }, readText?: ActionFieldTextReader): string {
  return actionFieldLabelSource(key, declared, readText).label;
}

/**
 * The choices a field declares, each with the words a person reads: `oneOf`/`anyOf` entries `{ const, title }`, or an
 * `enum` whose description names them as `value=label` (e.g. "personal=个人，project=当前项目"). Null when none.
 */
export function actionFieldOptions(declared?: unknown): Array<{ value: string; label: string }> | null {
  if (!declared || typeof declared !== "object") return null;
  const schema = declared as { enum?: unknown; oneOf?: unknown; anyOf?: unknown; description?: unknown };
  const isNull = (item: unknown) => Boolean(item) && typeof item === "object" && (item as { type?: unknown }).type === "null";
  const listedAll = [schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined;
  // A nullable field wraps its choices with a null branch: read the choices inside.
  const listed = listedAll?.filter(item => !isNull(item));
  if (listed?.length === 1 && listed[0] && typeof listed[0] === "object" && (listed[0] as { const?: unknown }).const === undefined) return actionFieldOptions(listed[0]);
  if (listed?.length && listed.every(item => item && typeof item === "object" && typeof (item as { const?: unknown }).const === "string")) {
    return listed.map(item => ({ value: (item as { const: string }).const, label: typeof (item as { title?: unknown }).title === "string" ? (item as { title: string }).title : (item as { const: string }).const }));
  }
  if (!Array.isArray(schema.enum) || !schema.enum.length || !schema.enum.every(item => typeof item === "string")) return null;
  const named = new Map<string, string>();
  if (typeof schema.description === "string") for (const [, value, label] of schema.description.matchAll(/([A-Za-z0-9_.-]+)\s*=\s*([^，,；;、\n]+)/g)) named.set(value!, label!.trim());
  return (schema.enum as string[]).map(value => ({ value, label: named.get(value) ?? value }));
}

/**
 * How a person fills a field that is a calendar day or a moment, from its JSON Schema `format` ("date", "date-time"),
 * through a nullable wrapper: picked rather than typed. Null for any other field.
 */
export function actionFieldInput(declared?: unknown): "date" | "datetime" | null {
  if (!declared || typeof declared !== "object") return null;
  const schema = declared as { format?: unknown; oneOf?: unknown; anyOf?: unknown };
  if (schema.format === "date") return "date";
  if (schema.format === "date-time") return "datetime";
  const listed = ([schema.oneOf, schema.anyOf].find(Array.isArray) as unknown[] | undefined)
    ?.filter(item => !(item && typeof item === "object" && (item as { type?: unknown }).type === "null"));
  return listed?.length === 1 ? actionFieldInput(listed[0]) : null;
}

/** A moment as a person reads it, in this machine's local time. */
const localMoment = (value: string): string | null => {
  const at = new Date(value);
  if (!Number.isFinite(at.getTime())) return null;
  const two = (part: number) => String(part).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
};

/** A field's value as a person reads it: a declared choice by its label, a moment in local time, rich text as its text, minutes-of-day as a time, the rest as it is. */
export function actionFieldValue(key: string, value: unknown, declared?: unknown, readText?: ActionFieldTextReader): string {
  if (typeof value === "string" && actionFieldInput(declared) === "datetime") return localMoment(value) ?? value;
  if (typeof value === "string") return actionFieldOptions(declared)?.find(option => option.value === value)?.label ?? value;
  if (typeof value === "number" && /_time$/.test(key) && Number.isInteger(value) && value >= 0 && value < 1440) {
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  }
  if (value && typeof value === "object" && (value as { type?: unknown }).type === "doc") {
    const inline = (node: unknown): string => !node || typeof node !== "object" ? "" : typeof (node as { text?: unknown }).text === "string" ? (node as { text: string }).text
      : Array.isArray((node as { content?: unknown }).content) ? ((node as { content: unknown[] }).content).map(inline).join("") : "";
    return ((value as { content?: unknown[] }).content ?? []).map(inline).filter(Boolean).join("\n");
  }
  if (Array.isArray(value) && value.every(item => typeof item === "string")) {
    return value.join(readText?.("common.list.separator") || "、");
  }
  return typeof value === "boolean"
    ? (readText?.(value ? "common.generated.yes" : "common.generated.no") || (value ? "是" : "否"))
    : typeof value === "number" ? String(value) : JSON.stringify(value, null, 2);
}
