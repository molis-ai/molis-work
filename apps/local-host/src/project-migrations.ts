import { PROJECT_RECOVERY_COLUMNS, type ProjectRecoveryDetails } from './project-recovery-details.js';
import {
  type LocalSqliteStorage,
  LOCAL_JOURNAL_SCHEMA_SQL,
  SqliteSchema,
} from "@molis-ai/molis-work-storage";
import {
  GOAL_BOARDS_SCHEMA_SQL,
  GOAL_EVENT_FACTS_SCHEMA_SQL,
  GOALS_SCHEMA_SQL,
  migrateRiskTreatmentPlan,
  migrateProjectGuidance,
  migrateProjectGuidanceRevisions,
  migrateGoalContractRevisionColumn,
  backfillGoalContractRevisions,
} from "@molis-ai/molis-work-module-goals";
import {
  GOAL_INPUT_BINDINGS_SCHEMA_SQL,
  GOAL_IMPACTS_SCHEMA_SQL,
  migrateGoalImpactHistory,
} from "@molis-ai/molis-work-module-goals";
import {
  ARTIFACTS_SCHEMA_SQL,
  migrateArtifactsSchema,
  type ArtifactsSqliteDatabase,
} from "@molis-ai/molis-work-module-artifacts";
import {
  EVIDENCE_SCHEMA_SQL,
  evidenceCorrectionsMigrationRequired,
  migrateEvidenceContractRevisionColumns,
  migrateEvidenceCorrections,
  migrateEvidenceLocatorSource,
  migrateEvidenceLocatorValidation,
  migrateEvidenceLocatorWorkspace,
  type EvidenceMigrationDatabase,
} from "@molis-ai/molis-work-module-evidence-verification";
import {
  EXECUTION_SCHEMA_SQL,
  migrateClarifierRoles,
  migrateExecutionActionColumns,
  migrateReviewerRunRoles,
  migrateUnifiedClaimRolesAndExclusivity,
  type ExecutionMigrationDatabase,
} from "@molis-ai/molis-work-module-execution";
import {
  GOVERNANCE_SCHEMA_SQL,
  CLARIFICATION_SCHEMA_SQL,
  migrateClarificationDialogue,
  governanceLegacySupersessionMigrationRequired,
  governanceNarrativeMigrationRequired,
  migrateContractProposals,
  migrateGoalTreeLegacySupersession,
  migrateGoalTreeProposalDecisions,
  migrateGoalTreeProposalNarrative,
  migrateGoalTreeProposals,
  migrateReviewContractRevisionColumn,
  migrateRuntimeDialogueAuthority,
  migrateGoalEventTrustedDecisions,
  migrateGoalTreeSubmittedSession,
  type GovernanceSqliteDatabase,
} from "@molis-ai/molis-work-module-governance-collaboration";
import {
  migrateActiveGoalLifecycle,
  migrateGoalArchiveSchema,
  migrateGoalContractCoverageSchema,
  migrateGoalEventFactsSchema,
  migrateGoalEventStateSchema,
  migrateGoalEventOwnerContinueSource,
  migrateGoalEventAgreementChange,
  migrateGoalEventWorkflow,
  GOAL_EVENT_STATE_SCHEMA_SQL,
  ensureGoalEventRequirementSourceColumn,
  ensureGoalEventRequirementCurrentColumns,
  ensureGoalEventDecisionAuthorizationColumns,
  ensureGoalEventAgreementChangeColumns,
  migrateGoalLifecycleState,
  migratePlanningMethodPacksSchema,
  migrateGoalTrashSchema,
  type GoalLifecycleMigrationDatabase,
} from "@molis-ai/molis-work-module-goals";
import {
  migrateFeedTables,
  migrateInfoflowContractV2,
} from "./feed-migrations.js";

/** Recovery is deliberately fail-closed: only this owner's complete schema is supported. */
export class ProjectRecoveryError extends Error {
  constructor(readonly code: string, readonly details?: ProjectRecoveryDetails) { super(code); }
}
export function assertProjectRecoverySchema(storage: LocalSqliteStorage): void {
  const schema = new SqliteSchema(storage.db);
  const hasMigrations = schema.hasTable('schema_migrations');
  const rows = hasMigrations ? storage.db.prepare('SELECT migration_id FROM schema_migrations').all() as {migration_id:number}[] : [];
  // Retiring Task in migration 38 does not erase an already-applied migration 37.
  // New projects skip 37; upgraded projects may legitimately retain both entries.
  if (rows.some(row => !Number.isInteger(row.migration_id) || row.migration_id < 1 || row.migration_id > 38))
    throw new ProjectRecoveryError('project_recovery_unsupported_schema');
  // The current owner also has idempotent column/table upgrades outside numbered migrations.
  const details: ProjectRecoveryDetails = {
    missing_migration_ids: Array.from({length: 36}, (_, i) => i + 1).filter(id => !rows.some(row => row.migration_id === id)),
    missing_tables: hasMigrations ? [] : ['schema_migrations'],
    missing_columns: {},
  };
  for(const [table,names] of Object.entries(PROJECT_RECOVERY_COLUMNS)){
    if (!schema.hasTable(table)) { details.missing_tables.push(table); continue; }
    const present=new Set(schema.columns(table).map(c=>c.name));
    const missing = names.filter(name => !present.has(name));
    if (missing.length) details.missing_columns[table] = missing;
  }
  if (rows.filter(row => row.migration_id <= 36).length !== 36 || details.missing_tables.length || Object.keys(details.missing_columns).length)
    throw new ProjectRecoveryError('project_recovery_requires_migration', details);
  // The pinned legacy client cannot describe migration 38. Return the recovery
  // blocker without pretending its empty legacy checklist explains that gap.
  if (!rows.some(row => row.migration_id === 38))
    throw new ProjectRecoveryError('project_recovery_requires_migration');
}

/** Preserve the installed Project migration order while each Module owns its DDL. */
export function migrateLocalProjectDatabase(storage: LocalSqliteStorage): void {
    const schema = new SqliteSchema(storage.db);
    schema.initialize();
    const applied = schema.hasMigration(1);
    if (!applied) {
      storage.immediate(() => {
      storage.db.exec(`
        ${GOAL_BOARDS_SCHEMA_SQL}

        ${GOALS_SCHEMA_SQL}

        ${GOAL_INPUT_BINDINGS_SCHEMA_SQL}

        ${GOAL_IMPACTS_SCHEMA_SQL}

        ${EXECUTION_SCHEMA_SQL}

        ${EVIDENCE_SCHEMA_SQL}

        ${GOVERNANCE_SCHEMA_SQL}

        ${ARTIFACTS_SCHEMA_SQL}

        ${CLARIFICATION_SCHEMA_SQL}

        ${LOCAL_JOURNAL_SCHEMA_SQL}

        ${GOAL_EVENT_FACTS_SCHEMA_SQL}

        ${GOAL_EVENT_STATE_SCHEMA_SQL}
      `);
      schema.recordMigration(1, new Date().toISOString());
      schema.recordMigration(2, new Date().toISOString());
      schema.recordMigration(3, new Date().toISOString());
      schema.recordMigration(4, new Date().toISOString());
      schema.recordMigration(5, new Date().toISOString());
      schema.recordMigration(6, new Date().toISOString());
      schema.recordMigration(7, new Date().toISOString());
      schema.recordMigration(8, new Date().toISOString());
      schema.recordMigration(9, new Date().toISOString());
      schema.recordMigration(10, new Date().toISOString());
      schema.recordMigration(11, new Date().toISOString());
      schema.recordMigration(12, new Date().toISOString());
      schema.recordMigration(13, new Date().toISOString());
      schema.recordMigration(14, new Date().toISOString());
      schema.recordMigration(15, new Date().toISOString());
      schema.recordMigration(16, new Date().toISOString());
      schema.recordMigration(17, new Date().toISOString());
      schema.recordMigration(18, new Date().toISOString());
      schema.recordMigration(19, new Date().toISOString());
      schema.recordMigration(20, new Date().toISOString());
      schema.recordMigration(21, new Date().toISOString());
      migrateFeedTables(storage.db);
      schema.recordMigration(22, new Date().toISOString());
      schema.recordMigration(23, new Date().toISOString());
      schema.recordMigration(24, new Date().toISOString());
      schema.recordMigration(25, new Date().toISOString());
      schema.recordMigration(26, new Date().toISOString());
      schema.recordMigration(27, new Date().toISOString());
      migrateInfoflowContractV2(storage.db);
      schema.recordMigration(28, new Date().toISOString());
      schema.recordMigration(29, new Date().toISOString());
      schema.recordMigration(30, new Date().toISOString());
      schema.recordMigration(31, new Date().toISOString());
      schema.recordMigration(32, new Date().toISOString());
      schema.recordMigration(33, new Date().toISOString());
      schema.recordMigration(34, new Date().toISOString());
      schema.recordMigration(35, new Date().toISOString());
      schema.recordMigration(36, new Date().toISOString());
      schema.recordMigration(38, new Date().toISOString());
      });
      migrateGoalEventTrustedDecisions(storage.db as unknown as GovernanceSqliteDatabase);
      return;
    }

    const clarifierRolesApplied = schema.hasMigration(2);
    if (!clarifierRolesApplied) {
      migrateClarifierRoles(storage.db as unknown as ExecutionMigrationDatabase);
    }
    const contractProposalsApplied = schema.hasMigration(3);
    if (!contractProposalsApplied) {
      migrateContractProposals(storage.db as unknown as GovernanceSqliteDatabase);
    }
    const goalArchiveApplied = schema.hasMigration(4);
    if (!goalArchiveApplied) {
      migrateGoalArchiveSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const impactHistoryApplied = schema.hasMigration(5);
    if (!impactHistoryApplied) migrateGoalImpactHistory(storage.db, new Date().toISOString());
    const reviewerRunRolesApplied = schema.hasMigration(6);
    if (!reviewerRunRolesApplied) {
      migrateReviewerRunRoles(storage.db as unknown as ExecutionMigrationDatabase);
    }
    const unifiedClaimRolesApplied = schema.hasMigration(7);
    if (!unifiedClaimRolesApplied) {
      migrateUnifiedClaimRolesAndExclusivity(storage.db as unknown as ExecutionMigrationDatabase);
    }
    const clarificationDialogueApplied = schema.hasMigration(8);
    if (!clarificationDialogueApplied) migrateClarificationDialogue(storage.db);
    const goalTreeProposalsApplied = schema.hasMigration(9);
    if (!goalTreeProposalsApplied) {
      migrateGoalTreeProposals(storage.db as unknown as GovernanceSqliteDatabase);
    }
    const goalTreeProposalDecisionsApplied = schema.hasMigration(10);
    if (!goalTreeProposalDecisionsApplied) {
      migrateGoalTreeProposalDecisions(storage.db as unknown as GovernanceSqliteDatabase);
    }
    const goalTrashApplied = schema.hasMigration(11);
    if (!goalTrashApplied) {
      migrateGoalTrashSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const lifecycleReconciliationApplied = schema.hasMigration(12);
    if (!lifecycleReconciliationApplied) {
      migrateGoalLifecycleState(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const activeGoalLifecycleApplied = schema.hasMigration(13);
    if (!activeGoalLifecycleApplied) {
      migrateActiveGoalLifecycle(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const runtimeDialogueAuthorityApplied = schema.hasMigration(14);
    if (!runtimeDialogueAuthorityApplied) {
      migrateRuntimeDialogueAuthority(storage.db as unknown as GovernanceSqliteDatabase);
    }
    const riskTreatmentPlanApplied = schema.hasMigration(15);
    if (!riskTreatmentPlanApplied) migrateRiskTreatmentPlan(storage.db);
    const planningMethodPacksApplied = schema.hasMigration(16);
    if (!planningMethodPacksApplied) {
      migratePlanningMethodPacksSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    if (evidenceCorrectionsMigrationRequired(storage.db as unknown as EvidenceMigrationDatabase)) {
      migrateEvidenceCorrections(storage.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorValidationApplied = schema.hasMigration(18);
    if (!evidenceLocatorValidationApplied) {
      migrateEvidenceLocatorValidation(storage.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorWorkspaceApplied = schema.hasMigration(19);
    if (!evidenceLocatorWorkspaceApplied) {
      migrateEvidenceLocatorWorkspace(storage.db as unknown as EvidenceMigrationDatabase);
    }
    const evidenceLocatorSourceApplied = schema.hasMigration(20);
    if (!evidenceLocatorSourceApplied) {
      migrateEvidenceLocatorSource(storage.db as unknown as EvidenceMigrationDatabase);
    }
    const contractCoverageApplied = schema.hasMigration(21);
    const goalColumns = schema.columns("goals");
    const riskColumns = schema.columns("risks");
    if (
      !contractCoverageApplied ||
      !goalColumns.some((column) => column.name === "decomposition_review_json") ||
      !riskColumns.some((column) => column.name === "resolution_basis_json")
    ) {
      migrateGoalContractCoverageSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const feedWorkbenchApplied = schema.hasMigration(22);
    if (!feedWorkbenchApplied) {
      storage.immediate(() => {
        migrateFeedTables(storage.db);
        schema.recordMigration(22, new Date().toISOString());
      });
    }
    const feedSourcesApplied = schema.hasMigration(23);
    if (!feedSourcesApplied) {
      storage.immediate(() => {
        migrateFeedTables(storage.db);
        schema.recordMigration(23, new Date().toISOString());
      });
    }
    const feedReadStateApplied = schema.hasMigration(24);
    if (!feedReadStateApplied) {
      storage.immediate(() => {
        migrateFeedTables(storage.db);
        schema.recordMigration(24, new Date().toISOString());
      });
    }
    const projectGuidanceApplied = schema.hasMigration(25);
    const projectGuidanceTable = schema.hasTable("project_guidance_entries");
    if (!projectGuidanceApplied || !projectGuidanceTable) migrateProjectGuidance(storage.db);
    const projectGuidanceRevisionsApplied = schema.hasMigration(26);
    const projectGuidanceRevisionsTable = schema.hasTable("project_guidance_revisions");
    if (!projectGuidanceRevisionsApplied || !projectGuidanceRevisionsTable) {
      migrateProjectGuidanceRevisions(storage.db);
    }
    const goalTreeProposalNarrativeApplied = schema.hasMigration(27);
    if (
      !goalTreeProposalNarrativeApplied ||
      governanceNarrativeMigrationRequired(storage.db as unknown as GovernanceSqliteDatabase)
    ) migrateGoalTreeProposalNarrative(storage.db as unknown as GovernanceSqliteDatabase);
    const goalTreeLegacySupersessionApplied = schema.hasMigration(28);
    if (
      !goalTreeLegacySupersessionApplied ||
      governanceLegacySupersessionMigrationRequired(storage.db as unknown as GovernanceSqliteDatabase)
    ) migrateGoalTreeLegacySupersession(storage.db as unknown as GovernanceSqliteDatabase);
    const infoflowContractApplied = schema.hasMigration(29);
    const inboxEntriesTable = schema.hasTable("inbox_entries");
    const sourceColumns = schema.columns("feed_sources");
    if (
      !infoflowContractApplied
      || !inboxEntriesTable
      || !sourceColumns.some((column) => column.name === "schedule_json")
    ) migrateInfoflowContract(storage);
    const continuousActionModelApplied = schema.hasMigration(30);
    const currentGoalColumns = schema.columns("goals");
    if (
      !continuousActionModelApplied ||
      !currentGoalColumns.some((column) => column.name === "current_contract_revision")
    ) migrateContinuousActionModel(storage);
    const artifactsApplied = schema.hasMigration(31);
    const artifactsTable = schema.hasTable("artifacts");
    const artifactVersionsTable = schema.hasTable("artifact_versions");
    if (!artifactsApplied || !artifactsTable || !artifactVersionsTable) {
      migrateArtifactsSchema(storage.db as unknown as ArtifactsSqliteDatabase);
    }
    const goalEventFactsApplied = schema.hasMigration(32);
    const goalWorkEventsTable = schema.hasTable("goal_work_events");
    if (!goalEventFactsApplied || !goalWorkEventsTable) {
      migrateGoalEventFactsSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    ensureGoalEventRequirementSourceColumn(storage.db);
    ensureGoalEventRequirementCurrentColumns(storage.db);
    ensureGoalEventDecisionAuthorizationColumns(storage.db);
    ensureGoalEventAgreementChangeColumns(storage.db);
    const goalEventStateApplied = schema.hasMigration(33);
    const eventStateOwnersTable = schema.hasTable("goal_event_state_owners");
    if (!goalEventStateApplied || !eventStateOwnersTable) {
      migrateGoalEventStateSchema(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const ownerContinueApplied = schema.hasMigration(34);
    if (!ownerContinueApplied) {
      migrateGoalEventOwnerContinueSource(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    const agreementChangeApplied = schema.hasMigration(35);
    if (!agreementChangeApplied) {
      migrateGoalEventAgreementChange(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    migrateGoalTreeSubmittedSession(storage.db as unknown as GovernanceSqliteDatabase);
    const workflowApplied = schema.hasMigration(36);
    if (!workflowApplied) {
      migrateGoalEventWorkflow(storage.db as unknown as GoalLifecycleMigrationDatabase);
    }
    migrateGoalEventTrustedDecisions(storage.db as unknown as GovernanceSqliteDatabase);
    if (schema.hasTable("tasks")) {
      storage.immediate(() => {
        storage.db.exec("DROP TABLE IF EXISTS tasks");
      });
    }
    if (!schema.hasMigration(38)) {
      schema.recordMigration(38, new Date().toISOString());
    }
  }

function migrateContinuousActionModel(storage: LocalSqliteStorage): void {
    const schema = new SqliteSchema(storage.db);
    storage.immediate(() => {
      migrateGoalContractRevisionColumn(storage.db);
      migrateExecutionActionColumns(storage.db as unknown as ExecutionMigrationDatabase);
      migrateEvidenceContractRevisionColumns(storage.db as unknown as EvidenceMigrationDatabase);
      migrateReviewContractRevisionColumn(storage.db as unknown as GovernanceSqliteDatabase);
      backfillGoalContractRevisions(storage.db);
      schema.recordMigration(30, new Date().toISOString(), true);
    });
  }

function migrateInfoflowContract(storage: LocalSqliteStorage): void {
    const schema = new SqliteSchema(storage.db);
    storage.immediate(() => {
      migrateInfoflowContractV2(storage.db);
      schema.recordMigration(29, new Date().toISOString(), true);
    });
  }
