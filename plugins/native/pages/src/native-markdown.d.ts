import type { LocalizedAgentBody } from "@molis-ai/molis-work-contracts/platform/model-prompts";

export default function readNativeMarkdown(directory: "prompts" | "methods", id: string, locales: readonly string[]): LocalizedAgentBody;
