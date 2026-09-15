import type { LegacyGovernanceSnapshot, GoalTreeProposalRecord, GoalTreeProposalItemRecord } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

/** Read-only compatibility projection; never rewrites historical receipts or confirms a new proposal. */
export function legacyProposalView(snapshot: LegacyGovernanceSnapshot): GoalTreeProposalRecord[] {
  const stateFromLegacy = (state: string): GoalTreeProposalRecord["state"] => {
    if (state === "pending" || state === "superseded" || state === "approved" || state === "rejected" || state === "dismissed") {
      return state;
    }
    if (state === "confirmed") return "approved";
    if (state === "applied") return "approved";
    return "closed";
  };
  const itemStateFromLegacy = (state: string): GoalTreeProposalItemRecord["state"] => {
    if (state === "pending" || state === "superseded" || state === "approved" || state === "rejected" || state === "dismissed") {
      return state;
    }
    if (state === "confirmed") return "approved";
    if (state === "applied") return "applied";
    return "pending";
  };
  const contractProposals = snapshot.contract_proposals.map((proposal): GoalTreeProposalRecord => {
    const sourceRefs = [...new Set(proposal.field_sources.flatMap((field) => field.source_refs))].sort();
    return {
      proposal_id: `legacy-contract-proposal:${proposal.proposal_id}`,
      board_id: proposal.board_id,
      origin: "legacy_contract_proposal",
      root_goal_id: proposal.goal_id,
      submitted_by: proposal.submitted_by,
      discovered_in_run_id: proposal.discovered_in_run_id,
      submitted_session_id: null,
      state: stateFromLegacy(proposal.state),
      version: 1,
      supersedes_proposal_id: null,
      base_event_cursor: 0,
      summary: `历史 Contract Proposal：${proposal.proposed_goal.title || proposal.goal_id}`,
      narrative: null,
      decision: proposal.decision,
      created_at: proposal.created_at,
      updated_at: proposal.decided_at ?? proposal.created_at,
      decided_at: proposal.decided_at,
      items: [
        {
          item_id: `legacy-contract-proposal-item:${proposal.proposal_id}`,
          proposal_id: `legacy-contract-proposal:${proposal.proposal_id}`,
          board_id: proposal.board_id,
          ordinal: 1,
          kind: "contract",
          operation: "update",
          payload: {
            proposed_goal: proposal.proposed_goal,
            field_sources: proposal.field_sources,
            review_policy: proposal.review_policy,
            proposed_impacts: proposal.proposed_impacts,
            proposed_risks: proposal.proposed_risks,
            dependency_rewire_ids: proposal.dependency_rewire_ids,
          },
          source_refs: sourceRefs.length > 0 ? sourceRefs : [`legacy-contract-proposal:${proposal.proposal_id}`],
          reason: "从历史 Contract Proposal 无损映射",
          explanation: null,
          confidence: proposal.field_sources.length === 0
            ? 1
            : Math.min(...proposal.field_sources.map((field) => field.confidence)),
          affected_objects: [{ object_type: "goal", object_id: proposal.goal_id }],
          baseline_versions: [],
          requires_user_confirmation: true,
          state: itemStateFromLegacy(proposal.state),
          conflict: null,
          decision: null,
          materialized_objects: [],
          revision_proposal_id: null,
          supersedes_item_id: null,
          created_at: proposal.created_at,
          updated_at: proposal.decided_at ?? proposal.created_at,
        },
      ],
      decisions: [],
    };
  });
  const candidates = snapshot.candidates.map((candidate): GoalTreeProposalRecord => ({
    proposal_id: `legacy-candidate:${candidate.candidate_id}`,
    board_id: candidate.board_id,
    origin: "legacy_candidate",
    root_goal_id: null,
    submitted_by: candidate.submitted_by,
    discovered_in_run_id: candidate.discovered_in_run_id,
    submitted_session_id: null,
    state: stateFromLegacy(candidate.state),
    version: 1,
    supersedes_proposal_id: null,
    base_event_cursor: 0,
    summary: `历史 Candidate：${candidate.proposed_goal.title || candidate.candidate_id}`,
    narrative: null,
    decision: candidate.decision,
    created_at: candidate.created_at,
    updated_at: candidate.decided_at ?? candidate.created_at,
    decided_at: candidate.decided_at,
    items: [
      {
        item_id: `legacy-candidate-item:${candidate.candidate_id}`,
        proposal_id: `legacy-candidate:${candidate.candidate_id}`,
        board_id: candidate.board_id,
        ordinal: 1,
        kind: "candidate",
        operation: "create",
        payload: {
          proposed_goal: candidate.proposed_goal,
          proposed_relations: candidate.proposed_relations,
          proposed_impacts: candidate.proposed_impacts,
          proposed_risks: candidate.proposed_risks,
          blocking_mode: candidate.blocking_mode,
        },
        source_refs: [`legacy-candidate:${candidate.candidate_id}`],
        reason: "从历史 Candidate 无损映射",
        explanation: null,
        confidence: 1,
        affected_objects: [{ object_type: "candidate", object_id: candidate.candidate_id }],
        baseline_versions: [],
        requires_user_confirmation: true,
        state: itemStateFromLegacy(candidate.state),
        conflict: null,
        decision: null,
        materialized_objects: [],
        revision_proposal_id: null,
        supersedes_item_id: null,
        created_at: candidate.created_at,
        updated_at: candidate.decided_at ?? candidate.created_at,
      },
    ],
    decisions: [],
  }));
  const rewires = snapshot.rewires.map((rewire): GoalTreeProposalRecord => ({
    proposal_id: `legacy-rewire:${rewire.rewire_id}`,
    board_id: rewire.board_id,
    origin: "legacy_rewire",
    root_goal_id: rewire.proposal.formal_goal_id ?? null,
    submitted_by: String(rewire.proposal.submitted_by ?? "legacy-runtime"),
    discovered_in_run_id: rewire.proposal.discovered_in_run_id ?? null,
    submitted_session_id: null,
    state: stateFromLegacy(rewire.state),
    version: 1,
    supersedes_proposal_id: null,
    base_event_cursor: 0,
    summary: `历史 Rewire：${rewire.rewire_id}`,
    narrative: null,
    decision: {
      legacy_state: rewire.state,
      impact: rewire.impact,
      superseded_by_goal_tree_proposal_id:
        typeof rewire.impact.superseded_by_goal_tree_proposal_id === "string"
          ? rewire.impact.superseded_by_goal_tree_proposal_id
          : null,
    },
    created_at: rewire.created_at,
    updated_at: rewire.decided_at ?? rewire.created_at,
    decided_at: rewire.decided_at,
    items: [
      {
        item_id: `legacy-rewire-item:${rewire.rewire_id}`,
        proposal_id: `legacy-rewire:${rewire.rewire_id}`,
        board_id: rewire.board_id,
        ordinal: 1,
        kind: "rewire",
        operation: "update",
        payload: rewire.proposal,
        source_refs: [`legacy-rewire:${rewire.rewire_id}`],
        reason: "从历史 Rewire 无损映射",
        explanation: null,
        confidence: 1,
        affected_objects: [{ object_type: "rewire", object_id: rewire.rewire_id }],
        baseline_versions: [],
        requires_user_confirmation: true,
        state: itemStateFromLegacy(rewire.state),
        conflict: null,
        decision: null,
        materialized_objects: [],
        revision_proposal_id: null,
        supersedes_item_id: null,
        created_at: rewire.created_at,
        updated_at: rewire.decided_at ?? rewire.created_at,
      },
    ],
    decisions: [],
  }));
  return [...contractProposals, ...candidates, ...rewires];
}

