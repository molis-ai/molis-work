import { ImError, clientId, textInput } from "../errors.js";
import { transaction, type ServerDatabase } from "../database.js";
import { Identity, type Role, type Session } from "../identity.js";
import { ServerEvents } from "../events.js";
import { ContinuityActions } from "./actions.js";
import type { ActionFactory, ArtifactVersionRecord, BoundActions, GoalContractView, GoalEventProgressResult, GoalEventStateView, GoalProjection, ProgressCommand, ProjectScope } from "./types.js";

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new ImError("continuity.invalid_version", "缺少有效的目标版本");
  return Number(value);
}
export function progressInput(value: Record<string, unknown>, projectId: string): ProgressCommand {
  const allowed = ["command_id","project_id","goal_id","cursor","revision","summary","next_step","next_actor"];
  if (Object.keys(value).some(k => !allowed.includes(k)) || value.project_id !== projectId) throw new ImError("continuity.invalid_input", "操作不属于此项目或包含不支持的字段");
  const optional = (v: unknown, max: number) => v === "" || v === undefined ? "" : textInput(v, "后续说明", max);
  return {command_id:clientId(value.command_id),project_id:projectId,goal_id:textInput(value.goal_id,"目标",128),cursor:count(value.cursor),revision:count(value.revision),
    summary:textInput(value.summary,"进展",4000),next_step:optional(value.next_step,2000),next_actor:optional(value.next_actor,100)};
}

export class ContinuityService {
  private readonly actions: ContinuityActions;
  private readonly active = new Set<{session:Session;projectId:string;controller:AbortController}>();
  constructor(readonly db: ServerDatabase, readonly identity: Identity, readonly events: ServerEvents, factory: ActionFactory) { this.actions = new ContinuityActions(factory); }
  /** Local operator API, never exposed as a browser mutation. Existing ids are required. */
  registerProject(scope: ProjectScope, ownerId: string): void {
    textInput(scope.id,"项目",128); textInput(scope.title,"项目名称",200);
    if (!Array.isArray(scope.goal_ids) || scope.goal_ids.length > 100 || !Array.isArray(scope.artifacts) || scope.artifacts.length > 100) throw new ImError("continuity.invalid_scope", "请选择不超过 100 个目标和成果");
    scope.goal_ids.forEach(id => textInput(id,"目标",128));
    scope.artifacts.forEach(ref => {textInput(ref.artifact_id,"成果",128);if (count(ref.version) < 1) throw new ImError("continuity.invalid_version","成果版本必须大于零");});
    transaction(this.db, () => {
      const old = this.db.prepare("SELECT owner_id FROM mw_projects WHERE id=?").get(scope.id) as {owner_id:string}|undefined;
      if (old && old.owner_id !== ownerId) throw new ImError("continuity.owner_conflict","项目已属于另一位成员",409);
      this.db.prepare("INSERT INTO mw_projects VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,scope_json=excluded.scope_json").run(scope.id,scope.title,ownerId,JSON.stringify(scope));
      this.db.prepare("INSERT OR IGNORE INTO mw_access VALUES (?,?,'owner')").run(scope.id,ownerId);
    });
  }
  scope(projectId: string): ProjectScope {
    const row = this.db.prepare("SELECT scope_json FROM mw_projects WHERE id=?").get(projectId) as {scope_json:string}|undefined;
    if (!row) throw new ImError("continuity.not_found","项目不存在",404);
    return JSON.parse(row.scope_json) as ProjectScope;
  }
  projects(session: Session) {
    const member = this.identity.requireMember(session);
    return this.db.prepare("SELECT p.id,p.title,a.role FROM mw_projects p JOIN mw_access a ON a.project_id=p.id WHERE a.member_id=? ORDER BY p.rowid").all(member.id) as {id:string;title:string;role:Role}[];
  }
  members(projectId: string) {
    return this.db.prepare("SELECT m.id,m.display_name,a.role FROM mw_access a JOIN mw_members m ON m.id=a.member_id WHERE a.project_id=? ORDER BY a.rowid").all(projectId) as {id:string;display_name:string;role:Role}[];
  }
  private async authorized<T>(session: Session, projectId: string, minimum: Role, operation: (bound: BoundActions, validate: () => void) => Promise<T>): Promise<T> {
    const member = this.identity.requireMember(session), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new ImError("continuity.timeout","等待桌面响应超时，请核对后重试",503)),20000);
    timeout.unref();
    const validate = () => { controller.signal.throwIfAborted(); this.identity.access(session,projectId,minimum); };
    const active = {session,projectId,controller}; this.active.add(active);
    try {
      const bound = await this.actions.connect({projectId,memberId:member.id,validate,signal:controller.signal});
      const result = await operation(bound,validate); validate(); return result;
    } finally { clearTimeout(timeout);this.active.delete(active); }
  }
  private async goal(bound: BoundActions, goalId: string): Promise<GoalProjection> {
    const [state,contract] = await Promise.all([
      this.actions.invoke<GoalEventStateView>(bound,"goals.state.read",{goal_id:goalId}),
      this.actions.invoke<GoalContractView>(bound,"goals.contract.read",{goal_id:goalId}),
    ]);
    return {goal_id:goalId,title:state.intent.title,outcome:state.agreement.outcome,status:state.work_status,cursor:state.goal_event_cursor,revision:contract.goal.current_contract_revision,
      can_record:state.can_record,summary:state.progress_summary?.summary ?? "",next_step:state.progress_summary?.next_step ?? "",next_actor:state.progress_summary?.next_actor ?? "",updated_at:state.progress_summary?.recorded_at ?? null};
  }
  private async artifacts(bound: BoundActions, scope: ProjectScope, team: boolean): Promise<ArtifactVersionRecord[]> {
    const records: ArtifactVersionRecord[] = [];
    for (const reference of scope.artifacts) {
      const result = await this.actions.invoke<{selected:ArtifactVersionRecord|null}>(bound,"artifacts.read",{reference});
      if (!result.selected) throw new ImError("continuity.artifact_missing","共享成果的固定版本暂不可读取",503);
      if (team && result.selected.scope !== "team_project") throw new ImError("continuity.private_artifact","成果仍是私人版本。请在桌面明确共享后再邀请成员。",403);
      records.push(result.selected);
    }
    return records;
  }
  async read(session: Session, projectId: string) {
    return this.authorized(session,projectId,"viewer",async (bound,validate) => {
      const scope = this.scope(projectId), role = this.identity.access(session,projectId);
      const goals = await Promise.all(scope.goal_ids.map(id => this.goal(bound,id)));
      const artifacts = await this.artifacts(bound,scope,role !== "owner"); validate();
      return {project:{id:scope.id,title:scope.title,role},goals,artifacts:artifacts.map(a => ({artifact_id:a.artifact_id,version:a.version,
        title:typeof a.metadata.title === "string" ? a.metadata.title : a.artifact_id,
        plugin_id:a.producer_plugin_id,availability:a.availability,
        content:a.content_kind === "inline" ? (typeof a.payload === "string" ? a.payload : JSON.stringify(a.payload,null,2)) : ""})),members:this.members(projectId)};
    });
  }
  async invite(session: Session, projectId: string, role: unknown) {
    if (role !== "viewer" && role !== "editor") throw new ImError("continuity.invalid_role","请选择只读或协作权限");
    return this.authorized(session,projectId,"owner",async (bound,validate) => {
      await this.artifacts(bound,this.scope(projectId),true); validate();
      return this.identity.code("invite",session.member_id!,{projectId,role,session});
    });
  }
  revoke(session: Session, projectId: string, memberId: string): void {
    this.identity.access(session,projectId,"owner");
    if (memberId === session.member_id) throw new ImError("continuity.owner_required","项目所有者不能在此撤回自己",409);
    transaction(this.db, () => {
      this.db.prepare("DELETE FROM mw_access WHERE project_id=? AND member_id=? AND role!='owner'").run(projectId,memberId);
      // Outstanding project invites are invalidated too; an old link cannot restore access.
      this.db.prepare("UPDATE mw_codes SET consumed=1 WHERE project_id=? AND kind='invite'").run(projectId);
      this.events.append({scopeKind:"project",scopeId:projectId,kind:"access",entityId:memberId});
    });
    for (const active of this.active) if (active.projectId === projectId && active.session.member_id === memberId) active.controller.abort(new ImError("identity.forbidden","项目访问已撤回",403));
    this.events.notify();
  }
  deviceRevoked(deviceId: string): void {
    for (const active of this.active) if (active.session.id === deviceId) active.controller.abort(new ImError("identity.unauthenticated","设备已断开",401));
    this.events.notify();
  }
  async progress(session: Session, input: ProgressCommand): Promise<{saved:true;event_id:string;replayed:boolean}> {
    return this.authorized(session,input.project_id,"editor",async (bound,validate) => {
      if (!this.scope(input.project_id).goal_ids.includes(input.goal_id)) throw new ImError("continuity.goal_denied","此目标未在共享范围内",403);
      const key = [input.project_id,session.member_id!,input.command_id], json = JSON.stringify(input);
      const old = transaction(this.db, () => {
        const row = this.db.prepare("SELECT request_json,result_json FROM mw_commands WHERE project_id=? AND member_id=? AND command_id=?").get(...key) as {request_json:string;result_json:string|null}|undefined;
        if (row && row.request_json !== json) throw new ImError("continuity.key_reused","这条操作标识已用于不同内容，请重新提交",409);
        if (!row) this.db.prepare("INSERT INTO mw_commands(project_id,member_id,command_id,request_json,state) VALUES (?,?,?,?,'pending')").run(...key,json);
        return row;
      });
      if (old?.result_json) {validate();return {...JSON.parse(old.result_json),replayed:true};}
      try {
        let result = await this.actions.invoke<GoalEventProgressResult|null>(bound,"goals.progress.receipt",{goal_id:input.goal_id,idempotency_key:input.command_id});
        const replayed = !!result;
        if (!result) {
          validate();
          result = await this.actions.invoke<GoalEventProgressResult>(bound,"goals.progress.record",{goal_id:input.goal_id,idempotency_key:input.command_id,
            based_on_cursor:input.cursor,expected_goal_cursor:input.cursor,expected_contract_revision:input.revision,summary:input.summary,next_step:input.next_step,next_actor:input.next_actor});
        }
        validate(); const receipt = {saved:true as const,event_id:result.event_id,replayed:replayed || result.replayed};
        transaction(this.db, () => {
          const saved = this.db.prepare("SELECT result_json FROM mw_commands WHERE project_id=? AND member_id=? AND command_id=?").get(...key) as {result_json:string|null};
          this.db.prepare("UPDATE mw_commands SET state='saved',result_json=?,error_code=NULL WHERE project_id=? AND member_id=? AND command_id=?").run(JSON.stringify(receipt),...key);
          if (!saved.result_json) this.events.append({scopeKind:"project",scopeId:input.project_id,kind:"progress",entityId:input.goal_id});
        }); this.events.notify(); return receipt;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? String(error.code) : "continuity.delivery_unknown";
        this.db.prepare("UPDATE mw_commands SET state='pending',error_code=? WHERE project_id=? AND member_id=? AND command_id=? AND result_json IS NULL").run(code,...key);
        if (code === "event_progress.stale_goal" || code.includes("idempotency_key_reused")) throw new ImError(code,"桌面状态已变化，请查看最新状态后重新提交",409);
        throw error;
      }
    });
  }
  async assets(session: Session, projectId: string) {
    return this.authorized(session,projectId,"viewer",async (bound,validate) => {
      const scope = this.scope(projectId), role = this.identity.access(session,projectId);
      const artifacts = await this.artifacts(bound,scope,role !== "owner");
      const goals = await Promise.all(scope.goal_ids.map(id => this.goal(bound,id))); validate();
      return {format:"molis-work-assets",version:1,source_project_id:projectId,title:scope.title,goals,
        artifacts:artifacts.map(a => ({artifact_id:a.artifact_id,version:a.version,artifact_type_id:a.artifact_type_id,schema_version:a.schema_version,
          owner_actor_id:a.owner_actor_id,producer:{plugin_id:a.producer_plugin_id,plugin_version:a.producer_plugin_version,binding_signature:a.producer_binding_signature},
          content:a.content_kind === "inline" ? {kind:"inline",payload:a.payload} : {kind:"reference",content_ref:`unavailable://${encodeURIComponent(a.artifact_id)}/${a.version}`,digest:a.content_digest,size_bytes:a.size_bytes,available:false},
          expected_digest:a.content_digest,metadata:typeof a.metadata.title === "string" ? {title:a.metadata.title} : {},scope:a.scope,
          availability:a.availability,lifecycle_state:a.lifecycle_state,supersedes_version:null,
          source_supersedes_version:a.supersedes_version})),
        dependencies:artifacts.map(a => ({plugin_id:a.producer_plugin_id,plugin_version:a.producer_plugin_version,credential_required:a.content_kind === "reference"})),
        notes:["只包含明确选中的固定成果版本和目标接续摘要。","目标摘要不包含原项目完整事件历史、权限或完成验收证据。","外部引用不携带文件路径和凭据，换设备后保持不可用，须重新连接来源。"]};
    });
  }
}
