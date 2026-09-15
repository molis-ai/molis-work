import { createGithubDeviceFlow } from "@molis-ai/molis-work-integration-github";
import { createFileSecretStore, readProductEnv } from "@molis-ai/molis-work-storage";
import { GITHUB_CLIENT_ID_REF, bindConnectorToken } from "./connector-credentials.js";
const deviceFlow = createGithubDeviceFlow({
  clientId() {
    try {
      const stored = createFileSecretStore().get(GITHUB_CLIENT_ID_REF);
      if (stored?.trim()) return stored.trim();
    } catch { /* Preserve environment fallback when the local store is unavailable. */ }
    return readProductEnv("GITHUB_CLIENT_ID") || null;
  },
  storeClientId: (value) => createFileSecretStore().put(GITHUB_CLIENT_ID_REF, value),
  bindToken: (value) => { bindConnectorToken("github", value); },
});
export const { storeGithubClientId, startGithubDeviceFlow, pollGithubDeviceFlow } = deviceFlow;
