import { workspaceReadActions, writerDirectoryCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingBeforeWrite } from "./route-entry.js";
import { codingActionControl } from "./route-entry.js";

/**
 * Environment readiness inspection for the authorized Coding workspace (`CHO-13`, `spec.md:188-200,334`):
 * - Inspects Git repository / branch / uncommitted state and parallel worktrees (including cleanup hints when idle).
 * - Checks dependency readiness (`package.json` / lockfile vs `node_modules`, Python `.venv`, Rust `Cargo.toml`) without executing code.
 * - Extracts declared scripts and port hints (`package.json` scripts) and checks `.env.example` / `.env.sample` key names
 *   against directory presence of `.env` / `.env.local` **without ever reading `.env` or secret values**.
 */
export interface CodingEnvironmentCheckItem {
  id: "git" | "deps" | "env" | "scripts" | "worktrees";
  label: string;
  status: "ok" | "warn" | "info";
  detail: string;
}

export interface CodingEnvironmentReadiness {
  workspace_id: string;
  status: "ready" | "attention";
  summary: string;
  branch: string | null;
  dirty_count: number;
  is_git_repo: boolean;
  deps_manager: string | null;
  deps_installed: boolean;
  script_names: string[];
  ports: number[];
  env_template: string | null;
  env_keys: string[];
  items: CodingEnvironmentCheckItem[];
  worktrees: {
    active: number;
    problem_count: number;
    cleanup_count: number;
  };
  checked_at: string;
}

const ENV_TEMPLATES = [".env.example", ".env.sample", ".env.template"] as const;
const ENV_FILES = new Set([".env", ".env.local", ".env.development", ".env.development.local"]);
const LOCKFILES = ["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb", "bun.lock"] as const;

function parseEnvExampleKeys(text: string): string[] {
  const keys: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match?.[1] && !keys.includes(match[1])) keys.push(match[1]);
  }
  return keys.slice(0, 12);
}

function detectPortHints(scripts: Record<string, unknown>): number[] {
  const ports = new Set<number>();
  for (const value of Object.values(scripts)) {
    if (typeof value !== "string") continue;
    for (const match of value.matchAll(/(?:--port(?:\s+|=)|-p\s+|PORT=|localhost:|127\.0\.0\.1:)(\d{2,5})\b/g)) {
      const port = Number(match[1]);
      if (Number.isSafeInteger(port) && port >= 80 && port <= 65535) ports.add(port);
    }
  }
  return [...ports].slice(0, 4);
}

type ActionsPort = NonNullable<NonNullable<PluginStartContext["services"]>["actions"]>;
type ControlArg = ReturnType<typeof codingActionControl>;

async function inspectGitSummary(
  actions: ActionsPort,
  workspaceId: string,
  control: ControlArg,
  items: CodingEnvironmentCheckItem[],
): Promise<{ isGitRepo: boolean; branch: string | null; dirtyCount: number }> {
  try {
    const git = await actions.invoke(workspaceReadActions.git, { workspace_id: workspaceId, kind: "summary" }, control);
    if (git.outcome === "summary") {
      const branch = git.branch;
      const dirtyCount = git.unstaged + git.staged.length + git.conflicted.length;
      if (git.conflicted.length > 0 || git.merging) {
        items.push({
          id: "git",
          label: "代码仓库",
          status: "warn",
          detail: `${git.branch ?? "游离 HEAD"} · 存在未解决合并冲突（${git.conflicted.length} 个文件）`,
        });
      } else if (dirtyCount > 0) {
        items.push({
          id: "git",
          label: "代码仓库",
          status: "info",
          detail: `${git.branch ?? "游离 HEAD"} · 已有 ${dirtyCount} 处未提交改动（开始前已存在）`,
        });
      } else {
        items.push({
          id: "git",
          label: "代码仓库",
          status: "ok",
          detail: `${git.branch ?? "游离 HEAD"} · 工作区干净`,
        });
      }
      return { isGitRepo: true, branch, dirtyCount };
    }
    if (git.outcome === "not-a-repository") {
      items.push({
        id: "git",
        label: "代码仓库",
        status: "info",
        detail: "非 Git 仓库目录（仍可读写文件，不支持工作树隔离）",
      });
    }
  } catch {
    /* Git summary is advisory; non-git or restricted setups still allow normal workspace reads */
  }
  return { isGitRepo: false, branch: null, dirtyCount: 0 };
}

interface RootInspection {
  depsManager: string | null;
  depsInstalled: boolean;
  scriptNames: string[];
  ports: number[];
  envTemplate: string | null;
  envKeys: string[];
}

async function inspectRootDirectory(
  actions: ActionsPort,
  workspaceId: string,
  control: ControlArg,
  items: CodingEnvironmentCheckItem[],
): Promise<RootInspection> {
  const found: RootInspection = { depsManager: null, depsInstalled: false, scriptNames: [], ports: [], envTemplate: null, envKeys: [] };
  try {
    const root = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [], kind: "directory" }, control);
    if (root.outcome !== "directory") return found;
    const entryMap = new Map(root.entries.map(entry => [entry.name, entry.kind]));
    const lockfile = LOCKFILES.find(name => entryMap.get(name) === "file");
    if (entryMap.get("package.json") === "file") {
      const hasNodeModules = entryMap.get("node_modules") === "directory";
      found.depsManager = lockfile?.startsWith("pnpm") ? "pnpm" : lockfile?.startsWith("yarn") ? "yarn" : lockfile?.startsWith("bun") ? "bun" : "npm";
      found.depsInstalled = hasNodeModules;
      items.push({
        id: "deps",
        label: "依赖环境",
        status: hasNodeModules ? "ok" : "warn",
        detail: hasNodeModules
          ? `已就绪（${lockfile ?? "package.json"} · node_modules 已存在）`
          : `检测到 ${lockfile ?? "package.json"}，尚未安装 node_modules（需要时经审批安装）`,
      });
      const pkgRead = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: ["package.json"], kind: "text" }, control);
      if (pkgRead.outcome === "text") {
        try {
          const parsed = JSON.parse(pkgRead.text) as { scripts?: Record<string, unknown> };
          const pkgScripts = parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
          const knownScripts = ["test", "build", "typecheck", "lint", "dev", "start"].filter(key => typeof pkgScripts[key] === "string");
          const ports = detectPortHints(pkgScripts);
          found.scriptNames = knownScripts;
          found.ports = ports;
          if (knownScripts.length || ports.length) {
            const parts = [
              knownScripts.length ? `脚本：${knownScripts.join(" / ")}` : "",
              ports.length ? `常见端口 ${ports.join(", ")}（冲突时可自动换用空闲端口）` : "",
            ].filter(Boolean);
            items.push({ id: "scripts", label: "检查与服务", status: "ok", detail: parts.join(" · ") });
          }
        } catch {
          items.push({ id: "scripts", label: "检查与服务", status: "warn", detail: "package.json 格式无法解析" });
        }
      }
    } else if (entryMap.get("Cargo.toml") === "file") {
      found.depsManager = "cargo";
      found.depsInstalled = true;
      items.push({ id: "deps", label: "依赖环境", status: "ok", detail: "Rust 工作区（Cargo.toml）" });
    } else if (entryMap.get("pyproject.toml") === "file" || entryMap.get("requirements.txt") === "file") {
      const hasVenv = entryMap.get(".venv") === "directory" || entryMap.get("venv") === "directory";
      found.depsManager = "python";
      found.depsInstalled = hasVenv;
      items.push({
        id: "deps",
        label: "依赖环境",
        status: hasVenv ? "ok" : "info",
        detail: hasVenv ? "Python 虚拟环境已存在" : "检测到 Python 依赖声明（未见本地 .venv）",
      });
    }

    const templateName = ENV_TEMPLATES.find(name => entryMap.get(name) === "file");
    if (templateName) {
      found.envTemplate = templateName;
      const hasLocalEnv = [...ENV_FILES].some(name => entryMap.get(name) === "file");
      const tplRead = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [templateName], kind: "text" }, control);
      const keys = tplRead.outcome === "text" ? parseEnvExampleKeys(tplRead.text) : [];
      found.envKeys = keys;
      if (!hasLocalEnv && keys.length > 0) {
        items.push({
          id: "env",
          label: "环境变量",
          status: "warn",
          detail: `未见本地 .env，${templateName} 声明了 ${keys.slice(0, 5).join(", ")}${keys.length > 5 ? ` 等 ${keys.length} 项` : ""}（仅核对变量名，不读取密钥值）`,
        });
      } else {
        items.push({
          id: "env",
          label: "环境变量",
          status: "ok",
          detail: hasLocalEnv ? `已存在本地环境文件（参考 ${templateName}，不读取密钥值）` : `已核对 ${templateName}`,
        });
      }
    }
  } catch {
    /* Workspace file listing is advisory; authorization failures are reported when starting a round */
  }
  return found;
}

export async function inspectCodingEnvironment(
  context: PluginStartContext,
  workspaceId: string,
  hasActiveSessionRuns: boolean,
  beforeWrite: CodingBeforeWrite,
): Promise<CodingEnvironmentReadiness | null> {
  const actions = context.services?.actions;
  if (!actions || !workspaceId) return null;
  const control = codingActionControl(beforeWrite);
  const items: CodingEnvironmentCheckItem[] = [];
  const { isGitRepo, branch, dirtyCount } = await inspectGitSummary(actions, workspaceId, control, items);
  const root = await inspectRootDirectory(actions, workspaceId, control, items);

  // 3. Isolated worktrees & cleanup state
  let worktrees = { active: 0, problem_count: 0, cleanup_count: 0 };
  try {
    const listed = await actions.invoke(writerDirectoryCapabilities.list, { workspace_id: workspaceId }, control);
    const problemCount = listed.filter(item => Boolean(item.problem)).length;
    const cleanupCount = hasActiveSessionRuns ? 0 : listed.length;
    worktrees = { active: listed.length, problem_count: problemCount, cleanup_count: cleanupCount };
    if (listed.length > 0) {
      items.push({
        id: "worktrees",
        label: "并行工作树",
        status: problemCount > 0 ? "warn" : "info",
        detail: problemCount > 0
          ? `${listed.length} 个独立目录（${problemCount} 个分支状态异常，待处理）`
          : cleanupCount > 0
            ? `保留 ${listed.length} 个独立工作树（当前无运行中轮次，整合后可清理）`
            : `${listed.length} 个独立工作树就绪`,
      });
    }
  } catch {
    /* Worktree listing only applies to git-backed workspaces */
  }

  const warnings = items.filter(item => item.status === "warn");
  const status = warnings.length > 0 ? "attention" : "ready";
  const summaryParts = [
    status === "ready" ? "环境就绪" : `${warnings.length} 项环境待留意`,
    branch ? branch : "",
    dirtyCount > 0 ? `${dirtyCount} 处既有改动` : "",
    items.find(item => item.id === "deps")?.status === "ok" ? "依赖齐全" : "",
  ].filter(Boolean);

  return {
    workspace_id: workspaceId,
    status,
    summary: summaryParts.join(" · "),
    branch,
    dirty_count: dirtyCount,
    is_git_repo: isGitRepo,
    deps_manager: root.depsManager,
    deps_installed: root.depsInstalled,
    script_names: root.scriptNames,
    ports: root.ports,
    env_template: root.envTemplate,
    env_keys: root.envKeys,
    items,
    worktrees,
    checked_at: new Date().toISOString(),
  };
}
