import { powerShellEnvironment } from "./connector-powershell.js";
import { delimiter, join } from "node:path";
import { readManagedConnectorTool } from "./connector-tool-install.js";

export interface ManagedCliLaunch { executable: string; cwd: string; environment: Record<string, string> }

/** Managed CLIs keep their own login files; host credentials and global config never enter their environment. */
export function managedCliLaunch(home: string, installationId: string): ManagedCliLaunch {
  const installed = readManagedConnectorTool(home, installationId);
  const ownHome = join(installed.directory, ".home");
  return { executable: installed.executable, cwd: ownHome, environment: {
    PATH: [...installed.runtime_path, "/usr/bin", "/bin"].join(delimiter), HOME: ownHome, TMPDIR: join(installed.directory, ".tmp"),
    XDG_CONFIG_HOME: join(ownHome, ".config"), XDG_CACHE_HOME: join(ownHome, ".cache"), XDG_DATA_HOME: join(ownHome, ".local", "share"),
    LANG: process.env.LANG || "en_US.UTF-8", TERM: "xterm-256color", NO_COLOR: "1",
    ...(installed.source.kind === "powershell" ? powerShellEnvironment(installed.directory, installed.executable) : {}),
    SF_AUTOUPDATE_DISABLE: "true", HUBSPOT_NO_AUTO_UPGRADE: "1", HF_HUB_DISABLE_UPDATE_CHECK: "1",
  } };
}
