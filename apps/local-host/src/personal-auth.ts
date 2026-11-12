import { createHash, randomBytes } from "node:crypto";
import { assertSecretStoreWritable, createFileSecretStore, resolveMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";
import { accountErrors, createAccountSessionManager, createAccountAuthentication, parseAccountEnvironment, type AccountSessionManager } from "@molis-ai/molis-work-service-account";
import type { AccountEnvironmentConfig, AccountCallControl, AccountView, UserView } from "@molis-ai/molis-work-contracts/services/account";

/**
 * Where the account's credentials are kept, and the question asked before anything is sent: can `feed/secrets.json` take this login's
 * write. A login whose credentials could not be kept does not start a transaction or spend an authorization code.
 */
export interface AccountSecrets extends Pick<SecretStore,'get'|'put'|'delete'> { assertWritable(): void }

/** The vault of the Home the store is opened on, asked as its own writes ask it (`assertSecretStoreWritable`). */
export function fileAccountSecrets(): AccountSecrets {
  const store=createFileSecretStore(),home=resolveMolisWorkHome();
  return {get:ref=>store.get(ref),put:(ref,value)=>store.put(ref,value),delete:ref=>store.delete(ref),assertWritable:()=>assertSecretStoreWritable(home)};
}

export type PersonalCloudConfig = AccountEnvironmentConfig;
/**
 * The one Host projection of the contract user used by the page status and by every account lease. The Home account
 * API returns the same `UserView` through `AccountView`; this projection must never hold a second user record.
 */
export type PersonalIdentity = Readonly<Pick<UserView, "userId" | "displayName" | "email"> & { applicationId: string }>;
export function personalIdentity(user: Pick<UserView, "userId" | "displayName" | "email">, applicationId: string): PersonalIdentity {
  return { userId: user.userId, displayName: user.displayName, email: user.email ?? null, applicationId };
}
export interface PersonalAccountLease {
  readonly userId: string; readonly applicationId: string; readonly authOrigin: string; readonly signal: AbortSignal;
  assertCurrent(): void;
  accessToken(): Promise<string>;
}
export function personalCloudConfig(env: NodeJS.ProcessEnv = process.env): PersonalCloudConfig | null {
  return env.MOLIS_WORK_ACCOUNT_CONFIG ? parseAccountEnvironment(env.MOLIS_WORK_ACCOUNT_CONFIG) : null;
}
type Authentication = ReturnType<typeof createAccountAuthentication>;
interface SessionOwner { manager:AccountSessionManager; authentication:Authentication; record:unknown|null; persistent:boolean }
/** The installation owns one active V2 session. A replacement has no Home authority until explicitly adopted. */
export class PersonalAuth {
  private epoch=0;
  private controller=new AbortController();
  private pending:string|null=null;
  private expires=0;
  private user:PersonalIdentity|null=null;
  private closed=false;
  private offline=false;
  private closing=new Set<Promise<void>>();
  private active:SessionOwner;
  private candidate:SessionOwner|undefined;
  private readonly key:string;
  readonly sessions:AccountSessionManager;
  constructor(readonly config:PersonalCloudConfig, private readonly secrets:AccountSecrets, private readonly http:typeof fetch=fetch, private readonly now=()=>Date.now()) {
    this.key=`molis.installation.account.v2:${createHash('sha256').update(JSON.stringify(config)).digest('hex')}`;
    this.active=this.owner(true);
    // Home borrows this stable port, while its original installation lease fences every operation.
    this.sessions=new Proxy(this.active.manager,{get:(_target,key)=>{
      const value=Reflect.get(this.active.manager,key);
      return typeof value==='function'?value.bind(this.active.manager):value;
    }});
  }
  private owner(persistent:boolean):SessionOwner {
    const owner={} as SessionOwner;
    owner.persistent=persistent;owner.record=null;
    owner.manager=createAccountSessionManager(this.config,{fetch:this.http,now:this.now,storage:{
      read:()=>{if(!owner.persistent)return owner.record;const raw=this.secrets.get(this.key);return raw?JSON.parse(raw):null;},
      write:value=>{
        if(owner.persistent){this.assertCurrent();this.secrets.put(this.key,JSON.stringify(value));this.accept(value);}
        owner.record=value;
      },
    }});
    owner.authentication=createAccountAuthentication(this.config,owner.manager,this.http);
    return owner;
  }
  private retire(owner:SessionOwner):void{
    const pending=owner.manager.close();this.closing.add(pending);
    void pending.finally(()=>this.closing.delete(pending)).catch(()=>undefined);
  }
  async drained():Promise<void>{await Promise.allSettled([...this.closing]);}
  private accept(value:unknown,replaceLogin=false):void {
    const record=value as {user?:Pick<UserView,"userId"|"displayName"|"email">}|null;
    const next=record?.user?personalIdentity(record.user,this.config.applicationId):null;
    if(replaceLogin||(next?.userId??null)!==(this.user?.userId??null)){
      this.epoch++;this.controller.abort();this.controller=new AbortController();
    }
    this.user=next;
  }
  assertCurrent():void{if(this.closed)throw new Error('ACCOUNT_HOST_CLOSED');}
  private assertVaultWritable():void{try{this.secrets.assertWritable();}catch(error){this.cancelLogin();throw error;}}
  private control():AccountCallControl{return {assertCurrent:()=>this.assertCurrent()};}
  get authentication():Authentication{this.assertVaultWritable();return this.candidate?.authentication??this.active.authentication;}
  offlineCached():boolean{return this.offline;}
  identity():PersonalIdentity|null{return this.user;}
  accountGeneration():number{return this.epoch;}
  accountLease():PersonalAccountLease {
    const identity=this.user;if(!identity)throw new Error('LOGIN_REQUIRED');
    const epoch=this.epoch,signal=this.controller.signal;
    const assertCurrent=()=>{if(signal.aborted||epoch!==this.epoch)throw new Error('REPLICA_ACCOUNT_MISMATCH');};
    return {...identity,authOrigin:this.config.authOrigin,signal,assertCurrent,accessToken:async()=>{assertCurrent();const token=await this.sessions.accessToken({signal,assertCurrent});assertCurrent();return token;}};
  }
  async currentIdentity():Promise<PersonalIdentity|null>{
    const owner=this.active,view=await owner.manager.readSession(this.control());
    if(owner!==this.active)throw new Error('REPLICA_ACCOUNT_MISMATCH');
    this.offline=view.state==='OFFLINE_CACHED';
    this.accept(view.state==='AUTHENTICATED'||view.state==='OFFLINE_CACHED'?{user:view.user}:null);
    return this.user;
  }
  async accessToken():Promise<string>{return this.sessions.accessToken(this.control());}
  callbackState():string|null{this.loginPending();return this.pending;}
  loginPending():boolean{if(this.pending&&this.expires<=this.now())this.cancelLogin();return this.pending!==null;}
  async begin(redirect:string,_desktop=false,_force=false):Promise<string>{
    this.assertCurrent();this.assertVaultWritable();await this.currentIdentity();const url=new URL(redirect);
    if(url.origin!==this.config.productOrigin||url.pathname!=='/account/callback'||url.search||url.hash)throw new Error('INVALID_LOGIN_CALLBACK');
    this.cancelLogin();this.candidate=this.owner(false);this.pending=randomBytes(32).toString('base64url');this.expires=this.now()+600000;
    return `${this.config.productOrigin}/?accountLogin=${encodeURIComponent(this.pending)}`;
  }
  /** Candidate tokens are validated by the V2 session owner before the installation receives them. */
  async adoptLogin(attachOnly:boolean):Promise<void>{
    this.assertVaultWritable();
    const candidate=this.candidate,nonce=this.pending;
    if(!candidate||!nonce||!this.loginPending())throw new Error('INVALID_LOGIN_CALLBACK');
    const check=()=>{this.assertCurrent();if(this.candidate!==candidate||this.pending!==nonce||!this.loginPending())throw new Error('LOGIN_CANCELLED');};
    const view=await candidate.manager.readSession({assertCurrent:check});check();
    if(view.state!=='AUTHENTICATED')throw new Error('LOGIN_REQUIRED');
    if(attachOnly){
      const lease=this.accountLease();
      try{if(view.user.userId!==lease.userId)throw accountErrors.forbidden('Browser verification belongs to another account');lease.assertCurrent();}
      finally{await candidate.manager.logout('CURRENT_LOGIN',randomBytes(24).toString('hex'),{assertCurrent:check});}
      check();candidate.authentication.close();await candidate.manager.close();this.candidate=undefined;return;
    }
    const previous=this.active;
    // Persist first. Failure leaves A authoritative and the candidate isolated.
    this.secrets.put(this.key,JSON.stringify(candidate.record));check();
    previous.persistent=false;candidate.persistent=true;this.active=candidate;this.candidate=undefined;
    this.accept({user:view.user},true);previous.authentication.close();
    await previous.manager.logout('CURRENT_LOGIN',randomBytes(24).toString('hex'),this.control()).catch(()=>undefined);
    this.retire(previous);
  }
  cancel(state:string):void{if(state!==this.pending)throw new Error('INVALID_LOGIN_CALLBACK');this.cancelLogin();}
  cancelLogin():void{
    this.pending=null;const candidate=this.candidate;this.candidate=undefined;
    candidate?.authentication.close();if(candidate)this.retire(candidate);
  }
  finishLogin():void{this.pending=null;}
  async logout(scope:'CURRENT_LOGIN'|'ALL_MOLIS_PRODUCTS'='CURRENT_LOGIN'):Promise<boolean>{this.cancelLogin();this.active.authentication.close();const result=await this.sessions.logout(scope,randomBytes(24).toString('hex'),this.control());return result.remoteRevocation==='CONFIRMED';}
  suspend():void{this.cancelLogin();this.closed=true;this.controller.abort();this.active.authentication.close();this.retire(this.active);}
  async safeView(control:AccountCallControl):Promise<AccountView>{return this.sessions.readSession(control);}
}
