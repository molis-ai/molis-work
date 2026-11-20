import fs from "node:fs";

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

/** One line of a command's text output, for the commands other packages run (`molis-work install`, `demo`, `uninstall`, …). */
export function printCliLine(text: string): void {
  console.log(text);
}

export function printV1Help(): void {
  console.log(`molis-work v1 <operation> --db PATH --json '{...}'

The management entry for project approvals from registered plugins.

Operations:
  review-request | review-decide

Complex payloads may use --file payload.json instead of --json.
--db PATH is required. It names an existing project's SQLite file. There is no default path: without --db nothing is opened.`);
  console.log("\nInstall Molis Work itself: molis-work install [--home PATH]");
}
