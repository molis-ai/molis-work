import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const MCP_TOOL_PREFERENCE_VERSION = 1;
export const MCP_TOOL_PREFERENCE_RELATIVE_PATH = "config/mcp-tools.json";

export interface McpToolPreference {
  readonly version: typeof MCP_TOOL_PREFERENCE_VERSION;
  readonly overrides: Readonly<Record<string, boolean>>;
}

const EMPTY: McpToolPreference = { version: MCP_TOOL_PREFERENCE_VERSION, overrides: {} };

export function mcpToolPreferencePath(homeDirectory: string): string {
  return path.join(homeDirectory, MCP_TOOL_PREFERENCE_RELATIVE_PATH);
}

export function parseMcpToolPreference(value: unknown): McpToolPreference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY;
  const record = value as { version?: unknown; overrides?: unknown };
  if (record.version !== MCP_TOOL_PREFERENCE_VERSION) return EMPTY;
  if (!record.overrides || typeof record.overrides !== "object" || Array.isArray(record.overrides)) {
    return EMPTY;
  }
  const overrides: Record<string, boolean> = {};
  for (const [name, enabled] of Object.entries(record.overrides)) {
    if (typeof enabled === "boolean" && name.startsWith("molis_work_v1_")) overrides[name] = enabled;
  }
  return { version: MCP_TOOL_PREFERENCE_VERSION, overrides };
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
  const preference: McpToolPreference = { version: MCP_TOOL_PREFERENCE_VERSION, overrides: { ...overrides } };
  const filePath = mcpToolPreferencePath(homeDirectory);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(preference, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
  return preference;
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
  return { version: MCP_TOOL_PREFERENCE_VERSION, overrides };
}
