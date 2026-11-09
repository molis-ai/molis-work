import type { IncomingMessage, ServerResponse } from 'node:http';
import { accountErrors } from '@molis-ai/molis-work-service-account';
import type { AccountCallControl } from '@molis-ai/molis-work-contracts/services/account';
import { handleAccountHttp, type AccountHostBinding } from './account-host.js';
import type { PersonalAuth } from './personal-auth.js';

interface InstallationLogin {
  auth:PersonalAuth;
  nonce:string;
  native:boolean;
  attachOnly:boolean;
  expires:number;
  complete:boolean;
  assertCurrent():void;
  completeLogin(response:ServerResponse):Promise<void>;
  fail():void;
  accepts(request:IncomingMessage):boolean;
}
/** Installation login uses the same credential protocol as Home. It has no business-action authority. */
export function createPersonalAccountProtocol(current:()=>InstallationLogin|null) {
  const owns=(request:IncomingMessage,url:URL)=>{
    const login=current();
    if(!login||login.expires<=Date.now()||!login.accepts(request))return false;
    if(url.pathname==='/account/callback')return login.auth.authentication.matchesCallback(url,request.headers.origin);
    return url.pathname.startsWith('/api/account/')&&request.headers['x-molis-account-login']===login.nonce;
  };
  return {owns,entry(url:URL){const login=current();return !!login&&!login.complete&&login.expires>Date.now()&&url.pathname==='/'&&url.searchParams.get('accountLogin')===login.nonce;},async handle(request:IncomingMessage,response:ServerResponse,url:URL):Promise<boolean>{
    if(!owns(request,url))throw accountErrors.forbidden('Installation login is not current');
    const login=current()!;
    const check=()=>{try{login.auth.assertCurrent();login.assertCurrent();}catch{throw accountErrors.cancelled('Installation login ended');}if(login.expires<=Date.now())throw accountErrors.cancelled('Installation login expired');};
    const run:AccountHostBinding['run']=async(origin,signal,operation)=>{
      check();if(origin!==login.auth.config.productOrigin)throw accountErrors.forbidden('Account product origin mismatch');
      const control:AccountCallControl={signal,assertCurrent:()=>{check();if(signal.aborted)throw accountErrors.cancelled('Installation login cancelled');}};
      try{const result=await operation(login.auth.sessions,control);control.assertCurrent();return result;}catch(error){if(error instanceof Error&&'code' in error&&error.code==='account.forbidden')throw error;control.assertCurrent();throw error;}
    };
    const binding:AccountHostBinding={home:'installation',configuration:JSON.stringify(login.auth.config),storage:undefined,fetch:undefined,assertAccountCurrent:check,
      session:()=>login.auth.sessions,run,matchesNativeCallback:(callback,origin)=>login.native&&login.auth.authentication.matchesNativeCallback(callback,origin),
      read:(origin,signal)=>run(origin,signal,async(manager,control)=>login.complete?manager.readSession(control):{state:'ANONYMOUS'}),
      manage:async()=>{throw accountErrors.forbidden('Complete installation login before managing the account');},
      authenticate:(origin,signal,operation)=>run(origin,signal,async(_manager,control)=>{
        const owner=login.auth.authentication;
        const auth=owner;
        let result:unknown=await operation(auth,control);
        const reply=result as {account?:unknown;operationReady?:boolean;status?:string};
        if(!login.complete&&(reply?.account||reply?.status==='COMPLETE')){
          control.assertCurrent();try{await login.completeLogin(response);}catch(error){login.fail();throw error;}control.assertCurrent();
          if(reply?.account)result={account:await login.auth.safeView(control)};
        }
        return result as Awaited<ReturnType<typeof operation>>;
      }),
    };
    return handleAccountHttp(request,response,url,binding,()=>login.native);
  }};
}
