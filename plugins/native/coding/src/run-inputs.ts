import { AGENT_REASONING_EFFORTS, type AgentReasoningEffort, type AgentRunControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingWriterAssignments } from "./writers.js";
import type { CodingModelChoice } from "./routes.js";

/** What the page sends to start, steer or answer a round, checked before it reaches the Host. */

export function text(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`${label}不能为空，且不能超过 ${maximum} 字符`);
  return value.trim();
}

/** The next round's saved choices; an effort that is not quick, balanced or deep is dropped, not guessed. */
export function nextConfiguration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("下一轮配置格式无效");
  const config = value as Record<string, unknown>;
  if (!["discuss", "plan", "collaborate", "parallel", "edit", "execute", "review"].includes(String(config.intent))) throw new Error("执行方式无效");
  for (const key of ["provider_id", "model_id", "workspace_id"]) {
    if (typeof config[key] !== "string" || (config[key] as string).length > 1000) throw new Error("模型或工作区配置无效");
  }
  // The effort the person chose for the next round; one that is not quick, balanced or deep is dropped, not guessed.
  const effort = (AGENT_REASONING_EFFORTS as readonly unknown[]).includes(config.reasoning_effort) ? { reasoning_effort: config.reasoning_effort as AgentReasoningEffort } : {};
  return { intent: config.intent as string, provider_id: config.provider_id as string,
    model_id: config.model_id as string, workspace_id: config.workspace_id as string, ...effort,
    ...(config.writer_assignments === undefined ? {} : { writer_assignments: codingWriterAssignments(config.writer_assignments) }) };
}

export function questionAnswer(body: Record<string, unknown>): Extract<AgentRunControl, { kind: "answer" }> {
  const pending_id = text(body.pending_id, "问题引用");
  const pending_revision = body.pending_revision;
  if (typeof pending_revision !== "number" || !Number.isInteger(pending_revision) || pending_revision < 1) throw new Error("问题版本无效，请重新读取原问题");
  if (body.answers === undefined) {
    text(body.text, "回答", 100_000);
    // Validate blank/oversized input without rewriting the user's answer.
    return { kind: "answer", pending_id, pending_revision, text: body.text as string };
  }
  if (body.text !== undefined || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 10) throw new Error("问卷回答格式无效");
  const answers = body.answers.map(value => {
    if (!value || typeof value !== "object") throw new Error("问卷回答格式无效");
    const { question, indexes, other } = value as Record<string, unknown>;
    if (typeof question !== "number" || !Number.isInteger(question) || !Array.isArray(indexes) || indexes.length > 20
      || !indexes.every(index => typeof index === "number" && Number.isInteger(index))
      || other !== undefined && (typeof other !== "string" || other.length > 500)) throw new Error("问题或选项编号无效");
    return { question, indexes: indexes as number[], ...(other === undefined ? {} : { other: other as string }) };
  });
  return { kind: "answer", pending_id, pending_revision, answers };
}

/** The reasoning effort a round is started with: one of the three, and only for a model marked as taking one. */
export function chosenEffort(body: Record<string, unknown>, model: CodingModelChoice): AgentReasoningEffort | undefined {
  const effort = body.reasoning_effort === undefined || body.reasoning_effort === "" ? undefined : String(body.reasoning_effort);
  if (effort !== undefined && (!(AGENT_REASONING_EFFORTS as readonly string[]).includes(effort) || !model.reasoning_effort)) throw new Error("所选模型没有标注可调思考力度，或力度不是快速、平衡、深入之一");
  return effort as AgentReasoningEffort | undefined;
}

/**
 * A control the person sends to the running round. A switch names only a model the Host offers this plugin; whether
 * the round can carry it is the Host's check.
 */
export async function runControl(body: Record<string, unknown>, models: () => Promise<readonly CodingModelChoice[]>): Promise<AgentRunControl> {
  if (body.kind === "answer") return questionAnswer(body);
  if (body.kind === "steer") return { kind: "steer", text: text(body.text, "补充要求", 100_000) };
  if (body.kind === "stop" || body.kind === "pause" || body.kind === "resume") return { kind: body.kind };
  if (body.kind === "switch-model") {
    const model = (await models()).find(entry => entry.provider_id === body.provider_id && entry.model_id === body.model_id);
    if (!model) throw new Error("所选模型不可用，请在全局模型设置中检查配置");
    return { kind: "switch-model", provider_id: model.provider_id, model_id: model.model_id };
  }
  throw new Error("不支持的控制动作");
}
