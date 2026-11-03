import type { PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

type ShelfPluginHttpMethod = "GET" | "POST";

export interface ShelfPluginRouteRequest {
  readonly method: ShelfPluginHttpMethod;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly body: Readonly<Record<string, unknown>>;
}

export interface ShelfPluginRouteResponse {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly bytes?: Uint8Array;
  readonly filename?: string;
  readonly mime?: string;
}

interface ShelfPluginRouteContext {
  readonly params: Readonly<Record<string, string>>;
  readonly request: ShelfPluginRouteRequest;
}

export type ShelfPluginRouteHandler = (
  context: ShelfPluginRouteContext,
) => ShelfPluginRouteResponse | Promise<ShelfPluginRouteResponse>;

// 32 MB of folder bytes is about 42.7 MB once base64-encoded, under 45,000,000 bytes with the entries' names.
const UPLOAD_BYTES = 45_000_000;
const WRITE_BYTES = 3_000_000;

/**
 * Shelf's routes, all answered by its Home half: on a project page the request chain hands them past the project half to the Home,
 * which saves into that project with the project the call came from.
 */
export const SHELF_HOME_ROUTES = [
  { route_id: "shelf.terminal", method: "POST", path: "/terminal", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.snapshot", method: "GET", path: "/" },
  { route_id: "shelf.settings.read", method: "GET", path: "/settings" },
  { route_id: "shelf.settings.write", method: "POST", path: "/settings", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.admit", method: "POST", path: "/items", max_body_bytes: UPLOAD_BYTES },
  { route_id: "shelf.sample", method: "POST", path: "/sample", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.folder", method: "POST", path: "/folders", max_body_bytes: UPLOAD_BYTES },
  { route_id: "shelf.hide", method: "POST", path: "/items/:item_id/hide", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.delete", method: "POST", path: "/items/:item_id/delete", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.useMaterial", method: "POST", path: "/items/:item_id/use-material", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.material.preview", method: "GET", path: "/items/:item_id/project-material" },
  { route_id: "shelf.material.save", method: "POST", path: "/items/:item_id/project-material", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.edit", method: "POST", path: "/items/:item_id/edit", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.job", method: "POST", path: "/jobs", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.job.cancel", method: "POST", path: "/jobs/:job_id/cancel", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.clipboard", method: "POST", path: "/clipboard", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.clipboard.delete", method: "POST", path: "/clipboard/:clip_id/delete", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.clipboard.join", method: "POST", path: "/clipboard/:clip_id/material", max_body_bytes: WRITE_BYTES },
  { route_id: "shelf.file", method: "GET", path: "/items/:item_id/file" },
] as const satisfies readonly PluginRouteDeclaration[];
