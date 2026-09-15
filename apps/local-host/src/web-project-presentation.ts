import fs from "node:fs";
import path from "node:path";
import type { WebProjectNavigation, WebSettingsProject, WebInstallationDiagnostics } from "@molis-ai/molis-work-app-workbench";
import type { MolisWorkProjectRecord } from "./project-catalog.js";
import { isOwnedInstaller } from "./installer/home-contract.js";
import { resolveConfiguredHome } from "./product-home.js";

export function projectNavigation(project: MolisWorkProjectRecord): WebProjectNavigation {
  return {
    project_id: project.project_id,
    display_name: project.display_name,
    data_class: project.data_class,
    database_path: project.database_path,
    source: project.source,
  };
}

export function settingsProject(project: MolisWorkProjectRecord): WebSettingsProject {
  return {
    project_id: project.project_id,
    display_name: project.display_name,
    database_path: project.database_path,
    source: project.source,
    data_class: project.data_class,
    created_at: project.created_at,
  };
}

export function installationDiagnostics(
  homeDirectory: string | undefined,
  projectCount: number,
): WebInstallationDiagnostics {
  const home = path.resolve(homeDirectory ?? resolveConfiguredHome());
  const manifestPath = path.join(home, "config", "installation.json");
  let installationState: WebInstallationDiagnostics["installation_state"] = "missing";
  let version: string | null = null;
  let releaseDirectory: string | null = null;
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        installer?: unknown;
        version?: unknown;
        release_path?: unknown;
      };
      if (
        isOwnedInstaller(manifest.installer)
        && typeof manifest.version === "string"
        && typeof manifest.release_path === "string"
      ) {
        version = manifest.version;
        releaseDirectory = path.resolve(home, manifest.release_path);
        installationState = "ready";
      } else {
        installationState = "invalid";
      }
    } catch {
      installationState = "invalid";
    }
  }
  return {
    home_directory: home,
    installation_state: installationState,
    version,
    release_directory: releaseDirectory,
    project_count: projectCount,
    launchers: ([
      ["CLI", "molis-work"],
      ["MCP", "molis-work-mcp"],
      ["Web", "molis-work-web"],
    ] as const).map(([name, file]) => {
      const launcherPath = path.join(home, "bin", file);
      return { name, path: launcherPath, state: fs.existsSync(launcherPath) ? "ready" : "missing" };
    }),
  };
}
