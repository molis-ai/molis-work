import type { ArtifactReference } from "../modules/artifacts.js";
import type { UiCommandInputKind, UiViewObjectRef } from "./ui.js";
import type { PluginRouteMethod } from "./plugin-manifest.js";

/** Each variant's `kind` must stay a declared UI command input kind. */
type PluginCommandInputOf<Kind extends UiCommandInputKind, Payload = unknown> =
  { kind: Kind } & Payload;

export type PluginCommandInput =
  | PluginCommandInputOf<"current">
  | PluginCommandInputOf<"object", { ref: UiViewObjectRef }>
  | PluginCommandInputOf<"agent-session", { session_id: string }>
  | PluginCommandInputOf<"artifacts", { references: readonly ArtifactReference[] }>;

export interface PluginRouteRequest {
  method: PluginRouteMethod;
  pathname: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<Record<string, string>>;
  body: unknown;
  actor_id: string;
  /** Trusted Host invocation control, never decoded from route parameters or JSON body. */
  execution?: PluginExecutionControl;
  /** Present only on a route that declares `stream`: one progress event, written by the Host as a `progress` line. */
  emit?(event: import("./actions.js").ActionProgressEvent): void;
}

/**
 * One line of a streamed route's answer, the only shape the Host writes and a page reads. Any number of `progress` lines, then
 * exactly one `result` (the route's answer body) or `error` (the same fields a JSON route's refusal has). Progress lines are
 * bounded (64 KiB each, 10 000 in all, 1 MiB together); the `result` line is bounded only by the action's own output limit.
 */
export type PluginRouteStreamLine =
  | ({ type: "progress" } & import("./actions.js").ActionProgressEvent)
  | { type: "result"; result: unknown }
  | { type: "error"; status: number; code: string; error: string; call_id?: string; details?: Readonly<Record<string, unknown>> };

export type PluginExecutionControl = Pick<import("./actions.js").ActionExecutionContext, "signal" | "beforeEffect" | "page_context" | "locale" | "assert_authority_current" | "retainBackgroundAuthority" | "query_only"> & {
  /**
   * The project a Home instance's route was called in: the Host reads it from the page's path (`/projects/<id>/api/plugins/…`) after
   * checking that the project exists and shows this plugin, never from the route's parameters, query or body. The plugin's own action
   * called with this control sees it as `caller.project_id`. The Host reads it only on a control it issued itself: on any other object
   * (a plugin's own, or a caller context passed on) it is ignored, as every field the control does not name is, and the call runs in
   * the instance's project (none for a Home instance).
   */
  readonly project_id?: string;
  /** Display name read from the Host catalog; grants no authority. */
  readonly project_title?: string;
};

export interface PluginRouteResponse {
  status: number;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  /** Non-stream HTTP bytes default to attachment; the Host allows inline only for PNG, JPEG and WebP MIME. */
  bytes?: Uint8Array;
  filename?: string;
  mime?: string;
  disposition?: "inline" | "attachment";
}

export interface PluginRouteBinding {
  route_id: string;
  handle(request: PluginRouteRequest): PluginRouteResponse | Promise<PluginRouteResponse>;
}
