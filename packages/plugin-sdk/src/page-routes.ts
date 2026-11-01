import { pluginErrors, type PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_PAGE_ROUTE_PARAM_LIMIT, type UiPageRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";

// The page routes a plugin declares (`ui.page_routes`, T-116 / PG-060): the grammar the Manifest is checked with and the one matcher the
// Host answers a GET path with, so the two cannot disagree and no plugin's route is written as code on the Host's side. A route has a
// path of lowercase literals and `:name` parameters and names the query parameters it reads; what a match gives is exactly those
// parameters, as strings no longer than `UI_PAGE_ROUTE_PARAM_LIMIT`, and nothing else of the request.

/** Bounds on what one Manifest declares as page routes. */
export const PAGE_ROUTE_LIMITS = Object.freeze({ routes: 32, segments: 8, query: 4, input: 8 });

const ROUTE_ID = /^[a-z][a-z0-9-]{0,63}$/u;
const PARAM_NAME = /^[a-z][a-z0-9_]{0,31}$/u;
const LITERAL = /^[a-z0-9_-]+$/u;
const TRUSTED_PARAMS: readonly string[] = ["actor_id", "idempotency_key", "control_token"];

type Segment = string | { readonly param: string };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** The segments of a declared path, or what is wrong with it. */
function declaredSegments(path: unknown): readonly Segment[] | string {
  if (typeof path !== "string" || !path.startsWith("/")) return "路径必须以 / 开头";
  if (path === "/") return [];
  const parts = path.slice(1).split("/");
  if (parts.length > PAGE_ROUTE_LIMITS.segments) return `路径最多 ${PAGE_ROUTE_LIMITS.segments} 段`;
  const segments: Segment[] = [];
  for (const part of parts) {
    if (part.startsWith(":")) {
      if (!PARAM_NAME.test(part.slice(1))) return `参数名 ${part} 只能用小写字母、数字和下划线，以字母开头`;
      segments.push({ param: part.slice(1) });
    } else if (LITERAL.test(part)) segments.push(part);
    else return `路径段 “${part}” 只能是小写字母、数字、下划线和连字符，不能为空`;
  }
  return segments;
}

/** Whether some path fits both patterns: the same length, and at every position the same literal or a parameter on either side. */
function overlap(left: readonly Segment[], right: readonly Segment[]): boolean {
  return left.length === right.length && left.every((segment, index) => typeof segment !== "string" || typeof right[index] !== "string" || segment === right[index]);
}

/** The names a route's request parameters have: its path parameters, then its query parameters. */
function parameterNames(segments: readonly Segment[], query: readonly string[]): string[] {
  return [...segments.flatMap(segment => typeof segment === "string" ? [] : [segment.param]), ...query];
}

/** The refusals for `ui.page_routes` and for the `stage_data.input` that names its parameters. Never throws. */
export function pageRouteProblems(manifest: PluginManifest): string[] {
  const declared: unknown = manifest.ui.page_routes;
  const problems: string[] = [];
  const known = new Set<string>();
  if (declared !== undefined) {
    if (!Array.isArray(declared)) return ["ui.page_routes 必须为数组"];
    if (declared.length > PAGE_ROUTE_LIMITS.routes) problems.push(`ui.page_routes 最多 ${PAGE_ROUTE_LIMITS.routes} 条`);
    const seen = new Map<string, readonly Segment[]>();
    for (const route of declared as unknown[]) {
      const id = isObject(route) && typeof route.route_id === "string" ? route.route_id : "";
      if (!isObject(route) || !ROUTE_ID.test(id)) { problems.push("页面路由缺少合法的 route_id（小写字母、数字、连字符，以字母开头）"); continue; }
      if (seen.has(id)) { problems.push(`页面路由重复：${id}`); continue; }
      const segments = declaredSegments(route.path);
      if (typeof segments === "string") { problems.push(`页面路由 ${id} 的 ${segments}`); continue; }
      const query: unknown = route.query ?? [];
      if (!Array.isArray(query) || query.length > PAGE_ROUTE_LIMITS.query || query.some(name => typeof name !== "string" || !PARAM_NAME.test(name))) {
        problems.push(`页面路由 ${id} 的 query 必须是最多 ${PAGE_ROUTE_LIMITS.query} 个参数名（小写字母、数字、下划线）`);
        continue;
      }
      const names = parameterNames(segments, query as string[]);
      for (const name of names) if (TRUSTED_PARAMS.includes(name)) problems.push(`页面路由 ${id} 不能声明可信字段 ${name}`);
      if (new Set(names).size !== names.length) problems.push(`页面路由 ${id} 的参数名重复`);
      for (const [other, otherSegments] of seen) if (overlap(segments, otherSegments)) problems.push(`页面路由 ${id} 与 ${other} 能匹配同一个路径`);
      seen.set(id, segments);
      for (const name of names) known.add(name);
    }
  }
  for (const view of manifest.ui.views ?? []) {
    const input: unknown = (view.stage_data as { input?: unknown } | undefined)?.input;
    if (input === undefined) continue;
    const names = Array.isArray(input) ? input as unknown[] : null;
    if (!names || names.length === 0 || names.length > PAGE_ROUTE_LIMITS.input || names.some(name => typeof name !== "string")) {
      problems.push(`视图 ${view.view_id} 的 stage_data.input 必须是 1 到 ${PAGE_ROUTE_LIMITS.input} 个参数名`);
      continue;
    }
    if (new Set(names).size !== names.length) problems.push(`视图 ${view.view_id} 的 stage_data.input 有重复的参数名`);
    for (const name of names as string[]) {
      if (TRUSTED_PARAMS.includes(name)) problems.push(`视图 ${view.view_id} 的 stage_data.input 不能声明可信字段 ${name}`);
      if (!known.has(name)) problems.push(`视图 ${view.view_id} 的 stage_data.input 指向 ${name}，本 Manifest 的 page_routes 没有这个参数`);
    }
  }
  return problems;
}

/** What a declared route matched: its name and the parameters it declares that the request carried; a parameter that could not be read is `rejected`. */
export interface PageRouteMatch {
  readonly route_id: string;
  readonly params: Readonly<Record<string, string>>;
  /** The first declared parameter that was refused, and why: its path segment is not valid percent-encoding, or it is longer than the limit. */
  readonly rejected?: { readonly param: string; readonly reason: "encoding" | "too_long" };
}

const withinLimit = (value: string): boolean => value.length <= UI_PAGE_ROUTE_PARAM_LIMIT || (value.length <= 2 * UI_PAGE_ROUTE_PARAM_LIMIT && [...value].length <= UI_PAGE_ROUTE_PARAM_LIMIT);

/**
 * The route of `routes` that answers `pathname` (a path with the project's scope already taken off) and the parameters it declares.
 * The shape decides the route (segment count and literals; a parameter is one non-empty segment), the first declared one winning, and
 * only then are its parameters read: a path parameter is decoded once, a query parameter that is absent is not in `params`. Null when no
 * route has that shape. Nothing the route does not declare is read, and nothing is cut: a parameter over the limit is `rejected`.
 */
export function matchPageRoute(routes: readonly UiPageRouteDeclaration[], pathname: string, query: { get(name: string): string | null }): PageRouteMatch | null {
  const actual = pathname === "/" ? [] : pathname.startsWith("/") ? pathname.slice(1).split("/") : null;
  if (!actual) return null;
  for (const route of routes) {
    const segments = declaredSegments(route.path);
    if (typeof segments === "string" || segments.length !== actual.length) continue;
    if (!segments.every((segment, index) => typeof segment === "string" ? segment === actual[index] : actual[index] !== "")) continue;
    const params: Record<string, string> = {};
    const outcome: { rejected?: NonNullable<PageRouteMatch["rejected"]> } = {};
    const take = (name: string, read: () => string | null): void => {
      if (outcome.rejected) return;
      let value: string | null;
      try { value = read(); } catch { outcome.rejected = { param: name, reason: "encoding" }; return; }
      if (value === null) return;
      if (!withinLimit(value)) { outcome.rejected = { param: name, reason: "too_long" }; return; }
      params[name] = value;
    };
    segments.forEach((segment, index) => { if (typeof segment !== "string") take(segment.param, () => decodeURIComponent(actual[index]!)); });
    for (const name of route.query ?? []) take(name, () => query.get(name));
    return { route_id: route.route_id, params: Object.freeze(params), ...(outcome.rejected ? { rejected: outcome.rejected } : {}) };
  }
  return null;
}

/** The parameters a stage names in its `stage_data.input`: exactly those the request carried. Trusted identity and transport fields are refused even if declared. */
export function stageRequestParams(input: readonly string[] | undefined, params: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const request: Record<string, string> = {};
  for (const name of input ?? []) {
    if (TRUSTED_PARAMS.includes(name)) throw pluginErrors.declaration_invalid(`stage_data.input 不能声明可信字段 ${name}`);
    if (Object.hasOwn(params, name)) request[name] = params[name]!;
  }
  return Object.freeze(request);
}

/** A match and the plugin whose Manifest declared the route. */
export interface DeclaredPageRouteMatch extends PageRouteMatch {
  readonly plugin_id: string;
}

/** The first plugin whose declared page routes answer `pathname`, with its match. One matcher for every plugin; no plugin is named. */
export function matchDeclaredPageRoute(manifests: Iterable<Pick<PluginManifest, "plugin_id" | "ui">>, pathname: string, query: { get(name: string): string | null }): DeclaredPageRouteMatch | null {
  for (const manifest of manifests) {
    const match = matchPageRoute(manifest.ui.page_routes ?? [], pathname, query);
    if (match) return { plugin_id: manifest.plugin_id, ...match };
  }
  return null;
}
