import type { AccountCallControl } from "@molis-ai/molis-work-contracts/services/account";
import { accountErrors } from "./errors.js";
import { checkAccountControl } from "./session-state.js";
import type { ActiveAccount, SessionTokens } from "./session-types.js";

/** One Host-owned rotation; each waiter retains its own authority and cancellation. */
export class AccountRefreshJob {
  readonly participants = new Set<AccountCallControl>();
  produced?: SessionTokens;
  promise!: Promise<void>;
  constructor(readonly base: ActiveAccount) {}
  assertParticipant(): void {
    for (const participant of this.participants) {
      try { checkAccountControl(participant); return; } catch { /* Another original participant may still be authorized. */ }
    }
    throw accountErrors.cancelled("Account refresh has no active request");
  }
  async wait(control: AccountCallControl): Promise<void> {
    checkAccountControl(control); this.participants.add(control);
    let stop: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      stop = () => reject(accountErrors.cancelled("Account request was cancelled"));
      control.signal?.addEventListener("abort", stop, { once: true });
    });
    try { await Promise.race([this.promise, cancelled]); checkAccountControl(control); }
    finally { this.participants.delete(control); if (stop) control.signal?.removeEventListener("abort", stop); }
  }
}
