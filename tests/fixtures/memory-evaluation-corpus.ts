import type { MemoryRecallRequest, MemoryWriteRequest } from "@molis-ai/molis-work-contracts/services/memory";

/** 合成材料，不来自真实 Home。标签由任务要求给出，不能由被测策略生成。 */
export interface MemoryEvaluationSeed {
  id: string;
  source: { id: string; speaker: "user"; text: string };
  project: string | null;
  request: MemoryWriteRequest;
}
export interface MemoryEvaluationCase {
  id: string;
  scene: "coding" | "assistant";
  purpose: string;
  project: string | null;
  request: MemoryRecallRequest;
  required: readonly string[];
  allowed: readonly string[];
  skipExpected?: boolean;
  mutation?: { seed: string; action: "update" | "disable" | "remove"; text?: string };
  forbiddenText?: readonly string[];
}

export const MEMORY_EVALUATION_CORPUS = {
  version: 1,
  clock: "2026-10-22T00:00:00.000Z",
  status: "development-calibration-not-held-out",
  limitations: ["这是机制校准集，不是冻结留出验证集", "不证明真实模型任务质量、形成准确率或节省比例"],
  seeds: [
    { id: "project-tool", source: { id: "u-coding-1", speaker: "user", text: "这个项目安装依赖和运行检查都用 pnpm" }, project: "project-a", request: { scope: "project", text: "这个项目安装依赖和运行检查都用 pnpm", kind: "convention" } },
    { id: "coding-review", source: { id: "u-coding-2", speaker: "user", text: "代码评审时先列能够复现的错误，再讨论代码风格" }, project: null, request: { scope: "personal", text: "代码评审时先列能够复现的错误，再讨论代码风格", kind: "preference" } },
    { id: "assistant-meeting", source: { id: "u-assistant-1", speaker: "user", text: "安排个人会议时优先考虑下午" }, project: null, request: { scope: "personal", text: "安排个人会议时优先考虑下午", kind: "preference" } },
    { id: "expired-travel", source: { id: "u-assistant-2", speaker: "user", text: "十月一日以前的出差都订靠窗座位" }, project: null, request: { scope: "personal", text: "十月一日以前的出差都订靠窗座位", kind: "fact", expires_at: "2026-10-01T00:00:00.000Z" } },
    { id: "other-project", source: { id: "u-coding-b", speaker: "user", text: "项目乙使用 yarn 安装依赖" }, project: "project-b", request: { scope: "project", text: "项目乙使用 yarn 安装依赖", kind: "convention" } },
    { id: "project-fact", source: { id: "u-project-1", speaker: "user", text: "本项目周报的北极星指标简称 NSM" }, project: "project-a", request: { scope: "project", text: "本项目周报的北极星指标简称 NSM", kind: "fact" } },
  ] satisfies readonly MemoryEvaluationSeed[],
  cases: [
    { id: "coding-install", scene: "coding", purpose: "项目工具约定命中", project: "project-a", request: { query: "安装依赖并运行检查" }, required: ["project-tool"], allowed: ["project-tool"] },
    { id: "coding-review", scene: "coding", purpose: "Coding 与助理分类隔离", project: "project-a", request: { query: "评审这次代码修改" }, required: ["coding-review"], allowed: ["coding-review"] },
    { id: "assistant-meeting", scene: "assistant", purpose: "个人助理不带项目工具约定", project: "project-a", request: { query: "安排下周的个人会议" }, required: ["assistant-meeting"], allowed: ["assistant-meeting"] },
    { id: "project-isolation", scene: "coding", purpose: "另一个项目的约定不串入", project: "project-b", request: { query: "安装依赖" }, required: ["other-project"], allowed: ["other-project"] },
    { id: "expired", scene: "assistant", purpose: "过期临时要求不使用", project: null, request: { query: "为十一月出差选座位" }, required: [], allowed: [], forbiddenText: ["十月一日以前"] },
    { id: "self-contained", scene: "assistant", purpose: "自包含格式转换应跳过自动记忆", project: null, request: { query: "把 apple 转为大写，只返回结果" }, required: [], allowed: [], skipExpected: true },
    { id: "explicit-recall", scene: "assistant", purpose: "简单但明确要求回忆时仍可读取", project: null, request: { query: "我之前对个人会议的时间有什么偏好" }, required: ["assistant-meeting"], allowed: ["assistant-meeting"] },
    { id: "semantic-rephrase", scene: "coding", purpose: "词面不同的任务检验有效召回", project: "project-a", request: { query: "这个仓库用哪个包管理器" }, required: ["project-tool"], allowed: ["project-tool"] },
    { id: "correction", scene: "assistant", purpose: "纠正后只有新值影响后续任务", project: null, request: { query: "安排个人会议" }, required: ["assistant-meeting"], allowed: ["assistant-meeting"], mutation: { seed: "assistant-meeting", action: "update", text: "安排个人会议时优先考虑上午" }, forbiddenText: ["优先考虑下午"] },
    { id: "forget", scene: "assistant", purpose: "遗忘后的后续读取", project: null, request: { query: "个人会议时间偏好" }, required: [], allowed: [], mutation: { seed: "assistant-meeting", action: "remove" }, forbiddenText: ["优先考虑下午"] },
  ] satisfies readonly MemoryEvaluationCase[],
} as const;
