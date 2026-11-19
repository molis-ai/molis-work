/**
 * Whether a round's directory can be understood (Coding A4, CLS-01～03, decision 51): which languages it uses and whether the program
 * that understands each is here. It is checked once when the round starts and recorded with it, so the person sees before any review
 * which file types will be checked and which will not. Nothing is downloaded or started here: a program is either on this machine (an
 * absolute path or a name on PATH) or complete in this Home's own tools folder; anything else is `missing`, and that language is
 * "not checked" this round, never "no errors".
 */

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path, { delimiter } from "node:path";
import type { AgentRunCodeIntelligence } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { LanguageServerSpec } from "./lsp-client.js";
import { installedTool } from "./tool-fetcher.js";

/** A file at the top of a directory that says which language it is written in, as the extension its server is found by. */
const MARKERS: Readonly<Record<string, string>> = {
  "tsconfig.json": ".ts", "jsconfig.json": ".js", "package.json": ".js",
  "pyproject.toml": ".py", "setup.py": ".py", "requirements.txt": ".py", "Pipfile": ".py",
  "Cargo.toml": ".rs", "go.mod": ".go",
};
/** Where source usually sits; only the top of each is read, so a large tree costs a few directory listings. */
const SOURCE_DIRECTORIES = ["", "src", "lib", "app", "cmd", "pkg"] as const;
const MAX_LANGUAGES = 8;

/** A program on this machine: an absolute path that exists, or a name found on PATH. */
export function localCommand(command: string): string | undefined {
  if (command.startsWith("/")) return existsSync(command) ? command : undefined;
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = path.join(directory, command);
    if (candidate.length > directory.length && existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** The extensions the directory's files and markers name, in the order first seen. */
async function extensionsIn(rootPath: string): Promise<string[]> {
  const found = new Set<string>();
  for (const sub of SOURCE_DIRECTORIES) {
    const entries = await readdir(path.join(rootPath, sub), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const marker = sub === "" ? MARKERS[entry.name] : undefined;
      if (marker !== undefined) found.add(marker);
      const extension = path.extname(entry.name).toLowerCase();
      if (extension.length > 1) found.add(extension);
    }
  }
  return [...found];
}

/** The language a server's id names, with React variants under their language: one row per language the person knows. */
const languageOf = (spec: LanguageServerSpec, extension: string) => (spec.languageId ?? extension.slice(1)).replace(/react$/u, "");

export async function codeIntelligenceReadiness(input: {
  readonly servers: readonly LanguageServerSpec[];
  readonly rootPath: string;
  readonly tools?: { readonly root: string; readonly registry?: string };
}): Promise<AgentRunCodeIntelligence> {
  const rows = new Map<string, LanguageServerSpec>();
  for (const extension of await extensionsIn(input.rootPath)) {
    const spec = input.servers.find(one => one.extensions.includes(extension));
    if (spec === undefined) continue;
    const language = languageOf(spec, extension);
    if (!rows.has(language)) rows.set(language, spec);
  }
  // TypeScript's server reads JavaScript too: a TypeScript project shows one row, not two for the same program.
  const typescript = rows.get("typescript"), javascript = rows.get("javascript");
  if (typescript !== undefined && javascript?.command === typescript.command) rows.delete("javascript");
  const languages: AgentRunCodeIntelligence["languages"] = [];
  // By language, so a round reads the same however the folder lists its files.
  for (const [language, spec] of [...rows].sort(([a], [b]) => a.localeCompare(b)).slice(0, MAX_LANGUAGES)) {
    if (localCommand(spec.command) !== undefined) { languages.push({ language, command: spec.command, state: "ready", source: "this_machine" }); continue; }
    const tool = spec.install !== undefined && input.tools !== undefined
      ? await installedTool(spec.install, { toolsRoot: input.tools.root, ...(input.tools.registry === undefined ? {} : { registry: input.tools.registry }) }).catch(() => undefined)
      : undefined;
    languages.push(tool === undefined ? { language, command: spec.command, state: "missing" } : { language, command: spec.command, state: "ready", source: "tools" });
  }
  return { languages };
}
