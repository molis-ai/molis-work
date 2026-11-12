import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";

export type AssistantReviewWords = readonly (string | OwnedTextRef)[];
export interface FormattedReviewField { readonly label: AssistantReviewWords; readonly value: string; readonly format: "sh" | "diff" | "json" | "exact"; readonly before?: AssistantReviewWords; readonly after?: AssistantReviewWords }
export type AssistantReviewField =
  | { readonly label: AssistantReviewWords; readonly value: AssistantReviewWords; readonly format?: undefined }
  | FormattedReviewField;
export interface AssistantReviewDisplay { readonly summary: AssistantReviewWords; readonly fields: readonly AssistantReviewField[] }
