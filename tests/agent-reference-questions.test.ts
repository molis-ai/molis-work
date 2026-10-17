import assert from "node:assert/strict";
import test from "node:test";
import { agentQuestionHtml, questionErrors } from "@molis-ai/molis-work-app-local-host";
import type { AgentPendingQuestion, AgentQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";
import { questionAnswer } from "@molis-ai/molis-work-plugin-sdk";

// specs/ai-interaction-experience T2 (AC-28): a reference question names kinds; the person finds objects by name and picks.

const say = (text: string, values?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values && key in values ? String(values[key]) : whole);
const reference = (overrides: Partial<AgentQuestion>): AgentQuestion => ({ index: 0, prompt: "关联的 Goal", type: "reference", required: true, options: [], multiple: false,
  allow_other: false, ref_kinds: ["goal"], ...overrides });
const card = (questions: AgentQuestion[]): AgentPendingQuestion => ({ pending_id: "p1", kind: "questionnaire", prompt: "约复盘会", options: [], allows_free_text: false, questions });

test("AC-28-2: a reference question is drawn as a search of its own kinds, listing no candidates", () => {
  const html = agentQuestionHtml(card([reference({}), reference({ index: 1, prompt: "参考资料", ref_kinds: ["cognia_material", "shelf_item"], multiple: true, max_count: 3 })]), say);
  assert.match(html, /data-ix-field="r0"[\s\S]*?data-ix-references data-ix-ref-source="goal" data-ix-ref-max="1"/, "one object by default");
  assert.match(html, /data-ix-field="r1"[\s\S]*?data-ix-ref-source="cognia_material,shelf_item" data-ix-multiple data-ix-ref-max="3"/, "the search asks for exactly the question's kinds");
  assert.match(html, /placeholder="输入名称搜索"/);
  assert.match(html, /data-ix-ref-labels="[^"]*&quot;found&quot;:&quot;\{n\} 个结果&quot;/, "the count's placeholder is left for the client to fill");
  assert.doesNotMatch(html, /data-ix-ref-option/, "drawing the card searches nothing: candidates come only while the person types");
});

test("AC-28-3: a drafted pick is drawn again as a chip; the label is the person's draft only", () => {
  const html = agentQuestionHtml(card([reference({ multiple: true })]), say, { r0: [{ value: "goal g1", label: "内部试用 <上线>" }] });
  assert.match(html, /<li class="mw-ix-chip" data-ix-reference="goal g1"><span>内部试用 &lt;上线&gt;<\/span>/);
  assert.match(html, /aria-label="去掉 内部试用 &lt;上线&gt;"/);
});

test("AC-28-3: the card's picks read back as objects; an empty optional pick is nothing picked", () => {
  const read = questionAnswer({ r0: [{ value: "goal g1", label: "内部试用" }, { value: "page a b", label: "x".repeat(300) }], r1: [] });
  assert.ok(read && "answers" in read);
  assert.deepEqual(read.answers[0], { question: 0, value: [{ kind: "goal", id: "g1", label: "内部试用" }, { kind: "page", id: "a b", label: "x".repeat(200) }] },
    "split at the first space (a kind has none), the page's label kept short: the Host replaces it with the owner's");
  assert.deepEqual(read.answers[1], { question: 1, value: [] });
});

test("AC-28-3: a refused pick is worded on its own field, with the cap when there is one", () => {
  const questions = [reference({ multiple: true, max_count: 2 }), reference({ index: 1 })];
  assert.deepEqual(questionErrors([{ question: 0, reason: "too-many" }, { question: 1, reason: "kind-not-allowed" }], say, questions),
    { r0: "最多选 2 个", r1: "选的对象不是这一题要的那一类" });
  assert.deepEqual(questionErrors([{ question: 1, reason: "reference-unavailable" }, { question: 0, reason: "required" }], say, questions),
    { r1: "选的对象已不存在或现在不能用，请重新选择", r0: "这一题需要回答" });
});
