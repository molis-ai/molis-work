/** Project settings category paths. Retained for route consumers. */
export function projectSettingsPageFromPath(pathname: string): "general" | "guidance" | "rules" | "planning" | null {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  if (path === "/settings" || path === "/settings/general") return "general";
  if (path === "/settings/guidance") return "guidance";
  if (path === "/settings/rules") return "rules";
  if (path === "/settings/planning") return "planning";
  return null;
}

export function projectSettingsPath(page: "general" | "guidance" | "rules" | "planning"): string {
  return page === "general" ? "/settings" : "/settings/" + page;
}

export function isProjectSettingsWorkbenchPath(pathname: string): boolean {
  return projectSettingsPageFromPath(pathname) != null;
}
