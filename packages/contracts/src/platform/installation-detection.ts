/** Read-only Local Host installation facts consumed by UI and entry adapters. */
export const SUPPORTED_RUNTIME_IDS = ["codex", "claude-code", "opencode", "pi-agent", "grok-build"] as const;

export type SupportedRuntimeId = (typeof SUPPORTED_RUNTIME_IDS)[number];

/** What each supported Runtime is called wherever a person reads its name. One table, so a new Runtime id cannot be added without a name. */
export const RUNTIME_DISPLAY_NAMES: Readonly<Record<SupportedRuntimeId, string>> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  "pi-agent": "Pi Agent",
  "grok-build": "Grok Build",
};

export type RuntimeConnectionState =
  | "not_detected"
  | "molis_work_unavailable"
  | "not_connected"
  | "needs_repair"
  | "connected"
  | "conflict";

export interface RuntimeIntegrationDetection {
  runtime_id: SupportedRuntimeId;
  display_name: string;
  executable_path: string | null;
  config_path: string;
  skill_path: string;
  connection_state: RuntimeConnectionState;
  message: string;
}

export type MolisWorkWebServiceState =
  | "unsupported"
  | "unavailable"
  | "absent"
  | "stopped"
  | "running"
  | "unhealthy"
  | "needs_repair"
  | "conflict";

export interface MolisWorkWebServiceDetection {
  provider: "macos-launchagent" | "unsupported";
  state: MolisWorkWebServiceState;
  supported: boolean;
  owned: boolean;
  running: boolean;
  label: string;
  plist_path: string;
  command: string[];
  stdout_log: string;
  stderr_log: string;
  message: string;
}
