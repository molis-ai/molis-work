/** Request-local admission. A shared installation owner never stores the current account. */
export interface ConfirmationAuthority { current(): void; effect(): void }
export const unboundConfirmation: ConfirmationAuthority = { current() {}, effect() {} };
