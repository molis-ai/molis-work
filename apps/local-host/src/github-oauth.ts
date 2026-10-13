import { createGithubDeviceFlow } from "@molis-ai/molis-work-integration-github";
import { createFileSecretStore, readProductEnv } from "@molis-ai/molis-work-storage";

/** The GitHub OAuth app this Home uses for the device flow; configuration, not an account credential. */
export const GITHUB_CLIENT_ID_REF = "connector:github:client_id";

const deviceFlow = createGithubDeviceFlow({
  clientId() {
    try {
      const stored = createFileSecretStore().get(GITHUB_CLIENT_ID_REF);
      if (stored?.trim()) return stored.trim();
    } catch { /* Preserve environment fallback when the local store is unavailable. */ }
    return readProductEnv("GITHUB_CLIENT_ID") || null;
  },
  storeClientId: (value) => createFileSecretStore().put(GITHUB_CLIENT_ID_REF, value),
});
export const { storeGithubClientId, startGithubDeviceFlow, pollGithubDeviceFlow } = deviceFlow;
