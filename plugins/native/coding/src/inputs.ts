import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {isDeepStrictEqual} from 'node:util';
import type {CodingSqliteDatabase} from './store.js';

const errors=defineErrorCodes('coding',{inputs_invalid:'invalid',inputs_changed:'conflict'});
export interface CodingInputs {draft:string;question_drafts:Record<string,unknown>;revision:number}
export const CODING_INPUTS_SCHEMA_SQL=`
 CREATE TABLE IF NOT EXISTS coding_inputs (
  project_id TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0),
  draft TEXT NOT NULL, questions_json TEXT NOT NULL,
  PRIMARY KEY(project_id,session_id),
  FOREIGN KEY(project_id,session_id) REFERENCES coding_sessions(project_id,session_id) ON DELETE CASCADE
 );
 CREATE TABLE IF NOT EXISTS coding_input_versions (
  project_id TEXT NOT NULL, session_id TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision>0), PRIMARY KEY(project_id,session_id)
 );
 CREATE TRIGGER IF NOT EXISTS coding_input_version_insert AFTER INSERT ON coding_inputs BEGIN
  INSERT INTO coding_input_versions VALUES(NEW.project_id,NEW.session_id,NEW.revision)
  ON CONFLICT(project_id,session_id) DO UPDATE SET revision=MAX(revision,NEW.revision);
 END;
 CREATE TRIGGER IF NOT EXISTS coding_input_version_update AFTER UPDATE OF revision ON coding_inputs BEGIN
  INSERT INTO coding_input_versions VALUES(NEW.project_id,NEW.session_id,NEW.revision)
  ON CONFLICT(project_id,session_id) DO UPDATE SET revision=MAX(revision,NEW.revision);
 END;
 CREATE TRIGGER IF NOT EXISTS coding_input_version_delete BEFORE DELETE ON coding_inputs BEGIN
  INSERT INTO coding_input_versions VALUES(OLD.project_id,OLD.session_id,OLD.revision+1)
  ON CONFLICT(project_id,session_id) DO UPDATE SET revision=MAX(revision,OLD.revision)+1;
 END;
`;

export function validateCodingInputs(draft:unknown,questions:unknown):{draft:string;question_drafts:Record<string,unknown>}{
 if(typeof draft!=='string'||draft.length>100000||!questions||typeof questions!=='object'||Array.isArray(questions)||Object.keys(questions).length>20)
  throw errors.inputs_invalid('草稿格式无效或超过长度限制');
 let encoded:string;try{encoded=JSON.stringify(questions);}catch{throw errors.inputs_invalid('草稿格式无效或超过长度限制');}
 if(encoded.length>100000||!isDeepStrictEqual(questions,JSON.parse(encoded)))throw errors.inputs_invalid('草稿格式无效或超过长度限制');
 return {draft,question_drafts:questions as Record<string,unknown>};
}

/** Freeze the editor's original premise before any other settings in the request are written. */
export function codingInputPatch(current:CodingInputs,body:Record<string,unknown>){
 if(body.draft===undefined&&body.question_drafts===undefined)return null;
 if(!Number.isSafeInteger(body.expected_input_revision)||body.expected_input_revision!==current.revision)
  throw errors.inputs_changed('草稿已更新，当前修改已保留，请核对后再保存');
 return {expected:current.revision,value:validateCodingInputs(body.draft===undefined?current.draft:body.draft,body.question_drafts===undefined?current.question_drafts:body.question_drafts)};
}

/** Saved user input has one owner and one atomic editing clock, independent of Runtime execution. */
export class CodingInputStore {
 constructor(private readonly db:CodingSqliteDatabase,private readonly assertSession:(projectId:string,sessionId:string)=>void){}
 read(projectId:string,sessionId:string):CodingInputs{
  this.assertSession(projectId,sessionId);
  const row=this.db.prepare('SELECT draft,questions_json,revision FROM coding_inputs WHERE project_id=? AND session_id=?').get(projectId,sessionId) as Record<string,unknown>|undefined;
  if(row)return {...validateCodingInputs(row.draft,JSON.parse(String(row.questions_json))),revision:Number(row.revision)};
  const clock=this.db.prepare('SELECT revision FROM coding_input_versions WHERE project_id=? AND session_id=?').get(projectId,sessionId) as Record<string,unknown>|undefined;
  return {draft:'',question_drafts:{},revision:clock?Number(clock.revision):0};
 }
 write(projectId:string,sessionId:string,expected:number,patch:Partial<Pick<CodingInputs,'draft'|'question_drafts'>>):CodingInputs{
  const current=this.read(projectId,sessionId);
  if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(expected+1))throw errors.inputs_invalid('草稿编辑版本无效');
  const next=validateCodingInputs(patch.draft===undefined?current.draft:patch.draft,patch.question_drafts===undefined?current.question_drafts:patch.question_drafts);
  if(expected!==current.revision)throw errors.inputs_changed('草稿已更新，当前修改已保留，请核对后再保存');
  if(isDeepStrictEqual(next,{draft:current.draft,question_drafts:current.question_drafts}))return current;
  const result=this.db.prepare(`INSERT INTO coding_inputs(project_id,session_id,revision,draft,questions_json)
   SELECT ?,?,?,?,? WHERE COALESCE((SELECT revision FROM coding_input_versions WHERE project_id=? AND session_id=?),0)=?
   ON CONFLICT(project_id,session_id) DO UPDATE SET revision=excluded.revision,draft=excluded.draft,questions_json=excluded.questions_json WHERE coding_inputs.revision=?`)
   .run(projectId,sessionId,expected+1,next.draft,JSON.stringify(next.question_drafts),projectId,sessionId,expected,expected) as {changes:number};
  if(result.changes!==1)throw errors.inputs_changed('草稿已更新，当前修改已保留，请核对后再保存');
  return {...next,revision:expected+1};
 }
 /** An accepted run may clear only the exact input it started with, never later typing. */
 clearIfUnchanged(projectId:string,sessionId:string,expected:number):boolean{
  this.assertSession(projectId,sessionId);if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(expected+1))throw errors.inputs_invalid('草稿编辑版本无效');
  const result=this.db.prepare("UPDATE coding_inputs SET draft='',revision=revision+1 WHERE project_id=? AND session_id=? AND revision=? AND draft<>'' AND EXISTS(SELECT 1 FROM coding_input_versions WHERE project_id=? AND session_id=? AND revision=?)").run(projectId,sessionId,expected,projectId,sessionId,expected) as {changes:number};
  return result.changes===1;
 }
}
