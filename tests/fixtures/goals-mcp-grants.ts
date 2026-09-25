import { molisWorkHostProjectReference, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { createMcpActionGrant } from "../../apps/local-host/src/mcp-action-grants.js";
import { writeMcpActionGrant } from "../../apps/local-host/src/mcp-settings-store.js";

/** Explicit authorization for isolated fixtures; production never infers grants from tool switches. */
export async function grantGoalsMcp(host: MolisWorkLocalHost | null, home: string,
  project: { project_id: string; board_id: string; database_path: string }, clientId = "runtime:codex") {
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, boardId: project.board_id, databasePath: project.database_path });
  const owner = host ?? new MolisWorkLocalHost();
  try {
    const views = await owner.inspectActions({ actor_id: clientId, project_id: project.project_id, audience: "mcp", permissions: [] }, reference);
    for (const view of views.filter(view => Object.values(goalsActions).some(action => action.capability_id === view.capability_id))) {
      await writeMcpActionGrant(home, createMcpActionGrant(clientId, project.project_id, view, true));
    }
  } finally { if (!host) await owner.close(); }
}
