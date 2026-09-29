import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
export class ShelfError extends Error {
  readonly code: string;
  execution?: BoundedInferenceReceipt;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ShelfError";
    this.code = code;
    this.details = details;
  }
}

export function isShelfError(error: unknown): error is ShelfError {
  return error instanceof ShelfError;
}
