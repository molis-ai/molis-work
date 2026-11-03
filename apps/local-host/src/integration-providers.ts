import type { IntegrationProviderPort } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { IntegrationBinding } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

/**
 * A provider for one source of an integration, as a caller that brings its own (a test) hands it to `homeIntegrationRegistry`. The
 * Host's own wiring is not here: each kind of built-in integration gets its provider where the built-in integrations are listed
 * (`builtin-integrations.ts`), so nothing chooses a connector by comparing integration ids.
 */
export type IntegrationProviderFactory = (integrationId: string, binding: IntegrationBinding) => IntegrationProviderPort;
