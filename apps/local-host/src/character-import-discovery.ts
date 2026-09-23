import { installedPluginSkillRoots } from "./character-import-plugins.js";
import { constants, accessSync, closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { delimiter, isAbsolute, join, relative, resolve, sep, basename, extname } from "node:path";
import { randomUUID } from "node:crypto";
import { CHARACTER_IMPORT_LIMITS as LIMITS, CHARACTER_IMPORT_RUNTIMES, parseCharacterImportSnapshot,
  type CharacterImportCandidate, type CharacterImportFile, type CharacterImportRule, type CharacterImportRuntimeId,
  type CharacterImportSkill, type CharacterImportSnapshot } from "@molis-ai/molis-work-contracts/modules/characters";

export interface CharacterDiscoveryOptions { userHome: string; env?: NodeJS.ProcessEnv; now?: () => string }
export interface CharacterDiscoveryInput { runtime_id?: CharacterImportRuntimeId; config_root?: string; project_root?: string }
const LABELS = { codex: "Codex", "claude-code": "Claude Code", cursor: "Cursor", opencode: "OpenCode", "grok-build": "Grok Build" };
const inside = (root: string, value: string) => { const part = relative(root, value); return !part || (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`)); };
const sensitive = (name: string) => /^(?:\.git|node_modules|outputs?|\.cache|__pycache__|\.pytest_cache|\.DS_Store|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|auth(?:\.(?!md$).*)?|credentials?(?:\.(?!md$).*)?|secrets?(?:\.(?!md$).*)?|tokens?(?:\.(?!md$).*)?|sessions?|history|logs?)$/i.test(name)
  || /\.(?:pem|key|p12|pfx|sqlite|sqlite3|db|log)$/i.test(name);
const directory = (path: string) => { try { return statSync(path).isDirectory(); } catch { return false; } };
function confirmedDirectory(path: string, label: string): string {
  if (typeof path !== "string" || !isAbsolute(path) || /[\0\r\n]/.test(path) || !directory(path)) throw new Error(`${label}必须是存在的绝对目录`);
  return realpathSync(path);
}

/** Parse the scalar metadata used by Skills without interpreting arbitrary YAML tags or objects. */
function skillFrontmatterScalar(frontmatter: string, key: "name" | "description"): string | undefined {
  const lines = frontmatter.split(/\r?\n/), index = lines.findIndex(line => line.startsWith(`${key}:`));
  if (index < 0) return undefined;
  const value = lines[index]!.slice(key.length + 1).trim();
  const block = value.match(/^([>|])([1-9][+-]?|[+-][1-9]?)?[ \t]*(?:#.*)?$/);
  if (!block) return value.replace(/^["']|["']$/g, "");
  const indicator = block[2] ?? "", explicitIndent = indicator.match(/[1-9]/)?.[0];
  let indentation = explicitIndent ? Number(explicitIndent) : undefined;
  const content: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (!line.trim()) { content.push(""); continue; }
    const spaces = line.match(/^ */)![0].length;
    indentation ??= spaces;
    if (!indentation || spaces < indentation) break;
    content.push(line.slice(indentation));
  }
  let result = "", previousText: string | undefined;
  for (let i = 0; i < content.length; i++) {
    const line = content[i]!, next = content[i + 1];
    result += line;
    if (block[1] === "|" || next === undefined || next === "") result += "\n";
    else if (line === "") {
      if (previousText === undefined || /^[ \t]/.test(previousText) || /^[ \t]/.test(next)) result += "\n";
    } else result += /^[ \t]/.test(line) || /^[ \t]/.test(next) ? "\n" : " ";
    if (line) previousText = line;
  }
  if (indicator.includes("+")) return result;
  const stripped = result.replace(/\n+$/, "");
  return indicator.includes("-") || !stripped ? stripped : `${stripped}\n`;
}

/** The browser submits only a candidate id. Captured file contents never come from a browser request. */
export function createCharacterDiscovery(options: CharacterDiscoveryOptions) {
  const home = confirmedDirectory(options.userHome, "用户目录"), env = options.env ?? process.env;
  const captures = new Map<string, CharacterImportSnapshot>(), captureSizes = new Map<string, number>();
  let capturedBytes = 0;
  const executable = (runtime: CharacterImportRuntimeId): string | null => {
    const names = { codex: ["codex"], "claude-code": ["claude"], cursor: ["cursor-agent", "agent"], opencode: ["opencode"], "grok-build": ["grok", "agent"] }[runtime];
    const dirs = [...(env.PATH ?? "").split(delimiter).filter(path => path && isAbsolute(path)), join(home, ".local/bin"), join(home, ".codex/bin"), join(home, ".grok/bin"), join(home, ".cursor/bin")];
    for (const name of names) for (const dir of dirs) {
      try {
        const path = realpathSync(join(dir, name));
        if (!statSync(path).isFile()) continue;
        accessSync(path, constants.X_OK);
        // Both vendors have shipped `agent`; the basename alone is never sufficient evidence.
        if (name === "agent" && !(runtime === "cursor" ? /(?:^|[/\\])\.cursor(?:-agent)?[/\\]|cursor-agent/i : /(?:^|[/\\])\.grok[/\\]|grok/i).test(path)) continue;
        return path;
      } catch { /* An absent executable does not prevent importing configuration. */ }
    }
    return null;
  };
  return {
    executable(runtime: CharacterImportRuntimeId): string | null {
      if (!CHARACTER_IMPORT_RUNTIMES.includes(runtime)) throw new Error("不支持的 Agent 来源");
      return executable(runtime);
    },
    get(candidateId: string): CharacterImportSnapshot | null {
      const snapshot = captures.get(candidateId); return snapshot ? structuredClone(snapshot) : null;
    },
    discover(input: CharacterDiscoveryInput = {}): CharacterImportCandidate[] {
      if (input.runtime_id !== undefined && !CHARACTER_IMPORT_RUNTIMES.includes(input.runtime_id)) throw new Error("不支持的 Agent 来源");
      if (input.config_root !== undefined && !input.runtime_id) throw new Error("手动目录必须指定对应 Agent");
      const manualRoot = input.config_root === undefined ? undefined : confirmedDirectory(input.config_root, "配置目录");
      const projectRoot = input.project_root === undefined ? undefined : confirmedDirectory(input.project_root, "项目目录");
      const codexHome = env.CODEX_HOME && isAbsolute(env.CODEX_HOME) ? resolve(env.CODEX_HOME) : join(home, ".codex");
      const configHome = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? resolve(env.XDG_CONFIG_HOME) : join(home, ".config");
      const roots = { codex: codexHome, "claude-code": join(home, ".claude"), cursor: join(home, ".cursor"), opencode: join(configHome, "opencode"), "grok-build": join(home, ".grok") };
      const candidates: CharacterImportCandidate[] = [];
      for (const runtime of input.runtime_id ? [input.runtime_id] : CHARACTER_IMPORT_RUNTIMES) {
        const initialRoot = manualRoot ?? roots[runtime], root = directory(initialRoot) ? realpathSync(initialRoot) : initialRoot, warnings: string[] = [], rules: CharacterImportRule[] = [], skills: CharacterImportSkill[] = [];
        const binary = executable(runtime), allowed = new Set<string>();
        let totalBytes = 0, fileCount = 0;
        const warn = (message: string) => { if (!warnings.includes(message)) warnings.push(message); };
        const allow = (path: string) => { if (directory(path)) allowed.add(realpathSync(path)); };
        allow(root);
        // Shared Agent Skills are an explicit source, not permission to traverse the home directory.
        if (!manualRoot && ["codex", "cursor", "opencode"].includes(runtime)) allow(join(home, ".agents/skills"));
        if (!manualRoot && runtime === "codex") allow(join(home, ".agents/skills/.system"));
        if (!manualRoot && runtime === "opencode") { allow(join(home, ".claude/skills")); allow(join(home, ".claude")); }
        if (projectRoot) allow(projectRoot);
        const safeReal = (path: string) => {
          const target = realpathSync(path);
          if (![...allowed].some(root => inside(root, target))) throw new Error("符号链接越出已选来源目录");
          return target;
        };
        const read = (path: string): Buffer | null => {
          let fd: number | undefined;
          try {
            const target = safeReal(path);
            fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
            const stat = fstatSync(fd);
            if (!stat.isFile() || stat.size > LIMITS.fileBytes || totalBytes + stat.size > LIMITS.totalBytes) throw new Error("文件类型或大小超过导入限制");
            const bytes = readFileSync(fd);
            if (bytes.length > LIMITS.fileBytes || totalBytes + bytes.length > LIMITS.totalBytes) throw new Error("文件读取期间超过导入限制");
            totalBytes += bytes.length; return bytes;
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") warn(`${path}：${(error as Error).message}`); return null; }
          finally { if (fd !== undefined) closeSync(fd); }
        };
        const text = (path: string) => {
          const bytes = read(path); if (!bytes) return null;
          try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
          catch { warn(`${path}：不是有效 UTF-8 文本，未导入`); return null; }
        };
        const entries = (path: string): string[] => {
          try { return readdirSync(safeReal(path)).sort(); }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") warn(`${path}：无法读取目录（${(error as Error).message}）`); return []; }
        };
        const addRule = (path: string, scope: "global" | "project") => {
          if (!existsSync(path) || rules.some(rule => rule.path === path)) return;
          if (rules.length >= LIMITS.rules) { warn("规则数量达到上限，其余规则未导入"); return; }
          if (lstatSync(path).isSymbolicLink()) { warn(`${path}：规则文件符号链接未导入，请选择实际配置目录`); return; }
          const content = text(path); if (content === null) return;
          const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
          const condition = frontmatter && /^(?:paths|globs|alwaysApply):/m.test(frontmatter) ? frontmatter : undefined;
          rules.push({ path, scope, content, ...(condition ? { condition } : {}) });
        };
        const walkRules = (path: string, scope: "global" | "project", extensions: string[], depth = 0, seen = new Set<string>()) => {
          if (!existsSync(path)) return;
          if (lstatSync(path).isSymbolicLink()) { warn(`${path}：规则目录符号链接未导入`); return; }
          let target: string;
          try { target = safeReal(path); } catch (error) { warn(`${path}：${(error as Error).message}`); return; }
          if (seen.has(target) || depth > 8) { warn(`${path}：规则目录循环或过深，未继续扫描`); return; }
          seen.add(target);
          for (const name of entries(path)) {
            if (sensitive(name)) { warn(`${join(path, name)}：排除凭据、历史、依赖或生成目录`); continue; }
            const child = join(path, name);
            if (directory(child)) walkRules(child, scope, extensions, depth + 1, seen);
            else if (extensions.includes(extname(name))) addRule(child, scope);
          }
        };
        const skillPaths = new Set<string>();
        const addSkill = (path: string) => {
          let target: string;
          try { target = safeReal(path); } catch (error) { warn(`${path}：${(error as Error).message}`); return; }
          if (skillPaths.has(target)) return;
          if (skills.length >= LIMITS.skills) { warn("技能数量达到上限，其余技能未导入"); return; }
          skillPaths.add(target);
          const files: CharacterImportFile[] = [], seen = new Set<string>(), beforeWarnings = warnings.length;
          const walk = (dir: string, depth = 0) => {
            let actual: string;
            try { actual = safeReal(dir); } catch (error) { warn(`${dir}：${(error as Error).message}`); return; }
            // Internal relative links are allowed. External resources cannot silently enter a Skill package.
            if (!inside(target, actual) || seen.has(actual) || depth > 12) { warn(`${dir}：技能资源越界、循环或过深，未导入`); return; }
            seen.add(actual);
            for (const name of entries(dir)) {
              const child = join(dir, name);
              if (sensitive(name)) { warn(`${child}：排除凭据、历史、依赖或生成产物`); continue; }
              let actualFile: string;
              try { actualFile = safeReal(child); } catch (error) { warn(`${child}：${(error as Error).message}`); continue; }
              if (!inside(target, actualFile)) { warn(`${child}：技能附件符号链接越界，未导入`); continue; }
              if (directory(child)) { walk(child, depth + 1); continue; }
              if (files.length >= LIMITS.filesPerSkill || fileCount >= LIMITS.files) { warn(`${path}：技能资源数量达到上限，导入不完整`); break; }
              const bytes = read(child); if (bytes === null) continue;
              let encoding: "utf8" | "base64" = "utf8", content: string;
              try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (content.includes("\0")) throw new Error("binary"); }
              catch { encoding = "base64"; content = bytes.toString("base64"); }
              files.push({ path: relative(path, child).split(sep).join("/"), encoding, content }); fileCount++;
            }
          };
          walk(path);
          const body = files.find(file => file.path === "SKILL.md" && file.encoding === "utf8")?.content;
          if (!body) { warn(`${path}：缺少可读取的 SKILL.md，未导入技能`); return; }
          const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
          const field = (key: "name" | "description") => skillFrontmatterScalar(frontmatter, key);
          const native = files.some(file => file.encoding === "base64" || !/\.(?:md|mdx|txt|json|jsonc|ya?ml|toml|csv|tsv|xml|svg)$/i.test(file.path))
            || /(?:mcp__|\bBash\b|\ballowed-tools:|\$\{(?:CLAUDE|CODEX|CURSOR)|(?:^|[\s(])(?:\.\.\/|file:\/\/))/m.test(body);
          const incomplete = warnings.length !== beforeWarnings;
          skills.push({ id: `${runtime}:${target}`, path, name: (field("name") || basename(path)).slice(0, 200),
            description: (field("description") || "").slice(0, 8000), files,
            compatibility: native || incomplete ? "native-only" : "portable",
            ...(native || incomplete ? { reason: incomplete ? "部分资源未读取，详见发现警告；使用前需在原生环境核对。" : "包含脚本、二进制资源或原生工具依赖，内置模式不能等价运行。" } : {}) });
        };
        const scanSkills = (path: string, depth = 0, seen = new Set<string>()) => {
          if (!existsSync(path)) return;
          let target: string;
          try {
            // A symlink installed directly in a known Skills tree explicitly identifies one package.
            // Admit that package root only; links from its resources still cannot escape it.
            if (lstatSync(path).isSymbolicLink()) {
              const linked = realpathSync(path), body = join(linked, "SKILL.md");
              if (!linked.split(sep).some(sensitive) && existsSync(body) && lstatSync(body).isFile()) allowed.add(linked);
            }
            target = safeReal(path);
          } catch (error) { warn(`${path}：${(error as Error).message}`); return; }
          if (seen.has(target) || depth > 4) { warn(`${path}：技能目录循环或过深，未继续扫描`); return; }
          seen.add(target);
          if (existsSync(join(path, "SKILL.md"))) { addSkill(path); return; }
          for (const name of entries(path)) {
            if (sensitive(name)) { warn(`${join(path, name)}：排除凭据、历史、依赖或生成目录`); continue; }
            const child = join(path, name); if (directory(child)) scanSkills(child, depth + 1, seen);
          }
        };
        const globalNames = runtime === "codex" ? [existsSync(join(root, "AGENTS.override.md")) ? "AGENTS.override.md" : "AGENTS.md"]
          : runtime === "claude-code" ? ["CLAUDE.md"] : runtime === "grok-build" ? ["GROK.md", "AGENTS.md", "Agents.md", "AGENT.md", "CLAUDE.md", "Claude.md", "CLAUDE.local.md"] : ["AGENTS.md"];
        for (const name of globalNames) addRule(join(root, name), "global");
        if (runtime === "claude-code" || runtime === "grok-build") walkRules(join(root, "rules"), "global", [".md"]);
        if (runtime === "cursor") warn("Cursor 的全局 User Rules 位于编辑器设置；没有稳定文件协议，本次未读取该设置。仅扫描显式规则文件与 Skills。");
        if (!manualRoot && runtime === "opencode" && !rules.length) addRule(join(home, ".claude/CLAUDE.md"), "global");
        scanSkills(join(root, "skills"));
        if (!manualRoot && ["codex", "cursor", "opencode"].includes(runtime)) scanSkills(join(home, ".agents/skills"));
        if (!manualRoot && runtime === "opencode") scanSkills(join(home, ".claude/skills"));
        if (projectRoot) {
          const names = runtime === "claude-code" ? ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]
            : runtime === "cursor" ? ["AGENTS.md", "CLAUDE.md"] : runtime === "grok-build" ? globalNames
            : runtime === "codex" ? [existsSync(join(projectRoot, "AGENTS.override.md")) ? "AGENTS.override.md" : "AGENTS.md"]
            : [existsSync(join(projectRoot, "AGENTS.md")) ? "AGENTS.md" : "CLAUDE.md"];
          for (const name of names) addRule(join(projectRoot, name), "project");
          const projectDirs = runtime === "claude-code" ? [".claude"] : runtime === "cursor" ? [".cursor", ".agents"]
            : runtime === "opencode" ? [".opencode", ".claude", ".agents"] : runtime === "codex" ? [".agents", ".codex"] : [".grok"];
          for (const dir of projectDirs) scanSkills(join(projectRoot, dir, "skills"));
          if (runtime === "claude-code") walkRules(join(projectRoot, ".claude/rules"), "project", [".md"]);
          if (runtime === "cursor") walkRules(join(projectRoot, ".cursor/rules"), "project", [".mdc"]);
          if (runtime === "grok-build") for (const dir of [".grok", ".claude", ".cursor"]) walkRules(join(projectRoot, dir, "rules"), "project", [".md"]);
          warn("项目导入只读取所选根目录和固定规则/Skills 目录；父目录及其他子目录的指令未扫描，使用时仍须核对工作目录范围。");
        }
        for (const skillRoot of installedPluginSkillRoots({ runtime, root, projectRoot, text, entries, warn })) scanSkills(skillRoot);
        if (!binary) warn(`未找到已确认的 ${LABELS[runtime]} 命令；可以导入配置，原生执行暂不可用。`);
        if (runtime === "codex" || runtime === "opencode" || runtime === "grok-build") warn("本次只读取固定规则与 Skills 路径；配置中自定义 instructions、额外 skills 路径或禁用项尚未解析，请核对预览。 ");
        if (!manualRoot && !directory(root) && !binary && !rules.length && !skills.length) continue;
        const snapshot = parseCharacterImportSnapshot({ runtime_id: runtime, config_root: resolve(root), ...(projectRoot ? { project_root: projectRoot } : {}),
          captured_at: (options.now ?? (() => new Date().toISOString()))(), rules, skills });
        const candidate_id = randomUUID();
        captures.set(candidate_id, structuredClone(snapshot));
        const capturedSize = snapshot.rules.reduce((sum, rule) => sum + Buffer.byteLength(rule.content), 0)
          + snapshot.skills.reduce((sum, skill) => sum + skill.files.reduce((size, file) => size + Buffer.byteLength(file.content), 0), 0);
        captureSizes.set(candidate_id, capturedSize); capturedBytes += capturedSize;
        // Bound both preview count and actual resource bytes, including base64 expansion.
        while (captures.size > 25 || (capturedBytes > 96 * 1024 * 1024 && captures.size > 1)) {
          const oldest = captures.keys().next().value!;
          capturedBytes -= captureSizes.get(oldest)!; captureSizes.delete(oldest); captures.delete(oldest);
        }
        candidates.push({ candidate_id, label: LABELS[runtime], executable: binary, snapshot, warnings });
      }
      return candidates;
    },
  };
}
