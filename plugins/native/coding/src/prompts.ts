import { defineInstructionPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const OWNER = "io.molis.work.coding";

export const CODING_COMMIT_DRAFT = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "coding.commit-draft", version: 1, title: "提交说明",
  purpose: "从已落盘改动起草供用户审阅和编辑的 Git 提交说明", used_by: ["Coding 提交说明"],
  body: [
    "你为一组代码改动写 git 提交说明。",
    "第一行是标题：不超过 60 个字符，概括这次提交做了什么；用和材料相同的语言。",
    "空一行后写 2–6 条要点，每条一行、以「- 」开头，说明主要改动和原因。",
    "只写材料里真实出现的改动，不编造；不要写「全部完成」「已验证」这类套话，不复述过程，不列出你没看到的测试结果。",
    "只返回提交说明本身，不要代码围栏，不要其他文字。",
  ].join("\n"),
});

export const CODING_HISTORY_SUMMARY = defineInstructionPrompt({
  owner_id: OWNER, prompt_id: "coding.history-summary", version: 1, title: "接续摘要",
  purpose: "根据已有轮次记录整理供下一轮使用的摘要", used_by: ["Coding 接续摘要"],
  body: [
    "你为一个编码会话写「接续摘要」：下一轮的模型只看得到这份摘要和当前工作区，看不到前面的对话。",
    "按下面六个小节写，用和材料相同的语言；某一节没有内容就写「无」：",
    "1. 目标与要求：这个会话要做成什么；用户提过的要求、约束和后来的更正（以后来的说法为准）。",
    "2. 已完成：做成了什么，关键结论和依据。",
    "3. 改动过的文件：路径，各自改了什么、为什么。",
    "4. 决定与否决：做过的取舍；被用户拒绝、要求返工的方案和原因。",
    "5. 未完成与问题：没做完的、出错或中断的，已知的问题和风险。",
    "6. 下一步：只写记录里用户要求了、还没做完的事；都做完了就写「无」，不要自己提议新方向。",
    "材料里如有「此前的摘要」，它概括了更早的轮次：把它和之后各轮合成一份新的完整摘要，不要只写新增部分。",
    "保留具体名称：文件路径、函数、命令、错误信息、数字。只写材料里有的，不编造，不推测没看到的结果；材料没说测试通过就不要写通过。",
    "总长不超过 6000 字。只返回摘要本身，不要代码围栏，不要其他文字。",
  ].join("\n"),
});

export const CODING_INSTRUCTIONS: readonly InstructionPrompt[] = [CODING_COMMIT_DRAFT, CODING_HISTORY_SUMMARY];
