import type { AgentBuilderPorts } from "../plugin-builder-surface.js";
import { replyLanguagePrompt } from "../reply-language.js";
import { WORKBENCH_LANGUAGES, type WebLocale } from "../web-locale.js";

type BuilderAgent = Awaited<ReturnType<AgentBuilderPorts["agent"]>>;

export const studioDesignLanguages = (current: WebLocale): ReturnType<NonNullable<AgentBuilderPorts['designLanguages']>> =>
  ({ current, available: WORKBENCH_LANGUAGES.languages });

/** Studio's stage jobs use the same Host instruction as other Agent rounds. */
export function builderAgentInLanguage(agent: BuilderAgent, locale: WebLocale): BuilderAgent {
  const language = replyLanguagePrompt(locale).body;
  return {
    run: request => agent.run({ ...request, instruction: request.instruction + "\n\n" + language }),
    close: () => agent.close(), records: () => agent.records(),
  };
}
