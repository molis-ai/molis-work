import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UNIX_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const BLOCKED_ENV_KEYS = new Set([
  "CI",
  "CLAUDECODE",
  "CONTINUOUS_INTEGRATION",
  "ELECTRON_NO_ASAR",
  "ELECTRON_RUN_AS_NODE",
  "NODE_CHANNEL_FD",
  "NODE_COMPILE_CACHE",
  "NODE_DEBUG",
  "NODE_OPTIONS",
  "NODE_PATH",
  "NODE_PENDING_DEPRECATION",
  "NODE_SKIP_PLATFORM_CHECK",
  "NODE_UNIQUE_ID",
  "VSCODE_INSPECTOR_OPTIONS",
  "XPC_SERVICE_NAME",
  "__CFBundleIdentifier",
]);

const BLOCKED_ENV_PREFIXES = [
  "VSCODE_",
  "CURSOR_",
  "ELECTRON_",
  "NPM_",
  "PNPM_",
  "BUN_",
  "DENO_",
  "VITE_",
  "NODE_",
  "COMPOSER_",
  "CLAUDE",
  "CODEX_",
];

let cachedLoginEnv: Record<string, string> | null = null;

export function isBlockedPtyEnvKey(key: string): boolean {
  if (BLOCKED_ENV_KEYS.has(key)) return true;
  if (key.startsWith("__CURSOR")) return true;
  const upper = key.toUpperCase();
  return upper.startsWith("__NEXT") || BLOCKED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix));
}

function parseNulEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const chunk of raw.split("\0")) {
    if (!chunk) continue;
    const separator = chunk.indexOf("=");
    if (separator <= 0) continue;
    const key = chunk.slice(0, separator);
    if (isBlockedPtyEnvKey(key)) continue;
    env[key] = chunk.slice(separator + 1);
  }
  return env;
}

function loginProbeEnvironment(): NodeJS.ProcessEnv {
  const username = os.userInfo().username;
  const lang = process.env.LANG?.trim();
  return {
    HOME: os.homedir(),
    USER: username,
    LOGNAME: username,
    SHELL: "/bin/zsh",
    TERM: "dumb",
    PATH: UNIX_PATH,
    LANG: lang && !isBlockedPtyEnvKey("LANG") ? lang : "C.UTF-8",
  };
}

function loginShellEnvironment(): Record<string, string> {
  if (cachedLoginEnv) return cachedLoginEnv;
  try {
    const result = spawnSync("/bin/zsh", ["-l", "-c", "env -0"], {
      env: loginProbeEnvironment(),
      timeout: 8000,
      maxBuffer: 1024 * 1024,
    });
    if (result.status === 0 && result.stdout.length > 0) {
      cachedLoginEnv = parseNulEnv(result.stdout.toString("utf8"));
      return cachedLoginEnv;
    }
  } catch {
    // Fall through to a minimal environment.
  }
  cachedLoginEnv = {};
  return cachedLoginEnv;
}

function isInsideDirectory(root: string, target: string): boolean {
  let realRoot: string;
  let realTarget: string;
  try {
    realRoot = fs.realpathSync.native(path.resolve(root));
    realTarget = fs.realpathSync.native(path.resolve(target));
  } catch {
    return false;
  }
  const relative = path.relative(realRoot, realTarget);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function nvmBinDirectory(): string | undefined {
  const home = os.homedir();
  const nvmDir = process.env.NVM_DIR?.trim() || path.join(home, ".nvm");
  const resolved = resolveNvmBinDirectory(nvmDir, process.env.NVM_BIN?.trim());
  if (!resolved || !isInsideDirectory(home, resolved)) return undefined;
  return resolved;
}

export function resolveNvmBinDirectory(nvmDir: string, nvmBin?: string): string | undefined {
  const root = path.resolve(nvmDir);
  const fromEnv = nvmBin?.trim();
  const candidates = [fromEnv ? path.resolve(fromEnv) : undefined, ...nvmAliasBinDirectories(root)];
  for (const directory of candidates) {
    if (directory && isExecutableFile(path.join(directory, "node"))) return directory;
  }
  return undefined;
}

function nvmAliasBinDirectories(nvmDir: string): string[] {
  let alias = "";
  try {
    alias = fs.readFileSync(path.join(nvmDir, "alias", "default"), "utf8").trim();
  } catch {
    return [];
  }
  const version = resolveNvmAliasValue(nvmDir, alias);
  if (!version) return [];
  const release = version.startsWith("v") ? version : `v${version}`;
  const versionsRoot = path.join(nvmDir, "versions", "node");
  const exact = path.join(versionsRoot, release, "bin");
  const matches: string[] = [];
  try {
    for (const name of fs.readdirSync(versionsRoot)) {
      if (nvmVersionNameMatches(name, release)) matches.push(name);
    }
  } catch {
    return [exact];
  }
  matches.sort(compareNodeVersionNames);
  return [exact, ...matches.map((name) => path.join(versionsRoot, name, "bin"))];
}

function nvmVersionNameMatches(name: string, release: string): boolean {
  if (name === release) return true;
  const wanted = parseNodeVersion(release);
  const got = parseNodeVersion(name);
  if (!wanted || !got) return false;
  if (wanted.minor == null) return got.major === wanted.major;
  if (wanted.patch == null) return got.major === wanted.major && got.minor === wanted.minor;
  return got.major === wanted.major && got.minor === wanted.minor && got.patch === wanted.patch;
}

function parseNodeVersion(value: string): { major: number; minor?: number; patch?: number } | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: match[2] == null ? undefined : Number(match[2]),
    patch: match[3] == null ? undefined : Number(match[3]),
  };
}

function resolveNvmAliasValue(nvmDir: string, raw: string): string {
  let current = raw.trim();
  for (let i = 0; i < 8; i++) {
    if (!current) return "";
    const aliasFile = path.join(nvmDir, "alias", ...current.split("/"));
    try {
      const next = fs.readFileSync(aliasFile, "utf8").trim();
      if (!next || next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function compareNodeVersionNames(left: string, right: string): number {
  const a = left.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (b[index] ?? 0) - (a[index] ?? 0);
    if (delta) return delta;
  }
  return 0;
}

function hostNodeBinDirectory(): string | undefined {
  const directory = path.dirname(process.execPath);
  const name = path.basename(process.execPath).toLowerCase();
  if ((name !== "node" && name !== "node.exe") || !isExecutableFile(process.execPath)) return undefined;
  return directory;
}

function userToolchainPath(): string {
  return mergePath(
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), ".grok", "bin"),
    nvmBinDirectory(),
    hostNodeBinDirectory(),
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    path.join(os.homedir(), ".cargo", "bin"),
  );
}

function currentSshAuthSock(): string | undefined {
  const value = process.env.SSH_AUTH_SOCK?.trim();
  if (!value || value.includes("cursor-sandbox")) return undefined;
  return value;
}

function currentTmpdir(): string | undefined {
  const value = process.env.TMPDIR?.trim();
  if (!value || /cursor-sandbox/i.test(value)) return undefined;
  return value;
}

function mergePath(...parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const directory of part.split(":")) {
      if (!directory || seen.has(directory)) continue;
      seen.add(directory);
      merged.push(directory);
    }
  }
  return merged.join(":");
}

export function isExecutableFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

export function resolveCommand(command: string, pathEnv: string): string {
  if (!command || command.includes("/") || command.includes("\\")) return command;
  for (const directory of pathEnv.split(":")) {
    if (!directory) continue;
    const candidate = path.join(directory, command);
    if (isExecutableFile(candidate)) return candidate;
  }
  return command;
}

export function resolvePtyCommand(command: string, pathEnv = buildPtyEnvironment().PATH ?? ""): string {
  return resolveCommand(command, pathEnv);
}

export function isPtyCommandAvailable(command: string, pathEnv = buildPtyEnvironment().PATH ?? ""): boolean {
  return Boolean(command?.trim()) && isExecutableFile(resolveCommand(command.trim(), pathEnv));
}

/** A terminal's environment: the person's login shell environment (`login`, read once by default), cleaned, and the caller's `overlay`. */
export function buildPtyEnvironment(overlay: Record<string, string> = {}, login: Record<string, string> = loginShellEnvironment()): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(login)) {
    // A terminal's Molis Work variables come only from its caller's overlay: those the person's login shell configuration exports
    // (a `MOLIS_WORK_ENCRYPTION_KEY`, a secret backend, test switches) are not carried in (S-103).
    if (!isBlockedPtyEnvKey(key) && !key.startsWith("MOLIS_WORK_")) env[key] = value;
  }
  env.HOME ||= os.homedir();
  env.USER ||= os.userInfo().username;
  env.LOGNAME ||= env.USER;
  env.SHELL ||= "/bin/zsh";
  env.PATH = mergePath(userToolchainPath(), login.PATH, UNIX_PATH);
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  const sshAuthSock = currentSshAuthSock();
  if (sshAuthSock) env.SSH_AUTH_SOCK = sshAuthSock;
  const tmpdir = currentTmpdir();
  if (tmpdir) env.TMPDIR = tmpdir;
  delete env.TERM_PROGRAM;
  delete env.TERM_PROGRAM_VERSION;
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  delete env.PWD;
  delete env.OLDPWD;
  for (const [key, value] of Object.entries(overlay)) {
    if (!isBlockedPtyEnvKey(key)) env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (isBlockedPtyEnvKey(key)) delete env[key];
  }
  return env;
}
