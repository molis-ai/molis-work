import type {StudioContentGraph,StudioContentRow} from './content-tables.js';
import {invalidStudio,studioObject} from './shape.js';

/** Relationships not expressed by SQLite foreign keys, especially fixed versions and polymorphic references. */
export function validateStudioRelationships(g:StudioContentGraph):void{
 const by=(table:string,id:unknown):StudioContentRow=>{const row=g[table]!.find(r=>r.id===id);if(!row)invalidStudio();return row;};
 const version=(idea:unknown,n:unknown)=>{const row=g.idea_versions!.find(r=>r.idea_id===idea&&r.version===n);if(!row)invalidStudio();return row;};
 const scope=(idea:unknown,n:unknown)=>{const row=g.mvp_scope_versions!.find(r=>r.idea_id===idea&&r.version===n);if(!row)invalidStudio();return row;};
 const same=(a:StudioContentRow,b:StudioContentRow,fields:readonly string[])=>{if(fields.some(k=>a[k]!==b[k]))invalidStudio();};
 const lensKey=['idea_id','idea_version','mvp_scope_version','lens'];
 const target=(input:unknown)=>{const t=studioObject(input);if(t.kind==='idea_brief')version(t.objectId,t.revision);else if(t.kind==='lens_report'||t.kind==='pulse_report'){if(by(t.kind==='lens_report'?'lens_reports':'pulse_reports',t.objectId).revision!==t.revision)invalidStudio();}else invalidStudio();};
 for(const rows of Object.values(g))for(const r of rows)if('actor_id'in r)by('workspace_actors',r.actor_id);
 for(const r of g.research_playbook_revisions!)by('workspace_actors',studioObject(JSON.parse(String(r.snapshot_json))).actorId);
 for(const d of g.directions!){const source=studioObject(JSON.parse(String(d.source_json)));if(source.kind!==d.source_kind)invalidStudio();if(source.kind==='pulse_opportunity'){const o=by('opportunities',source.opportunityId);if(o.report_id!==source.pulseReportId||o.converted_direction_id!==d.id)invalidStudio();}}
 for(const idea of g.ideas!)version(idea.id,idea.current_version);
 for(const card of g.idea_cards!){if(by('exploration_runs',card.exploration_run_id).direction_id!==card.direction_id)invalidStudio();if(card.status==='kept'&&by('ideas',card.kept_idea_id).direction_id!==card.direction_id)invalidStudio();}
 for(const v of g.idea_versions!){const idea=by('ideas',v.idea_id),card=by('idea_cards',v.source_card_id);if(card.direction_id!==idea.direction_id||card.exploration_run_id!==v.source_exploration_run_id)invalidStudio();if(v.parent_version!==null&&(Number(v.parent_version)>=Number(v.version)||!version(v.idea_id,v.parent_version)))invalidStudio();}
 for(const s of g.mvp_scope_versions!)version(s.idea_id,s.idea_version);
 for(const p of g.research_plans!){version(p.idea_id,p.idea_version);if(p.mvp_scope_version!==null&&scope(p.idea_id,p.mvp_scope_version).idea_version!==p.idea_version)invalidStudio();}
 for(const run of g.lens_runs!){same(run,by('research_plans',run.plan_id),lensKey);if(by('jobs',run.job_id).kind!=='research.lens.v1')invalidStudio();}
 for(const run of g.pulse_runs!)if(by('jobs',run.job_id).kind!=='discovery.pulse.v1')invalidStudio();
 for(const report of g.lens_reports!)same(report,by('lens_runs',report.run_id),lensKey);
 for(const edge of g.claim_evidence!)if(by('claims',edge.claim_id).report_id){const report=by('lens_reports',by('claims',edge.claim_id).report_id);if(report.run_id!==by('evidence',edge.evidence_id).run_id)invalidStudio();}
 for(const d of g.decisions!){version(d.idea_id,d.idea_version);if(scope(d.idea_id,d.mvp_scope_version).idea_version!==d.idea_version)invalidStudio();for(const [id,rev,lens]of [['market_report_id','market_report_revision','market_space'],['cost_report_id','cost_report_revision','build_cost']] as const){const report=by('lens_reports',d[id]);if(report.revision!==d[rev]||report.lens!==lens||report.idea_id!==d.idea_id||report.idea_version!==d.idea_version||report.status!=='completed'||(lens==='build_cost'&&report.mvp_scope_version!==d.mvp_scope_version))invalidStudio();}}
 for(const a of g.annotations!)target({kind:a.target_kind,objectId:a.object_id,revision:a.target_revision});
 for(const p of g.action_proposals!)target(JSON.parse(String(p.target_json)));
 for(const p of g.research_playbook_rules!)if(p.scope_kind==='report'&&by('lens_reports',p.report_id).lens!=='market_space')invalidStudio();
 for(const a of g.memory_rule_applications!){const p=by('research_plans',a.plan_id);if(a.run_id!==null&&by('lens_runs',a.run_id).plan_id!==p.id)invalidStudio();}
 for(const r of g.work_reuse_receipts!)if(by('lens_runs',r.run_id).plan_id!==r.plan_id)invalidStudio();
 const reportSignals=(id:unknown)=>g.pulse_report_signals!.filter(e=>e.report_id===id).map(e=>e.signal_id);
 for(const e of g.pulse_report_signals!){const report=by('pulse_reports',e.report_id),signal=by('supply_signals',e.signal_id);if(by('source_fetches',signal.fetch_id).run_id!==report.run_id)invalidStudio();}
 for(const e of g.opportunity_signals!)if(!reportSignals(by('opportunities',e.opportunity_id).report_id).includes(e.signal_id))invalidStudio();
 for(const r of g.pulse_reports!){const refs=reportSignals(r.id);for(const f of JSON.parse(String(r.findings_json)) as {sourceSignalIds:unknown[]}[])if(f.sourceSignalIds.some(id=>!refs.includes(id as string)))invalidStudio();}
}
