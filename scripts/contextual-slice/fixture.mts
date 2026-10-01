/**
 * Content and stand-ins for the context-driven interaction slice (specs/archive/contextual-interaction §9).
 * Everything here that is not the real Pages declaration is a labelled stand-in: other providers' declarations follow
 * the fragment-offers contract they will register in P1/P2, their executions are simulated, and so is memory.
 */
import type { ActionView, FragmentOfferChoice } from "@molis-ai/molis-work-contracts/platform/actions";
import { FRAGMENT_OFFERS_INPUT_SCHEMA, FRAGMENT_OFFERS_INPUT_TYPE, FRAGMENT_OFFERS_OUTPUT_SCHEMA, FRAGMENT_OFFERS_OUTPUT_TYPE } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_FRAGMENT_CHOICES } from "../../plugins/native/pages/src/fragment-offers.js";

type Json = Record<string, unknown>;
const text = (value: string) => [{ type: "text", text: value }];
const p = (value: string): Json => ({ type: "paragraph", content: text(value) });
const h = (level: number, value: string): Json => ({ type: "heading", attrs: { level }, content: text(value) });
const quote = (value: string): Json => ({ type: "blockquote", content: [p(value)] });
const tasks = (items: readonly [string, boolean][]): Json => ({ type: "task_list", content: items.map(([value, checked]) => ({ type: "task_item", attrs: { checked }, content: [p(value)] })) });
const bullets = (items: readonly string[]): Json => ({ type: "bullet_list", content: items.map(value => ({ type: "list_item", content: [p(value)] })) });

export interface SliceDocument { id: string; title: string; version: number; goal?: { id: string; title: string; state: string }; body: Json }

export const GOAL = { id: "goal-q4-conversion", title: "Q4 付费转化率提升到 6%", state: "进行中" };

export const DOCUMENTS: SliceDocument[] = [
  { id: "doc-q4-plan", title: "Q4 增长计划", version: 7, goal: GOAL, body: { type: "doc", content: [
    h(1, "Q4 增长计划"),
    p("背景：Q3 付费转化率为 4.1%，低于 5% 的目标。流失主要发生在试用的第 3 到第 7 天，这段时间里有 62% 的试用用户再也没有回来。"),
    h(2, "核心判断"),
    p("我们认为转化率低的主要原因，是新用户在试用期内没能完成第一个项目，而不是定价太高。"),
    p("竞品普遍提供 14 天试用，我们的 7 天试用期偏短，这是造成流失的次要原因。"),
    h(2, "行动计划"),
    tasks([
      ["10 月第 2 周：上线新手引导，把“创建第一个项目”压缩到 3 步以内", false],
      ["10 月底：试用期从 7 天延长到 14 天，先在 20% 的流量上做 A/B 测试", false],
      ["11 月：给试用第 5 天仍未创建项目的用户发送个性化提醒邮件", false],
      ["12 月：根据 A/B 结果决定是否全量，并复盘定价页", false],
    ]),
    h(2, "风险"),
    p("延长试用期可能会把付费时间点往后推，影响 Q4 的收入确认；另外新手引导依赖设计资源，10 月设计组还要支援官网改版，排期比较紧张，如果引导不能按时上线，后面的邮件提醒和 A/B 测试都会跟着顺延。"),
    h(2, "本周进展"),
    p("新手引导的交互稿已评审通过，开发预计下周三提测。"),
  ] } },
  { id: "doc-interviews", title: "用户访谈笔记 · 试用流失", version: 3, goal: GOAL, body: { type: "doc", content: [
    h(1, "用户访谈笔记 · 试用流失"),
    p("访谈对象：12 位在试用期内流失的用户，其中 9 位是个人开发者，3 位是小团队负责人。访谈时间为 9 月 18 日至 26 日。"),
    h(2, "主要发现"),
    p("8 位受访者表示“不知道从哪里开始”，大多数人停在导入数据这一步。"),
    p("只有 2 位提到价格，而且都是在对比过竞品之后才提的。"),
    p("小团队负责人更在意能不能邀请同事一起试用，而不是试用天数有多长。"),
    h(2, "原话摘录"),
    quote("我注册完就卡在导入那一步，文档里的例子和我的数据格式对不上。"),
    quote("七天其实够了，问题是我前五天都没弄明白它能帮我做什么。"),
    h(2, "待确认"),
    bullets(["导入失败的具体原因需要结合埋点数据确认", "小团队的协作需求是否足以单独做一个试用方案"]),
  ] } },
  { id: "doc-competitors", title: "竞品分析 · 试用策略", version: 2, body: { type: "doc", content: [
    h(1, "竞品分析 · 试用策略"),
    p("A 公司：14 天全功能试用，不需要绑定信用卡；从第 10 天起在产品内提示升级，转化率据公开访谈约为 7%。"),
    p("B 公司：7 天试用加永久免费版；免费版把协作人数限制在 2 人，主要靠团队扩张推动付费。"),
    p("C 公司：30 天试用，但注册时必须绑定信用卡，到期自动扣费；试用注册量低，但转化率超过 20%。"),
    h(2, "小结"),
    p("试用时长和转化率之间没有明显的对应关系，更关键的是用户在试用期内能否尽快体会到价值。"),
  ] } },
];

/** Recalled preferences and conventions (stand-in for `memory.recall`, shape agreed with the memory line). */
export const MEMORY_STANDIN = [
  { kind: "convention", text: "本项目说“付费转化率”，不简称“转化率”；数据都注明来源和时间段。" },
  { kind: "preference", text: "写计划和周报时把风险放在前面，每条不超过两句话。" },
];

const view = (provider: { provider_id: string; title: string }, capabilityId: string, title: string, operation: "query" | "command", extra: Partial<ActionView["action"]> = {}): ActionView => ({
  capability_id: capabilityId, version: 1, provider_id: provider.provider_id, operation, provider: provider as ActionView["provider"],
  availability: { available: true },
  action: { title, description: title, kind: operation === "query" ? "query" : "operation", scope: "project", audiences: ["user", "agent"], permissions: [],
    subject_kinds: ["pages_document"], input_schema: { type: "object" }, ...extra } as ActionView["action"],
});
const offers = (provider: { provider_id: string; title: string }, capabilityId: string, choices: readonly FragmentOfferChoice[]): ActionView =>
  view(provider, capabilityId, `${provider.title}：片段可以做的事`, "query", { fragment_offer_choices: choices, input_type: FRAGMENT_OFFERS_INPUT_TYPE, output_type: FRAGMENT_OFFERS_OUTPUT_TYPE,
    input_schema: FRAGMENT_OFFERS_INPUT_SCHEMA, output_schema: FRAGMENT_OFFERS_OUTPUT_SCHEMA });

export const PROVIDERS = {
  pages: { provider_id: "io.molis.work.pages", title: "Pages" },
  goals: { provider_id: "io.molis.work.goals", title: "Goals" },
  search: { provider_id: "system.search", title: "系统搜索" },
  assistant: { provider_id: "system.assistant", title: "助理" },
  lingguang: { provider_id: "io.molis.work.lingguang", title: "灵光" },
  ledger: { provider_id: "system.context-ledger", title: "关联" },
} as const;

/** Stand-in declarations: the contract is real, the providers register them in P1/P2 (spec §10). */
export const STANDIN_CHOICES: Record<Exclude<keyof typeof PROVIDERS, "pages">, readonly FragmentOfferChoice[]> = {
  goals: [
    { offer_id: "breakdown", title: "拆成目标步骤", intent: "organize", apply: "record", hint: "把一段计划拆成 Goal 下面可以跟踪的子目标和步骤", action: { capability_id: "goals.tree.submit", version: 1 }, granularities: ["range", "block", "blocks"] },
    { offer_id: "relate", title: "关联到目标", intent: "relate", apply: "record", hint: "把这段内容作为依据或计划关联到一个 Goal", action: { capability_id: "goals.relations.add", version: 1 }, granularities: ["range", "block", "blocks", "objects"] },
    { offer_id: "dependencies", title: "找出依赖", intent: "relate", apply: "result", hint: "找出计划里各步骤之间的先后依赖和卡点", action: { capability_id: "goals.planning.graph.check", version: 1 }, granularities: ["range", "block", "blocks"], roles: ["task", "list", "paragraph"] },
    { offer_id: "progress", title: "记录进展", intent: "advance", apply: "record", hint: "把刚完成的这一步记为 Goal 的进展，并附上依据", action: { capability_id: "goals.progress.record", version: 1 }, granularities: ["block"], roles: ["task"] },
    { offer_id: "next", title: "规划下一步", intent: "advance", apply: "result", hint: "完成一步之后，判断接下来该推进什么、有什么受影响", action: { capability_id: "goals.planning.impact", version: 1 }, granularities: ["block"], roles: ["task"] },
  ],
  search: [
    { offer_id: "evidence", title: "找依据", intent: "question", apply: "result", hint: "在项目资料里找支持或反驳这个说法的证据", action: { capability_id: "search.query", version: 1 }, granularities: ["range", "block", "word"] },
  ],
  assistant: [
    { offer_id: "discuss", title: "和助理展开讨论", intent: "expand", apply: "result", hint: "带上这段内容开一项助理工作，一起推敲和展开", action: { capability_id: "assistant.works.start", version: 1 }, granularities: ["range", "block", "blocks", "objects"] },
  ],
  lingguang: [
    { offer_id: "capture", title: "记下灵光", intent: "capture", apply: "record", hint: "把这个想法记到灵光，稍后再处理", action: { capability_id: "lingguang.sparks.create", version: 1 }, granularities: ["word", "range", "block"] },
  ],
  ledger: [
    { offer_id: "link", title: "建立联系", intent: "relate", apply: "record", hint: "在这几段或几份材料之间建立引用关系，以后能互相找到", action: { capability_id: "context.relations.add", version: 1 }, granularities: ["blocks", "objects"] },
  ],
};

const TARGET_TITLES: Record<string, string> = {
  "pages.ai": "文档写作助手", "pages.generate": "材料生成文稿", "goals.tree.submit": "提交目标拆解", "goals.relations.add": "关联 Goal",
  "goals.planning.graph.check": "检查计划依赖", "goals.progress.record": "记录进展", "goals.planning.impact": "评估计划影响",
  "search.query": "搜索项目资料", "assistant.works.start": "开始助理工作", "lingguang.sparks.create": "记下灵光", "context.relations.add": "建立关联",
};

const READ_ONLY_TARGETS = new Set(["pages.ai", "search.query", "goals.planning.graph.check", "goals.planning.impact"]);

/** The directory the slice's Host service sees: real Pages declaration plus labelled stand-ins. */
export function sliceDirectory(disabled: ReadonlySet<string> = new Set()): ActionView[] {
  const out: ActionView[] = [offers(PROVIDERS.pages, "pages.fragment.offers", PAGES_FRAGMENT_CHOICES)];
  for (const [name, choices] of Object.entries(STANDIN_CHOICES) as [keyof typeof STANDIN_CHOICES, readonly FragmentOfferChoice[]][]) {
    out.push(offers(PROVIDERS[name], `${name}.fragment.offers`, choices));
  }
  const all = [...PAGES_FRAGMENT_CHOICES.map(choice => [PROVIDERS.pages, choice] as const),
    ...(Object.entries(STANDIN_CHOICES) as [keyof typeof STANDIN_CHOICES, readonly FragmentOfferChoice[]][]).flatMap(([name, choices]) => choices.map(choice => [PROVIDERS[name], choice] as const))];
  const seen = new Set<string>();
  for (const [provider, choice] of all) {
    const key = provider.provider_id + " " + choice.action.capability_id;
    if (seen.has(key)) continue;
    seen.add(key);
    // Declared effects as the real actions have them: reading and generating change nothing; the rest write.
    const target = view(provider, choice.action.capability_id, TARGET_TITLES[choice.action.capability_id] ?? choice.action.capability_id, "command",
      READ_ONLY_TARGETS.has(choice.action.capability_id) ? { effect: "read" } : {});
    out.push(disabled.has(provider.provider_id) ? { ...target, availability: { available: false, code: "actions.disabled", reason: `${provider.title} 已停用` } } : target);
  }
  return out;
}
