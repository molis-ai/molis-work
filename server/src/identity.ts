import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ServerDatabase } from "./database.js";
import { transaction } from "./database.js";
import { ImError, textInput } from "./errors.js";

export interface Member { id: string; display_name: string }
export interface Session { id: string; member_id: string | null; expires_at: number }
export type Role = "owner" | "editor" | "viewer";
const AGE = 30 * 24 * 3600;
export const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
export const memberClientId = (id: string): string => `runtime:cross-device:${id}`;

export class Identity {
  private readonly cookieName: string;
  constructor(readonly db: ServerDatabase, private readonly now = Date.now) {
    this.cookieName = "molis_work_session_" + (db.prepare("SELECT cookie_suffix FROM mw_server_identity WHERE singleton=1").get() as {cookie_suffix:string}).cookie_suffix;
  }
  session(request: IncomingMessage): Session | null {
    const token = request.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(this.cookieName + "="))?.slice(this.cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    return this.db.prepare("SELECT id,member_id,expires_at FROM mw_sessions WHERE token_hash=? AND revoked=0 AND expires_at>?").get(hash(token), this.now()) as Session ?? null;
  }
  active(session: Session): Session {
    const fresh = this.db.prepare("SELECT id,member_id,expires_at FROM mw_sessions WHERE id=? AND revoked=0 AND expires_at>?").get(session.id, this.now()) as Session | undefined;
    if (!fresh || fresh.member_id !== session.member_id) throw new ImError("identity.unauthenticated", "设备连接已失效，请重新配对", 401);
    return fresh;
  }
  requireMember(session: Session): Member {
    this.active(session);
    const member = this.member(session);
    if (!member) throw new ImError("identity.unauthenticated", "请先连接设备或设置你的名字", 401);
    return member;
  }
  require(request: IncomingMessage, named = true): Session {
    const session = this.session(request);
    if (!session || (named && !session.member_id)) throw new ImError("identity.unauthenticated", "请先连接设备", 401);
    return session;
  }
  member(session: Session): Member | null {
    return session.member_id ? this.db.prepare("SELECT id,display_name FROM mw_members WHERE id=?").get(session.member_id) as Member ?? null : null;
  }
  createMember(name: string): Member {
    const member = { id: randomUUID(), display_name: textInput(name, "名字", 40) };
    this.db.prepare("INSERT INTO mw_members VALUES (?,?)").run(member.id, member.display_name);
    return member;
  }
  name(session: Session, value: unknown): { member: Member } {
    this.active(session);
    return transaction(this.db, () => {
      const name = textInput(value, "名字", 40), member = this.member(session) ?? this.createMember(name);
      this.db.prepare("UPDATE mw_members SET display_name=? WHERE id=?").run(name, member.id);
      this.db.prepare("UPDATE mw_sessions SET member_id=? WHERE id=?").run(member.id, session.id);
      return { member: { ...member, display_name: name } };
    });
  }
  private issue(memberId: string | null, label: string, response: ServerResponse, secure: boolean): Session {
    const token = randomBytes(32).toString("base64url");
    const session = { id: randomUUID(), member_id: memberId, expires_at: this.now() + AGE * 1000 };
    this.db.prepare("INSERT INTO mw_sessions(id,member_id,token_hash,label,expires_at) VALUES (?,?,?,?,?)").run(session.id, memberId, hash(token), label, session.expires_at);
    response.setHeader("set-cookie", `${this.cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${AGE}${secure ? "; Secure" : ""}`);
    return session;
  }
  ensure(request: IncomingMessage, response: ServerResponse, secure: boolean): Session {
    return this.session(request) ?? this.issue(null, "浏览器", response, secure);
  }
  code(kind: "bootstrap" | "pair" | "invite", memberId: string, input: { projectId?: string; role?: Role; session?: Session } = {}): { code: string; expires_at: number } {
    if (input.session) this.requireMember(input.session);
    const code = randomBytes(24).toString("base64url"), expires_at = this.now() + 10 * 60 * 1000;
    this.db.prepare("INSERT INTO mw_codes(hash,kind,member_id,project_id,role,creator_session,expires_at) VALUES (?,?,?,?,?,?,?)")
      .run(hash(code), kind, memberId, input.projectId ?? null, input.role ?? null, input.session?.id ?? null, expires_at);
    return { code, expires_at };
  }
  connect(input: { code: unknown; display_name: unknown; device_label: unknown }, request: IncomingMessage, response: ServerResponse, secure: boolean): Session {
    const code = textInput(input.code, "代码", 80), label = textInput(input.device_label, "设备名称", 60), name = textInput(input.display_name, "名字", 40);
    return transaction(this.db, () => {
      const invitation = this.db.prepare("SELECT * FROM mw_codes WHERE hash=? AND consumed=0 AND expires_at>?").get(hash(code), this.now()) as {kind:string; member_id:string; project_id:string|null; role:Role; creator_session:string|null} | undefined;
      if (!invitation) throw new ImError("identity.code_invalid", "代码已使用或过期，请生成新代码", 401);
      if (invitation.creator_session && !this.db.prepare("SELECT 1 FROM mw_sessions WHERE id=? AND revoked=0 AND expires_at>?").get(invitation.creator_session, this.now())) throw new ImError("identity.code_invalid", "发起设备已断开，请生成新代码", 401);
      const existing = this.session(request);
      let memberId = invitation.member_id;
      if (invitation.kind === "invite") {
        const owner = this.db.prepare("SELECT owner_id FROM mw_projects WHERE id=?").get(invitation.project_id) as {owner_id:string} | undefined;
        if (owner?.owner_id !== invitation.member_id) throw new ImError("identity.code_invalid", "邀请已失效", 403);
        memberId = existing?.member_id ?? this.createMember(name).id;
        this.db.prepare("INSERT INTO mw_access VALUES (?,?,?) ON CONFLICT(project_id,member_id) DO UPDATE SET role=CASE WHEN role='owner' THEN role ELSE excluded.role END")
          .run(invitation.project_id, memberId, invitation.role);
      }
      this.db.prepare("UPDATE mw_codes SET consumed=1 WHERE hash=?").run(hash(code));
      if (existing) this.db.prepare("UPDATE mw_sessions SET revoked=1 WHERE id=?").run(existing.id);
      return this.issue(memberId, label, response, secure);
    });
  }
  access(session: Session, projectId: string, minimum: Role = "viewer"): Role {
    const member = this.requireMember(session);
    const row = this.db.prepare("SELECT role FROM mw_access WHERE project_id=? AND member_id=?").get(projectId, member.id) as {role:Role} | undefined;
    if (!row || (minimum === "owner" && row.role !== "owner") || (minimum === "editor" && row.role === "viewer")) throw new ImError("identity.forbidden", "此项目的访问已撤回或没有操作权限", 403);
    return row.role;
  }
  devices(session: Session) {
    const member = this.requireMember(session);
    return (this.db.prepare("SELECT id,label FROM mw_sessions WHERE member_id=? AND revoked=0 AND expires_at>? ORDER BY rowid").all(member.id, this.now()) as {id:string;label:string}[]).map(d => ({...d,current:d.id === session.id}));
  }
  revokeDevice(session: Session, deviceId: string): boolean {
    const member = this.requireMember(session);
    return this.db.prepare("UPDATE mw_sessions SET revoked=1 WHERE id=? AND member_id=? AND revoked=0").run(deviceId, member.id).changes > 0;
  }
}
