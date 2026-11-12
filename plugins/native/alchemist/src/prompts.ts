import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


const OWNER = "io.molis.work.alchemist";

export const ALCHEMIST_REUSE = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.reuse", version: /* @version prompt.alchemist.reuse */ 2, title: "检查成果适用性",
  purpose: "评估历史成果与已确认方法在当前任务中的适用条件和风险", used_by: ["炼金术士 · 检查成果适用性"],
  ...promptBody("alchemist.reuse"),
});

export const ALCHEMIST_FORMAT_CORRECTION = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.format-correction", version: /* @version prompt.alchemist.format-correction */ 2, title: "修正 JSON 格式",
  purpose: "仅在预算明确允许时修正一次模型输出格式", used_by: ["炼金术士 · 修正 JSON 格式"],
  ...promptBody("alchemist.format-correction"),
});

export const ALCHEMIST_SYNTHESIS = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.synthesis", version: /* @version prompt.alchemist.synthesis */ 2, title: "综合研究结论",
  purpose: "根据研究判断生成有证据和适用条件的总结", used_by: ["炼金术士 · 综合研究结论"],
  ...promptBody("alchemist.synthesis"),
});

export const ALCHEMIST_COPILOT = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.copilot", version: /* @version prompt.alchemist.copilot */ 2, title: "Founder Copilot",
  purpose: "围绕当前对象和已知材料继续讨论", used_by: ["炼金术士 · Founder Copilot"],
  ...promptBody("alchemist.copilot"),
});

export const ALCHEMIST_EXPLORATION = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.exploration", version: /* @version prompt.alchemist.exploration */ 2, title: "生成 Idea 草案",
  purpose: "将 Direction 转为有依据的方向理解和 Idea 候选", used_by: ["炼金术士 · 生成 Idea 草案"],
  ...promptBody("alchemist.exploration"),
});

export const ALCHEMIST_CROSS_CHECK = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "alchemist.cross-check", version: /* @version prompt.alchemist.cross-check */ 2, title: "交叉检查证据",
  purpose: "按指定研究维度形成有依据且可校准的判断", used_by: ["炼金术士 · 研究"],
  ...promptBody("alchemist.cross-check"),
});

export const ALCHEMIST_INSTRUCTIONS: readonly InstructionPrompt[] = [ALCHEMIST_REUSE, ALCHEMIST_FORMAT_CORRECTION, ALCHEMIST_SYNTHESIS, ALCHEMIST_COPILOT, ALCHEMIST_EXPLORATION, ALCHEMIST_CROSS_CHECK];
