import { PROMPT_COMMAND_LIMITS, type PromptCommandFile, type PromptCommandLocation } from "@molis-ai/molis-work-contracts/services/prompt-commands";

/**
 * Reading a command file (Coding A2), the one way the Host and every plugin read one. Front matter between `---` lines may give a
 * `description` and an `argument-hint`; anything else in it (allowed tools, a model) is not read, since a command is only prompt text.
 * A file whose front matter is not closed, that is too long, or that is not text is listed as unreadable, and the others still work.
 */

const ARGUMENTS = "$ARGUMENTS";

/** What follows `/` for a file at `path` under its location: `name.md` → `name`, `folder/name.md` → `folder:name`; null for anything else. */
export function promptCommandName(path: string): string | null {
  const parts = path.split("/");
  if (parts.length > 2 || !/\.md$/iu.test(path) || parts.some(part => !part || part.startsWith("."))) return null;
  const name = parts.join(":").replace(/\.md$/iu, "");
  return name && name.length <= PROMPT_COMMAND_LIMITS.name && !/[\s/\\]/u.test(name) ? name : null;
}

/** One command file as read: its text, or why it cannot be used. `bytes` is the file's size, for the limit. */
export function readPromptCommand(file: { readonly location: PromptCommandLocation; readonly path: string; readonly text: string | null; readonly bytes: number }): PromptCommandFile | null {
  const name = promptCommandName(file.path);
  if (!name) return null;
  const place = { name, location: file.location, path: file.path };
  if (file.bytes > PROMPT_COMMAND_LIMITS.bytes) return { ...place, unreadable: "too-large" };
  if (file.text === null || file.text.includes("\u0000")) return { ...place, unreadable: "not-text" };
  const source = file.text.replace(/^﻿/u, "").replace(/\r\n?/gu, "\n");
  let body = source, fields: Record<string, string> = {};
  if (source.startsWith("---\n") || source === "---") {
    const end = source.indexOf("\n---", 3);
    if (end < 0 || (source[end + 4] !== undefined && source[end + 4] !== "\n")) return { ...place, unreadable: "front-matter" };
    fields = Object.fromEntries(source.slice(4, end).split("\n").flatMap(line => {
      const at = line.indexOf(":");
      return at > 0 ? [[line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim().replace(/^(["'])(.*)\1$/u, "$2")]] : [];
    }));
    body = source.slice(end + 4).replace(/^\n/u, "");
  }
  const takes = body.includes(ARGUMENTS);
  const first = body.split("\n").map(line => line.replace(/^#+\s*/u, "").trim()).find(Boolean) ?? name;
  const description = (fields.description || first).slice(0, 120);
  const hint = fields["argument-hint"] ? fields["argument-hint"].slice(0, 200) : null;
  return { ...place, description, argument_hint: hint, takes_arguments: takes, text: body };
}

/** The task a command makes: its text with every `$ARGUMENTS` replaced by the words as typed, or the words after it when it names none. */
export function fillPromptCommand(command: { readonly text: string; readonly takes_arguments: boolean }, words: string): string {
  if (command.takes_arguments) return command.text.split(ARGUMENTS).join(words);
  const typed = words.trim();
  return typed ? `${command.text.replace(/\s+$/u, "")}\n\n${typed}` : command.text;
}

/** Commands from several places, the first of a name kept: a project's before the person's, `.molis` before `.claude`. */
export function mergePromptCommands<Command extends PromptCommandFile>(...lists: readonly (readonly Command[])[]): Command[] {
  const seen = new Set<string>(), kept: Command[] = [];
  for (const list of lists) for (const command of list) { if (seen.has(command.name)) continue; seen.add(command.name); kept.push(command); }
  return kept;
}
