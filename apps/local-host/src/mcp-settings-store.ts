import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface McpActionGrant {
  readonly client_id: string;
  readonly project_id: string | null;
  readonly capability_id: string;
  readonly version: number;
  readonly provider_id: string;
  readonly permissions: readonly string[];
  readonly enabled: boolean;
}

export const MCP_TOOL_PREFERENCE_VERSION = 1;
export const MCP_TOOL_PREFERENCE_RELATIVE_PATH = "config/mcp-tools.json";

export interface McpToolPreference {
  readonly version: typeof MCP_TOOL_PREFERENCE_VERSION;
  readonly overrides: Readonly<Record<string, boolean>>;
  readonly action_grants?: readonly McpActionGrant[];
}

const EMPTY: McpToolPreference = { version: MCP_TOOL_PREFERENCE_VERSION, overrides: {} };

export function mcpToolPreferencePath(homeDirectory: string): string {
  return path.join(homeDirectory, MCP_TOOL_PREFERENCE_RELATIVE_PATH);
}

export function parseMcpToolPreference(value: unknown): McpToolPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
  const record = value as { version?: unknown; overrides?: unknown; action_grants?: unknown };
  if (record.version !== MCP_TOOL_PREFERENCE_VERSION) return EMPTY;
  if (!record.overrides || typeof record.overrides !== "object" || Array.isArray(record.overrides)) {
    return EMPTY;
  }
  const overrides: Record<string, boolean> = {};
  for (const [name, enabled] of Object.entries(record.overrides)) {
    if (typeof enabled === "boolean" && name.startsWith("molis_work_v1_")) overrides[name] = enabled;
  }
  const grants = Array.isArray(record.action_grants) ? record.action_grants.filter(isMcpActionGrant) : [];
  // Conflicting records must not let an older enabled grant defeat a revocation.
  const counts = new Map<string, number>();
  for (const grant of grants) { const key = actionGrantKey(grant); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const unique = grants.filter(grant => counts.get(actionGrantKey(grant)) === 1);
  return { version: MCP_TOOL_PREFERENCE_VERSION, overrides, ...(record.action_grants !== undefined ? { action_grants: unique } : {}) };
}

function isMcpActionGrant(value: unknown): value is McpActionGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return id(row.client_id) && (row.project_id === null || id(row.project_id)) && id(row.capability_id)
    && Number.isSafeInteger(row.version) && Number(row.version) > 0 && id(row.provider_id)
    && Array.isArray(row.permissions) && row.permissions.every(id) && typeof row.enabled === "boolean";
}

export function actionGrantKey(grant: Pick<McpActionGrant, "client_id" | "project_id" | "capability_id" | "version" | "provider_id">): string {
  return JSON.stringify([grant.client_id, grant.project_id, grant.capability_id, grant.version, grant.provider_id]);
}

export function isMcpToolEnabled(
  name: string,
  defaultEnabled: boolean,
  overrides: Readonly<Record<string, boolean>>,
): boolean {
  return Object.hasOwn(overrides, name) ? overrides[name]! : defaultEnabled;
}

export async function readMcpToolPreference(homeDirectory: string): Promise<McpToolPreference> {
  try {
    const text = await readFile(mcpToolPreferencePath(homeDirectory), "utf8");
    return parseMcpToolPreference(JSON.parse(text) as unknown);
  } catch {
    return EMPTY;
  }
}

export async function writeMcpToolPreference(
  homeDirectory: string,
  overrides: Readonly<Record<string, boolean>>,
): Promise<McpToolPreference> {
  return updateMcpToolPreference(homeDirectory, current => ({ ...current, overrides: { ...overrides } }));
}

const writes = new Map<string, Promise<unknown>>();

/** Management is the writer; all MCP processes re-read the same atomic file. */
export async function updateMcpToolPreference(homeDirectory: string, change: (current: McpToolPreference) => McpToolPreference): Promise<McpToolPreference> {
  const filePath = mcpToolPreferencePath(homeDirectory);
  const pending = (writes.get(filePath) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    let current: McpToolPreference;
    try {
      const raw = JSON.parse(await readFile(filePath, "utf8"));
      current = parseMcpToolPreference(raw);
      if (!raw || raw.version !== MCP_TOOL_PREFERENCE_VERSION || !raw.overrides || typeof raw.overrides !== "object" || Array.isArray(raw.overrides)
        || (raw.action_grants !== undefined && (!Array.isArray(raw.action_grants) || raw.action_grants.length !== current.action_grants?.length))) {
        throw new Error("MCP 配置包含无效或冲突的记录，已保留原文件；请先修复配置");
      }
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; current = EMPTY; }
    const preference = change(current);
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(preference, null, 2)}\n`, "utf8");
    await rename(temporary, filePath);
    return preference;
  });
  writes.set(filePath, pending);
  try { return await pending; } finally { if (writes.get(filePath) === pending) writes.delete(filePath); }
}

export async function writeMcpActionGrant(homeDirectory: string, grant: McpActionGrant): Promise<McpToolPreference> {
  if (!isMcpActionGrant(grant)) throw new Error("动作授权无效");
  const snapshot = structuredClone(grant);
  return updateMcpToolPreference(homeDirectory, current => ({ ...current,
    action_grants: [...(current.action_grants ?? []).filter(row => actionGrantKey(row) !== actionGrantKey(snapshot)), snapshot],
  }));
}

export function withMcpToolOverride(
  preference: McpToolPreference,
  name: string,
  enabled: boolean,
  defaultEnabled: boolean,
): McpToolPreference {
  const overrides = { ...preference.overrides };
  if (enabled === defaultEnabled) delete overrides[name];
  else overrides[name] = enabled;
  return { ...preference, overrides };
}
