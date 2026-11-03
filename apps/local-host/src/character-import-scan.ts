import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep, basename, extname } from "node:path";
import { CHARACTER_IMPORT_LIMITS as LIMITS, type CharacterImportFile, type CharacterImportRule, type CharacterImportRuntimeId, type CharacterImportSkill } from "@molis-ai/molis-work-contracts/modules/characters";
import { directory, inside, sensitive } from "./character-import-paths.js";

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

/**
 * One Agent runtime's configuration being read: what it takes in (rules, Skills, warnings), under the limits of an import and
 * only inside the directories the scan was allowed into. Nothing it reads is executed.
 */
export class CharacterScan {
  readonly rules: CharacterImportRule[] = [];
  readonly skills: CharacterImportSkill[] = [];
  readonly warnings: string[] = [];
  private readonly allowed = new Set<string>();
  private readonly skillPaths = new Set<string>();
  private totalBytes = 0;
  private fileCount = 0;

  constructor(private readonly runtime: CharacterImportRuntimeId) {}

  readonly warn = (message: string) => { if (!this.warnings.includes(message)) this.warnings.push(message); };

  allow(path: string) { if (directory(path)) this.allowed.add(realpathSync(path)); }

  private safeReal(path: string) {
    const target = realpathSync(path);
    if (![...this.allowed].some(root => inside(root, target))) throw new Error("符号链接越出已选来源目录");
    return target;
  }

  private read(path: string): Buffer | null {
    let fd: number | undefined;
    try {
      const target = this.safeReal(path);
      fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > LIMITS.fileBytes || this.totalBytes + stat.size > LIMITS.totalBytes) throw new Error("文件类型或大小超过导入限制");
      const bytes = readFileSync(fd);
      if (bytes.length > LIMITS.fileBytes || this.totalBytes + bytes.length > LIMITS.totalBytes) throw new Error("文件读取期间超过导入限制");
      this.totalBytes += bytes.length; return bytes;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(`${path}：${(error as Error).message}`); return null; }
    finally { if (fd !== undefined) closeSync(fd); }
  }

  readonly text = (path: string) => {
    const bytes = this.read(path); if (!bytes) return null;
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { this.warn(`${path}：不是有效 UTF-8 文本，未导入`); return null; }
  };

  readonly entries = (path: string): string[] => {
    try { return readdirSync(this.safeReal(path)).sort(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.warn(`${path}：无法读取目录（${(error as Error).message}）`); return []; }
  };

  addRule(path: string, scope: "global" | "project") {
    if (!existsSync(path) || this.rules.some(rule => rule.path === path)) return;
    if (this.rules.length >= LIMITS.rules) { this.warn("规则数量达到上限，其余规则未导入"); return; }
    if (lstatSync(path).isSymbolicLink()) { this.warn(`${path}：规则文件符号链接未导入，请选择实际配置目录`); return; }
    const content = this.text(path); if (content === null) return;
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
    const condition = frontmatter && /^(?:paths|globs|alwaysApply):/m.test(frontmatter) ? frontmatter : undefined;
    this.rules.push({ path, scope, content, ...(condition ? { condition } : {}) });
  }

  walkRules(path: string, scope: "global" | "project", extensions: string[], depth = 0, seen = new Set<string>()) {
    if (!existsSync(path)) return;
    if (lstatSync(path).isSymbolicLink()) { this.warn(`${path}：规则目录符号链接未导入`); return; }
    let target: string;
    try { target = this.safeReal(path); } catch (error) { this.warn(`${path}：${(error as Error).message}`); return; }
    if (seen.has(target) || depth > 8) { this.warn(`${path}：规则目录循环或过深，未继续扫描`); return; }
    seen.add(target);
    for (const name of this.entries(path)) {
      if (sensitive(name)) { this.warn(`${join(path, name)}：排除凭据、历史、依赖或生成目录`); continue; }
      const child = join(path, name);
      if (directory(child)) this.walkRules(child, scope, extensions, depth + 1, seen);
      else if (extensions.includes(extname(name))) this.addRule(child, scope);
    }
  }

  private addSkill(path: string) {
    let target: string;
    try { target = this.safeReal(path); } catch (error) { this.warn(`${path}：${(error as Error).message}`); return; }
    if (this.skillPaths.has(target)) return;
    if (this.skills.length >= LIMITS.skills) { this.warn("技能数量达到上限，其余技能未导入"); return; }
    this.skillPaths.add(target);
    const files: CharacterImportFile[] = [], seen = new Set<string>(), beforeWarnings = this.warnings.length;
    const walk = (dir: string, depth = 0) => {
      let actual: string;
      try { actual = this.safeReal(dir); } catch (error) { this.warn(`${dir}：${(error as Error).message}`); return; }
      // Internal relative links are allowed. External resources cannot silently enter a Skill package.
      if (!inside(target, actual) || seen.has(actual) || depth > 12) { this.warn(`${dir}：技能资源越界、循环或过深，未导入`); return; }
      seen.add(actual);
      for (const name of this.entries(dir)) {
        const child = join(dir, name);
        if (sensitive(name)) { this.warn(`${child}：排除凭据、历史、依赖或生成产物`); continue; }
        let actualFile: string;
        try { actualFile = this.safeReal(child); } catch (error) { this.warn(`${child}：${(error as Error).message}`); continue; }
        if (!inside(target, actualFile)) { this.warn(`${child}：技能附件符号链接越界，未导入`); continue; }
        if (directory(child)) { walk(child, depth + 1); continue; }
        if (files.length >= LIMITS.filesPerSkill || this.fileCount >= LIMITS.files) { this.warn(`${path}：技能资源数量达到上限，导入不完整`); break; }
        const bytes = this.read(child); if (bytes === null) continue;
        let encoding: "utf8" | "base64" = "utf8", content: string;
        try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (content.includes("\0")) throw new Error("binary"); }
        catch { encoding = "base64"; content = bytes.toString("base64"); }
        files.push({ path: relative(path, child).split(sep).join("/"), encoding, content }); this.fileCount++;
      }
    };
    walk(path);
    const body = files.find(file => file.path === "SKILL.md" && file.encoding === "utf8")?.content;
    if (!body) { this.warn(`${path}：缺少可读取的 SKILL.md，未导入技能`); return; }
    const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? "";
    const field = (key: "name" | "description") => skillFrontmatterScalar(frontmatter, key);
    const native = files.some(file => file.encoding === "base64" || !/\.(?:md|mdx|txt|json|jsonc|ya?ml|toml|csv|tsv|xml|svg)$/i.test(file.path))
      || /(?:mcp__|\bBash\b|\ballowed-tools:|\$\{(?:CLAUDE|CODEX|CURSOR)|(?:^|[\s(])(?:\.\.\/|file:\/\/))/m.test(body);
    const incomplete = this.warnings.length !== beforeWarnings;
    this.skills.push({ id: `${this.runtime}:${target}`, path, name: (field("name") || basename(path)).slice(0, 200),
      description: (field("description") || "").slice(0, 8000), files,
      compatibility: native || incomplete ? "native-only" : "portable",
      ...(native || incomplete ? { reason: incomplete ? "部分资源未读取，详见发现警告；使用前需在原生环境核对。" : "包含脚本、二进制资源或原生工具依赖，内置模式不能等价运行。" } : {}) });
  }

  scanSkills(path: string, depth = 0, seen = new Set<string>()) {
    if (!existsSync(path)) return;
    let target: string;
    try {
      // A symlink installed directly in a known Skills tree explicitly identifies one package.
      // Admit that package root only; links from its resources still cannot escape it.
      if (lstatSync(path).isSymbolicLink()) {
        const linked = realpathSync(path), body = join(linked, "SKILL.md");
        if (!linked.split(sep).some(sensitive) && existsSync(body) && lstatSync(body).isFile()) this.allowed.add(linked);
      }
      target = this.safeReal(path);
    } catch (error) { this.warn(`${path}：${(error as Error).message}`); return; }
    if (seen.has(target) || depth > 4) { this.warn(`${path}：技能目录循环或过深，未继续扫描`); return; }
    seen.add(target);
    if (existsSync(join(path, "SKILL.md"))) { this.addSkill(path); return; }
    for (const name of this.entries(path)) {
      if (sensitive(name)) { this.warn(`${join(path, name)}：排除凭据、历史、依赖或生成目录`); continue; }
      const child = join(path, name); if (directory(child)) this.scanSkills(child, depth + 1, seen);
    }
  }
}
