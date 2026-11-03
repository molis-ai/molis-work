import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ActionCallContext, ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
export interface ProjectScope { id: string; title: string; goal_ids: string[]; artifacts: ArtifactReference[] }
export interface ProgressCommand { command_id: string; project_id: string; goal_id: string; cursor: number; summary: string; next_step: string; next_actor: string }
export interface BoundActions { client: ActionClient; caller: ActionCallContext }
export type ActionFactory = (input: { projectId: string; memberId: string; validate: () => void; signal: AbortSignal }) => BoundActions;
export interface GoalProjection { goal_id: string; title: string; outcome: string; status: string; cursor: number; can_record: boolean; summary: string; next_step: string; next_actor: string; updated_at: string | null }
/** What continuity reads of `goals.state.read@1` and of the `goals.progress.*` results: only the fields it shows or returns. */
export interface GoalStateFacts {
  intent: { title: string }; agreement: { outcome: string }; work_status: string; goal_event_cursor: number; can_record: boolean;
  progress_summary: { summary: string; next_step: string | null; next_actor: string | null; recorded_at: string } | null;
}
export interface GoalProgressFacts { event_id: string; replayed: boolean }
export type { ArtifactVersionRecord };
