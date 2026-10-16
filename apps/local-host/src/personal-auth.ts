import { createHash, randomBytes } from "node:crypto";
import type { SecretStore } from "@molis-ai/molis-work-storage";

export interface PersonalCloudConfig { authOrigin: string; clientId: string; desktopClientId?: string }
export interface PersonalIdentity { userId: string; displayName: string; emails: string[]; applicationId: string }
/** A task belongs to one login generation, even when the user logs back into the same account. */
export interface PersonalAccountLease {
  readonly userId: string;
  readonly applicationId: string;
  readonly authOrigin: string;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  accessToken(): Promise<string>;
}
interface Credentials { identity: PersonalIdentity; clientId?: string; access: string; refresh: string; expires: number }
type SavedAccount = Credentials | { identity: PersonalIdentity; clientId?: string; offline: true };
type HttpFetch = typeof fetch;
const random = () => randomBytes(32).toString("base64url");

export function personalCloudConfig(env: NodeJS.ProcessEnv = process.env): PersonalCloudConfig | null {
  const authOrigin=env.MOLIS_WORK_AUTH_ORIGIN;
  const clientId=env.MOLIS_WORK_AUTH_CLIENT_ID;
  if (!authOrigin && !clientId) return null;
  if (!authOrigin || !clientId) throw new Error("PERSONAL_CLOUD_CONFIG_INCOMPLETE");
  for (const value of [authOrigin]) {
    const url=new URL(value);
    if (url.origin!==value || url.username || url.password
      || (url.protocol!=="https:" && !(url.protocol==="http:" && url.hostname==="127.0.0.1"))) throw new Error("INVALID_CLOUD_ORIGIN");
  }
  return {authOrigin,clientId,...(env.MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID?{desktopClientId:env.MOLIS_WORK_AUTH_DESKTOP_CLIENT_ID}:{})};
}

/** Credentials never enter page HTML, localStorage, sync payloads or logs. */
export class PersonalAuth {
  private epoch=0;
  private accountController=new AbortController();
  private loginGeneration=0;
  private refreshing: Promise<Credentials>|null=null;
  private refreshingIdentity: PersonalIdentity|null=null;
  private checkingIdentity: Promise<PersonalIdentity|null>|null=null;
  private readonly key: string;
  private pending: {state:string;verifier:string;redirect:string;expires:number;epoch:number;clientId:string;generation:number}|null=null;
  constructor(readonly config: PersonalCloudConfig, private readonly secrets: Pick<SecretStore,'get'|'put'|'delete'>,
    private readonly http: HttpFetch=fetch, private readonly now=()=>Date.now()) {
    this.key=`personal-auth:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
  }
  private saved(): SavedAccount|null {
    const raw=this.secrets.get(this.key); return raw?JSON.parse(raw):null;
  }
  identity(): PersonalIdentity|null { return this.saved()?.identity ?? this.refreshingIdentity; }
  accountLease(): PersonalAccountLease {
    const identity=this.identity();
    if (!identity) throw new Error('LOGIN_REQUIRED');
    const epoch=this.epoch;
    const signal=this.accountController.signal;
    const assertCurrent=()=>{
      if(signal.aborted || epoch!==this.epoch) throw new Error('REPLICA_ACCOUNT_MISMATCH');
    };
    return {
      userId:identity.userId, applicationId:identity.applicationId, authOrigin:this.config.authOrigin, signal,
      assertCurrent,
      accessToken:async()=>{
        assertCurrent();
        const token=await this.accessToken();
        assertCurrent();
        return token;
      },
    };
  }
  private invalidateAccount(): void {
    this.epoch++;
    this.accountController.abort();
    this.accountController=new AbortController();
    this.refreshing=null;
    this.refreshingIdentity=null;
    this.checkingIdentity=null;
  }
  callbackState(): string|null { return this.pending?.state??null; }
  /** Host shutdown cancels in-flight work without signing out persistent native credentials. */
  suspend(): void { this.invalidateAccount();this.pending=null; }
  dispose(): void { this.invalidateAccount();this.pending=null;this.secrets.delete(this.key); }
  async currentIdentity(): Promise<PersonalIdentity|null> {
    if(this.checkingIdentity)return this.checkingIdentity;
    const check=this.checkIdentity();this.checkingIdentity=check;
    try{return await check;}finally{if(this.checkingIdentity===check)this.checkingIdentity=null;}
  }
  private async checkIdentity(): Promise<PersonalIdentity|null> {
    const epoch=this.epoch;
    try {
      if(this.refreshing)await this.refreshing;
      const account=this.saved();
      if(!account||epoch!==this.epoch)return null;
      if('offline' in account)return account.identity;
      const access=await this.accessToken();
      const identity=await this.readIdentity(access, this.saved()?.clientId ?? this.config.clientId);
      const saved=this.saved();
      if(epoch!==this.epoch||!saved)return null;
      if(identity.userId!==saved.identity.userId||identity.applicationId!==saved.identity.applicationId)throw new Error('LOGIN_REQUIRED');
      this.secrets.put(this.key,JSON.stringify({...saved,identity}));
      return identity;
    }catch(error){
      if(error instanceof Error && error.message==='LOGIN_REQUIRED'){
        if(epoch===this.epoch){this.invalidateAccount();this.secrets.delete(this.key);}
        return null;
      }
      throw error; // Network failure must not erase a still-usable offline identity.
    }
  }
  cancel(state:string): void {
    const pending=this.pending;
    if(!pending||pending.state!==state||pending.expires<this.now()||pending.epoch!==this.epoch)throw new Error('INVALID_LOGIN_CALLBACK');
    this.pending=null;
  }
  private async request(url:string, init:RequestInit): Promise<unknown> {
    const response=await this.http(url,{...init,redirect:"error",signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error(response.status===401||response.status===403?"LOGIN_REQUIRED":"AUTH_REQUEST_FAILED");
    return response.json();
  }
  private async readIdentity(access: string, clientId: string): Promise<PersonalIdentity> {
    const result = await this.request(`${this.config.authOrigin}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${access}` },
    }) as { data?: PersonalIdentity & { clientId?: string } };
    const identity = result.data;
    if (!identity || typeof identity.userId !== 'string' || !identity.userId
      || typeof identity.applicationId !== 'string' || !identity.applicationId
      || identity.clientId !== clientId || typeof identity.displayName !== 'string'
      || !Array.isArray(identity.emails) || !identity.emails.every(email => typeof email === 'string')) {
      throw new Error('LOGIN_REQUIRED');
    }
    return { userId: identity.userId, displayName: identity.displayName,
      emails: identity.emails, applicationId: identity.applicationId };
  }
  async begin(redirect: string, desktop = false, forceLogin = false): Promise<string> {
    const callback=new URL(redirect);
    if (callback.protocol!=="http:" || callback.hostname!=="127.0.0.1" || callback.pathname!=="/account/callback" || callback.search || callback.hash) throw new Error("INVALID_LOGIN_CALLBACK");
    const clientId=desktop?(this.config.desktopClientId??this.config.clientId):this.config.clientId;
    const attempt={state:random(),verifier:random(),redirect,expires:this.now()+600000,epoch:this.epoch,clientId,generation:++this.loginGeneration};
    this.pending=attempt;
    const challenge=createHash("sha256").update(attempt.verifier).digest("base64url");
    const result=await this.request(`${this.config.authOrigin}/api/v1/auth/transactions`,{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        clientId,redirectUri:redirect,codeChallenge:challenge,codeChallengeMethod:"S256",
        state:attempt.state,scopes:["account"],...(forceLogin?{forceLogin:true}:{}),
      }),
    }) as {data:{loginUrl:string}};
    const login=new URL(result.data.loginUrl);
    if (this.pending!==attempt || attempt.epoch!==this.epoch) throw new Error("LOGIN_CANCELLED");
    if (login.origin!==this.config.authOrigin || login.pathname!=="/login") throw new Error("INVALID_LOGIN_URL");
    return login.href;
  }
  async complete(code:string, state:string): Promise<PersonalIdentity> {
    const pending=this.pending;
    if (!pending || pending.state!==state || pending.expires<this.now() || pending.epoch!==this.epoch || !code || code.length>2048) throw new Error("INVALID_LOGIN_CALLBACK");
    this.pending=null; // single use, including uncertain exchange results
    const tokens=await this.token({grant_type:"authorization_code",code,code_verifier:pending.verifier,redirect_uri:pending.redirect},pending.clientId);
    // Auth confirms the opaque token belongs to the client used for this login.
    const identity=await this.readIdentity(tokens.access_token, pending.clientId);
    if (!identity.userId || pending.epoch!==this.epoch || pending.generation!==this.loginGeneration) throw new Error("LOGIN_CANCELLED");
    // A status/refresh request started for the previous account must not overwrite
    // or clear the newly authenticated identity when it eventually returns.
    this.invalidateAccount();
    this.secrets.put(this.key,JSON.stringify({identity,clientId:pending.clientId,access:tokens.access_token,refresh:tokens.refresh_token,expires:this.now()+tokens.expires_in*1000}));
    return identity;
  }
  private async token(fields:Record<string,string>,clientId=this.config.clientId): Promise<{access_token:string;refresh_token:string;expires_in:number}> {
    const response=await this.request(`${this.config.authOrigin}/oauth2/token`,{method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({...fields,client_id:clientId}).toString(),
    }) as {access_token:string;refresh_token:string;expires_in:number};
    if (!response.access_token || !response.refresh_token || !Number.isFinite(response.expires_in) || response.expires_in<=0) throw new Error("INVALID_TOKEN_RESPONSE");
    return response;
  }
  async accessToken(): Promise<string> {
    if (this.refreshing) return (await this.refreshing).access;
    const saved=this.saved(); if (!saved || 'offline' in saved) throw new Error("LOGIN_REQUIRED");
    if (saved.expires>this.now()+60000) return saved.access;
    const epoch=this.epoch;
    // Rotation is single-flight. Burn the old refresh BEFORE sending; never replay
    // after a lost response or process restart (Auth revokes replayed families).
    this.refreshingIdentity=saved.identity;
    this.secrets.put(this.key,JSON.stringify({identity:saved.identity,clientId:saved.clientId,offline:true}));
    const refreshing=(async()=>{
      const tokens=await this.token({grant_type:"refresh_token",refresh_token:saved.refresh},saved.clientId??this.config.clientId);
      if (epoch!==this.epoch) throw new Error("LOGIN_CANCELLED");
      const next={...saved,access:tokens.access_token,refresh:tokens.refresh_token,expires:this.now()+tokens.expires_in*1000};
      this.secrets.put(this.key,JSON.stringify(next)); return next;
    })();
    this.refreshing=refreshing;
    try { return (await refreshing).access; }
    catch(error) {
      // An uncertain refresh is no longer safe for background tasks. A newer
      // successful login must not be invalidated by this old request's failure.
      if(epoch===this.epoch && error instanceof Error && error.message==='LOGIN_REQUIRED'){
        this.invalidateAccount();this.secrets.delete(this.key);
      }
      throw error;
    } finally { if(this.refreshing===refreshing){this.refreshing=null;this.refreshingIdentity=null;} }
  }
  async logout(): Promise<boolean> {
    const saved=this.saved(); this.invalidateAccount(); this.pending=null; this.secrets.delete(this.key);
    // Best-effort remote revocation. Offline sign-out always clears local credentials.
    if (saved && !('offline' in saved)) return this.request(`${this.config.authOrigin}/api/v1/sessions/current/logout`,{
      method:"POST",headers:{Authorization:`Bearer ${saved.access}`,"content-type":"application/json"},body:"{}",
    }).then(()=>true,()=>false);
    return true;
  }
}
