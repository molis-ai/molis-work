import { COGNIA_EVIDENCE_PROMPT, COGNIA_OWNER } from "./agent-definitions/system-prompts.js";
import { agentDefinitionsFor } from "./agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "./agent-definitions/builtin-registrations.js";
import type { CogniaAiPorts } from "@molis-ai/molis-work-plugin-cognia";
import { configuredTextPort } from "./configured-text-port.js";

/** Cognia owns the evidence prompt. The Host binds its selection to the Home's shared inference owner. */
export function createCogniaProloguePort(options: { homeDirectory: string; actorId?: string }): CogniaAiPorts {
  return configuredTextPort(options.homeDirectory, { owner: COGNIA_OWNER, timeoutMs: 180_000,
    unavailableReason: "当前没有可用的文字模型，请检查模型设置和服务连接；导入、搜索和阅读仍可使用。",
    system: () => agentDefinitionsFor(options.homeDirectory, builtinRegistrations).effective(COGNIA_OWNER, COGNIA_EVIDENCE_PROMPT).body });
}
