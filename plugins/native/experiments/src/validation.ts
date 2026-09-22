import type { ExperimentInput, Participant } from "./types.js";
export function requireText(value: unknown, label: string, max = 8000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${label}须为 1–${max} 字`);
  return value;
}
export function validateParticipant(value: Participant): Participant {
  requireText(value.id, "模型标识", 100); requireText(value.name, "模型名称", 100);
  requireText(value.model, "模型", 150);
  if (!["jev", "laya", "grok"].includes(value.kind)) throw new Error("不支持此模型类型");
  if (value.kind === "grok" && (value.model !== "grok-4.6" || value.effort !== "xhigh")) throw new Error("Grok 必须固定 grok-4.6 / xhigh");
  for (const [label, field, max] of [["运行程序路径",value.executable,1000],["权重路径",value.checkpoint,1000],["权重 revision",value.revision,100]] as const) {
    if (field != null && (typeof field !== "string" || field.length > max)) throw new Error(`${label}格式无效`);
  }
  if (value.kind === "laya") {
    if (value.model !== "laya-multilingual") throw new Error("首版 Laya 固定使用 multilingual 权重");
  }
  return structuredClone(value);
}
export function validateInput(value: ExperimentInput): ExperimentInput {
  requireText(value.name, "实验名称", 150);
  requireText(value.task?.instructions, "判断问题");
  const criteria = value.task.criteria;
  if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 8) throw new Error("需要 2–8 个选项");
  const keys = criteria.map(c => {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(c.key)) throw new Error("选项标识使用小写字母、数字和下划线");
    requireText(c.description, "选项说明", 500); return c.key;
  });
  if (new Set(keys).size !== keys.length) throw new Error("选项标识重复");
  for (const k of [value.task.positive_key, value.task.insufficient_key]) if (k && !keys.includes(k)) throw new Error("指标选项不存在");
  if (!Array.isArray(value.cases) || !value.cases.length || value.cases.length > 20) throw new Error("每场实验需要 1–20 条材料");
  if (new Set(value.cases.map(c => c.id)).size !== value.cases.length) throw new Error("材料标识重复");
  for (const c of value.cases) {
    requireText(c.id, "材料标识", 100); requireText(c.label, "材料名称", 150); requireText(c.input, "材料");
    requireText(c.source, "出处及阅读边界", 2000);
    if (!["human", "agent", "unlabeled"].includes(c.reference_status)) throw new Error("参考答案状态无效");
    if (c.reference != null && !keys.includes(c.reference)) throw new Error("参考答案不在选项中");
    if ((c.reference == null) !== (c.reference_status === "unlabeled")) throw new Error("参考答案及标注状态不一致");
    if (typeof c.rationale !== "string" || c.rationale.length > 2000) throw new Error("参考说明过长");
  }
  if (!Array.isArray(value.participants) || !value.participants.length || value.participants.length > 3) throw new Error("每场选择 1–3 组，单次最多 60 次调用");
  if (new Set(value.participants.map(p => p.id)).size !== value.participants.length) throw new Error("参试组重复");
  value.participants.forEach(validateParticipant);
  return structuredClone(value);
}
