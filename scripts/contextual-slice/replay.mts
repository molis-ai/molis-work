/**
 * Replayed judgments for the slice (specs/archive/contextual-interaction §9). Two kinds, always labelled on screen:
 * - `recorded`: real Jev answers captured with `--record` (file `replay-recorded.json`, written by the preview);
 * - `authored`: hand-written samples used before a real Jev key is available. They show what the layout policy does
 *   with a semantic judgment; they are not evidence that Jev judges this way.
 * Keys are `provider_id:offer_id`; the preview maps them to the candidates' judgment keys.
 */
export interface ReplayAnswer {
  readonly match: readonly string[];
  readonly activity?: string;
  readonly next: Readonly<Record<string, number>>;
  readonly intent: Readonly<Record<string, number>>;
  readonly surface: "none" | "suggest" | "options" | "preview" | "compare";
  readonly speak_up: number;
  readonly confidence: number;
}

const P = "io.molis.work.pages:", G = "io.molis.work.goals:", S = "system.search:", A = "system.assistant:", L = "io.molis.work.lingguang:", R = "system.context-ledger:";

export const AUTHORED_REPLAY: readonly ReplayAnswer[] = [
  // S1 an opinion: ask for evidence and counter-arguments first.
  { match: ["我们认为转化率低的主要原因"], next: { [S + "evidence"]: 0.34, [P + "counter"]: 0.27, [A + "discuss"]: 0.14, [P + "reader"]: 0.09, [G + "relate"]: 0.05, [P + "expand"]: 0.04 },
    intent: { question: 0.62, expand: 0.18, relate: 0.1, understand: 0.05 }, surface: "options", speak_up: 0.74, confidence: 0.68 },
  // S6 same shape, different meaning: an interview finding is evidence to attach, not a claim to attack.
  { match: ["8 位受访者表示"], next: { [G + "relate"]: 0.31, [R + "link"]: 0.02, [S + "evidence"]: 0.18, [P + "explain"]: 0.06, [L + "capture"]: 0.12, [P + "bullets"]: 0.08, [P + "counter"]: 0.04 },
    intent: { relate: 0.48, question: 0.18, capture: 0.14, organize: 0.1 }, surface: "suggest", speak_up: 0.66, confidence: 0.61 },
  { match: ["只有 2 位提到价格"], next: { [G + "relate"]: 0.29, [S + "evidence"]: 0.22, [P + "counter"]: 0.12, [L + "capture"]: 0.1, [A + "discuss"]: 0.08 },
    intent: { relate: 0.44, question: 0.26, capture: 0.12 }, surface: "suggest", speak_up: 0.63, confidence: 0.57 },
  { match: ["竞品普遍提供 14 天试用"], next: { [S + "evidence"]: 0.38, [P + "counter"]: 0.24, [P + "reader"]: 0.11, [A + "discuss"]: 0.09 },
    intent: { question: 0.66, expand: 0.12, understand: 0.1 }, surface: "options", speak_up: 0.7, confidence: 0.64 },
  // S2 a plan: break it into tracked steps, find dependencies.
  { match: ["上线新手引导", "试用期从 7 天延长到 14 天"], next: { [G + "breakdown"]: 0.33, [G + "dependencies"]: 0.27, [G + "relate"]: 0.12, [P + "actions"]: 0.08, [A + "discuss"]: 0.05 },
    intent: { organize: 0.46, relate: 0.36, advance: 0.08 }, surface: "suggest", speak_up: 0.68, confidence: 0.6 },
  // S3 two passages: compare them.
  { match: ["我们认为转化率低的主要原因", "竞品普遍提供 14 天试用"], activity: "comparing", next: { [P + "compare"]: 0.41, [R + "link"]: 0.18, [P + "merge"]: 0.16, [A + "discuss"]: 0.1 },
    intent: { combine: 0.64, relate: 0.2 }, surface: "compare", speak_up: 0.78, confidence: 0.7 },
  { match: ["A 公司：14 天全功能试用", "C 公司：30 天试用"], next: { [P + "compare"]: 0.46, [P + "bullets"]: 0.15, [R + "link"]: 0.12, [P + "merge"]: 0.1 },
    intent: { combine: 0.66, organize: 0.18 }, surface: "compare", speak_up: 0.72, confidence: 0.69 },
  // S4 editing a long, dense risk paragraph: make it tighter, respecting the “two sentences” preference.
  { match: ["延长试用期可能会把付费时间点往后推"], activity: "editing", next: { [P + "concise"]: 0.44, [P + "reader"]: 0.14, [G + "dependencies"]: 0.12, [P + "formal"]: 0.08, [P + "continue"]: 0.06 },
    intent: { rewrite: 0.58, question: 0.16, relate: 0.12 }, surface: "preview", speak_up: 0.71, confidence: 0.66 },
  { match: ["延长试用期可能会把付费时间点往后推"], next: { [G + "dependencies"]: 0.3, [P + "concise"]: 0.22, [P + "counter"]: 0.14, [G + "relate"]: 0.1 },
    intent: { relate: 0.38, rewrite: 0.3, question: 0.16 }, surface: "suggest", speak_up: 0.61, confidence: 0.55 },
  // S5 a step just done: record progress, then see what it unblocks.
  { match: ["上线新手引导"], activity: "completed", next: { [G + "progress"]: 0.46, [G + "next"]: 0.34, [L + "capture"]: 0.04 },
    intent: { advance: 0.82, capture: 0.06 }, surface: "suggest", speak_up: 0.8, confidence: 0.74 },
  { match: ["试用期从 7 天延长到 14 天"], activity: "completed", next: { [G + "next"]: 0.44, [G + "progress"]: 0.4 },
    intent: { advance: 0.84 }, surface: "suggest", speak_up: 0.77, confidence: 0.7 },
  // S7 a single term.
  { match: ["转化率"], activity: "word", next: { [P + "explain"]: 0.52, [S + "evidence"]: 0.16, [P + "translate"]: 0.06 },
    intent: { understand: 0.7, question: 0.12 }, surface: "none", speak_up: 0.2, confidence: 0.62 },
  // Several documents.
  { match: ["Q4 增长计划", "用户访谈笔记"], activity: "objects", next: { [R + "link"]: 0.28, [P + "compare"]: 0.26, [P + "synthesize"]: 0.2, [G + "relate"]: 0.12 },
    intent: { relate: 0.42, combine: 0.44 }, surface: "options", speak_up: 0.69, confidence: 0.58 },
  { match: ["用户访谈笔记", "竞品分析"], activity: "objects", next: { [P + "synthesize"]: 0.36, [P + "compare"]: 0.3, [R + "link"]: 0.14 },
    intent: { combine: 0.66, relate: 0.2 }, surface: "compare", speak_up: 0.72, confidence: 0.62 },
];

/** Pick the most specific sample whose fragments all appear in the selected text (and activity, when it names one). */
export function findReplay(answers: readonly ReplayAnswer[], texts: readonly string[], activity: string, granularity: string): ReplayAnswer | null {
  const joined = texts.join("\n");
  const fits = answers.filter(answer => answer.match.every(fragment => joined.includes(fragment)) && (!answer.activity || answer.activity === activity || answer.activity === granularity));
  return fits.sort((a, b) => (b.activity ? 1 : 0) - (a.activity ? 1 : 0) || b.match.length - a.match.length || b.match.join("").length - a.match.join("").length)[0] ?? null;
}
