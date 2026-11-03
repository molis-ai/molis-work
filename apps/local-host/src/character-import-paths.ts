import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CHARACTER_IMPORT_RUNTIMES, characterErrors, type CharacterImportRuntimeId } from "@molis-ai/molis-work-contracts/modules/characters";

export interface CharacterDiscoveryInput { runtime_id?: CharacterImportRuntimeId; config_root?: string; project_root?: string }

export const inside = (root: string, value: string) => { const part = relative(root, value); return !part || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)); };
export const sensitive = (name: string) => /^(?:\.git|node_modules|outputs?|\.cache|__pycache__|\.pytest_cache|\.DS_Store|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|auth(?:\.(?!md$).*)?|credentials?(?:\.(?!md$).*)?|secrets?(?:\.(?!md$).*)?|tokens?(?:\.(?!md$).*)?|sessions?|history|logs?)$/i.test(name)
  || /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db|log)$/i.test(name);
export const directory = (path: string) => { try { return statSync(path).isDirectory(); } catch { return false; } };
export function confirmedDirectory(path: string, label: string): string {
  if (typeof path !== "string" || !isAbsolute(path) || /[\0\r\n]/.test(path) || !directory(path)) throw characterErrors.invalid(`${label}必须是存在的绝对目录`);
  return realpathSync(path);
}

/** Where one discovery looks: the directories the person chose, and each Agent runtime's own configuration directory. */
export interface DiscoveryRoots {
  manualRoot: string | undefined;
  projectRoot: string | undefined;
  /** The runtimes this discovery covers, in the order they are scanned. */
  runtimes: readonly CharacterImportRuntimeId[];
  roots: Record<CharacterImportRuntimeId, string>;
}

export function discoveryRoots(home: string, env: NodeJS.ProcessEnv, input: CharacterDiscoveryInput): DiscoveryRoots {
  if (input.runtime_id !== undefined && !CHARACTER_IMPORT_RUNTIMES.includes(input.runtime_id)) throw characterErrors.invalid("不支持的 Agent 来源");
  if (input.config_root !== undefined && !input.runtime_id) throw characterErrors.invalid("手动目录必须指定对应 Agent");
  const manualRoot = input.config_root === undefined ? undefined : confirmedDirectory(input.config_root, "配置目录");
  const projectRoot = input.project_root === undefined ? undefined : confirmedDirectory(input.project_root, "项目目录");
  const codexHome = env.CODEX_HOME && isAbsolute(env.CODEX_HOME) ? resolve(env.CODEX_HOME) : join(home, ".codex");
  const configHome = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
  const roots = { codex: codexHome, "claude-code": join(home, ".claude"), cursor: join(home, ".cursor"), opencode: join(configHome, "opencode"), "grok-build": join(home, ".grok") };
  return { manualRoot, projectRoot, runtimes: input.runtime_id ? [input.runtime_id] : CHARACTER_IMPORT_RUNTIMES, roots };
}
