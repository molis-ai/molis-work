import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const knowledgeErrors = defineErrorCodes("knowledge", {
  invalid: "invalid", scope: "forbidden", anchor_unknown: "invalid", unreadable: "unavailable", excluded: "forbidden", unknown: "not_found", no_model: "unavailable",
});
export type KnowledgeErrorCode = `knowledge.${keyof typeof knowledgeErrors}`;
