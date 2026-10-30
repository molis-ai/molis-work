import { matchPluginRoute, PLUGIN_MANAGEMENT_OPERATIONS } from "./plugin-route-operations.js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionReference, isSubjectReader } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginRouteMatcher } from "@molis-ai/molis-work-plugin-runtime";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import type { PageActionRequest } from "./plugin-page-actions.js";

interface Activation {
  readonly manifest: PluginManifest;
  readonly install_id: string | null;
  readonly project_id: string | null;
  readonly actor_id: string;
  assertCurrent(permission?: string): void;
  invoke?(request: PageActionRequest): Promise<unknown>;
  resolveFiles?(paths: readonly string[]): readonly string[];
  requestAllowed?(method: string, pathname: string): boolean;
}
interface Page {
  readonly activation: Activation;
  readonly project_id: string | null;
  readonly requests: Set<AbortController>;
  readonly match: ReturnType<typeof pluginRouteMatcher>;
  expiresAt: number;
  closing?: boolean;
  assertScope?(): Promise<void>;
}
const refused = () => new ActionError("actions.forbidden", "插件页面权限已失效或未声明此入口");
const cancelled = () => new ActionError("actions.cancelled", "插件页面已关闭，这次请求已结束");
const homes = new Map<string, PluginPageAuthority>();
const requests = new WeakMap<IncomingMessage, { page: Page; check(): void; signal: AbortSignal }>();

/** Authority stays in the trusted outer document. The embedded document receives only a MessagePort. */
export function pluginPagesFor(home: string): PluginPageAuthority {
  const key = resolve(home);
  let authority = homes.get(key);
  if (!authority) {
    homes.set(key, authority = new PluginPageAuthority());
    projectDeletedHooksFor(key).register({ id: "plugin-pages", label: null, survivesRebuild: true,
      clear: project => authority!.clearProject(project) });
  }
  return authority;
}

export class PluginPageAuthority {
  private readonly activations = new Set<Activation>();
  private readonly pages = new Map<string, Page>();

  connect(activation: Activation): () => void {
    this.activations.add(activation);
    return () => {
      this.activations.delete(activation);
      for (const [id, page] of this.pages) if (page.activation === activation) this.close(id);
    };
  }

  open(pluginId: string, projectId: string | null, actorId: string, assertScope?: () => Promise<void>, registered?: Activation): { page_id: string; storage_scope: string } {
    const candidates = [...this.activations].filter(item => item.install_id && item.manifest.plugin_id === pluginId && item.actor_id === actorId);
    const activation = candidates.find(item => item.project_id === null && item.resolveFiles)
      ?? candidates.find(item => item.project_id === projectId) ?? candidates.find(item => item.project_id === null) ?? registered;
    if (!activation) throw refused();
    activation.assertCurrent();
    if (activation === registered) this.activations.add(activation);
    for (const [id, page] of this.pages) if (page.expiresAt < Date.now()) this.close(id);
    if (this.pages.size >= 256) throw new ActionError("actions.unavailable", "打开的插件页面过多，请关闭不用的页面");
    const id = randomUUID();
    this.pages.set(id, { activation, project_id: projectId, requests: new Set(), expiresAt: Date.now() + 30 * 60_000,
      match: activation.install_id ? pluginRouteMatcher(activation.manifest) : () => null, assertScope });
    return { page_id: id, storage_scope: `${activation.install_id ?? activation.manifest.plugin_id}:${activation.project_id ?? "home"}` };
  }

  /** Ends the page and its requests, for `reason`: a withdrawal unless the caller says the person left it (`left`). */
  close(id: string, reason: () => ActionError = refused): void {
    const page = this.pages.get(id);
    this.pages.delete(id);
    if (page && page.activation.install_id === null) this.activations.delete(page.activation);
    for (const request of page?.requests ?? []) request.abort(reason());
  }

  /**
   * Why a page's requests end when the person leaves it (closes the page, or its HTTP request ends): a cancellation while the page still
   * has its authority, a withdrawal once it has lost it. A refresh shared by its requests keeps the rotated tokens only for a cancellation
   * (S-95, T-218).
   */
  private left(page: Page): ActionError {
    if (!this.activations.has(page.activation)) return refused();
    // Only the page's own authority, no route permission: a page's grant is fixed when it is activated, and every withdrawal goes
    // through `revoke` (`withdrawPages`), which closes the page as forbidden. If a grant could change while the page is open, this
    // would have to check the route's permission too, or a page that lost it would still leave as a cancellation (T-218 S3).
    try { page.activation.assertCurrent(); } catch { return refused(); }
    return cancelled();
  }

  /** Cancel ordinary work, run at most one own action under the original authority, then revoke the page. */
  async finish(id: string, action: { reference: ActionReference; input: unknown } | undefined): Promise<void> {
    const page = this.pages.get(id);
    if (!page || !action || page.closing) { this.close(id, () => page ? this.left(page) : refused()); return; }
    page.closing = true;
    const reason = this.left(page);
    for (const request of page.requests) request.abort(reason);
    const controller = new AbortController(); page.requests.add(controller);
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.pages.get(id) !== page || !this.activations.has(page.activation) || page.expiresAt < Date.now()) throw refused();
      page.activation.assertCurrent();
    };
    const beforeEffect = async () => { check(); await page.assertScope?.(); check(); };
    try {
      const own = page.activation.manifest.actions?.find(item => item.capability_id === action.reference?.capability_id && item.version === action.reference?.version);
      if (!own || !page.activation.invoke) throw refused();
      for (const permission of own.action.permissions) page.activation.assertCurrent(permission);
      await beforeEffect();
      await page.activation.invoke({ ...action, project_id: page.project_id, signal: controller.signal,
        assertCurrent: check, beforeEffect, beforeBackgroundEffect: beforeEffect });
    } finally { this.close(id, () => this.left(page)); }
  }

  clearProject(projectId: string): void {
    for (const [id, page] of this.pages) if (page.project_id === projectId) this.close(id);
  }

  /** A terminal transport keeps this closure, never a caller-supplied installation or project. */
  terminalAccess(id: string) {
    const page = this.pages.get(id);
    if (!page || !page.activation.install_id) throw refused();
    const check = () => {
      if (this.pages.get(id) !== page || !this.activations.has(page.activation) || page.expiresAt < Date.now()) throw refused();
      page.activation.assertCurrent();
    };
    check();
    return { install_id: page.activation.install_id, project_id: page.project_id, actor_id: page.activation.actor_id,
      async assertCurrent() { check(); await page.assertScope?.(); check(); page.expiresAt = Date.now() + 30 * 60_000; } };
  }

  /** The shared transport guard calls this before any route, including management and static resources. */
  async bind(request: IncomingMessage, url: URL, response?: ServerResponse): Promise<(() => void) | undefined> {
    const contextual = request.headers["x-molis-context-page"], id = contextual ?? request.headers["x-molis-plugin-page"];
    if (id === undefined) return;
    const page = typeof id === "string" ? this.pages.get(id) : undefined;
    if (!page || page.closing || page.expiresAt < Date.now()) throw refused();
    const prefix = page.project_id === null ? "" : `/projects/${encodeURIComponent(page.project_id)}`;
    if (!url.pathname.startsWith(`${prefix}/api/`)) throw refused();
    const pathname = url.pathname.slice(prefix.length);
    const ownPrefix = `/api/plugins/${page.activation.manifest.plugin_id}/`;
    const operation = pathname.startsWith(ownPrefix) ? pathname.slice(ownPrefix.length) : null;
    if (operation !== null && PLUGIN_MANAGEMENT_OPERATIONS.has(operation)) throw refused();
    const embeddedRevision = page.activation.manifest.ui.embedded_plugins?.some(id => pathname === `/api/plugins/${id}/view-revision`);
    const revision = Boolean(page.activation.install_id) && (operation === "view-revision" || embeddedRevision) && request.method === "GET";
    // A toolbar callback never uses a route (the gate below lets it only its own owner choices), so its path is not matched. For any other
    // request, bad percent-encoding is answered by `matchPluginRoute`: 400 for this plugin's declared shape, otherwise no route and the gate refuses it.
    const route = contextual === undefined ? matchPluginRoute(page.match, page.activation.manifest.plugin_id, request.method ?? "GET", pathname) : null;
    const directory = Boolean(page.activation.install_id) && request.method === "POST" && pathname === "/api/host/directory-grants";
    const action = Boolean(page.activation.invoke) && request.method === "POST" && pathname === "/api/host/plugin-page-actions";
    const files = request.method === "POST" && pathname === "/api/host/plugin-page-files" && page.activation.resolveFiles;
    const checkOnly = request.method === "POST" && pathname === "/api/host/plugin-page-check";
    // An isolated page's related Assistant works are the action `assistant.works.related` now (PG-057), through the page's action gateway.
    const objectRead = Boolean(page.activation.install_id) && request.method === "POST" && pathname === "/api/placement/describe";
    const registered = page.activation.requestAllowed?.(request.method ?? "GET", pathname);
    // Only the trusted toolbar adds this header to a bound callback. The child fetch bridge drops it, and a page's
    // ordinary header never opens these owner actions. Both paths retain the page's cancellation and activation.
    const contextChoice = contextual !== undefined && request.headers["x-molis-plugin-page"] === undefined
      && request.method === "POST" && ["/api/contextual/prepare", "/api/contextual/attach", "/api/placement/convert"].includes(pathname);
    const workspaceChoice = contextual !== undefined && request.headers["x-molis-plugin-page"] === undefined
      && Boolean(page.project_id && page.activation.install_id) && request.method === "POST" && pathname === "/api/host/plugin-page-workspaces";
    const reviewChoice = contextual !== undefined && request.headers["x-molis-plugin-page"] === undefined && Boolean(page.project_id)
      && (request.method === "GET" && ["/api/agent/reviews", "/api/agent/reviews/recovery"].includes(pathname)
        || request.method === "POST" && ["/api/agent/reviews/decide", "/api/agent/reviews/recovery"].includes(pathname));
    if (contextual !== undefined ? !contextChoice && !workspaceChoice && !reviewChoice : !route && !directory && !revision && !action && !files && !checkOnly && !objectRead && !registered) throw refused();
    const permission = directory ? "directory:read" : workspaceChoice ? "workspace:read" : route?.permission ?? undefined;
    const controller = new AbortController();
    const check = () => {
      controller.signal.throwIfAborted();
      if (this.pages.get(id as string) !== page || !this.activations.has(page.activation)) throw refused();
      page.activation.assertCurrent(permission);
    };
    await page.assertScope?.(); check(); page.expiresAt = Date.now() + 30 * 60_000; page.requests.add(controller);
    requests.set(request, { page, check, signal: controller.signal });
    const release = () => { controller.abort(this.left(page)); page.requests.delete(controller); requests.delete(request); };
    response?.once("finish", release); response?.once("close", release); return release;
  }
}

/** Only the transport guard can populate this association; request JSON and copied headers cannot fabricate it. */
export function pluginPageRequest(request: IncomingMessage) {
  const authority = requests.get(request);
  if (!authority) return undefined;
  authority.check();
  return { plugin_id: authority.page.activation.manifest.plugin_id, project_id: authority.page.project_id,
    signal: authority.signal, assertCurrent: authority.check,
    ownedObject(object: {kind: string; id: string; project_id?: string | null}) {
      authority.check();
      if (!object || typeof object.kind !== "string" || typeof object.id !== "string" || !object.id || object.id.length > 256) throw refused();
      const reader = authority.page.activation.manifest.actions?.find(definition => isSubjectReader(definition.action) && definition.action.subject_kinds.includes(object.kind));
      if (!reader) throw refused();
      const project_id = reader.action.scope === "home" ? null : authority.page.project_id;
      if (object.project_id !== undefined && object.project_id !== project_id) throw refused();
      for (const permission of reader.action.permissions) authority.page.activation.assertCurrent(permission);
      return {kind: object.kind, id: object.id, project_id};
    },
    invoke(request: PageActionRequest) { if (!authority.page.activation.invoke) throw refused(); return authority.page.activation.invoke(request); },
    async resolveFiles(paths: readonly string[]) {
      await authority.page.assertScope?.(); authority.check();
      const resolveFiles = authority.page.activation.resolveFiles;
      if (!resolveFiles) throw refused();
      return resolveFiles(paths);
    } };
}
