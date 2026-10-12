import assert from "node:assert/strict";
import test from "node:test";
import { renderInteractionQuestion, type InteractionField } from "@molis-ai/molis-work-design-system";

/**
 * The consumer's conversion, written here as the specimen of how a real adapter reads the SDK's question shape
 * (Prologue docs/slices/ask-user-fields.md: PendingQuestion, QuestionnaireProblem). The design system never imports
 * the SDK or Molis contracts; this is the transformation a consumer owns, and it must stay a pure, local function.
 */
interface SdkOption { index: number; label: string; description?: string; recommended?: boolean }
interface SdkQuestion {
  index: number; prompt: string; options: SdkOption[]; multiple?: boolean; allowOther?: boolean; id?: string;
  type?: "choice" | "text" | "number" | "date" | "datetime" | "reference"; required?: boolean; help?: string;
  default?: string | number | number[]; multiline?: boolean; maxLength?: number; min?: number | string; max?: number | string; integer?: boolean;
  refKinds?: string[]; maxCount?: number;
}
interface SdkProblem { question: number; id?: string; reason: string; message: string }
const reasonText: Record<string, string> = {
  required: "这一项必填。", "too-long": "太长了。", "not-a-number": "请输入数字。", "not-an-integer": "请输入整数。", "too-small": "小于允许的最小值。",
  "too-large": "大于允许的最大值。", "bad-date": "请输入真实日期。", "too-early": "早于允许的日期。", "too-late": "晚于允许的日期。",
  "kind-not-allowed": "这类对象不能选。", "too-many": "选多了。", duplicate: "选重复了。", "unknown-option": "这个选项已不存在。",
};
function toField(q: SdkQuestion, problems: SdkProblem[], drafts: Record<number, unknown>, candidates: Array<{ kind: string; id: string; label: string }>): InteractionField {
  const own = problems.find(problem => problem.question === q.index);
  const id = q.id ?? `q${q.index}`;
  const base = { id, label: q.prompt, optional: q.required === false, hint: q.help, error: own ? reasonText[own.reason] ?? own.message : undefined };
  const draft = drafts[q.index];
  switch (q.type ?? "choice") {
    case "choice": return { ...base, control: { kind: "choice", multiple: q.multiple,
      options: q.options.map(option => ({ value: String(option.index), label: option.label, description: option.description, recommended: option.recommended,
        selected: Array.isArray(draft) ? draft.includes(option.index) : Array.isArray(q.default) && draft === undefined && q.default.includes(option.index) })),
      other: q.allowOther ? { label: "其他", value: "" } : undefined } };
    case "text": return { ...base, control: { kind: "text", value: String(draft ?? q.default ?? ""), multiline: q.multiline, maxLength: q.maxLength } };
    case "number": return { ...base, control: { kind: "number", value: String(draft ?? q.default ?? ""), min: q.min as number | undefined, max: q.max as number | undefined, integer: q.integer } };
    case "date": return { ...base, control: { kind: "date", value: String(draft ?? q.default ?? "") } };
    case "datetime": return { ...base, control: { kind: "datetime", date: "", time: "", zone: "" } };
    case "reference": return { ...base, control: { kind: "reference", candidates: candidates.filter(c => q.refKinds?.includes(c.kind)).map(c => ({ id: c.id, label: c.label, meta: c.kind })) } };
  }
}
const questions: SdkQuestion[] = [
  { index: 0, id: "format", prompt: "沟通方式", options: [{ index: 0, label: "一起复盘", description: "先对齐", recommended: true }, { index: 1, label: "异步审阅" }], default: [0], allowOther: true },
  { index: 1, id: "notes", prompt: "补充要求", options: [], type: "text", multiline: true, maxLength: 200, required: false, help: "说清想解决什么。" },
  { index: 2, id: "minutes", prompt: "时长", options: [], type: "number", min: 15, max: 120, integer: true },
  { index: 3, id: "deadline", prompt: "截止", options: [], type: "date" },
  { index: 4, id: "goal", prompt: "关联 Goal", options: [], type: "reference", refKinds: ["goal"], maxCount: 1 },
];
const catalog = [{ kind: "goal", id: "g1", label: "内部试用" }, { kind: "document", id: "d1", label: "不该出现的文档" }];

test("AC-17 / AC-04: a typed SDK question set converts to field views with help, required marks, recommendations and an other slot", () => {
  const fields = questions.map(q => toField(q, [], {}, catalog));
  const html = renderInteractionQuestion({ id: "sdk", kicker: "需要你补充", title: "安排", fields, footer: { note: "", actions: [] } });
  assert.match(html, /data-ix-option="0" aria-pressed="true"/, "a default only pre-selects; the answer is whatever the person submits");
  assert.match(html, /<span class="mw-ix-tag">推荐<\/span>/);
  assert.match(html, /data-ix-other="format"/, "allowOther becomes a free answer slot");
  assert.match(html, /<span class="mw-ix-optional">选填<\/span>/);
  assert.match(html, /说清想解决什么。/);
  assert.match(html, /data-ix-min="15" data-ix-max="120"/);
  assert.doesNotMatch(html, /不该出现的文档/, "candidates outside the question's refKinds never reach the card");
  assert.match(html, /data-ix-reference="g1"/);
});
test("AC-04 / AC-17: every closed-set problem reason lands on its own field and leaves the others untouched", () => {
  const problems: SdkProblem[] = [{ question: 2, id: "minutes", reason: "too-large", message: "x" }, { question: 3, id: "deadline", reason: "bad-date", message: "y" }, { question: 4, reason: "required", message: "z" }];
  const fields = questions.map(q => toField(q, problems, { 2: "999" }, catalog));
  const html = renderInteractionQuestion({ id: "sdk", kicker: "需要你补充", title: "安排", fields, footer: { note: "还有 3 项要修正", error: true, actions: [] } });
  assert.match(html, /id="sdk-minutes-error" data-ix-error>大于允许的最大值。/);
  assert.match(html, /id="sdk-deadline-error" data-ix-error>请输入真实日期。/);
  assert.match(html, /id="sdk-goal-error" data-ix-error>这一项必填。/);
  assert.match(html, /id="sdk-format-error" data-ix-error hidden><\/p>/, "a field without a problem stays quiet");
  assert.match(html, /value="999"/, "the wrong draft stays as typed beside its error");
});
test("AC-17 / AC-05: provenance slots show an earlier input, the object version that moved, and the facts behind the card", () => {
  const html = renderInteractionQuestion({ id: "p", kicker: "需要你补充", title: "安排", fields: [], footer: { note: "", actions: [] },
    about: "针对你说的「改到周五」", target: { prefix: "针对", label: "秋季工作台", version: "版本 2", changed: true },
    evidence: { label: "依据", rows: [["request_id", "req-1"], ["about", "input-7"]] } });
  assert.match(html, /data-ix-about>针对你说的「改到周五」</);
  assert.match(html, /data-ix-version data-changed>版本 2</);
  assert.match(html, /<details class="mw-ix-evidence" data-ix-evidence><summary>依据<\/summary><dl><dt>request_id<\/dt><dd>req-1<\/dd>/);
  assert.doesNotMatch(renderInteractionQuestion({ id: "q", kicker: "k", title: "t", fields: [], footer: { note: "", actions: [] }, evidence: { label: "依据", rows: [] } }), /data-ix-evidence/, "no rows, no block");
});
