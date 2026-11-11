import type { ContractDescriptor } from "../platform/package.js";
import type { AccountView, ClientEnvironmentConfig } from "./account-dto.js";

export type { LoginMethodsView, ProfileUpdateRequest, ProductReauthenticationRequest, ProductTransactionRequest, AccountView, SessionView, UserView, Scope as AccountScope } from "./account-dto.js";
export type { Feature, EntitlementCheckResult, EntitlementDecision, EntitlementSource } from "./account-dto.js";
export type { Subscription, PlanVersion, SeatPool, Assignment, AuditEvent } from "./account-dto.js";
export type { TenantCreationPolicyView, TenantView, PlatformTenantView, Membership, Invitation, OwnershipTransfer } from "./account-dto.js";

export const servicesAccountContract = {
  contractId: /* @version contract.io.molis.work.service.account "io.molis.work.service.account.v{version}" */ "io.molis.work.service.account.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.account */ 1,
  maturity: "partial", ssot: "docs/horizontal/account.md",
} as const satisfies ContractDescriptor;

/** Trusted Host configuration, never supplied by an HTTP request or action input. */
export type AccountEnvironmentConfig = ClientEnvironmentConfig & { readonly applicationId: string };

/** Resolves only inside this Host's Home/issuer credential store. No raw token leaves that boundary. */
export interface AccountCredentialReference {
  readonly secretRef: string;
  readonly issuer: string;
  readonly environmentId: string;
  readonly applicationId: string;
  readonly clientId: string;
  readonly userId: string;
  readonly sessionId: string;
}

export interface AccountCallControl {
  /** Synchronous owner check of original Home/session epoch and invocation authority. */
  readonly assertCurrent: () => void;
  readonly signal?: AbortSignal;
  /** Action authority checkpoint immediately before external effects. */
  readonly beforeEffect?: () => Promise<void>;
  /** Private authentication protocol only; not accepted by ordinary account actions. */
  readonly initiatorProofRef?: string;
}

/** Fixed-operation input for trusted Host code; this is not a browser/Agent proxy contract. */
export interface AccountOperationInput {
  readonly params?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string | number>>;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
}

export interface AccountEnvelope { readonly requestId: string; readonly data: unknown }

export interface AccountService {
  readSession(control: AccountCallControl): Promise<AccountView>;
  /** Central fixed operations; credential orchestration stays in the Host, never the action directory. */
  invoke(operationId: string, input: AccountOperationInput, control: AccountCallControl): Promise<AccountEnvelope>;
}
