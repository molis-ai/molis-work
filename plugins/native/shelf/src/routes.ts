import type { PluginRouteDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

// 32 MB of folder bytes is about 42.7 MB once base64-encoded, under the SDK's 45,000,000-byte ceiling.
const UPLOAD_BYTES = 45_000_000;

/** Routes the Home half answers; on a project page the request chain hands them past the project half to the Home. */
export const SHELF_HOME_ROUTES = [
  { route_id: "shelf.snapshot", method: "GET", path: "/snapshot" },
  { route_id: "shelf.settings.read", method: "GET", path: "/settings" },
  { route_id: "shelf.settings.write", method: "POST", path: "/settings" },
  { route_id: "shelf.admit", method: "POST", path: "/items", max_body_bytes: UPLOAD_BYTES },
  { route_id: "shelf.sample", method: "POST", path: "/sample" },
  { route_id: "shelf.folder", method: "POST", path: "/folders", max_body_bytes: UPLOAD_BYTES },
  { route_id: "shelf.hide", method: "POST", path: "/items/:item_id/hide" },
  { route_id: "shelf.delete", method: "POST", path: "/items/:item_id/delete" },
  { route_id: "shelf.useMaterial", method: "POST", path: "/items/:item_id/use-material" },
  { route_id: "shelf.edit", method: "POST", path: "/items/:item_id/edit" },
  { route_id: "shelf.file", method: "GET", path: "/items/:item_id/file" },
  { route_id: "shelf.job", method: "POST", path: "/jobs" },
  { route_id: "shelf.job.cancel", method: "POST", path: "/jobs/:job_id/cancel" },
  { route_id: "shelf.clipboard", method: "POST", path: "/clipboard" },
  { route_id: "shelf.clipboard.delete", method: "POST", path: "/clipboard/:clip_id/delete" },
  { route_id: "shelf.clipboard.join", method: "POST", path: "/clipboard/:clip_id/material" },
] as const satisfies readonly PluginRouteDeclaration[];

/** Saving a Shelf item into a project needs the project, so the project half answers these two. */
export const SHELF_MATERIAL_ROUTES = [
  { route_id: "shelf.material.preview", method: "GET", path: "/items/:item_id/project-material" },
  { route_id: "shelf.material.save", method: "POST", path: "/items/:item_id/project-material" },
] as const satisfies readonly PluginRouteDeclaration[];
