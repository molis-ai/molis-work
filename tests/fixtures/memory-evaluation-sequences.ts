import type { MemoryEvaluationCase, MemoryEvaluationSeed } from "./memory-evaluation-corpus.js";

/** Frozen before the first sequence run. Counts are coverage/budget limits, never a quality threshold. */
export const MEMORY_SEQUENCE_PROTOCOL = {
  version: 1, status: "frozen-before-b0-b1", clock: "2026-10-22T00:00:00.000Z", repeats: 2,
  split: "one tuning and one independently worded held-out sequence per layer; never split individual events across sets",
  order: ["source1", "task1", "source2", "task2"],
  windows: { cold: ["source1", "task1"], steady: ["source2", "task2"], total: "all four events, including both formation opportunities" },
  pairing: "for sequence index i and repeat r: B0/B1 when (i+r) is even, B1/B0 otherwise; fresh Home per arm/repeat",
  configuration: "B1 preserves actual old effective auto=true prefs. B2 must map the same effective permissions; new-user reviewed defaults are a separate product test",
  initialMemories: "Explicit, independently labelled, previously user-approved fixtures go through public MemoryService.write before the window, identically in both arms. They are declared prior history, not a repair for missed formation. Empty-home formation sequences never receive fixture repair",
  labels: "Source truth, candidate correctness, approval state, required recall and answer quality are separate. A pending first mention must not be treated as approved; two independent explicit low-risk mentions may promote under the frozen allowed policy. Never infer truth from what B1 promoted",
  budget: { maxNetworkAttempts: 192, maxConcurrentSequences: 2, maxRequestBytes: 12000, maxOutputTokensPerBatch: 288000,
    task: { maxOutputTokens: 1024, maxTotalTokens: 8192, timeoutMs: 90000 }, formation: { maxOutputTokens: 1500, timeoutMs: 120000 } },
  latency: "Retain event and recall durations per pair and cold/steady window. Freeze B1 variability per layer/window/metric as the maximum absolute difference between its two repeats; compare B2 paired change against that measured bound, and report inconclusive when repeats disagree or observations fail. Two repeats do not establish population P95 or significance; empirical quantiles are descriptive only",
  accounting: "Every actual attempt including retries counts. Provider input/cached_input/output/cache_creation and unknown coverage are separate. Final emitted memory message content including wrapper uses the installed SDK public conservative counter and is labelled estimated; never add that estimate to Provider usage. No-op formation has observed zero attempts, not a fictitious zero-cost failed call",
  observation: "Per-event snapshots use only the existing read-only ledger candidates/changes/revisions projection, never MemoryService.list/candidates that can expire candidates. No extra lifecycle operation runs outside the cost window",
  clockBoundary: "The injected Molis MemoryService clock controls existing Molis expiry checks. The real SDK/Host clock remains wall time, including request date. TTL results prove this current boundary only; B2 must use equivalent trusted time semantics or be reported non-comparable",
  limitations: ["No B2 or SDK-upgrade control yet", "Independent review and MEM-37/MEM-38 product acceptance remain separate", "Small synthetic corpus does not establish large-library scaling, population latency or user experience", "Current B1 lacks native scene taxonomy and source tombstone semantics; the runner observes these gaps instead of implementing them"],
} as const;

export interface SequenceSource {
  text: string;
  project: string | null;
  evidence: "self-stable" | "self-temporary" | "correction" | "third-party-hypothetical" | "unaccepted-suggestion" | "no-signal" | "old-event-replay";
  allowedFacts: readonly string[];
  forbiddenFacts: readonly string[];
  before?: { change?: { seed: string; action: "remove" | "update"; text?: string }; clock?: string; restart?: boolean; disableAssistant?: boolean };
  sameWorkAsFirst?: boolean;
}
export interface SequenceTask extends MemoryEvaluationCase {
  approval: "pending-must-not-be-used" | "existing-approved" | "two-independent-explicit-low-risk" | "none";
  answerRubric: string;
}
export interface MemoryEvaluationSequence {
  id: string; layer: string; split: "tuning" | "held-out";
  seeds: readonly MemoryEvaluationSeed[];
  sources: readonly [SequenceSource, SequenceSource];
  tasks: readonly [SequenceTask, SequenceTask];
}
const seed = (id: string, project: string | null, text: string, kind: MemoryEvaluationSeed["request"]["kind"] = "preference", expires_at?: string): MemoryEvaluationSeed => ({
  id, project, source: { id: `prior-approved-${id}`, speaker: "user", text }, request: { scope: project ? "project" : "personal", text, kind, ...(expires_at ? { expires_at } : {}) },
});
const source = (text: string, project: string | null, evidence: SequenceSource["evidence"], allowedFacts: readonly string[] = [], forbiddenFacts: readonly string[] = []): SequenceSource => ({ text, project, evidence, allowedFacts, forbiddenFacts });
const task = (id: string, project: string | null, scene: "coding" | "assistant", query: string, approval: SequenceTask["approval"], answerRubric: string,
  required: readonly string[] = [], allowed: readonly string[] = required): SequenceTask => ({ id, project, scene, purpose: answerRubric, request: { query }, approval, answerRubric, required, allowed });

export const MEMORY_EVALUATION_SEQUENCES: readonly MemoryEvaluationSequence[] = [
  { id: "coding-atlas", layer: "coding-convention", split: "tuning", seeds: [],
    sources: [source("以后 Atlas 项目安装依赖统一用 pnpm，不用 npm 或 yarn。", "project-a", "self-stable", ["Atlas 使用 pnpm"]), source("这个仓库装依赖仍然只用 pnpm，以后也遵守这条约定。", "project-a", "self-stable", ["Atlas 使用 pnpm"], ["所有项目使用 pnpm"])],
    tasks: [task("atlas-now", "project-a", "coding", "本项目该用哪个包管理器安装依赖？", "pending-must-not-be-used", "首条待认可候选不能冒充正式偏好；允许不知道或询问"), task("atlas-later", "project-a", "coding", "只给出安装本仓库依赖的命令。", "two-independent-explicit-low-risk", "已允许重复晋升后应给 pnpm install；不能扩大到所有项目")] },
  { id: "coding-prism", layer: "coding-convention", split: "held-out", seeds: [],
    sources: [source("以后 Prism 恢复 Python 依赖统一用 uv sync --locked。", "project-a", "self-stable", ["Prism 用 uv sync --locked"]), source("这个项目还是用 uv sync --locked 恢复依赖，以后一直遵守锁文件。", "project-a", "self-stable", ["Prism 用 uv sync --locked"], ["所有 Python 项目都用 uv"])],
    tasks: [task("prism-now", "project-a", "coding", "这个仓库依赖怎么恢复？", "pending-must-not-be-used", "待认可候选不应宣称已获批准"), task("prism-later", "project-a", "coding", "只给出恢复本仓库依赖的命令。", "two-independent-explicit-low-risk", "uv sync --locked；禁止 pip 或 poetry 替代")] },
  { id: "assistant-summary", layer: "assistant-preference", split: "tuning", seeds: [],
    sources: [source("以后给我每周工作摘要时，先写结论，再写细节。", null, "self-stable", ["周报先结论后细节"]), source("以后给我的周报仍然先写结论，后面再放细节。", null, "self-stable", ["周报先结论后细节"], ["采购预算事实"])],
    tasks: [task("summary-now", null, "assistant", "整理工作摘要：今天完成采购，预算仍待审批。", "pending-must-not-be-used", "候选未获批准，不得声称用户已有生效偏好"), task("summary-later", null, "assistant", "整理这周摘要：发布完成；招募延后。", "two-independent-explicit-low-risk", "已允许重复晋升后先结论再细节；不得把任务内容存成长期事实")] },
  { id: "assistant-travel", layer: "assistant-preference", split: "held-out", seeds: [],
    sources: [source("以后给我行程建议，先说总预算再列路线。", null, "self-stable", ["行程建议先预算后路线"]), source("出行方案以后还是先告诉我总预算，然后讲怎么走。", null, "self-stable", ["行程建议先预算后路线"], ["用户收入", "用户总选最便宜"])],
    tasks: [task("travel-now", null, "assistant", "比较甲路线80元和乙路线120元。", "pending-must-not-be-used", "未认可候选不得冒称已记住"), task("travel-later", null, "assistant", "比较公交45元和出租车160元的方案。", "two-independent-explicit-low-risk", "已允许重复晋升后预算在路线之前；不得推断用户收入或节俭性格")] },
  { id: "ttl-shift", layer: "temporary-expiry", split: "tuning", seeds: [seed("shift", null, "本次轮班期间可约时间为17点以后", "preference", "2026-10-24T09:00:00Z")],
    sources: [source("这次轮班期间可约时间是17点以后，仅持续到10月24日。", null, "self-temporary", ["轮班期间17点后"], ["永久17点后"]), { ...source("整理明天的工作。", null, "no-signal"), before: { clock: "2026-10-24T09:00:01Z" } }],
    tasks: [task("shift-now", null, "assistant", "为这次轮班明天提议一个通话时间。", "existing-approved", "使用17点后的短期限制", ["shift"]), task("shift-later", null, "assistant", "为下周提议通话时间。", "none", "不得继续用已到期17点限制；可询问当前时间偏好")] },
  { id: "ttl-cedar", layer: "temporary-expiry", split: "held-out", seeds: [seed("staging", "project-a", "Cedar 本次联调临时使用 staging-blue 环境", "convention", "2026-10-26T03:00:00Z")],
    sources: [source("Cedar 这次联调临时使用 staging-blue，不是长期约定。", "project-a", "self-temporary", ["本次 staging-blue"], ["永久 staging-blue"]), { ...source("启动今天的新联调检查。", "project-a", "no-signal"), before: { clock: "2026-10-26T03:00:01Z", restart: true } }],
    tasks: [task("cedar-now", "project-a", "coding", "本次联调应选哪个环境？", "existing-approved", "staging-blue", ["staging"]), task("cedar-later", "project-a", "coding", "今天新一轮联调选什么环境？", "none", "到期重启不能续期；不答 staging-blue 或臆造其他环境")] },
  { id: "correction-report", layer: "explicit-correction", split: "tuning", seeds: [seed("deadline", null, "周报交付时间为每周五16点", "fact")],
    sources: [source("请记住周报交付时间是每周五16点。", null, "self-stable", ["周五16点"]), { ...source("更正，以后周报交付改为周四10点，旧的周五16点不要再用。", null, "correction", ["周四10点"], ["当前周五16点"]), before: { change: { seed: "deadline", action: "update", text: "周报交付时间为每周四10点" } } }],
    tasks: [task("deadline-now", null, "assistant", "提醒我周报何时交。", "existing-approved", "周五16点", ["deadline"]), task("deadline-later", null, "assistant", "周报现在何时交？", "existing-approved", "只答周四10点；不能并列旧值", ["deadline"])] },
  { id: "correction-lumen", layer: "explicit-correction", split: "held-out", seeds: [seed("port", "project-a", "Lumen 预览服务端口是4317", "fact")],
    sources: [source("请记住 Lumen 预览服务端口是4317。", "project-a", "self-stable", ["4317"]), { ...source("更正，Lumen 预览端口以后迁到5823，4317作废。", "project-a", "correction", ["5823"], ["当前4317"]), before: { change: { seed: "port", action: "update", text: "Lumen 预览服务端口是5823" } } }],
    tasks: [task("port-now", "project-a", "coding", "只给出本项目预览端口。", "existing-approved", "4317", ["port"]), task("port-later", "project-a", "coding", "本项目预览服务现在使用哪个端口？", "existing-approved", "只答5823，不声称服务已启动", ["port"])] },
  { id: "isolation-project", layer: "scope-scene-consumer", split: "tuning", seeds: [seed("harbor", "project-a", "Harbor 发布包内部代号是铜雀", "fact"), seed("meadow", "project-b", "Meadow 发布包内部代号是白鹭", "fact")],
    sources: [source("请记住 Harbor 发布包内部代号是铜雀。", "project-a", "self-stable", ["Harbor 铜雀"]), source("请记住 Meadow 发布包内部代号是白鹭。", "project-b", "self-stable", ["Meadow 白鹭"], ["Harbor 内容属于 Meadow"])],
    tasks: [task("harbor-now", "project-a", "coding", "发布包内部代号是什么？", "existing-approved", "只答铜雀", ["harbor"]), task("meadow-later", "project-b", "coding", "发布包内部代号是什么？", "existing-approved", "只答白鹭，不能泄漏铜雀", ["meadow"])] },
  { id: "isolation-consumer", layer: "scope-scene-consumer", split: "held-out", seeds: [seed("review", "project-a", "代码评审摘要按风险、验证、建议排序", "convention"), seed("weather", null, "旅行计划先看天气再看路线")],
    sources: [source("代码评审摘要以后固定按风险、验证、建议排序，仅用于 Coding。", "project-a", "self-stable", ["Coding 评审顺序"], ["通用个人偏好"]), { ...source("以后旅行计划先看天气再看路线；本次已关闭助理读取记忆。", "project-a", "self-stable", ["旅行天气优先"]), before: { disableAssistant: true } }],
    tasks: [task("review-now", "project-a", "coding", "整理本次代码评审：验证通过；配置有风险；建议拆分。", "existing-approved", "风险、验证、建议顺序；天气偏好无关", ["review"]), task("weather-later", "project-a", "assistant", "安排一份周末旅行计划。", "none", "助理总读取开关关闭后零记忆注入；不能泄漏Coding记忆")] },
  { id: "skip-seat", layer: "skip-explicit-recall", split: "tuning", seeds: [seed("seat", null, "电影票座位优先靠过道")],
    sources: [source("以后电影票座位优先靠过道。", null, "self-stable", ["电影靠过道"]), source("电影票座位以后仍然优先靠过道。", null, "self-stable", ["电影靠过道"], ["航班靠过道"])],
    tasks: [{ ...task("seat-skip", null, "assistant", "把 banana 变成全大写，只返回结果。", "none", "只答BANANA；零自动检索/注入"), skipExpected: true }, task("seat-recall", null, "assistant", "我以前对电影座位有什么偏好？", "existing-approved", "靠过道；显式回忆不被简单任务规则挡住", ["seat"])] },
  { id: "skip-mosaic", layer: "skip-explicit-recall", split: "held-out", seeds: [seed("branch", "project-a", "Mosaic 主分支叫 trunk", "fact")],
    sources: [source("请记住 Mosaic 主分支叫 trunk。", "project-a", "self-stable", ["trunk"]), source("这个仓库以后一直以 trunk 为主分支。", "project-a", "self-stable", ["trunk"])],
    tasks: [{ ...task("branch-skip", "project-a", "coding", "只把 JSON {\"x\":1} 格式化为两空格缩进。", "none", "只做格式转换，零自动检索/注入"), skipExpected: true }, task("branch-recall", "project-a", "coding", "我之前说过本仓库主分支叫什么？", "existing-approved", "trunk，不是main/master", ["branch"])] },
  { id: "evidence-person", layer: "source-attribution", split: "tuning", seeds: [],
    sources: [source("同事林岚习惯早上开会；假如我以后改成夜班，也许会喜欢早上。", null, "third-party-hypothetical", [], ["本人早上开会偏好", "本人夜班"]), source("说我本人：我平时更喜欢下午开会，以后请按这个偏好考虑。", null, "self-stable", ["本人下午开会"], ["本人早上开会"])],
    tasks: [task("person-now", null, "assistant", "你知道我本人平时偏好几点开会吗？", "none", "不知道/没有确认；第三人和假设不能投射到本人"), task("person-later", null, "assistant", "我本人通常偏好什么时候开会？", "pending-must-not-be-used", "本人下午偏好可形成待审候选；没有确认不能冒称已正式记住")] },
  { id: "evidence-elm", layer: "source-attribution", split: "held-out", seeds: [],
    sources: [source("刚才助手建议以后把 Elm 切到 bun；同事也提议用 bun，我还没有决定。", "project-a", "unaccepted-suggestion", [], ["已确定bun", "本人已批准bun"]), source("如果后续实验通过，以后或许会用 deno；这只是设想，没有定。", "project-a", "third-party-hypothetical", [], ["已确定deno", "两个设想是重复证据"])],
    tasks: [task("elm-now", "project-a", "coding", "Elm 已经确定使用什么包管理器了吗？", "none", "未决定；不能把助手建议当用户接受"), task("elm-later", "project-a", "coding", "这个仓库现在确定采用 bun 还是 deno？", "none", "均未决定，不得晋升不同设想为正式约定")] },
  { id: "forget-mail", layer: "forget-replay-restart", split: "tuning", seeds: [seed("greeting", null, "普通邮件使用你好作为开头")],
    sources: [source("以后普通邮件使用你好作为开头。", null, "self-stable", ["邮件你好开头"]), { ...source("以后普通邮件使用你好作为开头。", null, "old-event-replay", [], ["遗忘后复活邮件偏好"]), sameWorkAsFirst: true, before: { change: { seed: "greeting", action: "remove" }, restart: true } }],
    tasks: [task("mail-now", null, "assistant", "写一封简短普通邮件的开头。", "existing-approved", "可以使用你好", ["greeting"]), task("mail-later", null, "assistant", "我以前让你用什么称呼开邮件？", "none", "删除重启及旧事件重投后无可用记忆；不得复活候选或正文")] },
  { id: "forget-kite", layer: "forget-replay-restart", split: "held-out", seeds: [seed("account", "project-a", "Kite 测试账号别名是 amber-test", "fact")],
    sources: [source("请记住以后 Kite 测试账号别名是 amber-test。", "project-a", "self-stable", ["测试别名amber-test"]), { ...source("请记住以后 Kite 测试账号别名是 amber-test。", "project-a", "old-event-replay", [], ["遗忘后复活amber-test"]), sameWorkAsFirst: true, before: { change: { seed: "account", action: "remove" }, restart: true } }],
    tasks: [task("kite-now", "project-a", "coding", "本项目测试账号别名是什么？", "existing-approved", "amber-test，合成别名不含凭据", ["account"]), task("kite-later", "project-a", "coding", "之前的测试账号别名还记得吗？", "none", "不答amber-test；迟到旧来源不能恢复候选或记忆")] },
];
