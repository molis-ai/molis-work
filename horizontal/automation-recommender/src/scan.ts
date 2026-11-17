import type { WorkspaceFileQuery, WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { AutomationEvidence, AutomationGap, AutomationSignal } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";

export interface ScanDirectory { readonly id: string; readonly title: string }
const MAX_WORKSPACES = 4;
const MAX_DIRECTORY_READS = 8;
const MAX_TEXT_READS = 12;
const MAX_EVIDENCE = 80;
const MAX_BYTES = 512 * 1024;

type Entry = Extract<WorkspaceFileResult, { outcome: "directory" }>["entries"][number];
const manifests = new Set(["package.json", "pyproject.toml", "Cargo.toml", "go.mod", ".mcp.json", "AGENTS.md", "CLAUDE.md"]);
const configured = new Set(["settings.json", "settings.local.json", "hooks.json", "commands.json", "mcp.json", "skills.json"]);
const dotDirectories = [".claude", ".molis", ".github"];
const declaredDirectories = new Set(["skills", "agents", "commands", "hooks"]);
const dependencySignals: Readonly<Record<string, AutomationSignal>> = {
  react: "frontend", vue: "frontend", svelte: "frontend", next: "frontend", vite: "frontend",
  jest: "tests", vitest: "tests", "@playwright/test": "tests", mocha: "tests",
  eslint: "format", prettier: "format", "@biomejs/biome": "format", typescript: "format",
  pg: "postgres", postgres: "postgres", "@notionhq/client": "notion", octokit: "github", "@octokit/rest": "github",
};
function jsonRecord(text: string) {
  try { const data: unknown = JSON.parse(text); return isRecord(data) ? data : undefined; }
  catch { return undefined; }
}

/** Extract fixed signals; workspace text, scripts, service endpoints and env never enter a report. */
function signalsOf(entry: Entry, text?: string): AutomationSignal[] {
  const { name, path } = entry;
  if (path[0] === ".claude" || path[0] === ".molis") {
    if (path.length === 1 && entry.kind === "directory") return ["configured"];
    if (path.length === 2 && (entry.kind === "directory" && declaredDirectories.has(name) || text !== undefined)) return ["configured"];
    return [];
  }
  if (path.length > 1 && !(path[0] === ".github" && name === "workflows" && entry.kind === "directory")) return [];
  if (path[0] === ".github" && name === "workflows" || name === ".gitlab-ci.yml") return ["ci"];
  if (["test", "tests", "__tests__", "spec"].includes(name) || /^(?:jest|vitest|playwright|pytest)\.config\./.test(name)) return ["tests"];
  if (/^(?:eslint\.config\.|\.eslintrc|biome\.json|\.prettierrc|tsconfig\.json)/.test(name)) return ["format"];
  if (name === "package.json") {
    const data = text ? jsonRecord(text) : undefined, signals = new Set<AutomationSignal>(["javascript"]);
    for (const value of [data?.dependencies, data?.devDependencies, data?.peerDependencies]) {
      if (isRecord(value)) for (const key of Object.keys(value)) if (Object.hasOwn(dependencySignals, key)) signals.add(dependencySignals[key]!);
    }
    if (isRecord(data?.scripts) && Object.hasOwn(data.scripts, "test")) signals.add("tests");
    return [...signals];
  }
  if (name === "pyproject.toml") return ["python", ...text && /\bpytest\b/.test(text) ? ["tests" as const] : [], ...text && /\[tool\.ruff\b/.test(text) ? ["format" as const] : []];
  if (name === "Cargo.toml" || name === "Cargo.lock") return ["rust"];
  if (name === "go.mod") return ["go"];
  if (["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"].includes(name)) return ["javascript"];
  if (name === ".mcp.json" && text !== undefined) return ["configured"];
  if ((name === "AGENTS.md" || name === "CLAUDE.md") && text !== undefined) return ["configured"];
  return [];
}

/** Match an existing declaration by stable name. Keep only bounded tokens, never raw configuration or a token value. */
function configNames(entry: Entry, text: string | undefined, add: (id: string) => void) {
  if (entry.path.length === 3 && declaredDirectories.has(entry.path[1]!)
    && (entry.kind === "directory" || entry.kind === "file" && entry.name.endsWith(".md"))) add(entry.name.replace(/\.md$/, ""));
  if (text === undefined) return;
  const name = entry.name;
  if (name === ".mcp.json" || name === "mcp.json") {
    const servers = jsonRecord(text)?.mcpServers;
    if (isRecord(servers)) Object.keys(servers).forEach(add);
  } else if (name === "AGENTS.md" || name === "CLAUDE.md") {
    for (const token of text.matchAll(/[a-z][a-z0-9_.-]{1,119}/gi)) add(token[0]);
  } else if (entry.path.length === 2 && configured.has(name)) {
    const values = jsonRecord(text);
    if (!values) return;
    for (const [key, value] of Object.entries(values)) {
      if (!declaredDirectories.has(key) && key !== "enabledSkills" && key !== "mcpServers") continue;
      if (isRecord(value)) Object.keys(value).forEach(add);
      if (Array.isArray(value)) for (const id of value) if (typeof id === "string") add(id);
    }
  }
}

export async function scanProjectAutomation(directories: readonly ScanDirectory[], read: (query: WorkspaceFileQuery) => Promise<WorkspaceFileResult>, assertCurrent: () => void) {
  const evidence: AutomationEvidence[] = [], gaps: AutomationGap[] = [], existing = new Set<string>();
  let bytes = 0, textReads = 0, directoryReads = 0, budget = directories.length > MAX_WORKSPACES;
  if (!directories.length) gaps.push({ code: "no-workspace" });
  const add = (id: string) => { if (existing.size < 4096 && /^[a-z][a-z0-9_.-]{1,119}$/i.test(id)) existing.add(id.toLowerCase()); };
  const selected = directories.slice(0, MAX_WORKSPACES);
  const nested: Array<{ directory: ScanDirectory; entry: Entry }> = [];
  const request = async (directory: ScanDirectory, path: readonly string[], kind: WorkspaceFileQuery["kind"]) => {
    assertCurrent();
    let result: WorkspaceFileResult;
    try { result = await read({ workspace_id: directory.id, kind, path }); }
    catch { result = { outcome: "denied" }; }
    assertCurrent();
    if (result.outcome !== kind) gaps.push({ code: "unreadable", workspace: directory.title, path: path.join("/") || "." });
    if (result.outcome === "directory" && result.truncated) budget = true;
    return result;
  };
  const inspect = async (directory: ScanDirectory, entry: Entry) => {
    const relative = entry.path.join("/");
    const wanted = entry.kind === "file" && (entry.path.length === 1 && manifests.has(entry.name)
      || entry.path.length === 2 && [".claude", ".molis"].includes(entry.path[0]!) && configured.has(entry.name));
    let text: string | undefined, fingerprint: string | undefined;
    if (wanted) {
      if (textReads >= MAX_TEXT_READS || bytes >= MAX_BYTES) budget = true;
      else {
        textReads += 1;
        const found = await request(directory, entry.path, "text");
        if (found.outcome === "text") {
          bytes += Buffer.byteLength(found.text);
          if (bytes <= MAX_BYTES) { text = found.text; fingerprint = found.fingerprint; } else budget = true;
        }
      }
    }
    if (text !== undefined && (entry.name === "package.json" || entry.name === ".mcp.json" || configured.has(entry.name)) && !jsonRecord(text)) {
      gaps.push({ code: "unreadable", workspace: directory.title, path: relative });
      text = undefined;
      fingerprint = undefined;
    }
    configNames(entry, text, add);
    const signals = signalsOf(entry, text);
    if (!signals.length) return;
    if (evidence.length >= MAX_EVIDENCE) { budget = true; return; }
    // Configured item names stay in this request only. The report can point at the containing folder.
    if (entry.path.length >= 3) return;
    evidence.push({ workspace_id: directory.id, workspace: directory.title, path: relative, signals, ...(fingerprint ? { fingerprint } : {}) });
  };
  for (const directory of selected) {
    directoryReads += 1;
    const root = await request(directory, [], "directory");
    if (root.outcome !== "directory") continue;
    for (const entry of root.entries) await inspect(directory, entry);
    for (const name of dotDirectories) {
      const entry = root.entries.find(item => item.kind === "directory" && item.name === name);
      if (entry) nested.push({ directory, entry });
    }
  }
  while (nested.length) {
    if (directoryReads >= MAX_DIRECTORY_READS) { budget = true; break; }
    const { directory, entry: folder } = nested.shift()!;
    directoryReads += 1;
    const result = await request(directory, folder.path, "directory");
    if (result.outcome !== "directory") continue;
    for (const entry of result.entries) {
      await inspect(directory, entry);
      if (entry.path.length === 2 && [".claude", ".molis"].includes(folder.name) && entry.kind === "directory"
        && declaredDirectories.has(entry.name)) nested.push({ directory, entry });
    }
  }
  if (budget) gaps.push({ code: "budget" });
  return { evidence, gaps, existing };
}
