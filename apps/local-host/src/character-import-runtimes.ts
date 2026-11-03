import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CharacterImportRuntimeId } from "@molis-ai/molis-work-contracts/modules/characters";
import { installedPluginSkillRoots } from "./character-import-plugins.js";
import type { CharacterScan } from "./character-import-scan.js";

/** Where one runtime is read: its configuration directory, the person's home, and the directories the person chose. */
export interface RuntimeSources {
  home: string;
  root: string;
  manualRoot: string | undefined;
  projectRoot: string | undefined;
}

/** What a runtime reads in the project the person chose; the rule files first, then the Skills trees, then the rule directories. */
function project(scan: CharacterScan, { projectRoot }: RuntimeSources, ruleFiles: readonly string[], skillTrees: readonly string[], ruleDirectories: ReadonlyArray<readonly [string, string]>) {
  if (!projectRoot) return;
  for (const name of ruleFiles) scan.addRule(join(projectRoot, name), "project");
  for (const dir of skillTrees) scan.scanSkills(join(projectRoot, dir, "skills"));
  for (const [dir, extension] of ruleDirectories) scan.walkRules(join(projectRoot, dir), "project", [extension]);
  scan.warn("项目导入只读取所选根目录和固定规则/Skills 目录；父目录及其他子目录的指令未扫描，使用时仍须核对工作目录范围。");
}

/** The shared Agent Skills tree is an explicit source, not permission to traverse the home directory. */
function sharedSkills(scan: CharacterScan, { home, manualRoot }: RuntimeSources) {
  if (!manualRoot) scan.scanSkills(join(home, ".agents/skills"));
}

function scanCodex(scan: CharacterScan, sources: RuntimeSources) {
  const { home, root, manualRoot, projectRoot } = sources;
  scan.allow(root);
  if (!manualRoot) { scan.allow(join(home, ".agents/skills")); scan.allow(join(home, ".agents/skills/.system")); }
  if (projectRoot) scan.allow(projectRoot);
  scan.addRule(join(root, existsSync(join(root, "AGENTS.override.md")) ? "AGENTS.override.md" : "AGENTS.md"), "global");
  scan.scanSkills(join(root, "skills"));
  sharedSkills(scan, sources);
  project(scan, sources, [projectRoot && existsSync(join(projectRoot, "AGENTS.override.md")) ? "AGENTS.override.md" : "AGENTS.md"], [".agents", ".codex"], []);
}

function scanClaudeCode(scan: CharacterScan, sources: RuntimeSources) {
  const { root, projectRoot } = sources;
  scan.allow(root);
  if (projectRoot) scan.allow(projectRoot);
  scan.addRule(join(root, "CLAUDE.md"), "global");
  scan.walkRules(join(root, "rules"), "global", [".md"]);
  scan.scanSkills(join(root, "skills"));
  project(scan, sources, ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"], [".claude"], [[".claude/rules", ".md"]]);
}

function scanCursor(scan: CharacterScan, sources: RuntimeSources) {
  const { home, root, manualRoot, projectRoot } = sources;
  scan.allow(root);
  if (!manualRoot) scan.allow(join(home, ".agents/skills"));
  if (projectRoot) scan.allow(projectRoot);
  scan.addRule(join(root, "AGENTS.md"), "global");
  scan.warn("Cursor 的全局 User Rules 位于编辑器设置；没有稳定文件协议，本次未读取该设置。仅扫描显式规则文件与 Skills。");
  scan.scanSkills(join(root, "skills"));
  sharedSkills(scan, sources);
  project(scan, sources, ["AGENTS.md", "CLAUDE.md"], [".cursor", ".agents"], [[".cursor/rules", ".mdc"]]);
}

function scanOpencode(scan: CharacterScan, sources: RuntimeSources) {
  const { home, root, manualRoot, projectRoot } = sources;
  scan.allow(root);
  if (!manualRoot) { scan.allow(join(home, ".agents/skills")); scan.allow(join(home, ".claude/skills")); scan.allow(join(home, ".claude")); }
  if (projectRoot) scan.allow(projectRoot);
  scan.addRule(join(root, "AGENTS.md"), "global");
  if (!manualRoot && !scan.rules.length) scan.addRule(join(home, ".claude/CLAUDE.md"), "global");
  scan.scanSkills(join(root, "skills"));
  sharedSkills(scan, sources);
  if (!manualRoot) scan.scanSkills(join(home, ".claude/skills"));
  project(scan, sources, [projectRoot && existsSync(join(projectRoot, "AGENTS.md")) ? "AGENTS.md" : "CLAUDE.md"], [".opencode", ".claude", ".agents"], []);
}

const GROK_RULE_FILES = ["GROK.md", "AGENTS.md", "Agents.md", "AGENT.md", "CLAUDE.md", "Claude.md", "CLAUDE.local.md"];

function scanGrokBuild(scan: CharacterScan, sources: RuntimeSources) {
  const { root, projectRoot } = sources;
  scan.allow(root);
  if (projectRoot) scan.allow(projectRoot);
  for (const name of GROK_RULE_FILES) scan.addRule(join(root, name), "global");
  scan.walkRules(join(root, "rules"), "global", [".md"]);
  scan.scanSkills(join(root, "skills"));
  project(scan, sources, GROK_RULE_FILES, [".grok"], [[".grok/rules", ".md"], [".claude/rules", ".md"], [".cursor/rules", ".md"]]);
}

/**
 * One scan per runtime. `fixedPathsOnly`: what the runtime's own configuration can add (instructions, extra Skills paths, disabled
 * entries) is not read, which the person is told at the preview.
 */
const RUNTIME_SCANS: Record<CharacterImportRuntimeId, { scan: (scan: CharacterScan, sources: RuntimeSources) => void; fixedPathsOnly: boolean }> = {
  codex: { scan: scanCodex, fixedPathsOnly: true },
  "claude-code": { scan: scanClaudeCode, fixedPathsOnly: false },
  cursor: { scan: scanCursor, fixedPathsOnly: false },
  opencode: { scan: scanOpencode, fixedPathsOnly: true },
  "grok-build": { scan: scanGrokBuild, fixedPathsOnly: true },
};

/** Reads one runtime's rules and Skills into `scan`: its own sources, the plugins it has installed, then what could not be read. */
export function scanRuntime(runtime: CharacterImportRuntimeId, scan: CharacterScan, sources: RuntimeSources, label: string, binary: string | null) {
  const { scan: read, fixedPathsOnly } = RUNTIME_SCANS[runtime];
  read(scan, sources);
  const { root, projectRoot } = sources;
  for (const skillRoot of installedPluginSkillRoots({ runtime, root, projectRoot, text: scan.text, entries: scan.entries, warn: scan.warn })) scan.scanSkills(skillRoot);
  if (!binary) scan.warn(`未找到已确认的 ${label} 命令；可以导入配置，原生执行暂不可用。`);
  if (fixedPathsOnly) scan.warn("本次只读取固定规则与 Skills 路径；配置中自定义 instructions、额外 skills 路径或禁用项尚未解析，请核对预览。 ");
}
