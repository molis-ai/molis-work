import type { AccountCallControl, AccountEnvelope, AccountOperationInput, AccountView, SessionView, UserView } from "@molis-ai/molis-work-contracts/services/account";

/** Host owns the encrypted atomic storage; this service owns the record format. */
export interface AccountSessionStorage { read(): unknown | null; write(record: unknown): void }
export interface AccountSessionManagerPorts { readonly storage: AccountSessionStorage; readonly fetch?: typeof fetch; readonly now?: () => number }
export interface AccountLoginAttempt { readonly id: string; readonly signal: AbortSignal; assertCurrent(): void }
export type AccountLogoutScope = "CURRENT_LOGIN" | "ALL_MOLIS_PRODUCTS";
export interface AccountLogoutResult { readonly localCleared: true; readonly remoteRevocation: "CONFIRMED" | "UNCONFIRMED" }
export interface AccountAuthenticationSession {
  readonly signal: AbortSignal;
  assertCurrent(): void;
  invoke(operationId: string, input: AccountOperationInput, control: AccountCallControl, proof?: { reference: string; value: string }): Promise<AccountEnvelope>;
}
export interface AccountSessionManager {
  authentication(control: AccountCallControl): Promise<AccountAuthenticationSession>;
  readSession(control: AccountCallControl): Promise<AccountView>;
  invoke(operationId: string, input: AccountOperationInput, control: AccountCallControl): Promise<AccountEnvelope>;
  activity(input: unknown, control: AccountCallControl): Promise<SessionView>;
  logout(scope: AccountLogoutScope, idempotencyKey: string, control: AccountCallControl): Promise<AccountLogoutResult>;
  beginLogin(control: AccountCallControl): AccountLoginAttempt;
  completeLogin(attempt: AccountLoginAttempt, tokenSet: unknown, control: AccountCallControl): Promise<AccountView>;
  cancelLogin(attempt: AccountLoginAttempt): void;
  close(): Promise<void>;
}
/** Private protocol material: never exported through contracts or a browser response. */
export interface SessionTokens { readonly accessToken: string; readonly refreshToken: string; readonly tokenType: "Bearer"; readonly accessExpiresAt: string; readonly session: SessionView }
export interface LogoutReceipt { readonly scope: AccountLogoutScope; readonly keyDigest: string; readonly remoteRevocation: AccountLogoutResult["remoteRevocation"] }
interface SavedBase { readonly version: /* @version format.account.session */ 1; readonly binding: string; readonly epoch: number }
export type ActiveAccount = SavedBase & { readonly state: "ACTIVE"; readonly tokens: SessionTokens; readonly user: UserView };
export type SavedAccount = ActiveAccount
  | (SavedBase & { readonly state: "REFRESHING"; readonly user: UserView; readonly session: SessionView })
  | (SavedBase & { readonly state: "OFFLINE"; readonly user: UserView })
  | (SavedBase & { readonly state: "EXPIRED" })
  | (SavedBase & { readonly state: "EMPTY"; readonly receipt?: LogoutReceipt });
export type SavedContents = SavedAccount extends infer T ? T extends SavedAccount ? Omit<T, keyof SavedBase> : never : never;
