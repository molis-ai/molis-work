import fs from "node:fs";

export const DEFAULT_CLI_DATABASE = ".molis-work/molis-work.db";

export function cliFlagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

/** CLI input is decoded once here; application owners validate business payloads. */
export function readCliJsonPayload(args: string[]): Record<string, unknown> {
  const inline = cliFlagValue(args, "--json");
  const file = cliFlagValue(args, "--file");
  if (inline) return JSON.parse(inline) as Record<string, unknown>;
  if (file) return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  return {};
}

export function printCliJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function cliGoalUrl(goalPath: string, baseUrl: string): string {
  try {
    return new URL(goalPath, baseUrl).toString();
  } catch {
    throw new Error(`无效的 Molis Work Web 地址: ${baseUrl}`);
  }
}

export function printV1Help(): void {
  console.log(`molis-work v1 <operation> --db PATH --json '{...}'

Operations:
  init | snapshot | goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
  active-goal | import-v3

Complex payloads may use --file payload.json instead of --json.
The SQLite database defaults to ${DEFAULT_CLI_DATABASE}.`);
  console.log("\nInstall Molis Work itself: molis-work install [--home PATH]");
}
