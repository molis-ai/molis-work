import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import type { AccountEnvironmentConfig } from "@molis-ai/molis-work-contracts/services/account";
import { accountErrors, type AccountSessionStorage } from "@molis-ai/molis-work-service-account";

/** One encrypted record; the storage owner supplies locking, encryption and atomic replacement. */
export function createHostAccountStorage(home: string, config: AccountEnvironmentConfig): AccountSessionStorage {
  const binding = [realpathSync(home), config.environmentId, config.authOrigin, config.applicationId, config.clientId, config.productOrigin];
  const reference = `molis.account.session.v1.${createHash("sha256").update(JSON.stringify(binding)).digest("hex")}`;
  const secrets = createLazyFileSecretStore(home);
  return {
    read() {
      try {
        const text = secrets.get(reference);
        if (text === null) return null;
        if (text.length > 64_000) throw accountErrors.unavailable("Account session storage is invalid");
        return JSON.parse(text);
      } catch { throw accountErrors.unavailable("Account session storage could not be read"); }
    },
    write(record) {
      try {
        const text = JSON.stringify(record);
        if (text === undefined || text.length > 64_000) throw accountErrors.unavailable("Account session storage is invalid");
        secrets.put(reference, text);
      } catch { throw accountErrors.unavailable("Account session storage could not be saved"); }
    },
  };
}
