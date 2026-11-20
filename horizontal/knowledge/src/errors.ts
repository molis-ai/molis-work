import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";

export const knowledgeErrors = defineErrorCodes("knowledge", {
  invalid: "invalid", scope: "forbidden", anchor_unknown: "invalid", unreadable: "unavailable", excluded: "forbidden", unknown: "not_found", no_model: "unavailable", revision_changed: "conflict",
});
export type KnowledgeErrorCode = `knowledge.${keyof typeof knowledgeErrors}`;

/** How long a reason given back may be: why a piece could not be read, why organizing failed, why the model chose a section. */
export const REASON_UNITS = 200;
/** A reason cut to its first {@link REASON_UNITS} UTF-16 units between whole characters (BL-981): never half of a two-unit one. */
export const reasonText = (text: string) => cutHead(text, REASON_UNITS);
/** What an error says, as a reason: its message (or the thrown value) cut like {@link reasonText}. */
export const reasonOf = (error: unknown) => reasonText(error instanceof Error ? error.message : String(error));
