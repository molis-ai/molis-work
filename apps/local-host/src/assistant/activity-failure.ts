import { platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AssistantActivityFailure } from "@molis-ai/molis-work-contracts/services/assistant";

/**
 * What sort of failure a step's refusal was (specs/visual-ui-experience ⑤, user 2026-10-23), read from the platform code its
 * text carries, and for an input the capability's contract refused, which fields broke which rule (the kernel writes them as
 * `/path keyword`, never the values). The page says it in the person's words and folds the text itself away. A code that is
 * an owner's own is not classified here: the page then shows the owner's text as it is.
 */
export function activityFailure(said: string): AssistantActivityFailure | undefined {
  const kind = /\bTOOL_ARGUMENTS_INVALID\b/.test(said) ? "invalid" : [...said.matchAll(/\bactions\.[a-z_]+/g)].map(([code]) => platformErrorKind(code)).find(Boolean);
  if (!kind) return undefined;
  const fields = kind === "invalid" ? [...said.matchAll(/(?:^|[：:,]\s*)(\/(?!\/)[\w./~-]*) ([A-Za-z]+)\b/g)].slice(0, 3).map(([, path, rule]) => ({ path, rule })) : [];
  return { kind, ...(fields.length ? { fields } : {}) };
}

/** A failed step's own text (bounded, the runtime's code prefix dropped) and how it is classified; empty for any other step. */
export function failedStep(item: AgentToolActivity): { detail: string; failure?: AssistantActivityFailure } {
  const detail = item.state === "failed" && item.output ? item.output.replace(/\s+/g, " ").trim().replace(/^[A-Z][A-Z_]+:\s*/, "").slice(0, 300) : "";
  return { detail, failure: detail ? activityFailure(`${item.summary} ${item.output}`) : undefined };
}
