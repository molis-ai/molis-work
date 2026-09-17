import { conforms, interactionFactsSchema } from './schema.js';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { SqliteDatabase } from '@molis-ai/molis-work-storage';
import { CasebookError, CONTRACT, VERSION, PURPOSE, CONTEXT_PURPOSE, RECEIPTS_PURPOSE, exact, requiredText,
  type AuthorizationRequest, type ReadRequest, type Fact, type Envelope } from './contract.js';

interface Scope { board: string; epoch: string; state: string; secret: string; since: string; pauses: number; }
const SQL = `CREATE TABLE IF NOT EXISTS casebook_interaction_scopes (
 board TEXT PRIMARY KEY, epoch TEXT NOT NULL, state TEXT NOT NULL, secret TEXT NOT NULL, since TEXT NOT NULL, pauses INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS casebook_interaction_facts (
 board TEXT NOT NULL, epoch TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL UNIQUE, body TEXT NOT NULL,
 PRIMARY KEY(board,epoch,seq));
CREATE TABLE IF NOT EXISTS casebook_goal_contexts (
 board TEXT NOT NULL, interaction_epoch TEXT NOT NULL, context_epoch TEXT NOT NULL,
 operation_id TEXT NOT NULL, phase TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(board,interaction_epoch,context_epoch,operation_id,phase));
CREATE TABLE IF NOT EXISTS casebook_interaction_audit_keys (board TEXT PRIMARY KEY, secret TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS casebook_interaction_actions (
 board TEXT NOT NULL, key TEXT NOT NULL, digest TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(board,key));`;
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class InteractionJournal {
  unpersistedFailures = 0;
  protected readonly key:string;
  constructor(readonly db: SqliteDatabase, readonly board: string, readonly project: string, readonly purpose:typeof PURPOSE|typeof CONTEXT_PURPOSE|typeof RECEIPTS_PURPOSE=PURPOSE) { this.key=JSON.stringify([purpose,board]); }
  scope(): Scope | null {
    if (!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='casebook_interaction_scopes'").get()) return null;
    return this.db.prepare('SELECT * FROM casebook_interaction_scopes WHERE board=?').get(this.key) as Scope ?? null;
  }
  tag(scope: Scope, domain: string, value: unknown): string {
    return createHmac('sha256', scope.secret).update(domain).update('\0').update(JSON.stringify(value)).digest('hex');
  }
  authorization() {
    const s = this.scope();
    return { project_ref: this.project, purpose: this.purpose, state: s?.state ?? 'not_joined',
      authorization_epoch: s?.epoch ?? null, deletion_required: s?.state === 'removed' };
  }
  setAuthorization(input: AuthorizationRequest, onApplied?: (result: Record<string,unknown>) => unknown) {
    exact(input, ['project_ref','action','purpose','include_goal_context','actor_ref','user_action_ref','user_confirmed','idempotency_key']);
    for (const v of [input.actor_ref,input.user_action_ref,input.idempotency_key]) requiredText(v);
    if (input.project_ref !== this.project || input.purpose !== this.purpose || input.user_confirmed !== true)
      throw new CasebookError('not_authorized');
    if (!['join','pause','resume','remove'].includes(input.action)) throw new CasebookError('invalid_request');
    // Called only after the owner-supplied authority verifier approved this exact action.
    this.db.exec(SQL);
    return this.db.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO casebook_interaction_audit_keys VALUES (?,?)').run(this.key,randomBytes(32).toString('hex'));
      const audit=this.db.prepare('SELECT secret FROM casebook_interaction_audit_keys WHERE board=?').get(this.key) as {secret:string};
      const mac=(x:unknown)=>createHmac('sha256',audit.secret).update(JSON.stringify(x)).digest('hex');
      const key = mac(input.idempotency_key), hash = mac(input);
      const prior = this.db.prepare('SELECT digest,body FROM casebook_interaction_actions WHERE board=? AND key=?')
        .get(this.key,key) as {digest:string;body:string}|undefined;
      if (prior) { if (prior.digest !== hash) throw new CasebookError('idempotency_conflict'); return JSON.parse(prior.body); }
      let s = this.scope();
      if (input.action === 'join') {
        if (s && s.state !== 'removed') throw new CasebookError('authorization_state_conflict');
        s = { board:this.key, epoch:randomUUID(),state:'active',secret:randomBytes(32).toString('hex'),since:new Date().toISOString(),pauses:0 };
        this.db.prepare('INSERT OR REPLACE INTO casebook_interaction_scopes VALUES (?,?,?,?,?,?)')
          .run(s.board,s.epoch,s.state,s.secret,s.since,s.pauses);
      } else {
        if (!s || (input.action === 'pause' && s.state !== 'active') || (input.action === 'resume' && s.state !== 'paused')
          || (input.action === 'remove' && s.state === 'removed')) throw new CasebookError('authorization_state_conflict');
        this.db.prepare('UPDATE casebook_interaction_scopes SET state=?,pauses=pauses+? WHERE board=?')
          .run(input.action === 'resume' ? 'active' : input.action === 'pause' ? 'paused' : 'removed',input.action === 'pause' ? 1 : 0,this.key);
        if (input.action === 'remove') {
          if(this.purpose!==RECEIPTS_PURPOSE)this.db.prepare('DELETE FROM casebook_goal_contexts WHERE board=?').run(this.board);
          this.db.prepare('DELETE FROM casebook_interaction_facts WHERE board=?').run(this.key);
          this.db.prepare("UPDATE casebook_interaction_scopes SET secret='' WHERE board=?").run(this.key);
        }
      }
      const result = {...this.authorization(), action_receipt: {
        action:input.action,purpose:this.purpose,actor_ref:mac(input.actor_ref),user_action_ref:mac(input.user_action_ref),recorded_at:new Date().toISOString(),
      }};
      const receipt=onApplied?onApplied(result):result;
      this.db.prepare('INSERT INTO casebook_interaction_actions VALUES (?,?,?,?)').run(this.key,key,hash,JSON.stringify(receipt));
      return receipt;
    }).immediate();
  }
  append(epoch: string, input: Omit<Fact,'seq'|'source_digest'>): Fact | null {
    return this.db.transaction(() => {
      const s=this.scope(); if (!s || s.state !== 'active' || s.epoch !== epoch) return null;
      if(input.kind==='correction') {
        const target=this.db.prepare('SELECT body FROM casebook_interaction_facts WHERE board=? AND epoch=? AND id=?').get(this.key,epoch,input.corrects_fact_id) as {body:string}|undefined;
        if(!target || JSON.parse(target.body).operation_id!==input.operation_id) throw new CasebookError('invalid_correction');
      } else if(input.corrects_fact_id!==null) throw new CasebookError('invalid_correction');
      const old=this.db.prepare('SELECT board,epoch,body FROM casebook_interaction_facts WHERE id=?').get(input.fact_id) as {board:string;epoch:string;body:string}|undefined;
      if (old) {
        if(old.board!==this.key || old.epoch!==epoch) throw new CasebookError('idempotency_conflict');
        const fact=JSON.parse(old.body) as Fact;
        const {seq,source_digest,...body}=fact;
        if (digest(body)!==digest(input)) throw new CasebookError('idempotency_conflict');
        return fact;
      }
      const {seq}=this.db.prepare('SELECT COALESCE(MAX(seq),0)+1 seq FROM casebook_interaction_facts WHERE board=? AND epoch=?')
        .get(this.key,epoch) as {seq:number};
      const body={...input,seq}; const fact={...body,source_digest:digest(body)};
      if (Buffer.byteLength(JSON.stringify(fact))>48*1024 || !conforms(fact,interactionFactsSchema.properties!.facts!.items!)) throw new CasebookError('source_projection_invalid');
      this.db.prepare('INSERT INTO casebook_interaction_facts VALUES (?,?,?,?,?)').run(this.key,epoch,seq,input.fact_id,JSON.stringify(fact));
      return fact;
    }).immediate();
  }
  read(input: ReadRequest): Envelope {
    exact(input,['project_ref','schema_version','authorization_epoch','after_cursor','limit']);
    if (input.schema_version !== VERSION) throw new CasebookError('unsupported_schema_version');
    const s=this.scope();
    if (input.project_ref !== this.project || !s || s.state !== 'active' || s.epoch !== input.authorization_epoch)
      throw new CasebookError('not_authorized');
    if (!Number.isSafeInteger(input.after_cursor) || input.after_cursor<0 || !Number.isInteger(input.limit) || input.limit<1 || input.limit>100)
      throw new CasebookError('invalid_request');
    const {max}=this.db.prepare('SELECT COALESCE(MAX(seq),0) max FROM casebook_interaction_facts WHERE board=? AND epoch=?')
      .get(this.key,s.epoch) as {max:number};
    if (input.after_cursor>max) throw new CasebookError('cursor_gap');
    const rows=this.db.prepare('SELECT body FROM casebook_interaction_facts WHERE board=? AND epoch=? AND seq>? ORDER BY seq LIMIT ?')
      .all(this.key,s.epoch,input.after_cursor,input.limit) as {body:string}[];
    const facts:Fact[]=[]; let bytes=0;
    for (const row of rows) { if(bytes+Buffer.byteLength(row.body)>700*1024) break; bytes+=Buffer.byteLength(row.body); facts.push(JSON.parse(row.body) as Fact); }
    facts.forEach((f,i)=>{ const {source_digest,...body}=f; if(!conforms(f,interactionFactsSchema.properties!.facts!.items!) || digest(body)!==source_digest) throw new CasebookError('source_projection_invalid'); if(f.seq!==input.after_cursor+i+1) throw new CasebookError('cursor_gap'); });
    const {incomplete}=this.db.prepare(`SELECT COUNT(*) incomplete FROM casebook_interaction_facts a
      WHERE a.board=? AND a.epoch=? AND json_extract(a.body,'$.kind')='attempt' AND NOT EXISTS
      (SELECT 1 FROM casebook_interaction_facts b WHERE b.board=a.board AND b.epoch=a.epoch
       AND json_extract(b.body,'$.operation_id')=json_extract(a.body,'$.operation_id') AND json_extract(b.body,'$.kind')='result')`)
      .get(this.key,s.epoch) as {incomplete:number};
    const to=facts.at(-1)?.seq ?? input.after_cursor;
    return {contract_id:CONTRACT,schema_version:VERSION,project_ref:this.project,authorization_epoch:s.epoch,
      exported_at:new Date().toISOString(),stream_id:`${CONTRACT}:${s.epoch}`,
      cursor:{after_exclusive:input.after_cursor,to_inclusive:to,has_more:to<max},facts,
      coverage:{recording_since:s.since,retained_from_seq:1,channels:['local-host.capability.v1','web.goal-events.v1'],
        missing:['before_authorization','paused_windows','legacy_withProject_calls','transport_parse_and_auth_rejections',
          'ui_visibility','host_intent_and_detours','external_delivery','unobserved_background_operations',
          'crash_before_attempt_persisted','write_failures_may_be_unrecoverable_after_restart','unlisted_capabilities'],
        unpersisted_failures:this.unpersistedFailures,incomplete_operations:incomplete,paused_windows:s.pauses,
        historical_backfill:false,external_outcome:'unknown'}};
  }
}
