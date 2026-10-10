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

export const MCP_TOOL_PREFERENCE_VERSION = 2;
export const MCP_TOOL_PREFERENCE_RELATIVE_PATH = "config/mcp-tools.json";

/** Which actions each MCP client may use; nothing else switches an MCP tool on or off. */
export interface McpToolPreference {
  readonly version: typeof MCP_TOOL_PREFERENCE_VERSION;
  readonly action_grants: readonly McpActionGrant[];
}

const EMPTY: McpToolPreference = { version: MCP_TOOL_PREFERENCE_VERSION, action_grants: [] };

export function mcpToolPreferencePath(homeDirectory: string): string {
  return path.join(homeDirectory, MCP_TOOL_PREFERENCE_RELATIVE_PATH);
}

export function parseMcpToolPreference(value: unknown): McpToolPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
  const record = value as { version?: unknown; action_grants?: unknown };
  if (record.version !== MCP_TOOL_PREFERENCE_VERSION) return EMPTY;
  const grants = Array.isArray(record.action_grants) ? record.action_grants.filter(isMcpActionGrant) : [];
  // Conflicting records must not let an older enabled grant defeat a revocation.
  const counts = new Map<string, number>();
  for (const grant of grants) { const key = actionGrantKey(grant); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const unique = grants.filter(grant => counts.get(actionGrantKey(grant)) === 1);
  return { version: MCP_TOOL_PREFERENCE_VERSION, action_grants: unique };
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

export async function readMcpToolPreference(homeDirectory: string): Promise<McpToolPreference> {
  try {
    const text = await readFile(mcpToolPreferencePath(homeDirectory), "utf8");
    return parseMcpToolPreference(JSON.parse(text) as unknown);
  } catch {
    return EMPTY;
  }
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
      if (!raw || raw.version !== MCP_TOOL_PREFERENCE_VERSION || !Array.isArray(raw.action_grants) || raw.action_grants.length !== current.action_grants.length) {
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
  return writeMcpActionGrants(homeDirectory, [grant]);
}

/** Several grants in one atomic write: an action and the actions it depends on are saved together or not at all. */
export async function writeMcpActionGrants(homeDirectory: string, grants: readonly McpActionGrant[]): Promise<McpToolPreference> {
  if (!grants.every(isMcpActionGrant)) throw new Error("动作授权无效");
  const snapshots = grants.map(grant => structuredClone(grant));
  const keys = new Set(snapshots.map(actionGrantKey));
  return updateMcpToolPreference(homeDirectory, current => ({ ...current,
    action_grants: [...current.action_grants.filter(row => !keys.has(actionGrantKey(row))), ...snapshots],
  }));
}
