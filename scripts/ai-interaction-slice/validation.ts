import { references, type Values, type DemoAnswer, type Field } from "./model.ts";

/** Presentation exercise, deliberately not a copy of the SDK's authoritative validator. */
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function validDateTime(value: string): boolean {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match || !validDate(match[1]!)) return false;
  return Number(match[2]) < 24 && Number(match[3]) < 60 &&
    Number(match[5] ?? 0) <= 14 && Number(match[6] ?? 0) < 60 &&
    (Number(match[5] ?? 0) !== 14 || Number(match[6]) === 0) && Number.isFinite(Date.parse(value));
}
export function validateValues(values: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  if (values.format.length !== 1 || ![0, 1].includes(values.format[0]!)) errors.format = "请选择一种沟通方式。";
  if (!values.topics.length || new Set(values.topics).size !== values.topics.length ||
      values.topics.some(index => ![0, 1, 2].includes(index))) errors.topics = "至少选择一个复盘重点。";
  if (!values.notes.trim()) errors.notes = "写一句希望这次解决的问题，也可以在下方补充。";
  else if (values.notes.length > 2000) errors.notes = "请把补充控制在 2000 字以内。";
  const minutes = Number(values.minutes);
  if (!values.minutes.trim() || !Number.isInteger(minutes) || minutes < 15 || minutes > 120) errors.minutes = "请输入 15–120 之间的整数分钟。";
  if (!validDate(values.date)) errors.date = "请输入真实日期，例如 2026-10-15。";
  if (!validDateTime(values.when)) errors.when = "请输入带时区的时间，例如 2026-10-16T10:00-07:00。";
  if (!errors.date && !errors.when && values.date > values.when.slice(0, 10)) errors.date = "准备截止日期不能晚于开始日期。";
  if (!values.references.length || values.references.length > 2 ||
      new Set(values.references.map(ref => ref.id)).size !== values.references.length ||
      values.references.some(ref => !references.some(candidate => candidate.id === ref.id && candidate.kind === ref.kind && candidate.label === ref.label))) {
    errors.references = "请选择 1–2 份示例材料。候选仅供演示。";
  }
  return errors;
}
export function answers(values: Values): DemoAnswer[] {
  if (Object.keys(validateValues(values)).length) throw new Error("演示问卷仍有待修正字段");
  return [
    { question: 0, indexes: [...values.format] }, { question: 1, indexes: [...values.topics] },
    { question: 2, value: values.notes.trim() }, { question: 3, value: Number(values.minutes) },
    { question: 4, value: values.date }, { question: 5, value: values.when },
    { question: 6, value: values.references.map(ref => ({ ...ref })) },
  ];
}
