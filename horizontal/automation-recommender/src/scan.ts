import type { WorkspaceFileQuery, WorkspaceFileResult } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import type { AutomationEvidence, AutomationGap, AutomationHint, AutomationSignal } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import type { PluginServiceProjectHints } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";

export interface ScanDirectory { readonly id: string; readonly title: string }
/** A service's declared `project_hints`, as its declaration gives them (specs/automation-recommender §7). */
export interface ScanServiceHints extends PluginServiceProjectHints { readonly service_id: string }
const MAX_WORKSPACES = 4;
const MAX_DIRECTORY_READS = 8;
const MAX_TEXT_READS = 12;
const MAX_EVIDENCE = 80;
const MAX_BYTES = 512 * 1024;

type Entry = Extract<WorkspaceFileResult, { outcome: "directory" }>["entries"][number];
const manifests = new Set(["package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", ".mcp.json", "AGENTS.md", "CLAUDE.md"]);
const GIT_CONFIG = [".git", "config"] as const;
const configured = new Set(["settings.json", "settings.local.json", "hooks.json", "commands.json", "mcp.json", "skills.json"]);
const dotDirectories = [".claude", ".molis", ".github"];
const declaredDirectories = new Set(["skills", "agents", "commands", "hooks"]);
const dependencySignals: Readonly<Record<string, AutomationSignal>> = {
  react: "frontend", vue: "frontend", svelte: "frontend", next: "frontend", vite: "frontend",
  jest: "tests", vitest: "tests", "@playwright/test": "tests", mocha: "tests",
  eslint: "format", prettier: "format", "@biomejs/biome": "format", typescript: "format",
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
  if (name === "requirements.txt") return ["python", ...text && /^\s*pytest\b/m.test(text) ? ["tests" as const] : []];
  if (name === "pyproject.toml") return ["python", ...text && /\bpytest\b/.test(text) ? ["tests" as const] : [], ...text && /\[tool\.ruff\b/.test(text) ? ["format" as const] : []];
  if (name === "Cargo.toml" || name === "Cargo.lock") return ["rust"];
  if (name === "go.mod") return ["go"];
  if (["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"].includes(name)) return ["javascript"];
  if (name === ".mcp.json" && text !== undefined) return ["configured"];
  if ((name === "AGENTS.md" || name === "CLAUDE.md") && text !== undefined) return ["configured"];
  return [];
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The hosts of a Git config's remote URLs (`https://host/…`, `ssh://user@host/…`, `user@host:path`); never the URL or its user. */
function remoteHosts(text: string): Set<string> {
  const hosts = new Set<string>();
  for (const [, url] of text.matchAll(/^\s*url\s*=\s*(\S+)\s*$/gim)) {
    const found = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url!) ?? /^(?:[^@/\s]+@)?([^/:\s]+):(?!\/\/)/.exec(url!);
    if (found) hosts.add(found[1]!.toLowerCase());
  }
  return hosts;
}

/** The package names a manifest declares as its dependencies (npm), or the text a Python manifest names them in. */
function packageNames(text: string): Set<string> {
  const data = jsonRecord(text), names = new Set<string>();
  for (const value of [data?.dependencies, data?.devDependencies, data?.peerDependencies, data?.optionalDependencies]) if (isRecord(value)) Object.keys(value).forEach(name => names.add(name));
  return names;
}
const pythonNames = (name: string) => name.toLowerCase().replace(/[_.]+/g, "-");
function pythonDeclares(text: string, wanted: string): boolean {
  const name = escape(pythonNames(wanted)).replace(/-/g, "[-_.]");
  return new RegExp(`(?:^|["'\\s])${name}(?=\\s*(?:[<>=!~;\\[,"']|$))`, "im").test(text);
}

/**
 * The services whose declared hints this entry matches: a file or folder at a declared path, a dependency a manifest names (`@scope/*`
 * for a whole scope), a Git remote on a declared host. Only the declared hint is kept, never what the file says about it.
 */
function hintsOf(entry: Entry, text: string | undefined, services: readonly ScanServiceHints[]): AutomationHint[] {
  const out: AutomationHint[] = [], relative = entry.path.join("/");
  const npm = entry.name === "package.json" && entry.path.length === 1 && text !== undefined ? packageNames(text) : null;
  const python = (entry.name === "pyproject.toml" || entry.name === "requirements.txt") && entry.path.length === 1 ? text : undefined;
  const hosts = entry.path.length === 2 && entry.path[0] === GIT_CONFIG[0] && entry.name === GIT_CONFIG[1] && text !== undefined ? remoteHosts(text) : null;
  for (const service of services) {
    const add = (kind: AutomationHint["kind"], hint: string) => { out.push({ service_id: service.service_id, kind, hint }); };
    for (const hint of service.files ?? []) if (hint.endsWith("/") ? entry.kind === "directory" && `${relative}/` === hint : entry.kind === "file" && relative === hint) add("file", hint);
    for (const hint of service.dependencies ?? []) {
      const scope = hint.endsWith("/*") ? hint.slice(0, -1) : null;
      if (npm && (scope ? [...npm].some(name => name.startsWith(scope)) : npm.has(hint))) add("dependency", hint);
      else if (python !== undefined && !scope && !hint.startsWith("@") && pythonDeclares(python, hint)) add("dependency", hint);
    }
    for (const hint of service.git_hosts ?? []) if (hosts?.has(hint.toLowerCase())) add("git_host", hint);
  }
  return out;
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

export async function scanProjectAutomation(directories: readonly ScanDirectory[], read: (query: WorkspaceFileQuery) => Promise<WorkspaceFileResult>, assertCurrent: () => void,
  services: readonly ScanServiceHints[] = []) {
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
      || entry.path.length === 2 && [".claude", ".molis"].includes(entry.path[0]!) && configured.has(entry.name)
      || services.length > 0 && entry.path.length === 2 && entry.path[0] === GIT_CONFIG[0] && entry.name === GIT_CONFIG[1]);
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
    const signals = entry.path[0] === GIT_CONFIG[0] ? [] : signalsOf(entry, text), hints = hintsOf(entry, text, services);
    if (!signals.length && !hints.length) return;
    if (evidence.length >= MAX_EVIDENCE) { budget = true; return; }
    // Configured item names stay in this request only. The report can point at the containing folder.
    if (entry.path.length >= 3) return;
    evidence.push({ workspace_id: directory.id, workspace: directory.title, path: relative, signals, ...(hints.length ? { hints } : {}), ...(fingerprint ? { fingerprint } : {}) });
  };
  for (const directory of selected) {
    directoryReads += 1;
    const root = await request(directory, [], "directory");
    if (root.outcome !== "directory") continue;
    for (const entry of root.entries) await inspect(directory, entry);
    // A Git remote on a host a service declares: only the repository's own config is read, and only its remote hosts are kept.
    if (services.some(service => service.git_hosts?.length) && root.entries.some(item => item.kind === "directory" && item.name === GIT_CONFIG[0])) {
      await inspect(directory, { name: GIT_CONFIG[1], path: [...GIT_CONFIG], kind: "file" });
    }
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
