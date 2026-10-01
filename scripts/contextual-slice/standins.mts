/**
 * Simulated results for the slice (specs/archive/contextual-interaction §9). Every result says so in its `standin` label;
 * the preview uses a real model for `pages.ai` when one is configured, and these only when none is.
 */
import { DOCUMENTS, GOAL } from "./fixture.mjs";

export interface StandinText { readonly text: string; readonly standin: string }

const CANNED: readonly { match: string; command: string; style?: string; text: string }[] = [
  { match: "我们认为转化率低的主要原因", command: "counter", text: "1. 访谈里有 2 位用户明确提到价格，而且是在对比竞品之后——价格敏感可能集中在会比较方案的那部分人身上，他们恰好是潜在的付费用户。\n2. “没完成第一个项目”可能是结果而不是原因：如果用户一开始就觉得不值这个价，也不会投入时间去完成。\n3. 目前只有访谈证据（12 人），还没有看过按价格页访问分组的转化数据，结论的外推性有限。" },
  { match: "竞品普遍提供 14 天试用", command: "counter", text: "1. 竞品分析里 B 公司同样是 7 天试用，靠免费版和团队扩张转化，说明时长不是唯一路径。\n2. C 公司 30 天试用的转化率高，主要来自绑卡筛选，而不是时长本身。\n3. 访谈原话“七天其实够了”直接反驳了“7 天太短”的判断。" },
  { match: "延长试用期可能会把付费时间点往后推", command: "rewrite", style: "concise", text: "风险：延长试用期会推迟付费时间点，影响 Q4 收入确认。新手引导依赖的设计资源 10 月还要支援官网改版，若引导延期，邮件提醒和 A/B 测试都会顺延。" },
  { match: "延长试用期可能会把付费时间点往后推", command: "reader", text: "· “影响 Q4 的收入确认”没有量化：推迟多少、影响多大，读者无法判断这个风险是否值得。\n· 设计资源冲突缺少应对：是否可以先上线简化版引导？\n· 这一段把两个独立风险写在了一起，建议拆开。" },
  { match: "8 位受访者表示", command: "explain", text: "这条发现说明，多数流失发生在“开始使用”之前：用户没有走到体会产品价值的那一步。它支持“新手引导”这一行动，而与“定价过高”的解释关系不大。" },
  { match: "转化率", command: "explain", text: "付费转化率：在一段时间内开始试用的用户里，最终付费的比例。本项目按试用开始的自然月统计，Q3 为 4.1%。" },
  { match: "我们认为转化率低的主要原因", command: "compare", text: "相同点：两段都在解释试用期流失的原因。\n不同点：第一段把主因归于“没完成第一个项目”（产品上手问题）；第二段把次因归于“试用期偏短”（策略问题）。\n冲突：如果主因是上手问题，那么延长试用期只会拉长同样的困惑期；访谈原话“七天其实够了”也更支持第一段。" },
  { match: "A 公司：14 天全功能试用", command: "compare", text: "相同点：三家都用试用拉新，并在试用后期引导升级。\n不同点：A 靠无门槛长试用；B 靠免费版和协作限制；C 靠绑卡筛选高意向用户。\n启示：转化率高低更取决于“谁进入试用”和“试用期内是否体会到价值”，而不是天数。" },
  { match: "新手引导", command: "actions", text: "- 和设计组确认 10 月引导交互稿的排期\n- 定义“创建第一个项目”的 3 个步骤与埋点\n- 准备 A/B 测试的分流与指标看板\n- 起草第 5 天未建项目的提醒邮件" },
];

export function standinPagesAi(command: string, style: string | undefined, text: string): StandinText {
  const found = CANNED.find(item => item.command === command && (item.style ?? undefined) === (style ?? undefined) && text.includes(item.match));
  if (found) return { text: found.text, standin: "切片替身 · 预先写好的样例结果，非模型生成" };
  const head = text.replace(/\s+/g, " ").trim().slice(0, 40);
  const generic: Record<string, string> = {
    explain: `（替身）这里会解释「${head}」的含义和背景。`,
    counter: `（替身）这里会针对「${head}」给出 2–3 条反例或风险。`,
    reader: `（替身）这里会从读者角度指出「${head}」里不清楚的地方。`,
    expand: `（替身）这里会把「${head}」展开成一段完整论述。`,
    continue: "（替身）这里会顺着上文往下写一段。",
    actions: "- （替身）行动项一\n- （替身）行动项二",
    bullets: "- （替身）要点一\n- （替身）要点二",
    rewrite: `（替身）改写后的「${head}」`,
    translate: `(stand-in) Translation of “${head}”`,
    compare: "（替身）相同点……不同点……冲突……",
    merge: "（替身）合并后的一段文字。",
  };
  return { text: generic[command] ?? `（替身）${command}`, standin: "切片替身 · 未接模型时的占位结果" };
}

function bigrams(value: string): Set<string> {
  const clean = value.replace(/[^㐀-鿿A-Za-z0-9]/g, "");
  const out = new Set<string>();
  for (let index = 0; index < clean.length - 1; index += 1) out.add(clean.slice(index, index + 2));
  return out;
}

/** Evidence stand-in: bigram overlap over the slice's own documents, excluding the passage itself. */
export function standinEvidence(text: string, excludeDocId?: string): { hits: { doc_id: string; title: string; excerpt: string; score: number }[]; standin: string } {
  const query = bigrams(text);
  const hits: { doc_id: string; title: string; excerpt: string; score: number }[] = [];
  for (const doc of DOCUMENTS) {
    const walk = (node: Record<string, unknown>) => {
      if (node.type === "paragraph" || node.type === "heading") {
        const value = ((node.content as { text?: string }[] | undefined) ?? []).map(item => item.text ?? "").join("");
        if (value && !text.includes(value) && !(doc.id === excludeDocId && value.length < 20)) {
          const grams = bigrams(value);
          let shared = 0;
          for (const gram of grams) if (query.has(gram)) shared += 1;
          const score = shared / Math.max(8, Math.sqrt(grams.size * query.size));
          if (score > 0.08) hits.push({ doc_id: doc.id, title: doc.title, excerpt: value, score: Math.round(score * 100) / 100 });
        }
      }
      for (const child of (node.content as Record<string, unknown>[] | undefined) ?? []) if (typeof child === "object" && child.type !== "text") walk(child);
    };
    walk(doc.body);
  }
  return { hits: hits.sort((a, b) => b.score - a.score).slice(0, 4), standin: "切片内检索（替身）：在本切片的三篇文档里按字面重合查找，不是系统搜索" };
}

export function standinDependencies(texts: readonly string[]): { items: { step: string; depends_on: string; why: string }[]; standin: string } {
  const lines = texts.flatMap(item => item.split(/\n+/)).map(item => item.trim()).filter(Boolean);
  const has = (word: string) => lines.find(line => line.includes(word));
  const items: { step: string; depends_on: string; why: string }[] = [];
  const guide = has("新手引导"), ab = has("A/B"), mail = has("提醒邮件"), review = has("复盘");
  if (ab && guide) items.push({ step: ab, depends_on: guide, why: "A/B 测试要比较的是“新引导 + 14 天”与现状，引导不上线，测试结果就混入了两个变量" });
  if (mail && guide) items.push({ step: mail, depends_on: guide, why: "提醒邮件要把用户带回“创建第一个项目”的新流程" });
  if (review && ab) items.push({ step: review, depends_on: ab, why: "是否全量要等 A/B 至少跑满两个试用周期" });
  if (!items.length && lines.length > 1) lines.slice(1).forEach((line, index) => items.push({ step: line, depends_on: lines[index]!, why: "按书写顺序推断（替身）" }));
  return { items, standin: "切片替身 · 依赖按关键词规则推断，非 Goals 规划服务" };
}

export function standinBreakdown(texts: readonly string[]): { goal: typeof GOAL; steps: { title: string; due?: string }[] } {
  const lines = texts.flatMap(item => item.split(/\n+/)).map(item => item.trim()).filter(Boolean);
  const steps = lines.map(line => {
    const [when, what] = line.split(/[：:]/, 2);
    return what ? { title: what.trim(), due: when!.trim() } : { title: line };
  });
  return { goal: GOAL, steps };
}

export function standinNext(text: string): { items: string[]; standin: string } {
  if (text.includes("新手引导")) return { items: ["“试用期延长到 14 天”的 A/B 测试现在可以开始排期（它依赖新引导上线）", "给 11 月提醒邮件准备素材：链接到新的 3 步流程", "在 Goal「Q4 付费转化率提升到 6%」记录：引导已上线，开始观察第 3–7 天留存"], standin: "切片替身 · 预先写好的样例结果" };
  return { items: ["检查这一步解锁了哪些后续步骤", "更新相关 Goal 的进展"], standin: "切片替身 · 通用占位" };
}
