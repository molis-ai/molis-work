import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { GoalEventStateView, GoalEventProgressResult } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ActionCallContext, ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
export interface ProjectScope { id: string; title: string; goal_ids: string[]; artifacts: ArtifactReference[] }
export interface ProgressCommand { command_id: string; project_id: string; goal_id: string; cursor: number; revision: number; summary: string; next_step: string; next_actor: string }
export interface BoundActions { client: ActionClient; caller: ActionCallContext }
export type ActionFactory = (input: { projectId: string; memberId: string; validate: () => void; signal: AbortSignal }) => BoundActions;
export interface GoalProjection { goal_id: string; title: string; outcome: string; status: string; cursor: number; revision: number; can_record: boolean; summary: string; next_step: string; next_actor: string; updated_at: string | null }
export interface GoalContractView { goal: { current_contract_revision: number } }
export type { ArtifactReference, ArtifactVersionRecord, GoalEventStateView, GoalEventProgressResult };
