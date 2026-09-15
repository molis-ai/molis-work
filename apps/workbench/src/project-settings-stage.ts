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

export function renderProjectSettingsDirectory(L: (text: string) => string): string {
  const items = [
    ["general", L("常规"), "/settings"],
    ["guidance", L("项目说明"), "/settings/guidance"],
    ["rules", L("工作规则"), "/settings/rules"],
    ["planning", L("工作规划"), "/settings/planning"],
  ];
  return `<section class="desktop-directory-panel" data-directory-panel="settings" hidden>
    <nav class="project-settings-directory" data-project-settings-dir aria-label="${L("项目设置")}">
      ${items.map(([id, label, href]) => `<a href="${href}" data-project-settings-page="${id}">${label}</a>`).join("")}
    </nav>
  </section>`;
}
