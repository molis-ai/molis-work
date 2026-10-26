import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { HomeConsentLedger } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { consentSubject, pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";

/** The person takes back the agreement that keeps Goals in every project (ac-trust T5); a project made after this has no Goals. */
export function takeBackGoals(home: string): void {
  const goals = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === "goals")!.manifest;
  const ledger = new HomeConsentLedger(home);
  // The Host records the agreement the first time it starts a project's plugins; either way there is one live row to take back.
  ledger.record({ plugin_id: goals.plugin_id, publisher_signature: goals.publisher.signature, manifest_digest: pluginManifestDigest(goals),
    granted_by: "host_build", grants: [{ kind: "always_on", subject: consentSubject.alwaysOn() }], at: "2026-10-24T00:00:00.000Z" });
  for (const agreement of ledger.consents(goals.plugin_id).filter(row => row.kind === "always_on" && row.revoked_at === null)) ledger.revoke(agreement.consent_id, "2026-10-25T00:00:00.000Z");
}

/** A project made after the agreement was taken back: it has no Goals. */
export async function createProjectWithoutGoals(home: string, name = "没有 Goals") {
  takeBackGoals(home);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  try { return await catalog.createProject({ display_name: name, actor_id: "browser-test" }); } finally { catalog.close(); }
}
