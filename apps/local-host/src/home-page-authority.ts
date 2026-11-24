import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ActionError,
  parseExactActionReferences,
  type ActionCallContext,
  type ActionClient,
  type ExactActionReference,
  type HomePageSubject,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { homeErrors, type HomePageVersion } from "@molis-ai/molis-work-contracts/services/home";
import { actionKey } from "@molis-ai/molis-work-service-home";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { issueHomePageCaller } from "./plugin-callers.js";
import { activeLocale } from "./web-locale.js";
import { captureWebSessionAuthority } from "./web-sessions.js";

const HOME_PAGE_IDLE_MS = 30 * 60_000;
const HOME_PAGE_SESSION_LIMIT = 128;

export const HOME_PAGE_SESSION_HEADER = "x-molis-home-page";

interface HomePageSession {
  readonly id: string;
  readonly subject: HomePageSubject;
  readonly actor_id: string;
  readonly declared: ReadonlySet<string>;
  readonly approved: ReadonlySet<string>;
  readonly requests: Set<AbortController>;
  readonly sessionCurrent: () => void;
  readonly withdraw: () => void;
  expiresAt: number;
  revoked: boolean;
}

interface BoundHomePageRequest {
  readonly session: HomePageSession;
  readonly controller: AbortController;
  readonly check: () => void;
}

const boundRequests = new WeakMap<IncomingMessage, BoundHomePageRequest>();

const sessionInvalid = (message = "生成首页会话已失效或无权访问") => homeErrors.session_invalid(message);

function sessionLapsed(session: HomePageSession): boolean {
  return session.requests.size === 0 && session.expiresAt < Date.now();
}

/**
 * Manages Host-issued opaque `page_session_id` records for live adopted generated home pages (`home-page`) and read-only
 * draft previews (`home-page-preview`). Every action call resolves its subject exclusively from this registry — never from
 * request body fields (S-home-page-authority). Switching, restoring, selecting basic, closing, or deleting the project revokes
 * active sessions immediately and aborts every in-flight call so `beforeEffect()` rejects before writing (S-home-page-approval).
 */
export class HomePageSessionRegistry {
  private readonly sessions = new Map<string, HomePageSession>();

  private expire(): void {
    for (const [id, session] of this.sessions) {
      if (sessionLapsed(session)) this.close(id);
    }
  }

  private openSession(
    kind: HomePageSubject["kind"],
    projectId: string,
    actorId: string,
    version: HomePageVersion,
    approvedActions: readonly ExactActionReference[],
  ): { page_session_id: string; subject: HomePageSubject } {
    this.expire();
    if (this.sessions.size >= HOME_PAGE_SESSION_LIMIT) {
      throw new ActionError("actions.unavailable", "打开的生成首页会话过多，请关闭不用的标签页");
    }
    const id = randomUUID();
    const subject: HomePageSubject = Object.freeze({
      kind,
      project_id: projectId,
      page_id: version.page_id,
      version: version.version,
    });
    const sessionCurrent = captureWebSessionAuthority();
    const record: HomePageSession & { withdraw: () => void } = {
      id,
      subject,
      actor_id: actorId,
      declared: new Set(version.actions.map(actionKey)),
      approved: new Set(approvedActions.map(actionKey)),
      requests: new Set(),
      sessionCurrent,
      withdraw: () => {},
      expiresAt: Date.now() + HOME_PAGE_IDLE_MS,
      revoked: false,
    };
    this.sessions.set(id, record);
    record.withdraw = issueHomePageCaller(subject, LOCAL_OWNER_PERMISSIONS, () => {
      if (record.revoked || this.sessions.get(record.id) !== record) {
        throw sessionInvalid("生成首页会话已失效");
      }
      record.sessionCurrent();
    }, approvedActions.filter(ref => record.declared.has(actionKey(ref))));
    return { page_session_id: id, subject };
  }

  openLive(
    projectId: string,
    actorId: string,
    version: HomePageVersion,
    approvedActions: readonly ExactActionReference[],
  ): { page_session_id: string; subject: HomePageSubject } {
    return this.openSession("home-page", projectId, actorId, version, approvedActions);
  }

  openPreview(
    projectId: string,
    actorId: string,
    version: HomePageVersion,
  ): { page_session_id: string; subject: HomePageSubject } {
    return this.openSession("home-page-preview", projectId, actorId, version, []);
  }

  close(id: string, reason: () => ActionError = () => sessionInvalid("生成首页会话已关闭")): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.revoked = true;
    session.withdraw();
    this.sessions.delete(id);
    for (const controller of [...session.requests]) {
      controller.abort(reason());
    }
    session.requests.clear();
  }

  /** Closes a session only when it belongs to `projectId` (prevents cross-project session teardown). */
  closeForProject(projectId: string, id: string): void {
    const session = this.sessions.get(id);
    if (!session || session.subject.project_id !== projectId) return;
    this.close(id);
  }

  /** Revokes every live adopted `home-page` session in `projectId` (called immediately on adopt / restore / select basic). */
  revokeLiveProject(projectId: string): void {
    for (const [id, session] of [...this.sessions]) {
      if (session.subject.project_id === projectId && session.subject.kind === "home-page") {
        this.close(id, () => sessionInvalid("项目首页已切换或撤下，旧页面会话已作废"));
      }
    }
  }

  /** Revokes all live and preview sessions belonging to `projectId` (called on project deletion / close). */
  clearProject(projectId: string): void {
    for (const [id, session] of [...this.sessions]) {
      if (session.subject.project_id === projectId) {
        this.close(id, () => sessionInvalid("项目已关闭或删除，首页会话已作废"));
      }
    }
  }

  /**
   * Transport-level binding for `x-molis-home-page`: ONLY `/projects/<project>/api/home-pages/actions` (POST) is permitted.
   * Any other route carrying `x-molis-home-page` (including `files/read`, `adopt`, `restore`, plugin routes) is refused immediately.
   */
  bind(request: IncomingMessage, url: URL, response?: ServerResponse): (() => void) | undefined {
    const raw = request.headers[HOME_PAGE_SESSION_HEADER];
    if (raw === undefined) return undefined;
    const id = typeof raw === "string" ? raw : undefined;
    const session = id ? this.sessions.get(id) : undefined;
    if (!session || session.revoked) throw sessionInvalid();
    if (sessionLapsed(session)) {
      this.close(session.id);
      throw sessionInvalid("生成首页长时间未操作，会话已过期，请刷新页面");
    }
    const expectedPath = `/projects/${encodeURIComponent(session.subject.project_id)}/api/home-pages/actions`;
    if (request.method !== "POST" || url.pathname !== expectedPath) {
      throw sessionInvalid("生成首页只能经页面动作网关调用本项目已获准的动作");
    }
    const controller = new AbortController();
    const check = () => {
      controller.signal.throwIfAborted();
      if (session.revoked || this.sessions.get(session.id) !== session) {
        throw sessionInvalid("生成首页会话已失效");
      }
      session.sessionCurrent();
    };
    check();
    session.expiresAt = Date.now() + HOME_PAGE_IDLE_MS;
    session.requests.add(controller);
    boundRequests.set(request, { session, controller, check });
    const release = () => {
      controller.abort(new ActionError("actions.cancelled", "生成首页请求已结束"));
      if (session.requests.delete(controller)) session.expiresAt = Date.now() + HOME_PAGE_IDLE_MS;
      boundRequests.delete(request);
    };
    response?.once("finish", release);
    response?.once("close", release);
    return release;
  }

  /**
   * Invokes one action on behalf of a bound home-page session (either via HTTP transport binding or directly in service tests
   * using `page_session_id`). Body fields cannot override subject, project, page, or version (S-home-page-authority).
   */
  async invokeBySessionId(options: {
    pageSessionId: string;
    projectId: string;
    body: unknown;
    client: ActionClient;
    permissions: readonly string[];
    signal?: AbortSignal;
  }): Promise<unknown> {
    const session = this.sessions.get(options.pageSessionId);
    if (!session || session.revoked) throw sessionInvalid();
    if (sessionLapsed(session)) {
      this.close(session.id);
      throw sessionInvalid("生成首页长时间未操作，会话已过期，请刷新页面");
    }
    if (session.subject.project_id !== options.projectId) {
      throw sessionInvalid("生成首页会话不属于当前项目");
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason ?? new ActionError("actions.cancelled", "请求已取消"));
    if (options.signal) {
      if (options.signal.aborted) abortFromCaller();
      else options.signal.addEventListener("abort", abortFromCaller, { once: true });
    }
    const check = () => {
      controller.signal.throwIfAborted();
      if (session.revoked || this.sessions.get(session.id) !== session) {
        throw sessionInvalid("生成首页会话已失效");
      }
      session.sessionCurrent();
    };
    session.requests.add(controller);
    session.expiresAt = Date.now() + HOME_PAGE_IDLE_MS;
    try {
      return await this.executeBound(session, controller, check, options.body, options.client, options.permissions);
    } finally {
      options.signal?.removeEventListener("abort", abortFromCaller);
      if (session.requests.delete(controller)) session.expiresAt = Date.now() + HOME_PAGE_IDLE_MS;
    }
  }

  async invokeBoundRequest(
    request: IncomingMessage,
    projectId: string,
    body: unknown,
    client: ActionClient,
    permissions: readonly string[],
  ): Promise<unknown> {
    const bound = boundRequests.get(request);
    if (!bound) throw sessionInvalid("缺少有效的生成首页会话");
    if (bound.session.subject.project_id !== projectId) {
      throw sessionInvalid("生成首页会话不属于当前项目");
    }
    return this.executeBound(bound.session, bound.controller, bound.check, body, client, permissions);
  }

  private async executeBound(
    session: HomePageSession,
    controller: AbortController,
    check: () => void,
    body: unknown,
    client: ActionClient,
    permissions: readonly string[],
  ): Promise<unknown> {
    check();
    if (!isRecord(body)) throw new ActionError("actions.input_invalid", "页面动作请求必须是对象");
    const availability = body.mode === "availability";
    const allowedKeys = availability ? ["mode", "reference"] : ["reference", "input"];
    // Reject any attempt to pass subject / project_id / page_id / version / actor_id in the request body.
    if (Object.keys(body).some(key => !allowedKeys.includes(key))) {
      throw new ActionError("actions.input_invalid", "页面动作请求包含未允许的字段");
    }
    const rawRef = body.reference;
    if (!isRecord(rawRef) || typeof rawRef.capability_id !== "string" || typeof rawRef.version !== "number" || typeof rawRef.provider_id !== "string") {
      throw new ActionError("actions.input_invalid", "页面动作必须给出确切的 capability_id、version 和 provider_id");
    }
    const ref: ExactActionReference = {
      capability_id: rawRef.capability_id,
      version: rawRef.version,
      provider_id: rawRef.provider_id,
    };
    try {
      parseExactActionReferences([ref]);
    } catch (error) {
      throw new ActionError("actions.input_invalid", error instanceof Error ? error.message : "页面动作引用无效");
    }

    const key = actionKey(ref);
    if (!session.declared.has(key)) {
      throw new ActionError("actions.forbidden", "这一版生成首页没有声明这项动作");
    }
    const isPreview = session.subject.kind === "home-page-preview";
    if (!isPreview && !session.approved.has(key)) {
      throw new ActionError("actions.forbidden", "这项动作未获得本人在当前页面版本上的批准");
    }

    const caller: ActionCallContext = {
      actor_id: session.actor_id,
      project_id: session.subject.project_id,
      audience: "plugin",
      home_page: session.subject,
      ...(isPreview ? { query_only: true as const } : {}),
      permissions: [...permissions],
      allowed_actions: [ref],
      signal: controller.signal,
      locale: activeLocale() ?? undefined,
      validate_authority: async () => { check(); },
      assert_authority_current: () => { check(); },
    };

    const views = await client.discover(caller);
    check();
    const view = views.find(
      candidate =>
        candidate.capability_id === ref.capability_id &&
        candidate.version === ref.version &&
        candidate.provider.provider_id === ref.provider_id,
    );
    if (!view || !view.action.audiences.includes("plugin")) {
      throw new ActionError("actions.forbidden", "这项动作未对页面开放或当前不可调用");
    }
    if (isPreview && view.operation !== "query") {
      throw new ActionError("actions.forbidden", "试用预览中只允许只读查询动作，不能执行修改操作");
    }
    if (availability) {
      return view.availability;
    }
    if (!view.availability.available) {
      throw new ActionError(view.availability.code ?? "actions.unavailable", view.availability.reason ?? "这项动作当前不可用", {
        kind: view.availability.kind,
      });
    }
    const result = await client.invoke(caller, ref, body.input);
    check();
    return result;
  }
}

export function homePageRequestBound(request: IncomingMessage): boolean {
  return boundRequests.has(request) || request.headers[HOME_PAGE_SESSION_HEADER] !== undefined;
}
