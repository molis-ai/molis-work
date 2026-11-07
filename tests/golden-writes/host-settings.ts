import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** The Host's versioned settings files, each through the page entry that writes it: config/mcp-tools.json, browser/sites.json, config/onboarding.json. */
export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  await http("/api/settings/mcp/actions", { body: { client_id: "agent:prologue", project_id: projectId, capability_id: "goals.create", version: 1, provider_id: "io.molis.work.goals", enabled: true } });
  const scope = `https://${tag}.golden.invalid`;
  readsBack(await http("/api/browser/sites", { body: { scope, decision: "allow" } }), scope);
  await http("/api/onboarding/dismiss", { body: { kind: "first_run", user_confirmed: true } });
}
