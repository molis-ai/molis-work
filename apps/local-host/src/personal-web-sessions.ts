import { randomBytes } from 'node:crypto';
import { PersonalAuth, type PersonalCloudConfig } from './personal-auth.js';

export interface AccountNavigation { id:string;returnTo:string;complete:boolean;expires:number }
export interface WebAccountSession { id:string;auth:PersonalAuth;expires:number;navigation:AccountNavigation|null;space:'local'|'account'; borrowed?:boolean }
export const WEB_ACCOUNT_COOKIE='molis-work-session';
const TTL=8*60*60*1000;

/** Local web-host sessions. No OS credential access, no tokens in cookies or on disk.
 * Process restart intentionally signs web clients out. Not a distributed cloud store.
 */
export class PersonalWebSessions {
  private sessions=new Map<string,WebAccountSession>();
  private expiryTimers=new Map<WebAccountSession,NodeJS.Timeout>();
  constructor(private now=()=>Date.now()){}
  private sweep():void {
    for(const session of this.sessions.values())if(session.expires<=this.now())this.remove(session);
  }
  get(cookie:string|undefined):WebAccountSession|null {
    this.sweep();
    const values=cookie?.split(';').map(part=>part.trim()).filter(part=>part.startsWith(WEB_ACCOUNT_COOKIE+'='))??[];
    if(values.length!==1)return null;
    return this.sessions.get(values[0].slice(WEB_ACCOUNT_COOKIE.length+1))??null;
  }
  create(config:PersonalCloudConfig):WebAccountSession {
    this.sweep();
    if(this.sessions.size>=256)throw new Error('WEB_SESSION_CAPACITY');
    const secrets=new Map<string,string>();
    const auth=new PersonalAuth(config,{get:key=>secrets.get(key)??null,put:(key,value)=>{secrets.set(key,value);},delete:key=>{secrets.delete(key);}});
    return this.adopt(auth,false);
  }
  adopt(auth:PersonalAuth,borrowed=true):WebAccountSession {
    this.sweep();
    if(this.sessions.size>=256)throw new Error('WEB_SESSION_CAPACITY');
    const session:WebAccountSession={id:randomBytes(32).toString('base64url'),auth,expires:this.now()+TTL,navigation:null,space:'local',borrowed};
    this.sessions.set(session.id,session);
    const timer=setTimeout(()=>this.remove(session),TTL);timer.unref();this.expiryTimers.set(session,timer);
    return session;
  }
  rotate(session:WebAccountSession):void {
    if(this.sessions.get(session.id)!==session || session.expires<=this.now())throw new Error('WEB_SESSION_EXPIRED');
    this.sessions.delete(session.id);session.id=randomBytes(32).toString('base64url');
    this.sessions.set(session.id,session);
  }
  remove(session:WebAccountSession):void { clearTimeout(this.expiryTimers.get(session));this.expiryTimers.delete(session);this.sessions.delete(session.id);if(!session.borrowed)session.auth.dispose();session.navigation=null; }
  close():void { for(const session of this.sessions.values())this.remove(session); }
  cookie(session:WebAccountSession|null,secure:boolean):string {
    return `${WEB_ACCOUNT_COOKIE}=${session?.id??''}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session?Math.max(0,Math.floor((session.expires-this.now())/1000)):0}${secure?'; Secure':''}`;
  }
}
