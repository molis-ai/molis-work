/** Project settings category paths. Retained for route consumers. */
export function projectSettingsPageFromPath(pathname: string): "general" | "workspaces" | "guidance" | "rules" | null {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  if (path === "/settings" || path === "/settings/general") return "general";
  if (path === "/settings/workspaces") return "workspaces";
  if (path === "/settings/guidance") return "guidance";
  if (path === "/settings/rules") return "rules";
  return null;
}

export function projectSettingsPath(page: "general" | "workspaces" | "guidance" | "rules"): string {
  return page === "general" ? "/settings" : "/settings/" + page;
}

export function isProjectSettingsWorkbenchPath(pathname: string): boolean {
  return projectSettingsPageFromPath(pathname) != null;
}
