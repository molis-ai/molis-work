/**
 * The one register of external AI development tools: every product entry, what it offers for reading sessions, and what it does not.
 * It records what a tool gives, not what Molis has connected (whether an adapter exists is reported at run time), so a row that says
 * `via: "command"` is not a promise that Molis reads it. Plain data: no function values, so a resume is a template, not a closure.
 * Pages never import this file: the host hands them names. The order is a contract, because the runtime lists are derived from it and
 * the interface shows them in this order.
 */
export type ExternalToolSurface = "cli" | "ide" | "desktop" | "cloud";
export type ExternalToolRegion = "global" | "cn" | "unspecified";
export type ExternalToolTrust = "official" | "help" | "repository" | "third_party" | "unverified";
export type ExternalToolGap = "not_offered" | "private_store" | "interactive_only" | "needs_account" | "unverified";
export type ExternalSessionCapability = "discover" | "list" | "read" | "search" | "resume" | "send" | "stop" | "export";

/** A way in counts only on these three sources: a third party's word, or anything unchecked, can only be a gap. */
export type ExternalToolReachedTrust = "official" | "help" | "repository";

/**
 * A path as a base plus relative segments, expanded by the host for the current user. `env`, when set to an absolute path, is the whole
 * path instead: `CODEX_HOME` is the directory itself, not a parent of `.codex`.
 */
export interface ExternalToolPath {
  base: "home" | "xdg_config";
  segments: readonly string[];
  env?: string;
}

/**
 * How one capability is reached: one of four ways, or a gap with its reason. `argv` holds the arguments after the program, which is
 * `terminal.command`, else the first of `detect.commands`; `{session_id}` and `{query}` are the only placeholders, each a whole element.
 */
export type ExternalToolAccess =
  | { via: "command"; argv: readonly string[]; output: "json" | "jsonl" | "text" | "interactive"; trust: ExternalToolReachedTrust }
  | { via: "protocol"; protocol: string; method: string; trust: ExternalToolReachedTrust }
  | { via: "service"; service_id: string; trust: ExternalToolReachedTrust }
  | { via: "local_record"; root: ExternalToolPath; format: "documented" | "internal"; trust: ExternalToolReachedTrust }
  | { via: "gap"; gap: ExternalToolGap; note: string; fallback: "return_to_tool" | "export" | "none"; trust: ExternalToolTrust };

export interface ExternalToolEntry {
  id: string;
  display_name: string;
  vendor: string;
  surface: ExternalToolSurface;
  region: ExternalToolRegion;
  /** Written only once a test on real installs shows two entries share one native session; the value is the main entry's id. */
  shares_sessions_with?: string;
  /**
   * How to confirm a command on this machine is this tool. A command name several tools ship (`agent`) is never enough: its real path
   * must match `real_path_pattern`, a case-insensitive regular expression.
   */
  detect?: { commands: readonly string[]; real_path_pattern?: string; version_argv: readonly string[]; version_pattern: string };
  /** Required on a local entry: where this tool keeps sessions, `null` when public sources do not say. A cloud entry has none. */
  data_root?: ExternalToolPath | null;
  mcp_integration?: true;
  /** The resume arguments live in `sessions.resume` alone; this is only the command name. */
  terminal?: { command: string };
  character_import?: { config_root: ExternalToolPath };
  sessions: Readonly<Record<ExternalSessionCapability, ExternalToolAccess>>;
  /** When this row was last checked, and against which version. */
  checked: { on: string; version?: string };
}

/**
 * A native session id: one argument of a command, so letters, digits and `._:-` only (no space, quote or shell character) and not
 * starting with `-`, which a tool would read as an option (`--dangerously-…`). The one rule for an id a page names, a tool reports or
 * a record holds (S-103 ⑤ ⑧).
 */
export const EXTERNAL_SESSION_NATIVE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

const gap = <Kind extends ExternalToolGap, Trust extends ExternalToolTrust>(kind: Kind, note: string, trust: Trust, fallback: "return_to_tool" | "export" = "return_to_tool") =>
  ({ via: "gap", gap: kind, note, fallback, trust }) as const;

/** Not found, or found and not checked. Never the same as "does not exist". */
const pending = (note = "公开资料未查到") => gap("unverified", note, "unverified");
/** A lead only a third party gives: it stays a gap, and the lead stays in the note. */
const lead = (note: string) => gap("unverified", `线索：${note}`, "third_party");
const inApp = (note = "只在产品界面里有，程序调不了", trust: "official" | "third_party" = "official") => gap("interactive_only", note, trust);
const hidden = (note = "私有或加密的存储，不解析") => gap("private_store", note, "third_party");

const ALL_PENDING = { discover: pending(), list: pending(), read: pending(), search: pending(), resume: pending(), send: pending(), stop: pending(), export: pending() } as const;
const APP_ONLY = { discover: inApp(), list: inApp(), read: inApp(), search: inApp(), resume: inApp(), send: inApp(), stop: inApp(), export: pending() } as const;
const thirdPartyApp = inApp("只在产品界面里有（第三方说法）", "third_party");
const PRIVATE_APP = { discover: hidden(), list: thirdPartyApp, read: hidden(), search: thirdPartyApp, resume: thirdPartyApp, send: thirdPartyApp, stop: thirdPartyApp,
  export: gap("not_offered", "没有导出（第三方说法）", "third_party") } as const;

/** Not checked tool by tool: nothing runs these yet (S-sessions-read-only-commands). A tool's adapter confirms them when it lands. */
const VERSION_PROBE = { version_argv: ["--version"], version_pattern: "\\d+\\.\\d+" } as const;
const CHECKED = { on: "2026-11-05" } as const;
const CODEX_HOME = { base: "home", segments: [".codex"], env: "CODEX_HOME" } as const;
const PI_SESSIONS = { base: "home", segments: [".pi", "agent", "sessions"] } as const;
const QODER_CN_PROJECTS = { base: "home", segments: [".qoder-cn", "projects"] } as const;
const KIMI_SESSIONS = { base: "home", segments: [".kimi-code", "sessions"] } as const;
const MINIMAX_HOME = { base: "home", segments: [".minimax"] } as const;
const GEMINI_CHATS = { base: "home", segments: [".gemini", "tmp"] } as const;

export const EXTERNAL_TOOLS = [
  // These six stay first, in this order: SUPPORTED_RUNTIME_IDS, TERMINAL_RUNTIMES and CHARACTER_IMPORT_RUNTIMES take their order from here.
  { id: "codex", display_name: "Codex", vendor: "OpenAI", surface: "cli", region: "global", detect: { commands: ["codex"], ...VERSION_PROBE }, data_root: CODEX_HOME,
    mcp_integration: true, terminal: { command: "codex" }, character_import: { config_root: CODEX_HOME },
    sessions: { ...ALL_PENDING,
      discover: { via: "protocol", protocol: "codex app-server", method: "thread/list", trust: "official" },
      list: { via: "protocol", protocol: "codex app-server", method: "thread/list", trust: "official" },
      read: { via: "protocol", protocol: "codex app-server", method: "thread/read", trust: "official" },
      resume: { via: "command", argv: ["resume", "{session_id}"], output: "interactive", trust: "help" },
      send: { via: "command", argv: ["exec", "resume", "{session_id}"], output: "text", trust: "help" },
      stop: { via: "protocol", protocol: "codex app-server", method: "turn/interrupt", trust: "official" } },
    checked: { on: "2026-11-05", version: "0.166.0" } },
  { id: "claude-code", display_name: "Claude Code", vendor: "Anthropic", surface: "cli", region: "global", detect: { commands: ["claude"], ...VERSION_PROBE },
    data_root: { base: "home", segments: [".claude", "projects"] }, mcp_integration: true, terminal: { command: "claude" },
    character_import: { config_root: { base: "home", segments: [".claude"] } },
    sessions: { ...ALL_PENDING,
      discover: { via: "protocol", protocol: "claude-agent-sdk", method: "listSessions", trust: "official" },
      list: { via: "protocol", protocol: "claude-agent-sdk", method: "listSessions", trust: "official" },
      read: { via: "protocol", protocol: "claude-agent-sdk", method: "getSessionMessages", trust: "official" },
      search: inApp("只在会话选择器里有"),
      resume: { via: "command", argv: ["--resume", "{session_id}"], output: "interactive", trust: "official" },
      send: { via: "command", argv: ["-p", "--resume", "{session_id}"], output: "text", trust: "official" },
      stop: pending("`claude agents --json` 只列运行中的") },
    checked: CHECKED },
  // The Agent CLI. `~/.cursor` is shared with the editor, which is `cursor-editor` and imports nothing.
  { id: "cursor", display_name: "Cursor", vendor: "Cursor", surface: "cli", region: "global",
    detect: { commands: ["cursor-agent", "agent"], real_path_pattern: "(?:^|[/\\\\])\\.cursor(?:-agent)?[/\\\\]|cursor-agent", ...VERSION_PROBE },
    data_root: null, character_import: { config_root: { base: "home", segments: [".cursor"] } },
    sessions: { ...ALL_PENDING,
      discover: hidden("`~/.cursor/chats` 是私有库（第三方说法）"), list: inApp("`agent ls` 不支持无头，官方人员确认过（2026-01 版）"), read: hidden("`~/.cursor/chats` 是私有库（第三方说法）"),
      // The official form is `--resume [chatId]`, so two elements. Not tried on this machine: `cursor-agent` is not installed here.
      resume: { via: "command", argv: ["--resume", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "opencode", display_name: "OpenCode", vendor: "OpenCode", surface: "cli", region: "unspecified", detect: { commands: ["opencode"], ...VERSION_PROBE }, data_root: null,
    mcp_integration: true, terminal: { command: "opencode" }, character_import: { config_root: { base: "xdg_config", segments: ["opencode"] } },
    sessions: { ...ALL_PENDING, discover: lead("`opencode session list`"), list: lead("`opencode session list`"), read: lead("`opencode export <id>`"), export: lead("`opencode export <id>`"),
      resume: { via: "command", argv: ["--session", "{session_id}"], output: "interactive", trust: "repository" } },
    checked: CHECKED },
  { id: "pi-agent", display_name: "Pi Agent", vendor: "Pi", surface: "cli", region: "unspecified", data_root: PI_SESSIONS, mcp_integration: true, terminal: { command: "pi" },
    sessions: { ...ALL_PENDING,
      discover: { via: "local_record", root: PI_SESSIONS, format: "internal", trust: "help" }, list: inApp("只有 `--resume` 选择器"),
      read: { via: "local_record", root: PI_SESSIONS, format: "internal", trust: "help" },
      resume: { via: "command", argv: ["--session", "{session_id}"], output: "interactive", trust: "help" },
      send: pending("`--mode rpc` 未核"),
      export: pending("`--export <file>` 存在（HTML），参数是文件不是会话号，占位符写不下") },
    checked: { on: "2026-11-05", version: "1.5.0" } },
  { id: "grok-build", display_name: "Grok Build", vendor: "xAI", surface: "cli", region: "global",
    detect: { commands: ["grok", "agent"], real_path_pattern: "(?:^|[/\\\\])\\.grok[/\\\\]|grok", ...VERSION_PROBE }, data_root: { base: "home", segments: [".grok"] },
    mcp_integration: true, terminal: { command: "grok" }, character_import: { config_root: { base: "home", segments: [".grok"] } },
    sessions: { ...ALL_PENDING, discover: pending("`grok sessions list` 存在，输出格式未核"), list: pending("`grok sessions list` 存在，输出格式未核"),
      read: pending("`~/.grok/` 无官方读取口"), search: pending("`grok sessions search` 存在，输出格式未核"),
      resume: { via: "command", argv: ["--resume", "{session_id}"], output: "interactive", trust: "help" } },
    checked: { on: "2026-11-05", version: "1.0.70" } },

  { id: "codex-ide", display_name: "Codex IDE 扩展", vendor: "OpenAI", surface: "ide", region: "global", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "codex-desktop", display_name: "Codex 桌面", vendor: "OpenAI", surface: "desktop", region: "global", data_root: null, sessions: ALL_PENDING, checked: { on: "2026-11-05", version: "0.166.0" } },
  { id: "codex-cloud", display_name: "Codex 云端任务", vendor: "OpenAI", surface: "cloud", region: "global",
    sessions: { ...ALL_PENDING, discover: pending("`codex cloud list` 存在，输出格式未核"), list: pending("`codex cloud list` 存在，输出格式未核"),
      read: gap("not_offered", "`status`、`diff` 只有状态和差异，不是对话", "help"), resume: gap("not_offered", "只有把差异应用到本地", "help"),
      send: gap("not_offered", "`codex cloud exec` 是新任务，不算续接", "help") },
    checked: { on: "2026-11-05", version: "0.166.0" } },
  { id: "claude-code-desktop", display_name: "Claude Code 桌面", vendor: "Anthropic", surface: "desktop", region: "global", data_root: null,
    sessions: { ...APP_ONLY, resume: inApp("官方说能恢复 CLI 会话，是否共用未实测") }, checked: CHECKED },
  { id: "claude-code-ide", display_name: "Claude Code VS Code", vendor: "Anthropic", surface: "ide", region: "global", data_root: null, sessions: APP_ONLY, checked: CHECKED },
  { id: "claude-code-web", display_name: "Claude Code 网页", vendor: "Anthropic", surface: "cloud", region: "global", sessions: ALL_PENDING, checked: CHECKED },
  { id: "gemini-cli", display_name: "Gemini CLI", vendor: "Google", surface: "cli", region: "global", detect: { commands: ["gemini"], ...VERSION_PROBE }, data_root: GEMINI_CHATS,
    sessions: { ...ALL_PENDING, discover: pending("`gemini --list-sessions` 存在，输出格式未查到"), list: pending("`gemini --list-sessions` 存在，输出格式未查到"),
      read: { via: "local_record", root: GEMINI_CHATS, format: "internal", trust: "official" },
      // The UUID only: the list numbers change.
      resume: { via: "command", argv: ["--resume", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "antigravity-cli", display_name: "Antigravity 终端", vendor: "Google", surface: "cli", region: "global", data_root: null,
    sessions: { ...ALL_PENDING, discover: hidden(), list: inApp("`/resume`（第三方说法）", "third_party"), read: hidden(), resume: inApp("`/resume`（第三方说法）", "third_party") }, checked: CHECKED },
  { id: "antigravity-desktop", display_name: "Antigravity 桌面", vendor: "Google", surface: "desktop", region: "global", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "copilot-cli", display_name: "Copilot CLI", vendor: "GitHub", surface: "cli", region: "global", detect: { commands: ["copilot"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING, discover: lead("`~/.copilot/session-state/<id>/`"), list: inApp("只有 `--resume` 选择器"), read: lead("`events.jsonl`，格式未公开"),
      resume: { via: "command", argv: ["--resume", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "copilot-ide", display_name: "Copilot IDE 会话", vendor: "GitHub", surface: "ide", region: "global", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "copilot-coding-agent", display_name: "Copilot 编码 Agent", vendor: "GitHub", surface: "cloud", region: "global", detect: { commands: ["gh"], ...VERSION_PROBE },
    sessions: { ...ALL_PENDING,
      discover: { via: "command", argv: ["agent-task", "list"], output: "text", trust: "official" },
      list: { via: "command", argv: ["agent-task", "list"], output: "text", trust: "official" },
      read: { via: "command", argv: ["agent-task", "view", "{session_id}", "--log"], output: "text", trust: "official" },
      resume: gap("not_offered", "官方没有续接云端任务的入口", "official") },
    checked: CHECKED },
  { id: "cursor-editor", display_name: "Cursor 编辑器", vendor: "Cursor", surface: "ide", region: "global", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "cursor-cloud", display_name: "Cursor 云端 Agent", vendor: "Cursor", surface: "cloud", region: "global",
    sessions: { ...ALL_PENDING, discover: lead("`GET /v0/agents`"), list: lead("`GET /v0/agents`"), read: lead("`/conversation`"), send: lead("followup"), stop: lead("stop") }, checked: CHECKED },
  { id: "kiro-cli", display_name: "Kiro CLI", vendor: "AWS", surface: "cli", region: "global", detect: { commands: ["kiro-cli"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING, discover: pending("`--list-sessions` 存在，输出格式未核"), list: pending("`--list-sessions` 存在，输出格式未核"), read: lead("`~/.kiro/sessions/`"),
      resume: { via: "command", argv: ["--resume-id", "{session_id}"], output: "interactive", trust: "official" }, send: pending("无头模式拿不到会话 ID（问题单）") },
    checked: CHECKED },
  { id: "kiro-ide", display_name: "Kiro IDE", vendor: "AWS", surface: "ide", region: "global", data_root: null, sessions: { ...PRIVATE_APP, export: pending() }, checked: CHECKED },
  { id: "devin-cloud", display_name: "Devin 云端", vendor: "Cognition", surface: "cloud", region: "global",
    sessions: { ...ALL_PENDING, discover: gap("needs_account", "企业 API，接口没核完", "official"), list: gap("needs_account", "企业 API，接口没核完", "official"),
      read: gap("needs_account", "会话消息接口，要服务账号", "official"), resume: inApp("只在网页里") },
    checked: CHECKED },
  { id: "devin-desktop", display_name: "Devin Desktop", vendor: "Cognition", surface: "desktop", region: "global", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  // Cascade reportedly stopped on 2026-07-01; old records may still be on people's machines, so the row stays.
  { id: "windsurf-cascade", display_name: "Windsurf／Cascade（旧版）", vendor: "Cognition", surface: "ide", region: "global", data_root: null,
    sessions: { ...PRIVATE_APP, discover: hidden("加密 `.pb`（第三方说法）"), read: hidden("加密 `.pb`（第三方说法）") }, checked: CHECKED },
  { id: "junie-cli", display_name: "Junie CLI", vendor: "JetBrains", surface: "cli", region: "global", data_root: null,
    sessions: { ...ALL_PENDING, discover: pending("`transcript.md`、`events.jsonl` 的根目录未写"), list: inApp("`/history`"), read: pending("`transcript.md`、`events.jsonl` 的根目录未写"),
      search: inApp("`/history`"), resume: inApp("`/history`") },
    checked: CHECKED },
  { id: "junie-ide", display_name: "Junie IDE", vendor: "JetBrains", surface: "ide", region: "global", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "droid", display_name: "Droid", vendor: "Factory", surface: "cli", region: "global", detect: { commands: ["droid"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING,
      discover: { via: "command", argv: ["search", "--json"], output: "json", trust: "official" }, list: inApp("`/sessions`"), read: pending("`-o json` 是运行输出"),
      search: { via: "command", argv: ["search", "--json", "{query}"], output: "json", trust: "official" },
      resume: { via: "command", argv: ["resume", "{session_id}"], output: "interactive", trust: "official" },
      send: { via: "command", argv: ["exec", "-s", "{session_id}"], output: "text", trust: "official" } },
    checked: CHECKED },
  { id: "amp", display_name: "Amp CLI", vendor: "Amp", surface: "cli", region: "global", detect: { commands: ["amp"], ...VERSION_PROBE }, data_root: null,
    sessions: {
      discover: gap("unverified", "`amp threads list` 存在，输出格式未核", "unverified", "export"), list: gap("unverified", "`amp threads list` 存在，输出格式未核", "unverified", "export"),
      read: { via: "command", argv: ["threads", "markdown", "{session_id}"], output: "text", trust: "official" },
      search: gap("unverified", "`amp threads search` 存在，输出格式未核", "unverified", "export"), resume: gap("unverified", "公开资料未查到", "unverified", "export"),
      send: gap("unverified", "公开资料未查到", "unverified", "export"), stop: gap("unverified", "公开资料未查到", "unverified", "export"),
      // The JSON goes to the thread's creator only.
      export: { via: "command", argv: ["threads", "export", "{session_id}"], output: "json", trust: "official" } },
    checked: CHECKED },
  { id: "amp-web", display_name: "Amp 网页", vendor: "Amp", surface: "cloud", region: "global", sessions: { ...ALL_PENDING, export: inApp("网页里的导出") }, checked: CHECKED },

  { id: "qwen-code", display_name: "Qwen Code", vendor: "Alibaba", surface: "cli", region: "unspecified", detect: { commands: ["qwen"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING,
      discover: { via: "command", argv: ["sessions", "list", "--json"], output: "json", trust: "official" },
      list: { via: "command", argv: ["sessions", "list", "--json"], output: "json", trust: "official" },
      read: pending("`/export` 在 TUI 内；`--acp`、`@qwen-code/sdk/peer` 未核"), resume: inApp("`/resume`"), export: inApp("`/export`") },
    checked: CHECKED },
  { id: "lingma", display_name: "通义灵码", vendor: "Alibaba", surface: "ide", region: "unspecified", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "qoder", display_name: "Qoder CLI（国际）", vendor: "Qoder", surface: "cli", region: "global", detect: { commands: ["qodercli"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING, discover: pending("`--list-sessions` 存在，输出格式未核"), list: pending("`--list-sessions` 存在，输出格式未核"), read: pending("`-p -o json` 是运行输出"),
      resume: { via: "command", argv: ["-r", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "qoder-ide", display_name: "Qoder IDE（国际）", vendor: "Qoder", surface: "ide", region: "global", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  // Whether it shares sessions with the international build is not written anywhere; taken as not shared.
  { id: "qoder-cn", display_name: "Qoder CLI（国内）", vendor: "Qoder", surface: "cli", region: "cn", detect: { commands: ["qodercn"], ...VERSION_PROBE }, data_root: QODER_CN_PROJECTS,
    sessions: { ...ALL_PENDING, discover: pending("`qodercn --list-sessions` 存在，JSON 输出未写"), list: pending("`qodercn --list-sessions` 存在，JSON 输出未写"),
      read: { via: "local_record", root: QODER_CN_PROJECTS, format: "internal", trust: "official" },
      resume: { via: "command", argv: ["-r", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "qoder-cn-ide", display_name: "Qoder IDE（国内）", vendor: "Qoder", surface: "ide", region: "cn", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "codebuddy", display_name: "CodeBuddy Code（国际）", vendor: "Tencent", surface: "cli", region: "global", detect: { commands: ["codebuddy"], ...VERSION_PROBE }, data_root: null,
    sessions: { ...ALL_PENDING, list: pending("列表命令未查到"), read: pending("只知日志在 `~/.codebuddy/logs/`"),
      resume: { via: "command", argv: ["-r", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "codebuddy-cn", display_name: "CodeBuddy（国内）", vendor: "Tencent", surface: "cli", region: "cn", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "codebuddy-ide", display_name: "CodeBuddy IDE", vendor: "Tencent", surface: "ide", region: "unspecified", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "trae", display_name: "TRAE（国际）", vendor: "ByteDance", surface: "ide", region: "global", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "trae-cn", display_name: "TRAE（国内）", vendor: "ByteDance", surface: "ide", region: "cn", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "solo", display_name: "SOLO（国际）", vendor: "ByteDance", surface: "desktop", region: "global", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "solo-cn", display_name: "SOLO（国内）", vendor: "ByteDance", surface: "desktop", region: "cn", data_root: null, sessions: PRIVATE_APP, checked: CHECKED },
  { id: "kimi-code", display_name: "Kimi Code", vendor: "Moonshot", surface: "cli", region: "unspecified", detect: { commands: ["kimi"], ...VERSION_PROBE }, data_root: KIMI_SESSIONS,
    sessions: { ...ALL_PENDING,
      discover: { via: "local_record", root: KIMI_SESSIONS, format: "internal", trust: "official" },
      list: inApp("`/sessions`"), read: pending("`kimi export <id>` 存在，输出格式未核"),
      resume: { via: "command", argv: ["--session", "{session_id}"], output: "interactive", trust: "official" },
      send: pending("`kimi acp`、Server API 未核"), export: pending("`kimi export <id>` 存在，输出格式未核") },
    checked: CHECKED },
  { id: "zcode", display_name: "ZCode", vendor: "ZCode", surface: "desktop", region: "unspecified", data_root: null, sessions: { ...PRIVATE_APP, export: pending() }, checked: CHECKED },
  { id: "minimax-code", display_name: "MiniMax Code", vendor: "MiniMax", surface: "cli", region: "unspecified", detect: { commands: ["mcode"], ...VERSION_PROBE }, data_root: MINIMAX_HOME,
    sessions: { ...ALL_PENDING,
      discover: { via: "local_record", root: MINIMAX_HOME, format: "internal", trust: "official" }, list: inApp("`/sessions`"),
      read: { via: "local_record", root: MINIMAX_HOME, format: "internal", trust: "official" }, search: inApp("`/sessions`"),
      resume: { via: "command", argv: ["--session", "{session_id}"], output: "interactive", trust: "official" } },
    checked: CHECKED },
  { id: "minimax-agent", display_name: "MiniMax 开发 Agent", vendor: "MiniMax", surface: "cloud", region: "unspecified", sessions: ALL_PENDING, checked: CHECKED },
  { id: "comate", display_name: "文心快码 Comate", vendor: "Baidu", surface: "ide", region: "unspecified", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "zulu", display_name: "Zulu", vendor: "Baidu", surface: "ide", region: "unspecified", data_root: null, sessions: ALL_PENDING, checked: CHECKED },
  { id: "codearts-agent", display_name: "CodeArts 代码智能体", vendor: "Huawei", surface: "cli", region: "unspecified", data_root: null,
    sessions: { ...ALL_PENDING, resume: pending("有 `codearts run`，会话命令未查到") }, checked: CHECKED },
] as const satisfies readonly ExternalToolEntry[];

export type ExternalToolId = (typeof EXTERNAL_TOOLS)[number]["id"];

/** The rows that have a field, which is what makes a row a member of a runtime list. */
export type ExternalToolWith<Key extends string> = Extract<(typeof EXTERNAL_TOOLS)[number], Record<Key, unknown>>;

/** The ids of the rows that have `key`, in register order. Every runtime list is one of these. */
export const externalToolIdsWith = <Key extends string>(key: Key): readonly ExternalToolWith<Key>["id"][] =>
  EXTERNAL_TOOLS.filter(tool => key in tool).map(tool => tool.id) as ExternalToolWith<Key>["id"][];

/** One row by id. */
export const externalTool = <Id extends ExternalToolId>(id: Id): Extract<(typeof EXTERNAL_TOOLS)[number], { id: Id }> =>
  EXTERNAL_TOOLS.find(tool => tool.id === id) as Extract<(typeof EXTERNAL_TOOLS)[number], { id: Id }>;
