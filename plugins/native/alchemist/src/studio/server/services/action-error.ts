import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

/** Safe business failure shared by function callers and HTTP status mapping. */
export class AlchemistOperationError extends ActionError {
  constructor(code: string, message: string, readonly status: 400 | 404 | 409 | 422 = 409, readonly details: Record<string, unknown> = {}) {
    super(code, message);
  }
}
