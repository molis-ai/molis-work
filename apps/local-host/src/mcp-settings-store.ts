import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";

export interface McpActionGrant {
  readonly client_id: string;
  readonly project_id: string | null;
  readonly capability_id: string;
  readonly version: number;
  readonly provider_id: string;
  readonly permissions: readonly string[];
  readonly enabled: boolean;
}

const MCP_TOOL_PREFERENCE_VERSION = 3;
const MCP_TOOL_PREFERENCE_RELATIVE_PATH = "config/mcp-tools.json";

/** Which actions each MCP client may use; nothing else switches an MCP tool on or off. */
export interface McpToolPreference {
  readonly version: typeof MCP_TOOL_PREFERENCE_VERSION;
  readonly action_grants: readonly (McpActionGrant & { readonly generation: string })[];
}

const EMPTY: McpToolPreference = { version: MCP_TOOL_PREFERENCE_VERSION, action_grants: [] };

export function mcpToolPreferencePath(homeDirectory: string): string {
  return path.join(homeDirectory, MCP_TOOL_PREFERENCE_RELATIVE_PATH);
}

export function parseMcpToolPreference(value: unknown): McpToolPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidPreference();
  const record = value as { version?: unknown; action_grants?: unknown };
  if (Object.keys(record).length !== 2 || Object.keys(record).some(key => key !== "version" && key !== "action_grants")
    || record.version !== MCP_TOOL_PREFERENCE_VERSION || !Array.isArray(record.action_grants) || !record.action_grants.every(isStoredMcpActionGrant)) throw invalidPreference();
  // Keep every valid record: duplicates are existing facts, never absence that reopens a public default.
  return { version: MCP_TOOL_PREFERENCE_VERSION, action_grants: record.action_grants };
}

function isMcpActionGrant(value: unknown, stored = false): value is McpActionGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const fields = ["client_id", "project_id", "capability_id", "version", "provider_id", "permissions", "enabled", ...(stored ? ["generation"] : [])];
  if (Object.keys(row).length !== fields.length || Object.keys(row).some(key => !fields.includes(key))) return false;
  const id = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return id(row.client_id) && (row.project_id === null || id(row.project_id)) && id(row.capability_id)
    && Number.isSafeInteger(row.version) && Number(row.version) > 0 && id(row.provider_id)
    && Array.isArray(row.permissions) && row.permissions.every(id) && typeof row.enabled === "boolean"
    && (!stored || id(row.generation));
}

function isStoredMcpActionGrant(value: unknown): value is McpToolPreference["action_grants"][number] { return isMcpActionGrant(value, true); }

export function actionGrantKey(grant: Pick<McpActionGrant, "client_id" | "project_id" | "capability_id" | "version" | "provider_id">): string {
  return JSON.stringify([grant.client_id, grant.project_id, grant.capability_id, grant.version, grant.provider_id]);
}

export async function readMcpToolPreference(homeDirectory: string): Promise<McpToolPreference> {
  try { return parsePreferenceText(await readFile(mcpToolPreferencePath(homeDirectory), "utf8")); }
  catch (error) { return unreadablePreference(error); }
}

/** The final effect check reads the same atomic file and current-version parser without yielding. */
export function readMcpToolPreferenceSync(homeDirectory: string): McpToolPreference {
  try { return parsePreferenceText(readFileSync(mcpToolPreferencePath(homeDirectory), "utf8")); }
  catch (error) { return unreadablePreference(error); }
}

function invalidPreference(cause?: unknown): ActionError {
  return new ActionError("actions.configuration_unavailable", "MCP 授权配置无效，已保留原文件；请修复为完整 version 3 配置后重试", { cause });
}

function parsePreferenceText(text: string): McpToolPreference {
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { throw invalidPreference(error); }
  return parseMcpToolPreference(value);
}

function unreadablePreference(error: unknown): McpToolPreference {
  if (error instanceof ActionError) throw error;
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return EMPTY;
  throw new ActionError("actions.configuration_unavailable", "MCP 授权配置无法读取，已保留原文件；请检查文件权限或路径后重试", { cause: error });
}

function assertUniqueGrants(preference: McpToolPreference): void {
  if (new Set(preference.action_grants.map(actionGrantKey)).size !== preference.action_grants.length) {
    throw new ActionError("actions.configuration_unavailable", "MCP 配置包含重复授权记录，已保留原文件；请明确修复配置后重试");
  }
}

const writes = new Map<string, Promise<unknown>>();

/** Management is the writer; all MCP processes re-read the same atomic file. */
async function updateMcpToolPreference(homeDirectory: string, change: (current: McpToolPreference) => McpToolPreference): Promise<McpToolPreference> {
  const filePath = mcpToolPreferencePath(homeDirectory);
  // Only the order is chained: the previous write's failure was already answered to its own caller.
  const pending = (writes.get(filePath) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const current = await readMcpToolPreference(homeDirectory);
    assertUniqueGrants(current);
    const preference = parseMcpToolPreference(change(current));
    assertUniqueGrants(preference);
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
  if (!grants.every(grant => isMcpActionGrant(grant))) throw new Error("动作授权无效");
  const snapshots = grants.map(grant => structuredClone(grant));
  const keys = new Set(snapshots.map(actionGrantKey));
  return updateMcpToolPreference(homeDirectory, current => ({ ...current,
    action_grants: [...current.action_grants.filter(row => !keys.has(actionGrantKey(row))), ...snapshots.map(grant => {
      const previous = current.action_grants.find(row => actionGrantKey(row) === actionGrantKey(grant));
      const samePermissions = previous && new Set(previous.permissions).size === new Set(grant.permissions).size
        && previous.permissions.every(permission => grant.permissions.includes(permission));
      return { ...grant, generation: previous && previous.enabled === grant.enabled && samePermissions ? previous.generation : randomUUID() };
    })],
  }));
}
