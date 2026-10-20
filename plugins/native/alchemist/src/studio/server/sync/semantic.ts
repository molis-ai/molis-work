import {z} from 'zod';
import type {SqliteDatabase} from '../db/open-database.js';
import {SqliteDirectionRepository} from '../db/direction-repository.js';
import {SqliteExplorationRepository} from '../db/exploration-repository.js';
import {SqliteIdeaRepository} from '../db/idea-repository.js';
import {SqliteResearchRepository} from '../db/research-repository.js';
import {SqlitePulseRepository} from '../db/pulse-repository.js';
import {SqliteCalibrationRepository} from '../db/calibration-repository.js';
import {SqliteMemoryRepository} from '../db/memory-repository.js';
import {SqliteConversationRepository} from '../db/conversation-repository.js';
import {SqliteDecisionRepository} from '../db/decision-repository.js';
import {alchemistOperations as a,directionSchema,explorationSchema,ideaSchema,ideaVersionSchema,researchPlanSchema,lensRunSchema} from '../../shared/contracts/actions.js';
import {lensReportSchema,evidenceSchema} from '../../shared/contracts/research.js';
import {reuseSnapshotSchema,reuseMethodSchema,reuseFeedbackSchema} from '../../../work-reuse/contracts.js';
import type {StudioContentGraph} from './content-tables.js';
import {invalidStudio,studioObject} from './shape.js';
import {validateStudioRelationships} from './relationships.js';

/** Read through the original owner mappers, then validate the exact current contracts before committing a restore. */
export function validateStudioSaved(db:SqliteDatabase,g:StudioContentGraph):void{
 const directions=new SqliteDirectionRepository(db),explorations=new SqliteExplorationRepository(db),ideas=new SqliteIdeaRepository(db),research=new SqliteResearchRepository(db),pulse=new SqlitePulseRepository(db),calibration=new SqliteCalibrationRepository(db),memory=new SqliteMemoryRepository(db);
 for(const r of g.directions!)directionSchema.parse(directions.get(String(r.id)));
 for(const r of g.exploration_runs!)explorationSchema.parse(explorations.get(String(r.id)));
 for(const r of g.ideas!)ideaSchema.parse(ideas.getIdea(String(r.id)));
 for(const r of g.idea_versions!)ideaVersionSchema.parse(ideas.getVersion(String(r.idea_id),Number(r.version)));
 for(const r of g.mvp_scope_versions!)for(const key of ['in_scope_json','out_of_scope_json','platform_assumptions_json','integration_assumptions_json'])z.array(z.string()).parse(JSON.parse(String(r[key])));
 for(const r of g.research_plans!)researchPlanSchema.parse(research.getPlan(String(r.id)));
 for(const r of g.lens_runs!)lensRunSchema.parse(research.getRun(String(r.id)));
 for(const r of g.lens_reports!){lensReportSchema.parse(research.getReport(String(r.id)));for(const e of research.listEvidence(String(r.id)))evidenceSchema.parse(e);}
 for(const r of g.evidence!)if(!g.lens_runs!.some(run=>run.id===r.run_id))invalidStudio();
 a.conversationList.output.parse({messages:new SqliteConversationRepository(db).list('workspace-local')});
 for(const r of g.decisions!)a.decisionCreate.output.parse({decision:new SqliteDecisionRepository(db).get(String(r.id))});
 for(const r of g.annotations!)a.annotationCreate.output.parse({annotation:calibration.getAnnotation(String(r.id))});
 for(const r of g.action_proposals!){const stored=calibration.getProposal(String(r.id))!;a.proposalReject.output.parse({proposal:stored.proposal});if(stored.proposal.action==='create_playbook_rule')playbookPayload.parse(stored.payload);}
 for(const r of g.taste_rules!)a.tasteCreate.output.parse({rule:memory.getTasteRule(String(r.id))});
 for(const r of g.research_playbook_rules!)a.playbookDisable.output.parse({rule:memory.getPlaybookRule(String(r.id))});
 for(const r of g.pulse_runs!){a.pulseStart.output.parse({run:pulse.getRun(String(r.id))});a.pulseReports.output.shape.reports.element.shape.signals.parse(pulse.listSignals(String(r.id)));}
 a.pulseReports.output.parse({reports:pulse.listReports().map(report=>({report,opportunities:pulse.listOpportunities(report.id),signals:pulse.listSignals(report.runId)}))});
 for(const r of g.research_playbook_revisions!){const rule=studioObject(JSON.parse(String(r.snapshot_json)));a.playbookDisable.output.parse({rule});if(rule.id!==r.rule_id||rule.version!==r.version)invalidStudio();}
 for(const r of g.memory_rule_applications!)if(r.method_snapshot_json!==null){const m=reuseMethodSchema.parse(JSON.parse(String(r.method_snapshot_json)));if(m.id!==r.rule_id||m.version!==r.rule_version)invalidStudio();}
 for(const r of g.work_reuse_receipts!){const snapshot=reuseSnapshotSchema.parse(JSON.parse(String(r.snapshot_json)));if(snapshot.actorId!==r.actor_id||!['pending','recorded','not_needed'].includes(String(r.relation_state)))invalidStudio();if(r.feedback_json!==null)reuseFeedbackSchema.omit({planId:true}).parse(JSON.parse(String(r.feedback_json)));}
 validateStudioRelationships(g);
}
const id=z.string().min(1),strings=z.array(z.string().min(1));
const playbookPayload=z.strictObject({originalFeedback:id,methodChange:id,positiveExamples:strings,negativeExamples:strings,scope:z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('report'),reportId:id}),z.strictObject({kind:z.literal('direction'),directionId:id}),z.strictObject({kind:z.literal('global_market_space')})])});
