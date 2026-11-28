import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { seedDemoGoals as seedProjectSamples } from "@molis-ai/molis-work-app-local-host";

// The seeded test project keeps the samples it had before batch 109-1 (user 2026-11-27): Feed is installed there, but its samples are left
// out, as they were while Feed had a Home half the seed passed over. The demo project a person opens still gets Feed's samples on first
// open. Tests about those samples seed them through the Host's `seedDemoGoals` itself.
export const FIXTURE_UNSEEDED_PLUGINS: readonly string[] = [FEED_PLUGIN_ID];

export function seedDemoGoals(databasePath: string, projectId?: string): Promise<void> {
  return seedProjectSamples(databasePath, projectId, { leaveOut: FIXTURE_UNSEEDED_PLUGINS });
}
