import type { ExternalToolId } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type { ExternalSessionSourceAdapter } from "../ports.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { copilotCodingAgentAdapter } from "./copilot-coding-agent.js";
import { droidAdapter } from "./droid.js";
import { geminiCliAdapter } from "./gemini-cli.js";
import { kimiCodeAdapter } from "./kimi-code.js";
import { minimaxCodeAdapter } from "./minimax-code.js";
import { piAgentAdapter } from "./pi-agent.js";
import { qoderCnAdapter } from "./qoder-cn.js";
import { qwenCodeAdapter } from "./qwen-code.js";

const BUILTIN_ADAPTER_INSTANCES: readonly ExternalSessionSourceAdapter[] = [
  codexAdapter,
  claudeCodeAdapter,
  piAgentAdapter,
  geminiCliAdapter,
  copilotCodingAgentAdapter,
  droidAdapter,
  qwenCodeAdapter,
  qoderCnAdapter,
  kimiCodeAdapter,
  minimaxCodeAdapter,
];

const ADAPTER_BY_ENTRY = new Map<ExternalToolId, ExternalSessionSourceAdapter>(
  BUILTIN_ADAPTER_INSTANCES.map(adapter => [adapter.entry_id, adapter]),
);

export function getSessionAdapter(entryId: ExternalToolId): ExternalSessionSourceAdapter | undefined {
  return ADAPTER_BY_ENTRY.get(entryId);
}

export function hasSessionAdapter(entryId: ExternalToolId): boolean {
  return ADAPTER_BY_ENTRY.has(entryId);
}
