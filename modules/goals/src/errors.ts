import type { ActionErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";

export class GoalsCommandError extends Error {
  declare readonly kind?: ActionErrorKind;
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    kind?: ActionErrorKind,
  ) {
    super(message);
    this.name = "GoalsCommandError";
    if (kind) this.kind = kind;
  }
}

export type GoalsErrorFactory = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
  kind?: ActionErrorKind,
) => Error;

