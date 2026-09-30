import type { FragmentActionOffer, FragmentOfferChoice, FragmentOffersInput } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * What Pages can do with part of a document (specs/contextual-interaction §5.1). Each choice runs the existing
 * writing assistant (`pages.ai`), which only proposes text; nothing is written until the person accepts the preview.
 */
const ai = { capability_id: "pages.ai", version: 1 } as const;
const text = ["word", "range", "block"] as const;
const passages = ["range", "block", "blocks"] as const;

export const PAGES_FRAGMENT_CHOICES: readonly FragmentOfferChoice[] = [
  { offer_id: "explain", title: "解释", intent: "understand", apply: "result", hint: "说明这个词或这段话的意思、背景和隐含前提", action: ai, granularities: [...text] },
  { offer_id: "counter", title: "提出反例", intent: "question", apply: "result", hint: "针对一个观点或判断给出反例、反驳或风险", action: ai, granularities: [...passages] },
  { offer_id: "reader", title: "读者视角", intent: "question", apply: "result", hint: "从读者角度指出不清楚、没说服力或缺依据的地方", action: ai, granularities: [...passages] },
  { offer_id: "expand", title: "展开论述", intent: "expand", apply: "insert_after", hint: "把简短的观点或要点展开成完整的论述", action: ai, granularities: ["range", "block"] },
  { offer_id: "continue", title: "接着写", intent: "expand", apply: "insert_after", hint: "顺着正在写的内容往下写一段", action: ai, granularities: ["block"] },
  { offer_id: "actions", title: "拆成行动项", intent: "organize", apply: "insert_after", hint: "把计划、安排或决定拆成可以执行的待办步骤", action: ai, granularities: [...passages] },
  { offer_id: "bullets", title: "提炼要点", intent: "organize", apply: "insert_after", hint: "把较长的内容压缩成几条要点", action: ai, granularities: ["range", "block", "blocks"] },
  { offer_id: "concise", title: "改得更简洁", intent: "rewrite", apply: "replace", hint: "删去冗余，意思不变", action: ai, granularities: [...passages] },
  { offer_id: "formal", title: "改得更正式", intent: "rewrite", apply: "replace", hint: "改成适合正式文档或对外沟通的措辞", action: ai, granularities: [...passages] },
  { offer_id: "translate", title: "翻译", intent: "rewrite", apply: "replace", hint: "在中英文之间翻译", action: ai, granularities: [...text, "blocks"] },
  { offer_id: "compare", title: "比较异同", intent: "combine", apply: "result", hint: "并排比较两段、几段内容或几份材料的相同点、不同点和冲突", action: ai, granularities: ["blocks", "objects"] },
  { offer_id: "merge", title: "合并成一段", intent: "combine", apply: "replace", hint: "把几段内容合并成一段连贯的文字", action: ai, granularities: ["blocks"] },
  { offer_id: "synthesize", title: "合成新文档", intent: "combine", apply: "record", hint: "把几份材料提炼整合成一篇新文档，原材料不变", action: { capability_id: "pages.generate", version: 1 }, granularities: ["objects"] },
];

const COMMAND: Readonly<Record<string, { command: string; style?: string }>> = {
  explain: { command: "explain" }, counter: { command: "counter" }, reader: { command: "reader" }, expand: { command: "expand" },
  continue: { command: "continue" }, actions: { command: "actions" }, bullets: { command: "bullets" },
  concise: { command: "rewrite", style: "concise" }, formal: { command: "rewrite", style: "formal" }, translate: { command: "translate" },
  compare: { command: "compare" }, merge: { command: "merge" },
};


/** Prepare every applicable choice's complete `pages.ai` input. Pure: reads nothing, writes nothing. */
export function preparePagesFragmentOffers(input: FragmentOffersInput, kind: string, providerId?: string): FragmentActionOffer[] {
  const { fragment } = input;
  if (fragment.object.kind !== kind) return [];
  const roles = fragment.targets.map(target => target.role);
  const joined = fragment.targets.length > 1
    ? fragment.targets.map((target, index) => `【第 ${index + 1} 段】\n${target.text}`).join("\n\n")
    : fragment.targets[0]?.text ?? "";
  if (!joined.trim()) return [];
  const version = typeof fragment.object.version === "number" ? fragment.object.version : Number(fragment.object.version);
  return PAGES_FRAGMENT_CHOICES.filter(choice => (!choice.granularities || choice.granularities.includes(fragment.granularity))
    && (!choice.roles || roles.some(role => role && choice.roles!.includes(role))))
    .map(choice => ({
      offer_id: choice.offer_id, title: choice.title,
      action: { ...choice.action, ...(providerId ? { provider_id: providerId } : {}) },
      input: choice.offer_id === "synthesize" ? synthesizeInput(input)
        : { id: fragment.object.id, ...COMMAND[choice.offer_id], text: joined.slice(0, 180_000), ...(Number.isInteger(version) && fragment.granularity !== "objects" ? { expected_version: version } : {}) },
    }));
}

/** `pages.generate` input for several selected documents: their current text as snapshots, one stable request per selection. */
function synthesizeInput(input: FragmentOffersInput): unknown {
  const inputs = input.fragment.targets.filter(target => target.ref).map(target => ({
    entry_id: `pages:${target.ref!.id}`, item_id: target.ref!.id, revision: Number(target.ref!.version) || 0, title: target.ref!.title ?? "",
    body: target.text, url: null, source_label: "Pages", captured_at: new Date(0).toISOString(),
  }));
  const titles = inputs.map(item => item.title).filter(Boolean);
  return { request_id: input.request_id, request_hash: input.request_id, inputs,
    title: titles.length ? `综合：${titles.slice(0, 3).join(" · ")}` : "综合文稿",
    instructions: "提炼这些材料的共同结论、分歧和可执行建议，写成一篇结构清楚的新文档；引用时注明出自哪份材料。" };
}
