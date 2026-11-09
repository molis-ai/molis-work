import type { AgentBuilderPorts } from "@molis-ai/molis-work-plugin-builder";
import { replyLanguagePrompt } from "../reply-language.js";
import type { WebLocale } from "../web-locale.js";

type BuilderAgent = Awaited<ReturnType<AgentBuilderPorts["agent"]>>;

/** Studio's stage jobs use the same Host instruction as other Agent rounds. */
export function builderAgentInLanguage(agent: BuilderAgent, locale: WebLocale): BuilderAgent {
  const language = replyLanguagePrompt(locale).body;
  return {
    run: request => agent.run({ ...request, instruction: request.instruction + "\n\n" + language }),
    close: () => agent.close(), records: () => agent.records(),
  };
}
