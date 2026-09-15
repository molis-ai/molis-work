/** Public root SDK aliases. Authoritative definitions belong to the named owner. */
export type DefinitionState = import("@molis-ai/molis-work-contracts/modules/goals").GoalDefinitionState;
export type DecompositionState = import("@molis-ai/molis-work-contracts/modules/goals").GoalDecompositionState;
export type ValidityState = import("@molis-ai/molis-work-contracts/modules/goals").GoalValidityState;
export type FulfillmentState = import("@molis-ai/molis-work-contracts/modules/goals").GoalFulfillmentState;
export type ClaimRole = import("@molis-ai/molis-work-contracts/modules/execution").ExecutionClaimRole;
export type ClaimState = import("@molis-ai/molis-work-contracts/modules/execution").ExecutionClaimState;
export type GoalDisplayStatus = import("@molis-ai/molis-work-plugin-goals").GoalDisplayStatus;
export type ImpactAccess = import("@molis-ai/molis-work-contracts/modules/goals").ImpactAccess;
export type RiskBlockingMode = import("@molis-ai/molis-work-contracts/modules/goals").RiskBlockingMode;
export type GoalMode = import("@molis-ai/molis-work-contracts/modules/goals").GoalPolicy["goal_mode"];
export type ProjectGuidanceKind = import("@molis-ai/molis-work-contracts/modules/goals").ProjectGuidanceKind;
export type ProjectGuidanceEntryRecord = import("@molis-ai/molis-work-contracts/modules/goals").ProjectGuidanceEntryRecord;
export type ProjectGuidanceChangeKind = import("@molis-ai/molis-work-contracts/modules/goals").ProjectGuidanceRevisionRecord["change_kind"];
export type ProjectGuidanceRevisionRecord = import("@molis-ai/molis-work-contracts/modules/goals").ProjectGuidanceRevisionRecord;
export type ProjectGuidanceView = import("@molis-ai/molis-work-contracts/modules/goals").ProjectGuidanceView;
export type AddProjectGuidanceInput = import("@molis-ai/molis-work-contracts/modules/goals").AddProjectGuidanceInput;
export type AddProjectGuidanceResult = import("@molis-ai/molis-work-contracts/modules/goals").AddProjectGuidanceResult;
export type UpdateProjectGuidanceInput = import("@molis-ai/molis-work-contracts/modules/goals").UpdateProjectGuidanceInput;
export type UpdateProjectGuidanceResult = import("@molis-ai/molis-work-contracts/modules/goals").UpdateProjectGuidanceResult;
export type AcceptanceCriterion = import("@molis-ai/molis-work-contracts/modules/goals").GoalAcceptanceCriterion;
export type GoalRecord = import("@molis-ai/molis-work-contracts/modules/goals").GoalRecord;
export type GoalRelationRecord = import("@molis-ai/molis-work-contracts/modules/goals").GoalRelationRecord;
export type GoalTrashStatus = import("@molis-ai/molis-work-contracts/modules/goals").GoalTrashStatus;
export type GoalTrashResult = import("@molis-ai/molis-work-contracts/modules/goals").GoalTrashResult;

export type ImpactBindingRecord = import("@molis-ai/molis-work-contracts/modules/goals").ImpactBindingRecord;

export type RiskRecord = import("@molis-ai/molis-work-contracts/modules/goals").RiskRecord;
export type GoalPolicy = import("@molis-ai/molis-work-contracts/modules/goals").GoalPolicy;
export type TaskContext = import("@molis-ai/molis-work-contracts/modules/goals").GoalTaskContext;
export type LegacyProductContext = import("@molis-ai/molis-work-contracts/modules/goals").GoalLegacyProductContext;
export type DecompositionReview = import("@molis-ai/molis-work-contracts/modules/goals").GoalDecompositionReview;
export type LeafReadiness = import("@molis-ai/molis-work-contracts/modules/goals").GoalLeafReadiness;
export type ClaimRecord = import("@molis-ai/molis-work-contracts/modules/execution").ExecutionClaimRecord;
export type RunRecord = import("@molis-ai/molis-work-contracts/modules/execution").ExecutionRunRecord;

export type EvidenceRecord =
  import("@molis-ai/molis-work-contracts/modules/evidence-verification").EvidenceRecord;
export type EvidenceCorrectionRecord =
  import("@molis-ai/molis-work-contracts/modules/evidence-verification").EvidenceCorrectionRecord;

export type ReviewObligationRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ReviewObligationRecord;
export type ReviewRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ReviewRecord;

export type ContractRevisionEffect = import("@molis-ai/molis-work-contracts/modules/goals").GoalContractRevisionEffect;

export type GoalContractRevisionRecord = import("@molis-ai/molis-work-contracts/modules/goals").GoalContractRevisionRecord;

export type GoalRiskLinkRecord = import("@molis-ai/molis-work-contracts/modules/goals").GoalRiskLinkRecord;

export type CoverageContractRevisionRecord = import("@molis-ai/molis-work-contracts/modules/goals").CoverageContractRevisionRecord;

export type GoalLifecycleEventRecord = import("@molis-ai/molis-work-plugin-goals").BoardSnapshot["lifecycle_events"][number];

export type DependencyProposalBasis =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").DependencyProposalBasis;
export type DependencyProposal =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").DependencyProposal;

export type ContractFieldName =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ContractFieldName;
export type ContractFieldSource =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ContractFieldSource;
export type ContractProposalImpact =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ContractProposalImpact;
export type ContractProposalRisk =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ContractProposalRisk;
export type ContractProposalRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ContractProposalRecord;

/**
 * Dialogue facts live beside, rather than inside, the canonical Goal
 * Contract. They let the current Runtime resume a Draft conversation without
 * treating an inference or an unapproved structure as settled Goal truth.
 */
export type ClarificationSessionState = import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ClarificationSessionState;

export type ClarificationFact = import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ClarificationFact;

export type ClarificationAssumption = import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ClarificationAssumption;

export type ClarificationSessionRecord = import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ClarificationSessionRecord;

export type ClarificationTurnRecord = import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ClarificationTurnRecord;

/**
 * A proposed Goal Tree is deliberately separate from canonical Goals. It can
 * describe a whole family of changes while the user is still deciding what
 * should become real.
 */
export type GoalTreeProposalOrigin =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalOrigin;
export type GoalTreeProposalState =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalState;
export type GoalTreeProposalItemKind =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemKind;
export type GoalTreeProposalOperation =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalOperation;
export type GoalTreeProposalItemState =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemState;
export type GoalTreeProposalDecisionAction =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalDecisionAction;
export type GoalTreeProposalDecisionState =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalDecisionState;
export type ProposalAffectedObjectType =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ProposalAffectedObjectType;
export type ProposalAffectedObject =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ProposalAffectedObject;
export type ProposalObjectVersion =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").ProposalObjectVersion;

/**
 * The user decision audit is recorded separately from the Runtime that
 * carried it over MCP. A local Runtime can attest that the user explicitly
 * confirmed in the current dialogue; this is auditable provenance, not a
 * cryptographic trust boundary.
 */
export type GoalTreeProposalDecisionAuthority =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalDecisionAuthority;
export type GoalTreeProposalDecisionRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalDecisionRecord;
export type GoalTreeProposalNarrative =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalNarrative;
export type GoalTreeProposalItemExplanation =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemExplanation;

export type GoalTreeProposalItemRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemRecord;
export type GoalTreeProposalRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalRecord;

export type GoalTreeProposalItemInput =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemInput;
export type GoalTreeProposalSubmitInput =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalSubmitInput;
export type GoalTreeProposalCheckInput =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalCheckInput;
export type GoalTreeProposalItemDecisionInput =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalItemDecisionInput;
export type GoalTreeProposalDecideInput =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").GoalTreeProposalDecideInput;

export type CandidateGoalRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").CandidateGoalRecord;
export type RewireRecord =
  import("@molis-ai/molis-work-contracts/modules/governance-collaboration").RewireRecord;

export type BoardSnapshot = import("@molis-ai/molis-work-plugin-goals").BoardSnapshot;

export type GoalContractView = import("@molis-ai/molis-work-plugin-goals").GoalContractView;

export type CreateGoalInput = import("@molis-ai/molis-work-contracts/modules/goals").CreateGoalInput;

export { DEFAULT_GOAL_POLICY } from "@molis-ai/molis-work-module-goals";
