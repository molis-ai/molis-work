import { createHash, randomBytes } from 'node:crypto';
import type { SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { SecretStore } from './file-secret-store.js';
import { localPayloadErrors, openLocalAead, sealLocalAead } from './local-aead.js';

const PREFIX='molis-work-local-payload-v1';
/** Technical encryption only. The owner fixes the key reference, scope and complete persisted-data predicate. */
export function createLocalPayloadProtection(options:{
  secrets:Pick<SecretStore,'get'|'createIfAbsent'>;
  keyRef:string;
  scope:string;
  authorize():void;
  hasProtectedData():boolean;
}):SyncLocalProtection {
  if(!options.keyRef.trim()||!options.scope.trim()) throw localPayloadErrors.local_payload_invalid('本机正文保护缺少可信作用域');
  const check=()=>options.authorize();
  const unavailable=():never=>{throw localPayloadErrors.local_payload_key_unavailable('本机同步密钥不可用，原数据已保留');};
  const identityRef=options.keyRef+':identity',fingerprint=(key:Uint8Array)=>createHash('sha256').update(key).digest('hex');
  const readState=()=>{
    check();const raw=options.secrets.get(options.keyRef);check();const identity=options.secrets.get(identityRef);check();
    if(identity!==null&&!/^[a-f0-9]{64}$/.test(identity))unavailable();
    const key=raw===null?null:Buffer.from(raw,'base64');
    if(key&&(key.length!==32||key.toString('base64')!==raw))unavailable();
    if(identity&&(!key||fingerprint(key)!==identity))unavailable();
    return {key,identity};
  };
  const keyForWrite=()=>{
    let state=readState();if(state.key&&state.identity)return state.key;
    const used=options.hasProtectedData();check();state=readState();if(state.key&&state.identity)return state.key;
    if(used)unavailable();
    if(!state.key){check();options.secrets.createIfAbsent(options.keyRef,randomBytes(32).toString('base64'));check();state=readState();}
    if(!state.key)return unavailable();
    check();options.secrets.createIfAbsent(identityRef,fingerprint(state.key));check();
    state=readState();if(!state.key||!state.identity)return unavailable();return state.key;
  };
  const aad=(binding:string)=>Buffer.from(JSON.stringify([PREFIX,options.scope,binding]),'utf8');
  return {
    seal(plaintext,binding){
      check();const key=keyForWrite(),sealed=sealLocalAead(PREFIX,{key,aad:aad(binding),plaintext});check();return Buffer.from(sealed,'utf8');
    },
    open(sealed,binding){
      check();const {key,identity}=readState();if(!key||!identity)return unavailable();
      let encrypted:string;try{encrypted=new TextDecoder('utf-8',{fatal:true}).decode(sealed);}catch{throw localPayloadErrors.local_payload_invalid('本机同步密文无效');}
      const value=openLocalAead(PREFIX,{key,aad:aad(binding),encrypted});check();return value;
    },
  };
}
