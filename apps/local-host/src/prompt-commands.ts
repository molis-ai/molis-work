import { constants } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { PROMPT_COMMAND_LIMITS, PROMPT_COMMAND_LOCATIONS, type PromptCommandFile } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { readPromptCommand } from "@molis-ai/molis-work-plugin-sdk";

/**
 * Prompt commands as the Host reads them (Coding A2): the `.md` files in `.molis/commands` and `.claude/commands`, and one folder down,
 * of the person's home directory (`commands.personal.list@1`) or of one of the project's folders (`commands.project.list@1`). One walk
 * for both. A file that is a link is listed as unreadable and never followed, and a folder inside that is a link is not entered (nor read
 * through when it becomes one after it was listed), so a
 * command cannot bring another file's text to the plugin that asked (S-prompt-commands, docs/system/SECURITY-INVARIANTS.md). Nothing is written.
 */
export function personalPromptCommands(home = homedir()): Promise<PromptCommandFile[]> {
  // The person's command folder may itself be their own link (a dotfiles set-up); what is in it is read only as plain files.
  return promptCommandsIn(home, null);
}

/** A project folder's commands: its command folders are read only where they really are inside it (one that is a link out is not read). */
export async function projectPromptCommands(folder: string): Promise<PromptCommandFile[]> {
  return promptCommandsIn(folder, await realpath(folder));
}

async function promptCommandsIn(base: string, within: string | null): Promise<PromptCommandFile[]> {
  const found: PromptCommandFile[] = [];
  for (const location of PROMPT_COMMAND_LOCATIONS) {
    const root = path.join(base, location);
    if (!(await stat(root).catch(() => null))?.isDirectory()) continue;
    const real = await realpath(root).catch(() => null);
    if (!real || (within !== null && !real.startsWith(within + path.sep))) continue;
    const files: string[] = [];
    const walk = async (relative: string, depth: number) => {
      const entries = await readdir(path.join(root, relative), { withFileTypes: true }).catch(() => []);
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (files.length >= PROMPT_COMMAND_LIMITS.files || entry.name.startsWith(".")) continue;
        const at = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory() && depth === 0) await walk(at, 1);
        else if (/\.md$/iu.test(entry.name) && (entry.isFile() || entry.isSymbolicLink())) files.push(at);
      }
    };
    await walk("", 0);
    for (const file of files) {
      const read = await readOne(path.join(root, file), path.join(real, file));
      const command = read === "link" ? readPromptCommand({ location, path: file, text: "", bytes: 0 }) : readPromptCommand({ location, path: file, ...read });
      if (!command) continue;
      found.push(read === "link" ? { name: command.name, location, path: file, unreadable: "link" } : command);
    }
  }
  return found;
}

/**
 * One file's text, read without following a link: `link` for a link, `text: null` when it is not text. Opened without following one, so
 * a file swapped for a link after it was listed is refused too; and the opened file must be the one at `expected` under the command
 * folder's real place, so a subfolder swapped for a link after it was listed does not bring in a file from elsewhere.
 */
async function readOne(absolute: string, expected: string): Promise<"link" | { text: string | null; bytes: number }> {
  if ((await lstat(absolute).catch(() => null))?.isSymbolicLink()) return "link";
  const handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch((error: NodeJS.ErrnoException) => error.code === "ELOOP" ? "link" as const : null);
  if (handle === "link") return "link";
  if (!handle) return { text: null, bytes: 0 };
  try {
    const info = await handle.stat();
    const there = await realpath(absolute).catch(() => null) === expected ? await stat(expected).catch(() => null) : null;
    if (!there || there.dev !== info.dev || there.ino !== info.ino) return "link";
    if (!info.isFile()) return { text: null, bytes: 0 };
    if (info.size > PROMPT_COMMAND_LIMITS.bytes) return { text: "", bytes: info.size };
    const bytes = await handle.readFile();
    try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), bytes: bytes.byteLength }; } catch { return { text: null, bytes: bytes.byteLength }; }
  } finally { await handle.close(); }
}
