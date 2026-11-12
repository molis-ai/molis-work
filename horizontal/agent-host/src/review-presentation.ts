import type { AgentReviewDocument, AgentReviewRequest, AgentToolOperationReviewDocument } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { OwnedTextRef, TextArgs } from "@molis-ai/molis-work-contracts/platform/ui";
import { textArgs } from "@molis-ai/molis-work-plugin-sdk/ui";

export type ReviewWord = string | OwnedTextRef;
export type ReviewWords = readonly ReviewWord[];
export interface ReviewFieldPresentation {
  readonly label?: ReviewWords;
  readonly value?: ReviewWords;
  readonly format?: "diff" | "sh" | "json" | "exact";
  readonly subject?: boolean;
}
export interface ReviewPresentation {
  readonly summary?: ReviewWords;
  readonly fields?: readonly ReviewFieldPresentation[];
  readonly concurrent?: ReviewWords;
}
export interface ToolReviewField {
  readonly label: string;
  readonly value: string;
  readonly presentation?: ReviewFieldPresentation;
}

// Only the view uses these words. The executable document, its authorization and its stored decision still use their original shapes.
const presentations = new WeakMap<AgentReviewDocument, ReviewPresentation>();
export const reviewPresentation = (document: AgentReviewDocument) => presentations.get(document);

export function presentReview<T extends AgentReviewDocument>(document: T, copy: ReviewPresentation): T {
  presentations.set(document, copy);
  return document;
}

export function clonePresentedReview(request: AgentReviewRequest): AgentReviewRequest {
  const cloned = structuredClone(request), copy = reviewPresentation(request.document);
  if (copy) presentReview(cloned.document, copy);
  return cloned;
}

export function reviewText(key: string, args?: TextArgs): OwnedTextRef {
  return { owner: "workbench", key: "workbench.assistant-review." + key, ...(args ? { args: textArgs(args) } : {}) };
}

export function reviewField(label: string, value: string, key: string, options: Omit<ReviewFieldPresentation, "label"> = {}): ToolReviewField {
  return { label, value, presentation: { label: [reviewText("field." + key)], ...options } };
}

export function presentToolReview(operation: Omit<AgentToolOperationReviewDocument, "fields">, fields: readonly ToolReviewField[], summary?: ReviewWords): AgentToolOperationReviewDocument {
  return presentReview({ ...operation, fields: fields.map(({ label, value }) => ({ label, value })) },
    { summary, fields: fields.map(field => field.presentation ?? {}) });
}
