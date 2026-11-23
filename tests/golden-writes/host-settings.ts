import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The Host only serves its pages to an account Home with a signed-in session, and a golden Home never signs in: root Home only. */
export const webSurface = true;

/** The Host's versioned settings files, each through the page entry that writes it: config/mcp-tools.json, browser/sites.json, config/onboarding.json, and config/project-arrival.json by arriving at the project's page. */
export default async function ({ http, projectId, tag }: GoldenWriteContext) {
  const path = "/api/settings/mcp/actions", action = { client_id: "agent:prologue", project_id: projectId, capability_id: "goals.create", version: 1, provider_id: "io.molis.work.goals" };
  const seen = await http(`${path}?client_id=agent%3Aprologue&project_id=${encodeURIComponent(projectId)}`, { method: "GET" });
  const grant = (seen as { grants: Array<{ capability_id: string; version: number; provider_id: string; generation: string }> }).grants
    .find(row => row.capability_id === action.capability_id && row.version === action.version && row.provider_id === action.provider_id);
  const saved = await http(path, { body: { ...action, enabled: true, expected: grant ? { expected_generation: grant.generation } : { expected_absent: true } } });
  await http(path, { body: { ...action, enabled: false, expected: { expected_generation: (saved as { generation: string }).generation } } });
  const scope = `https://${tag}.golden.invalid`;
  readsBack(await http("/api/browser/sites", { body: { scope, decision: "allow" } }), scope);
  await http("/api/onboarding/dismiss", { body: { kind: "first_run", user_confirmed: true } });
  await http("/locale?lang=en&next=/settings/appearance", { method: "GET" });
  await http(`/projects/${encodeURIComponent(projectId)}/`, { method: "GET" });
  readsBack(await http("/", { method: "GET" }), projectId);
  if (process.platform === "darwin") {
    const bundle_id = `io.molis.work.golden.${tag}`;
    readsBack(await http("/api/computer/forbidden", { body: { bundle_id, name: "金样应用" } }), bundle_id);
  }
}
