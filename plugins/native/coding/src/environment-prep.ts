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
 * - Returns structured facts only; UI wording is rendered on the client via `buildEnvironmentChecklistHtml`.
 */
export interface CodingEnvironmentReadiness {
  workspace_id: string;
  canonical_path: string;
  status: "ready" | "attention";
  branch: string | null;
  head_commit: string | null;
  dirty_count: number;
  git_conflicted_count: number;
  git_merging: boolean;
  is_git_repo: boolean;
  deps_manager: string | null;
  deps_installed: boolean;
  script_names: string[];
  ports: number[];
  package_json_invalid?: boolean;
  env_template: string | null;
  env_keys: string[];
  has_local_env: boolean;
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
): Promise<{ isGitRepo: boolean; branch: string | null; headCommit: string | null; dirtyCount: number; conflictedCount: number; merging: boolean }> {
  try {
    const git = await actions.invoke(workspaceReadActions.git, { workspace_id: workspaceId, kind: "summary" }, control);
    if (git.outcome === "summary") {
      return {
        isGitRepo: true,
        branch: git.branch,
        headCommit: git.head_commit,
        dirtyCount: git.unstaged + git.staged.length + git.conflicted.length,
        conflictedCount: git.conflicted.length,
        merging: Boolean(git.merging),
      };
    }
  } catch {
    /* Git summary is advisory; non-git or restricted setups still allow normal workspace reads */
  }
  return { isGitRepo: false, branch: null, headCommit: null, dirtyCount: 0, conflictedCount: 0, merging: false };
}

interface RootInspection {
  depsManager: string | null;
  depsInstalled: boolean;
  scriptNames: string[];
  ports: number[];
  packageJsonInvalid?: boolean;
  envTemplate: string | null;
  envKeys: string[];
  hasLocalEnv: boolean;
}

async function inspectRootDirectory(
  actions: ActionsPort,
  workspaceId: string,
  control: ControlArg,
): Promise<RootInspection> {
  const found: RootInspection = {
    depsManager: null,
    depsInstalled: false,
    scriptNames: [],
    ports: [],
    envTemplate: null,
    envKeys: [],
    hasLocalEnv: false,
  };
  try {
    const root = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [], kind: "directory" }, control);
    if (root.outcome !== "directory") return found;
    const entryMap = new Map(root.entries.map(entry => [entry.name, entry.kind]));
    found.hasLocalEnv = [...ENV_FILES].some(name => entryMap.get(name) === "file");
    const lockfile = LOCKFILES.find(name => entryMap.get(name) === "file");
    if (entryMap.get("package.json") === "file") {
      found.depsManager = lockfile?.startsWith("pnpm") ? "pnpm" : lockfile?.startsWith("yarn") ? "yarn" : lockfile?.startsWith("bun") ? "bun" : "npm";
      found.depsInstalled = entryMap.get("node_modules") === "directory";
      const pkgRead = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: ["package.json"], kind: "text" }, control);
      if (pkgRead.outcome === "text") {
        try {
          const parsed = JSON.parse(pkgRead.text) as { scripts?: Record<string, unknown> };
          const pkgScripts = parsed.scripts && typeof parsed.scripts === "object" ? parsed.scripts : {};
          found.scriptNames = ["test", "build", "typecheck", "lint", "dev", "start"].filter(key => typeof pkgScripts[key] === "string");
          found.ports = detectPortHints(pkgScripts);
        } catch {
          found.packageJsonInvalid = true;
        }
      }
    } else if (entryMap.get("Cargo.toml") === "file") {
      found.depsManager = "cargo";
      found.depsInstalled = true;
    } else if (entryMap.get("pyproject.toml") === "file" || entryMap.get("requirements.txt") === "file") {
      found.depsManager = "python";
      found.depsInstalled = entryMap.get(".venv") === "directory" || entryMap.get("venv") === "directory";
    }

    const templateName = ENV_TEMPLATES.find(name => entryMap.get(name) === "file");
    if (templateName) {
      found.envTemplate = templateName;
      const tplRead = await actions.invoke(workspaceReadActions.file, { workspace_id: workspaceId, path: [templateName], kind: "text" }, control);
      found.envKeys = tplRead.outcome === "text" ? parseEnvExampleKeys(tplRead.text) : [];
    }
  } catch {
    /* Workspace file listing is advisory; authorization failures are reported when starting a round */
  }
  return found;
}

export async function inspectCodingEnvironment(
  context: PluginStartContext,
  workspaceId: string,
  canonicalPath: string,
  hasActiveSessionRuns: boolean,
  beforeWrite: CodingBeforeWrite,
): Promise<CodingEnvironmentReadiness | null> {
  const actions = context.services?.actions;
  if (!actions || !workspaceId) return null;
  const control = codingActionControl(beforeWrite);
  const gitInfo = await inspectGitSummary(actions, workspaceId, control);
  const root = await inspectRootDirectory(actions, workspaceId, control);

  let worktrees = { active: 0, problem_count: 0, cleanup_count: 0 };
  try {
    const listed = await actions.invoke(writerDirectoryCapabilities.list, { workspace_id: workspaceId }, control);
    const problemCount = listed.filter(item => Boolean(item.problem)).length;
    const cleanupCount = hasActiveSessionRuns ? 0 : listed.length;
    worktrees = { active: listed.length, problem_count: problemCount, cleanup_count: cleanupCount };
  } catch {
    /* Worktree listing only applies to git-backed workspaces */
  }

  const needsNodeDeps = Boolean(root.depsManager && !["cargo", "python"].includes(root.depsManager) && !root.depsInstalled);
  const needsLocalEnv = Boolean(root.envTemplate && !root.hasLocalEnv && root.envKeys.length > 0);
  const hasAttention = gitInfo.conflictedCount > 0
    || gitInfo.merging
    || needsNodeDeps
    || Boolean(root.packageJsonInvalid)
    || needsLocalEnv
    || worktrees.problem_count > 0;

  return {
    workspace_id: workspaceId,
    canonical_path: canonicalPath,
    status: hasAttention ? "attention" : "ready",
    branch: gitInfo.branch,
    head_commit: gitInfo.headCommit,
    dirty_count: gitInfo.dirtyCount,
    git_conflicted_count: gitInfo.conflictedCount,
    git_merging: gitInfo.merging,
    is_git_repo: gitInfo.isGitRepo,
    deps_manager: root.depsManager,
    deps_installed: root.depsInstalled,
    script_names: root.scriptNames,
    ports: root.ports,
    ...(root.packageJsonInvalid ? { package_json_invalid: true } : {}),
    env_template: root.envTemplate,
    env_keys: root.envKeys,
    has_local_env: root.hasLocalEnv,
    worktrees,
    checked_at: new Date().toISOString(),
  };
}
