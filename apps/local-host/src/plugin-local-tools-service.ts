import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { PluginDefinition, PluginLocalToolsClient, PluginLocalToolsDeclaration, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginLocalToolsClient, type PluginLocalToolsPort } from "@molis-ai/molis-work-plugin-runtime";

/** Pins the directories searched (replacing `PATH` and the declared ones), for an isolated trial or a test that must not meet this machine's tools. */
export const LOCAL_TOOLS_PATH_ENV = "MOLIS_WORK_LOCAL_TOOLS_PATH";
/** `off` finds nothing. */
export const LOCAL_TOOLS_SWITCH_ENV = "MOLIS_WORK_LOCAL_TOOLS";
/** A found tool stays found, and a missing one missing, for this long unless the plugin asks again (`refresh`). */
const ANSWER_MS = 30_000;

/**
 * What a plugin that declares `local_tools` is given (PG-112): the Host looks for the declared file names in `PATH` and the declared
 * directories, with file-system queries only. It starts no process and reads no file. A sandboxed package is not given it (S-79).
 */
export function pluginLocalToolsFor(definition: PluginDefinition, context: PluginStartContext, assertActive: () => void): PluginLocalToolsClient | undefined {
  const declaration = definition.manifest.local_tools;
  if (!declaration || definition.execution === "sandbox") return undefined;
  return createPluginLocalToolsClient(definition.manifest, createPluginLocalToolsPort(),
    { assertActive, requireGrant: permission => context.requireGrant(permission) }, declaration);
}

type Found = readonly { readonly tool_id: string; readonly executable: string | null }[];

export function createPluginLocalToolsPort(now: () => number = Date.now): PluginLocalToolsPort {
  let answer: { key: string; at: number; found: Promise<Found> } | undefined;
  return {
    async find(declaration, options) {
      const switched = process.env[LOCAL_TOOLS_SWITCH_ENV] === "off";
      const pinned = process.env[LOCAL_TOOLS_PATH_ENV];
      const key = JSON.stringify([switched, pinned ?? null, process.env.PATH ?? "", declaration]);
      if (!answer || answer.key !== key || now() - answer.at > ANSWER_MS) {
        const found = switched ? Promise.resolve(declaration.tools.map(tool => ({ tool_id: tool.tool_id, executable: null })))
          : search(declaration, searchDirectories(declaration, pinned));
        const entry = { key, at: now(), found };
        answer = entry;
        // A failed or abandoned search is not kept: the next call looks again.
        found.catch(() => { if (answer === entry) answer = undefined; });
      }
      const pending = answer.found;
      if (!options.signal) return pending;
      options.signal.throwIfAborted();
      return Promise.race([pending, new Promise<never>((_, reject) => options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true }))]);
    },
    async isExecutable(candidate) {
      if (process.env[LOCAL_TOOLS_SWITCH_ENV] === "off") return false;
      return runnableFile(candidate);
    },
    refresh() { answer = undefined; },
  };
}

/** The pin replaces everything; otherwise `PATH`, then the declared directories (`~/` is the person's home). Only absolute directories count. */
function searchDirectories(declaration: PluginLocalToolsDeclaration, pinned: string | undefined): string[] {
  const home = homedir();
  const listed = pinned !== undefined ? pinned.split(path.delimiter)
    : [...(process.env.PATH ?? "").split(path.delimiter), ...(declaration.directories ?? []).map(directory => directory.startsWith("~/") ? path.join(home, directory.slice(2)) : directory)];
  return [...new Set(listed.filter(directory => path.isAbsolute(directory)))];
}

async function search(declaration: PluginLocalToolsDeclaration, directories: readonly string[]): Promise<Found> {
  const found: { tool_id: string; executable: string | null }[] = [];
  for (const tool of declaration.tools) {
    let executable: string | null = null;
    find: for (const directory of directories) {
      for (const binary of tool.binaries) {
        const candidate = path.join(directory, binary);
        if (await runnableFile(candidate)) { executable = candidate; break find; }
      }
    }
    found.push({ tool_id: tool.tool_id, executable });
  }
  return found;
}

async function runnableFile(candidate: string): Promise<boolean> {
  try {
    if (!(await stat(candidate)).isFile()) return false;
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
