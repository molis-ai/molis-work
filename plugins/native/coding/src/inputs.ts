import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {isDeepStrictEqual} from 'node:util';
import type {PluginDatabase,PluginDatabaseReader} from '@molis-ai/molis-work-contracts/platform/plugin';

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
function readInputs(db:PluginDatabaseReader,projectId:string,sessionId:string):CodingInputs {
 if(!db.get('SELECT session_id FROM coding_sessions WHERE project_id=? AND session_id=?',[projectId,sessionId]))throw errors.inputs_invalid('编码会话不存在');
 const row=db.get('SELECT draft,questions_json,revision FROM coding_inputs WHERE project_id=? AND session_id=?',[projectId,sessionId]);
 if(row)return {...validateCodingInputs(row.draft,JSON.parse(String(row.questions_json))),revision:Number(row.revision)};
 const clock=db.get('SELECT revision FROM coding_input_versions WHERE project_id=? AND session_id=?',[projectId,sessionId]);
 return {draft:'',question_drafts:{},revision:Number(clock?.revision??0)};
}
export class CodingInputStore {
 constructor(private readonly db:PluginDatabase){}
 read(projectId:string,sessionId:string):CodingInputs{return readInputs(this.db,projectId,sessionId);}
 async write(beforeEffect:()=>Promise<void>,projectId:string,sessionId:string,expected:number,patch:Partial<Pick<CodingInputs,'draft'|'question_drafts'>>):Promise<CodingInputs>{
  return this.db.transaction(beforeEffect,tx=>{
   const current=readInputs(tx,projectId,sessionId);
   if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(expected+1))throw errors.inputs_invalid('草稿编辑版本无效');
   if(expected!==current.revision)throw errors.inputs_changed('草稿已更新，当前修改已保留，请核对后再保存');
   const next=validateCodingInputs(patch.draft===undefined?current.draft:patch.draft,patch.question_drafts===undefined?current.question_drafts:patch.question_drafts);
   if(isDeepStrictEqual(next,{draft:current.draft,question_drafts:current.question_drafts}))return current;
   tx.run('INSERT INTO coding_inputs VALUES (?,?,?,?,?) ON CONFLICT(project_id,session_id) DO UPDATE SET revision=excluded.revision,draft=excluded.draft,questions_json=excluded.questions_json',[projectId,sessionId,expected+1,next.draft,JSON.stringify(next.question_drafts)]);
   tx.run('INSERT INTO coding_input_versions VALUES (?,?,?) ON CONFLICT(project_id,session_id) DO UPDATE SET revision=excluded.revision',[projectId,sessionId,expected+1]);
   return {...next,revision:expected+1};
  });
 }
 /** An accepted run clears only the exact revision it started with. */
 async clearIfUnchanged(beforeEffect:()=>Promise<void>,projectId:string,sessionId:string,expected:number):Promise<boolean>{
  return this.db.transaction(beforeEffect,tx=>{
   const current=readInputs(tx,projectId,sessionId);
   if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(expected+1))throw errors.inputs_invalid('草稿编辑版本无效');
   if(current.revision!==expected||!current.draft)return false;
   tx.run("UPDATE coding_inputs SET draft='',revision=? WHERE project_id=? AND session_id=?",[expected+1,projectId,sessionId]);
   tx.run('INSERT INTO coding_input_versions VALUES (?,?,?) ON CONFLICT(project_id,session_id) DO UPDATE SET revision=excluded.revision',[projectId,sessionId,expected+1]);
   return true;
  });
 }
}
