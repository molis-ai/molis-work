import type { TextRef } from "./ui-text.js";

/** A finite target in the actual input, owned by the action's declaration. Never an execution grant. */
export interface ActionDelegationTarget {
  readonly key: string;
  readonly title: string;
  readonly title_text?: TextRef;
  /** Name of the explicit empty-string target, bound to the action provider's words. Does not authorize/default that value. */
  readonly empty_title?: TextRef;
  readonly kind: string;
  readonly field: string;
  /** Only a constant owner-defined default; absence otherwise requires an explicit input. */
  readonly default_value?: string;
  /** Supported literal targets, when the owner cannot yet verify every value of the input field. */
  readonly allowed_values?: readonly string[];
}

/** Every activated operation must be granted as a whole, with all its targets. */
export interface ActionDelegationOperation {
  readonly key: string;
  readonly title: string;
  readonly title_text?: TextRef;
  readonly fields: readonly string[];
  readonly targets: readonly string[];
  /** A constant operation, or the presence of any of its effect fields. Empty values still count. */
  readonly when: "always" | readonly string[];
}

/** Closed top-level input fields, not a policy language or a promise inferred from subject_kinds. */
export interface ActionDelegationDeclaration {
  readonly targets: readonly ActionDelegationTarget[];
  readonly operations: readonly ActionDelegationOperation[];
  /** Version/idempotency controls only; the owner must not use these to choose a target or add an effect. */
  readonly control_fields: readonly string[];
}

/** Targets extracted from one schema-validated input. Identity, grants and currentness are still checked by the caller. */
export interface ActionDelegationEffect {
  readonly key: string;
  readonly targets: Readonly<Record<string, string>>;
}

export type ActionDelegationExtraction =
  | { readonly state: "resolved"; readonly operations: readonly ActionDelegationEffect[] }
  | { readonly state: "confirmation-required"; readonly reason: "undeclared" | "confirmation-only" | "invalid-declaration" | "invalid-input" | "target-missing" | "target-unsupported" | "no-operation" };
