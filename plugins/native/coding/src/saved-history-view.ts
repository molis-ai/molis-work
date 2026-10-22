import {createHash} from 'node:crypto';
import type {CodingExecution} from './routes.js';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
const errors=defineErrorCodes('coding',{history_unavailable:'unavailable'});
/** Complete saved event records remain in SQL; this is a passive, bounded page of original rounds. */
export function codingSavedHistoryPage(execution:CodingExecution,projectId:string,sessionId:string,before?:string,limit=20){
 const archives=execution.sessions.savedHistory(projectId,sessionId);if(archives.length&&!execution.savedHistoryView)throw errors.history_unavailable('会话历史读取服务尚未装配');
 const runs=archives.flatMap(json=>execution.savedHistoryView!(json).runs),end=before===undefined?runs.length:Number(before);
 if(!Number.isSafeInteger(end)||end<0||end>runs.length||!Number.isSafeInteger(limit)||limit<1||limit>50)throw errors.history_unavailable('会话历史读取范围无效');
 return {state:createHash('sha256').update(JSON.stringify(archives)).digest('hex'),runs:runs.slice(Math.max(0,end-limit),end),offset:Math.max(0,end-limit),total:runs.length};
}
