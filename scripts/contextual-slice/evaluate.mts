/**
 * Offline evaluation of the judgment (specs/archive/contextual-interaction §5.4).
 *
 *   pnpm exec tsx scripts/contextual-slice/evaluate.mts [--label name] [--limit N] [--out file.json]
 *
 * Builds each labelled case's focus with the real Pages focus reader, derives candidates from the slice directory,
 * asks real Jev (through Prologue, key read in-process from the person's Home) and the rules baseline, and reports:
 * top-1 / top-3 hits against acceptable actions, latency, emphasis / Assistant rates, and whether passages of the
 * same shape but different meaning get different rows. Labels are the designer's judgment of reasonable actions.
 */
import { writeFileSync } from "node:fs";
import { EditorState, TextSelection } from "prosemirror-state";
import type { SurfaceFocus, ContextualCandidate } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates, judgmentQuestions, judgmentState, planContextualLayout, readContextualJudgment } from "@molis-ai/molis-work-kernel";
import { nodeFromUnknown } from "../../plugins/native/pages/src/schema.js";
import { pagesFocusPlugin, readPagesFocus } from "../../plugins/native/pages/src/focus.js";
import { DOCUMENTS, MEMORY_STANDIN, sliceDirectory } from "./fixture.mjs";
import { createJevEvaluator } from "./jev.mjs";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const variant = arg("--label") ?? "default";

type Case = { id: string; doc: string; from: string; to?: string; word?: boolean; activity?: "editing" | "completed" | "comparing"; objects?: string[]; ok: string[]; kind: string };
const CASES: Case[] = [
  { id: "opinion-main", doc: "doc-q4-plan", from: "我们认为转化率低的主要原因", kind: "claim", ok: ["evidence", "counter", "reader", "discuss"] },
  { id: "opinion-trial", doc: "doc-q4-plan", from: "竞品普遍提供 14 天试用", kind: "claim", ok: ["evidence", "counter", "reader", "discuss"] },
  { id: "background-fact", doc: "doc-q4-plan", from: "背景：Q3 付费转化率为 4.1%", kind: "fact", ok: ["relate", "explain", "evidence", "bullets", "link"] },
  { id: "plan-two", doc: "doc-q4-plan", from: "10 月第 2 周", to: "先在 20% 的流量上做 A/B 测试", kind: "plan", ok: ["breakdown", "dependencies", "relate", "actions"] },
  { id: "plan-all", doc: "doc-q4-plan", from: "10 月第 2 周", to: "并复盘定价页", kind: "plan", ok: ["breakdown", "dependencies", "relate", "actions"] },
  { id: "risk", doc: "doc-q4-plan", from: "延长试用期可能会把付费时间点往后推", kind: "risk", ok: ["dependencies", "concise", "counter", "reader", "relate", "bullets"] },
  { id: "risk-editing", doc: "doc-q4-plan", from: "延长试用期可能会把付费时间点往后推", activity: "editing", kind: "editing", ok: ["concise", "reader", "continue", "formal", "bullets"] },
  { id: "progress-note", doc: "doc-q4-plan", from: "新手引导的交互稿已评审通过", kind: "progress", ok: ["relate", "capture", "link"] },
  { id: "word-conversion", doc: "doc-q4-plan", from: "转化率", word: true, kind: "term", ok: ["explain", "evidence", "translate"] },
  { id: "word-ab", doc: "doc-q4-plan", from: "A/B", word: true, kind: "term", ok: ["explain", "evidence", "translate"] },
  { id: "done-guide", doc: "doc-q4-plan", from: "10 月第 2 周", activity: "completed", kind: "done", ok: ["progress", "next"] },
  { id: "done-trial", doc: "doc-q4-plan", from: "10 月底", activity: "completed", kind: "done", ok: ["progress", "next"] },
  { id: "compare-claims", doc: "doc-q4-plan", from: "我们认为转化率低的主要原因", to: "这是造成流失的次要原因", activity: "comparing", kind: "compare", ok: ["compare", "link", "merge"] },
  { id: "finding-start", doc: "doc-interviews", from: "8 位受访者表示", kind: "finding", ok: ["relate", "evidence", "capture", "link"] },
  { id: "finding-price", doc: "doc-interviews", from: "只有 2 位提到价格", kind: "finding", ok: ["relate", "evidence", "link", "capture"] },
  { id: "finding-team", doc: "doc-interviews", from: "小团队负责人更在意", kind: "finding", ok: ["capture", "relate", "discuss", "link"] },
  { id: "quote-import", doc: "doc-interviews", from: "我注册完就卡在导入那一步", kind: "quote", ok: ["relate", "explain", "capture", "link", "evidence"] },
  { id: "quote-seven", doc: "doc-interviews", from: "七天其实够了", kind: "quote", ok: ["relate", "evidence", "link", "counter"] },
  { id: "todo-list", doc: "doc-interviews", from: "导入失败的具体原因", to: "单独做一个试用方案", kind: "plan", ok: ["breakdown", "relate", "actions", "dependencies"] },
  { id: "method", doc: "doc-interviews", from: "访谈对象：12 位", kind: "fact", ok: ["relate", "explain", "bullets", "link"] },
  { id: "competitor-a", doc: "doc-competitors", from: "A 公司：14 天全功能试用", kind: "fact", ok: ["relate", "explain", "capture", "bullets", "evidence", "link"] },
  { id: "competitors-three", doc: "doc-competitors", from: "A 公司：14 天全功能试用", to: "转化率超过 20%", kind: "compare", ok: ["compare", "bullets", "link", "merge"] },
  { id: "conclusion", doc: "doc-competitors", from: "试用时长和转化率之间没有明显的对应关系", kind: "claim", ok: ["evidence", "counter", "relate", "reader"] },
  { id: "competitor-c", doc: "doc-competitors", from: "C 公司：30 天试用", kind: "fact", ok: ["explain", "relate", "evidence", "link"] },
  { id: "objects-plan-interviews", doc: "doc-q4-plan", from: "", objects: ["doc-q4-plan", "doc-interviews"], kind: "objects", ok: ["link", "compare", "synthesize", "relate"] },
  { id: "objects-interviews-competitors", doc: "doc-interviews", from: "", objects: ["doc-interviews", "doc-competitors"], kind: "objects", ok: ["synthesize", "compare", "link"] },
  { id: "objects-all", doc: "doc-q4-plan", from: "", objects: ["doc-q4-plan", "doc-interviews", "doc-competitors"], kind: "objects", ok: ["synthesize", "compare", "link"] },
  { id: "background-editing", doc: "doc-q4-plan", from: "背景：Q3 付费转化率为 4.1%", activity: "editing", kind: "editing", ok: ["concise", "formal", "continue", "reader"] },
  { id: "heading-plan", doc: "doc-q4-plan", from: "行动计划", kind: "heading", ok: ["expand", "bullets", "breakdown", "explain"] },
  { id: "finding-price-vs-claim", doc: "doc-competitors", from: "C 公司：30 天试用", to: "转化率超过 20%", kind: "fact", ok: ["explain", "relate", "evidence", "link"] },
];

const plain = (node: unknown): string => {
  const value = node as { type?: string; text?: string; content?: unknown[] };
  if (value.type === "text") return value.text ?? "";
  return (value.content ?? []).map(plain).join(value.type === "doc" ? "\n" : "");
};

function focusFor(item: Case): SurfaceFocus {
  const doc = DOCUMENTS.find(entry => entry.id === item.doc)!;
  const object = { kind: "pages_document", id: doc.id, version: doc.version, title: doc.title };
  if (item.objects) {
    const docs = item.objects.map(id => DOCUMENTS.find(entry => entry.id === id)!);
    return { context_id: `objects:${item.id}`, plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "objects", object,
      targets: docs.map(entry => ({ kind: "object" as const, role: "object" as const, text: `${entry.title}\n${plain(entry.body).slice(0, 600)}`, ref: { kind: "pages_document", id: entry.id, version: entry.version, title: entry.title } })) };
  }
  let state = EditorState.create({ doc: nodeFromUnknown(doc.body), plugins: [pagesFocusPlugin()] });
  const at = (text: string) => { let found = -1; state.doc.descendants((node, pos) => { if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text); }); if (found < 0) throw new Error(`${item.id}: 找不到「${text}」`); return found; };
  const start = at(item.from);
  const blockEnd = (pos: number) => state.doc.resolve(pos).end();
  const end = item.word ? start + item.from.length : item.to ? at(item.to) + item.to.length : blockEnd(start);
  const blockStart = state.doc.resolve(start).start();
  if (item.activity === "completed") {
    let taskPos = -1;
    state.doc.descendants((node, pos) => { if (taskPos < 0 && node.type.name === "task_item" && node.textContent.includes(item.from)) taskPos = pos; });
    state = state.apply(state.tr.setNodeMarkup(taskPos, undefined, { checked: true }));
  } else if (item.activity === "editing") {
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, blockEnd(start))));
    state = state.apply(state.tr.insertText("，"));
  } else if (item.activity === "comparing") {
    const first = TextSelection.create(state.doc, blockStart, blockEnd(start));
    state = state.apply(state.tr.setSelection(first));
    state = state.apply(state.tr.setMeta(pagesFocusKeyRef(), { compare: { from: first.from, to: first.to } }));
    const second = at(item.to!);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.doc.resolve(second).start(), second + item.to!.length)));
  } else {
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, item.word ? start : item.to ? blockStart : blockStart, end)));
  }
  const focus = readPagesFocus(state)!;
  if (!focus) throw new Error(`${item.id}: 没有读到情境`);
  return { context_id: `${doc.id}:${focus.local_id}`, plugin_id: "io.molis.work.pages", activity: focus.activity, granularity: focus.granularity, object,
    targets: focus.targets, surroundings: focus.surroundings, ...(doc.goal ? { goal: doc.goal } : {}) };
}
// The compare meta key is internal to focus.ts; importing it lazily keeps this script decoupled from the module layout.
import { pagesFocusKey } from "../../plugins/native/pages/src/focus.js";
function pagesFocusKeyRef() { return pagesFocusKey; }

const offerOf = (candidates: readonly ContextualCandidate[], key: string) => candidates.find(item => item.key === key)?.offer_id ?? key;
const pct = (n: number, d: number) => d ? `${Math.round(100 * n / d)}%` : "—";
const quantile = (values: number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0; };

const jev = createJevEvaluator({});
const limit = Number(arg("--limit") ?? CASES.length);
const rows: Record<string, unknown>[] = [];
for (const item of CASES.slice(0, limit)) {
  const focus = focusFor(item);
  const candidates = fragmentCandidates(sliceDirectory(), focus);
  const rules = planContextualLayout({ focus, candidates });
  const state = judgmentState(focus, { memory: MEMORY_STANDIN });
  const questions = judgmentQuestions(candidates, focus);
  let judged = null as ReturnType<typeof planContextualLayout> | null, latency = 0, error = "", raw: unknown = null;
  try {
    const started = Date.now();
    const out = await jev.evaluate({ state: state.text, questions, signal: AbortSignal.timeout(30_000) });
    latency = Date.now() - started;
    raw = out.body;
    const judgment = readContextualJudgment(out.body, candidates, "jev", latency, out.model);
    judged = Object.keys(judgment.next).length ? planContextualLayout({ focus, candidates, judgment }) : null;
    if (!judged) error = "空答案";
  } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
  const top = (plan: typeof rules | null) => plan ? plan.primary.map(key => offerOf(candidates, key)) : [];
  const row = { id: item.id, kind: item.kind, granularity: focus.granularity, activity: focus.activity, candidates: candidates.length, ok: item.ok,
    rules: top(rules), jev: top(judged), emphasis: judged?.emphasis ? offerOf(candidates, judged.emphasis) : null, assistant: judged?.assistant?.form ?? null,
    latency, error, answers: (raw as { answers?: unknown } | null)?.answers ?? null };
  rows.push(row);
  console.log(`${item.id.padEnd(30)} rules=${top(rules).join("/")}  jev=${top(judged).join("/") || "—"}  ${latency}ms${error ? "  ERR " + error : ""}`);
}
await jev.close();

const scored = rows.filter(row => (row.jev as string[]).length);
const hit1 = (list: string[], ok: string[]) => ok.includes(list[0] ?? "");
const hit3 = (list: string[], ok: string[]) => list.slice(0, 3).some(item => ok.includes(item));
const summary = {
  variant, cases: rows.length, answered: scored.length,
  top1: { jev: pct(scored.filter(row => hit1(row.jev as string[], row.ok as string[])).length, scored.length), rules: pct(rows.filter(row => hit1(row.rules as string[], row.ok as string[])).length, rows.length) },
  top3: { jev: pct(scored.filter(row => hit3(row.jev as string[], row.ok as string[])).length, scored.length), rules: pct(rows.filter(row => hit3(row.rules as string[], row.ok as string[])).length, rows.length) },
  latency_ms: { p50: quantile(scored.map(row => row.latency as number), 0.5), p95: quantile(scored.map(row => row.latency as number), 0.95) },
  emphasis_rate: pct(scored.filter(row => row.emphasis).length, scored.length),
  assistant_rate: pct(scored.filter(row => row.assistant).length, scored.length),
};
// Same shape, different meaning: single-paragraph ranges of different kinds.
const ranges = rows.filter(row => row.granularity === "range" && (row.jev as string[]).length);
let pairs = 0, differ = 0, rulesDiffer = 0;
for (let i = 0; i < ranges.length; i += 1) for (let j = i + 1; j < ranges.length; j += 1) {
  if (ranges[i]!.kind === ranges[j]!.kind) continue;
  pairs += 1;
  if (JSON.stringify(ranges[i]!.jev) !== JSON.stringify(ranges[j]!.jev)) differ += 1;
  if (JSON.stringify(ranges[i]!.rules) !== JSON.stringify(ranges[j]!.rules)) rulesDiffer += 1;
}
Object.assign(summary, { same_shape_pairs: pairs, rows_differ: { jev: pct(differ, pairs), rules: pct(rulesDiffer, pairs) } });
console.log(JSON.stringify(summary, null, 2));
if (arg("--out")) writeFileSync(arg("--out")!, JSON.stringify({ summary, rows }, null, 2) + "\n");
