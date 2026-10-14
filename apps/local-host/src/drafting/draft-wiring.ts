import { screenModelMaterial } from "@molis-ai/molis-work-service-agent-host";
import { registeredInstructionBody } from "../agent-definitions/instructions.js";
import { CONTEXTUAL_DRAFT } from "../agent-definitions/system-prompts.js";
import { hostTextGeneration } from "../host-complete-text.js";
import type { DraftPorts } from "./draft-service.js";

const CALLER = "contextual.draft";

/** The person's date as `YYYY-MM-DD`, in their own time zone. */
const localDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * What drafting uses in this Home: its configured text model, the drafting instruction as the person left it (设置 › 提示词), and the
 * same screening as every other material that reaches a model. Without a Home there is no model and the drafts are what needs none,
 * so a test or a bare process never reaches for the real Home's connection.
 */
export function draftPorts(home: string | undefined): DraftPorts {
  const generate = home ? hostTextGeneration({ homeDirectory: home }) : undefined;
  return { ...(generate ? { generate } : {}), instruction: () => registeredInstructionBody(home, CONTEXTUAL_DRAFT, CALLER), screen: screenModelMaterial, today: localDate };
}
