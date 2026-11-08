import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { actionErrorFromResponse } from '@molis-ai/molis-work-plugin-sdk';
import { readPersonalNativeSession } from './personal-native-session.js';
import { WEB_CONTROL_TOKEN_RELATIVE_PATH } from './web-control-token.js';
import { postToResidentHost, residentHostOrigin } from './resident-host-request.js';
import { probeMcpResident } from './mcp-resident-health.js';

export const ACCOUNT_CONNECT_PATH='/api/internal/account-connect';
export interface ResidentAccountConnection { homeDirectory:string; controlToken:string; installation:boolean }

/** A new OS process explicitly attaches to the installation owner's current account once; never follows later switches. */
export async function connectResidentAccount(homeDirectory:string,address:string,signal: AbortSignal = new AbortController().signal, requireInstallation=false):Promise<ResidentAccountConnection> {
 const origin=residentHostOrigin(address);signal.throwIfAborted();
 let nativeSession:string|undefined;
 try{nativeSession=readPersonalNativeSession(homeDirectory);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(requireInstallation&&!nativeSession)throw new ActionError('actions.forbidden','当前安装缺少原生连接凭据；请修复安装后显式登录，不能打开匿名业务。');
 let controlToken:string;
 try{controlToken=(await readFile(path.join(homeDirectory,WEB_CONTROL_TOKEN_RELATIVE_PATH),{encoding:'utf8',signal})).trim();}
 catch{signal.throwIfAborted();throw new ActionError('actions.service_unavailable','当前Home没有可连接的常驻宿主。');}
 // A directly selected Home already has its scope. Only an installation owns the native capability and may choose an account.
 if(!nativeSession)return {homeDirectory,controlToken,installation:false};
 const health=await probeMcpResident(homeDirectory,origin,signal);
 if(health!=='ready')throw new ActionError('actions.service_unavailable','请先启动并登录当前安装的工作台。');
 const answer=await postToResidentHost({origin,homeDirectory,controlToken,nativeSession,path:ACCOUNT_CONNECT_PATH,body:{},signal,retryHint:'请显式重新连接当前账号'});
 if(!answer)throw new ActionError('actions.service_unavailable','当前安装尚未连接。');
 if(!answer.ok)throw actionErrorFromResponse(answer.status,answer.body);
 const {homeDirectory:target,controlToken:credential}=answer.body;
 if(typeof target!=='string'||!path.isAbsolute(target)||typeof credential!=='string'||credential.length<32||credential.length>512||/[\r\n\0]/.test(credential))throw new ActionError('actions.transport_invalid','当前账号连接响应无效。');
 return {homeDirectory:target,controlToken:credential,installation:true};
}
