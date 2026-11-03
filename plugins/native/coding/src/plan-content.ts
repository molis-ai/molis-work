/**
 * What a plan is and how an answer is read as one: the Host reads a planner's answer with it (plans.ts), the routes check a plan a person
 * edited, and the page (src/browser/plans.ts) tells a plan from any other answer with the same functions. Pure, so the page's bundle takes it.
 */
export interface CodingPlanContent {
  title: string;
  /**
   * `after` names the earlier steps (1-based) a step waits for. Left out, a step waits for the one before it;
   * an empty list means it can start right away. Only earlier steps can be named, so the graph has no cycles.
   */
  steps: Array<{ title: string; acceptance: string; after?: number[] }>;
  blockers: string;
  change_reason: string;
}
export function parseCodingPlan(value: unknown): CodingPlanContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new Error("计划格式无效"), { codingKey: "coding.server.plan-shape" });
  const entry = value as Record<string, unknown>;
  const text = (value: unknown, label: string, max: number, optional = false): string => {
    if (typeof value !== "string" || value.length > max || !optional && !value.trim()) throw Object.assign(new Error(`${label}无效或过长`), { codingKey: "coding.server.field-invalid", codingValues: { label: { key: label }, maximum: max } });
    return value.trim();
  };
  if (!Array.isArray(entry.steps) || !entry.steps.length || entry.steps.length > 20) throw Object.assign(new Error("计划需包含 1–20 个有序步骤"), { codingKey: "coding.server.plan-steps-count" });
  const content = { title: text(entry.title, "coding.field.plan-title", 200), steps: entry.steps.map((step: unknown, index: number) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw Object.assign(new Error("计划步骤无效"), { codingKey: "coding.server.plan-step-shape" });
    const one = step as Record<string, unknown>;
    const parsed: { title: string; acceptance: string; after?: number[] } = { title: text(one.title, "coding.field.plan-step", 1000), acceptance: text(one.acceptance, "coding.field.plan-acceptance", 1000) };
    if (one.after !== undefined && one.after !== null) {
      if (!Array.isArray(one.after) || one.after.some(n => !Number.isSafeInteger(n) || n < 1 || n > index) || new Set(one.after).size !== one.after.length)
        throw Object.assign(new Error(`第 ${index + 1} 步的前置步骤只能是它之前的步骤编号，且不能重复`), { codingKey: "coding.server.plan-after", codingValues: { step: index + 1 } });
      parsed.after = [...one.after as number[]].sort((a, b) => a - b);
    }
    return parsed;
  }), blockers: text(entry.blockers ?? "", "coding.field.plan-blockers", 2000, true).replace(/^(无|没有|暂无|none|n\/a)[。.]?$/i, ""), change_reason: text(entry.change_reason ?? "", "coding.field.plan-change-reason", 2000, true) };
  if (JSON.stringify(content).length > 12_000) throw Object.assign(new Error("计划正文超过 12,000 字符，请保留具体步骤与完成条件"), { codingKey: "coding.server.plan-long" });
  return content;
}
/**
 * The steps a confirmed plan runs as: `step-N` ids, and each step's waits as step ids. A step that declares no
 * `after` carries no `depends_on`, so plans written before steps could declare them freeze exactly as they did.
 */
export function executionSteps(content: CodingPlanContent): Array<{ id: string; title: string; acceptance: string; depends_on?: string[] }> {
  return content.steps.map(({ after, ...step }, index) => ({ id: `step-${index + 1}`, ...step, ...(after ? { depends_on: after.map(n => `step-${n}`) } : {}) }));
}
export function parseCodingPlanAnswer(answer: string): CodingPlanContent {
  // Providers may prepend commentary. A single explicit JSON block is still
  // unambiguous; two competing blocks must never silently choose one.
  const blocks = [...answer.matchAll(/^```(?:json)?[^\S\n]*\n([\s\S]*?)\n```[^\S\n]*$/gim)];
  if (blocks.length > 1) throw new Error("回答包含多个计划版本，请明确保留一个提案");
  // A single complete JSON object on its own final lines may follow prose.
  // No braces are permitted in the prefix, and JSON.parse still rejects a
  // second object or trailing commentary rather than selecting one silently.
  const trimmed = answer.trim();
  const raw = blocks.length === 1 ? blocks[0]![1]! : trimmed.match(/^[^{}]*\n(\{[\s\S]*\})$/)?.[1] ?? trimmed;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("模型没有返回有效计划，原回答仍保留。请补充要求让它重新规划。"); }
  return parseCodingPlan(parsed);
}
