import type { IntegrationDrivers } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { GMAIL_OAUTH_CALLBACK_ALIAS } from "./index.js";
import { GMAIL_MAILBOX_DRIVER } from "./recent-mail.js";

/** What Gmail declares the Host does for it (D3 A): the OAuth return address its client was registered under, and recent mail for onboarding. */
export const drivers: IntegrationDrivers = Object.freeze({
  oauth_callback_aliases: [GMAIL_OAUTH_CALLBACK_ALIAS],
  mailbox: GMAIL_MAILBOX_DRIVER,
});
