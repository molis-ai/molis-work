import type {SyncAuthority} from './index.js';
import {isTransportBackoff,type syncTransportBackoff} from './transport-backoff.js';
import {syncQuotaError,syncResponseMessage} from './quota.js';
import {syncError} from './sync-errors.js';

/**
 * Stop waiting the moment the request is cancelled, whatever the injected `fetch` does with its signal: a device stop or
 * sign-out waits for the operation holding the sync lock, so a response that never comes must not hold that lock.
 */
function untilAborted(pending:Promise<Response>,signal:AbortSignal):Promise<Response>{
  if(signal.aborted){
    pending.catch(()=>undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<Response>((resolve,reject)=>{
    const stop=()=>reject(signal.reason);
    signal.addEventListener('abort',stop,{once:true});
    pending.finally(()=>signal.removeEventListener('abort',stop)).then(resolve,reject);
  });
}

export function syncTransport(ports:{
  endpoint():string;
  fetch():typeof fetch;
  abort():AbortSignal;
  cycleAbort?():AbortSignal|undefined;
  onBackoff?():void;
  authority():SyncAuthority;
  assert():void;
  backoff:ReturnType<typeof syncTransportBackoff>;
  onWrite():void;
}){
  const send=async(route:string,body?:string|Buffer,method=body===undefined?'GET':'POST',type='application/json',check=ports.assert)=>{
    const canSend=()=>{
      check();
      if(ports.cycleAbort?.()?.aborted)throw ports.backoff.currentError();
      try{
        ports.backoff.assertReady();
      }catch(error){
        if(isTransportBackoff(error))ports.onBackoff?.();
        throw error;
      }
    };
    canSend();
    const authority=ports.authority();
    const token=await authority.accessToken();
    canSend();
    if(method!=='GET')ports.onWrite();
    const timeout=type==='application/octet-stream'?45_000:15_000;
    const cycleSignal=ports.cycleAbort?.();
    const signals=[authority.signal,ports.abort(),AbortSignal.timeout(timeout)];
    if(cycleSignal)signals.push(cycleSignal);
    const signal=AbortSignal.any(signals);
    let response:Response;
    try{
      response=await untilAborted(ports.fetch()(new URL(route,ports.endpoint()),{
        method,signal,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},
        ...(body===undefined?{}:{body}),
      }),signal);
    }catch(error){
      check();
      if(cycleSignal?.aborted)throw ports.backoff.currentError();
      const backoffError=ports.backoff.offline(error);
      ports.onBackoff?.();
      throw backoffError;
    }
    check();
    try{
      await ports.backoff.check(response,check);
    }catch(error){
      if(isTransportBackoff(error))ports.onBackoff?.();
      throw error;
    }
    return response;
  };
  const request=async<T=unknown>(route:string,body?:unknown,method=body===undefined?'GET':'POST',check=ports.assert):Promise<T>=>{
    const response=await send(route,body===undefined?undefined:JSON.stringify(body),method,'application/json',check);
    const text=await response.text();
    check();
    if(text.length>4*1024*1024)throw new Error('SYNC_RESPONSE_TOO_LARGE');
    let result:Record<string,unknown>;
    try{
      const parsed:unknown=JSON.parse(text);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw syncError('invalid','同步响应格式无效');
      result=parsed as Record<string,unknown>;
    }catch{throw syncError('invalid','同步响应格式无效');}
    if(!response.ok){
      if(result.error==='SYNC_ITEM_PURGED'||result.error==='SYNC_ITEM_EXPIRED')throw syncError('invalid','云端内容已过保留期或永久删除，本机原件仍保留');
      if(result.error==='SYNC_BLOB_MISSING'||result.error==='SYNC_BLOB_CORRUPT')throw syncError('invalid',syncResponseMessage(result.error));
      if(result.error==='SYNC_QUOTA_EXCEEDED')throw syncQuotaError();
      throw new Error(response.status===409?'同步版本已变化，请重试':response.status===401?'登录已失效，请重新登录':syncResponseMessage(result.error));
    }
    return result as T;
  };
  return {send,request};
}
