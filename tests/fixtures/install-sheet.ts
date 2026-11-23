import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { HomeConsentLedger } from "@molis-ai/molis-work-app-local-host";
import { newPublisher, signedPackage } from "./sandbox-package.js";

// What the two halves of S-package-install-sheet share (tests/security-invariants-package-install-sheet.test.ts for the Host's route,
// its .e2e twin for the shell's sheet): one signed package asking for a site and a key, and a publisher the person has pinned.

export const SHEET_PLUGIN_ID = "com.example.sheet";
export const SHEET_KEY_VALUE = "fixture-key-value-for-install-sheet";

/** The notes package asking for a site and a key, which the Host projects as two optional switches (`network:request`, `secret:use`). */
export const sheetPackage = (publisher = newPublisher(), version = "1.0.0", more: (contract: SandboxPluginContract) => void = () => undefined): PluginPackageBundle =>
  signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.list")!.effects = { storage: ["read"], networkDomains: ["api.example.test"], secretRefs: ["calendar-key"] };
    more(contract);
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    if (version !== "1.0.0") manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
  }, { pluginId: SHEET_PLUGIN_ID, version });

/** The person's pin of a publisher, as importing its first package in the settings leaves it. */
export const pinSheetPublisher = (home: string, publisher: ReturnType<typeof newPublisher>, label = "Sheet publisher") =>
  new HomeConsentLedger(home).pinPublisher({ key_id: publisher.identity, public_key_spki_base64: publisher.signer.public_key_spki_base64, label, pinned_at: new Date().toISOString(), pinned_by: "test" });
