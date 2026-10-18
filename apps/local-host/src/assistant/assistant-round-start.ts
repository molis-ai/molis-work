import type { AgentSessionRef, AgentStartRequest, AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID, type AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import type { StoredWork } from "./assistant-store.js";

/** Enough for a real piece of business work with its lookups; a round never runs unbounded. */
export const ROUND_TURNS = 24;
/** Whose a work's rounds are on the Host: its project's, or the person's own when it belongs to none. */
export const ownerOf = (work: StoredWork) => work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER;

/**
 * What a round of `work` asks the Host for: whose it is, the session and role it runs as, what it is told and shown,
 * and how far it may go. The Host checks all of it again when it starts the round.
 */
export function roundStartInput(work: StoredWork, round: {
  actor_id: string; session: AgentSessionRef; role_id: string; task: string; text_materials: AgentTextMaterial[];
  materials: readonly AssistantMaterial[]; tokens_left?: number;
}): AgentStartRequest {
  const { materials } = round;
  return {
    project_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: round.actor_id,
    session: round.session, role_id: round.role_id, workspace: "business", task: round.task,
    action_gateway: !work.reply_target,
    text_materials: round.text_materials,
    // Pictures the person added: the runtime shows them to the model in this round (refused if the model cannot see).
    ...(materials.some(item => item.kind === "image") ? { image_materials: materials.filter(item => item.kind === "image" && item.image)
      .map(item => ({ material_id: item.material_id, title: item.title, resource: { id: item.image!.resource_id, revision: item.image!.revision }, media_type: item.image!.media_type })) } : {}),
    history: "session", queued: "carry", budget: { max_turns: ROUND_TURNS, ...(round.tokens_left === undefined ? {} : { max_total_tokens: round.tokens_left }) }, skills: [], mcp_tools: [], mcp_sources: [], session_title: work.title,
    // The project's side panel browser is the person's work surface: a work delegated in the background never drives it.
    ...(work.delegated_by || work.reply_target ? { browser: false as const } : {}),
    // The chosen Character really carries the round: the Host freezes its exact version or refuses, never another.
    ...(work.character ? { character: { artifact_id: work.character.artifact_id, version: work.character.version } } : {}),
  };
}
