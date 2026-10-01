/**
 * Does a recalled memory change the judgment (specs/archive/contextual-interaction AC-C12, P3)? Offline, with real Jev: the same
 * selection is judged without and with one memory item in the judgment state, over the real fragment-offer
 * declarations of Pages, Goals, 灵光 and search. A control case carries an unrelated memory and should not move.
 *
 *   pnpm exec tsx scripts/contextual-slice/evaluate-memory.mts [--out specs/archive/contextual-interaction/evidence/p3-memory-jev.json]
 *
 * The key is read in-process from the person's own Home (consented 2026-09-30) and never printed or written.
 */
import { writeFileSync } from "node:fs";
import type { ActionDefinition, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { searchActions } from "@molis-ai/molis-work-contracts/services/search";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { fragmentCandidates, judgmentQuestions, judgmentState, planContextualLayout, readContextualJudgment } from "@molis-ai/molis-work-kernel";
import { pagesActions } from "../../plugins/native/pages/src/actions.js";
import { goalsFragmentOffersAction } from "../../plugins/native/goals/src/fragment-offers.js";
import { lingguangActions } from "../../plugins/native/lingguang/src/actions.js";
import { createJevEvaluator } from "./jev.mjs";

const arg = (name: string) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined; };
const view = (provider_id: string, title: string, definition: Pick<ActionDefinition, "capability_id" | "version" | "operation" | "action">): ActionView => ({
  capability_id: definition.capability_id, version: definition.version, provider_id, operation: definition.operation,
  provider: { provider_id, title } as ActionView["provider"], availability: { available: true }, action: definition.action } as ActionView);
const target = (provider_id: string, title: string, capability_id: string, effect: "read" | "write") =>
  view(provider_id, title, { capability_id, version: 1, operation: effect === "read" ? "query" : "command", action: { title: capability_id, description: capability_id,
    kind: effect === "read" ? "query" : "operation", effect, scope: "project", audiences: ["user"], permissions: [], subject_kinds: ["any"], input_schema: { type: "object" } } as ActionView["action"] });

// The real declarations; the targets stand for the real actions with their real effects.
const DIRECTORY: ActionView[] = [
  view("io.molis.work.pages", "Pages", pagesActions.fragmentOffers), target("io.molis.work.pages", "Pages", "pages.ai", "read"),
  view("io.molis.work.goals", "Goals", goalsFragmentOffersAction), target("io.molis.work.goals", "Goals", "goals.tree.submit", "write"), target("io.molis.work.goals", "Goals", "goals.progress.record", "write"),
  view("io.molis.work.lingguang", "灵光", lingguangActions.fragmentOffers), target("io.molis.work.lingguang", "灵光", "lingguang.create", "write"),
  view("system.search", "搜索", searchActions.fragmentOffers), target("system.search", "搜索", "search.query", "read"),
];

type Case = { id: string; focus: SurfaceFocus; memory: { kind: string; text: string }; favours: string; control?: boolean };
const doc = (title: string, goal?: { id: string; title: string }) => ({ object: { kind: "pages_document", id: "doc-" + title, version: 1, title }, ...(goal ? { goal } : {}) });
const range = (id: string, text: string, heading: string, title: string, goal?: { id: string; title: string }): SurfaceFocus => ({
  context_id: id, plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "range", ...doc(title, goal),
  targets: [{ kind: "text_range", role: "paragraph", text }], surroundings: { heading_path: [heading] } });
const GOAL = { id: "G1", title: "提升新用户留存" };
const CASES: Case[] = [
  { id: "plan-breakdown", focus: range("m1", "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈。", "本周计划", "新手引导推进", GOAL),
    memory: { kind: "preference", text: "计划类的文字，我习惯直接拆成 Goal 下的步骤来跟踪，不需要行动项清单" }, favours: "breakdown" },
  { id: "claim-counter", focus: range("m2", "我们认为留存下降的主因是上手困难，而不是价格太高。", "核心判断", "留存分析"),
    memory: { kind: "preference", text: "看到观点类的判断，先帮我找反例和反驳，再谈怎么改写" }, favours: "counter" },
  { id: "term-find", focus: { ...range("m3", "激活", "定义", "留存分析"), granularity: "word" },
    memory: { kind: "convention", text: "项目里的术语先查它在项目资料里怎么用，不要泛泛解释" }, favours: "find" },
  { id: "weekly-capture", focus: range("m4", "本周新增付费用户 120 人，环比下降 8%。", "数据", "第 39 周周报"),
    memory: { kind: "preference", text: "周报里的数据变化先记到灵光，周五统一整理成分析" }, favours: "capture" },
  { id: "control-unrelated", focus: range("m5", "下周三前完成新手引导改版，周五发给二十个老用户试用并收集反馈。", "本周计划", "新手引导推进", GOAL),
    memory: { kind: "preference", text: "界面用深色主题，字号大一点" }, favours: "breakdown", control: true },
];

const jev = createJevEvaluator({});
if (!jev.configured()) throw new Error("这个 Home 没有可用的 TypeSafe 连接");
const judge = async (focus: SurfaceFocus, memory: readonly { kind: string; text: string }[]) => {
  const candidates = fragmentCandidates(DIRECTORY, focus);
  const state = judgmentState(focus, { memory });
  const started = Date.now();
  const out = await jev.evaluate({ state: state.text, questions: judgmentQuestions(candidates, focus), signal: AbortSignal.timeout(30_000) });
  const judgment = readContextualJudgment(out.body, candidates, "jev", Date.now() - started, out.model);
  const plan = planContextualLayout({ focus, candidates, judgment });
  const byKey = new Map(candidates.map(item => [item.key, item.offer_id]));
  const ranked = Object.entries(judgment.next).sort((a, b) => b[1] - a[1]).map(([key, p]) => ({ offer: byKey.get(key)!, p: Math.round(p * 1000) / 1000 }));
  return { primary: plan.primary.map(key => byKey.get(key)!), ranked, latency_ms: judgment.latency_ms };
};

const results = [];
for (const item of CASES) {
  const without = await judge(item.focus, []);
  const withMemory = await judge(item.focus, [item.memory]);
  const rank = (run: typeof without) => run.ranked.findIndex(entry => entry.offer === item.favours) + 1;
  const probability = (run: typeof without) => run.ranked.find(entry => entry.offer === item.favours)?.p ?? 0;
  const row = { id: item.id, control: Boolean(item.control), memory: item.memory.text, favours: item.favours,
    without: { primary: without.primary, rank: rank(without), p: probability(without) }, with: { primary: withMemory.primary, rank: rank(withMemory), p: probability(withMemory) },
    latency_ms: [without.latency_ms, withMemory.latency_ms] };
  results.push(row);
  console.log(`${row.id}${row.control ? "（对照）" : ""}: ${item.favours} 名次 ${row.without.rank} → ${row.with.rank}，概率 ${row.without.p} → ${row.with.p}；主位 ${without.primary.join("/")} → ${withMemory.primary.join("/")}`);
}
await jev.close();
const out = arg("--out");
if (out) writeFileSync(out, JSON.stringify({ recorded_at: new Date().toISOString().slice(0, 10), model: "jev (via Prologue evaluateTypeSafe)", results }, null, 2) + "\n");
