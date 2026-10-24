import type { AgentSessionRef, AgentStartRequest, AgentTextMaterial, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID, type AssistantMaterial } from "@molis-ai/molis-work-contracts/services/assistant";
import type { HostOfferedOriginalInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";
import type { StoredWork } from "./assistant-store.js";

/**
 * Enough for a real piece of business work with its lookups, including a desktop task that needs about twenty steps
 * with a look and an action each; a round never runs unbounded (specs/computer-use §9, CU-G05).
 */
export const ROUND_TURNS = 60;
/** Whose a work's rounds are on the Host: its project's, or the person's own when it belongs to none. */
export const ownerOf = (work: StoredWork) => work.project_ref?.project_id ?? ASSISTANT_PERSONAL_OWNER;

/** A trusted send owner may attest only the exact ordinary input, before any derived materials are added. */
export function sentOriginal(input: AssistantSendInput, offered: Omit<HostOfferedOriginalInput, "action"> | undefined, writtenBy?: string) {
  if (!offered || writtenBy || input.written_by || input.reask !== undefined) return undefined;
  if (offered.install_id !== ASSISTANT_INSTALL_ID || offered.input_id !== input.request_id || offered.text !== input.text || offered.written_by !== "person")
    throw assistantErrors.invalid("发送原件与受理的本人输入不一致");
  return Object.freeze({ ...offered });
}

/**
 * What a round of `work` asks the Host for: whose it is, the session and role it runs as, what it is told and shown,
 * and how far it may go. The Host checks all of it again when it starts the round.
 */
export function roundStartInput(work: StoredWork, round: {
  actor_id: string; session: AgentSessionRef; role_id: string; task: string; text_materials: AgentTextMaterial[];
  materials: readonly AssistantMaterial[]; tokens_left?: number;
  original_input?: Omit<HostOfferedOriginalInput, "action">; continued_from?: AgentRunRef;
}): AgentStartRequest {
  const { materials } = round;
  return {
    project_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: round.actor_id,
    session: round.session, role_id: round.role_id, workspace: "business", task: round.task,
    action_gateway: !work.reply_target,
    text_materials: round.text_materials,
    ...(round.original_input ? { original_input: { input_id: round.original_input.input_id, text: round.original_input.text, written_by: round.original_input.written_by, occurred_at: round.original_input.occurred_at } } : {}),
    ...(round.continued_from ? { continued_from: round.continued_from } : {}),
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
