import type { PromptCommandFile } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { fillPromptCommand } from "@molis-ai/molis-work-plugin-sdk/prompt-commands";
import type { ComposerChip, ComposerCommandMenu } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { Command as CommandItem } from "../commands.js";
import { chooseIntent } from "./configuration.js";
import { roundActive } from "./composer-mount.js";
import { shut } from "./composer-state.js";
import type { Page } from "./page.js";
import { api, status } from "./request.js";

/**
 * Prompt commands in Coding's `/` menu and palette (A2, docs/design/coding-daily-basics scheme A): the project's (`.molis/commands`,
 * `.claude/commands` in the round's workspace) and the person's own, read again when the workspace changes and every half minute
 * while the page draws its commands. Choosing one puts its chip at the start of the box: what is typed after it is the argument,
 * and the whole prompt it makes is shown folded under the words. The send's task is that prompt; nothing else comes with a command.
 *
 * `/init` (A1) is the one built-in that is a prompt too: it drafts an AGENTS.md from what the round reads in the repository, in the
 * first way of working that writes, so the draft reaches the repository only through the review card like any other write.
 */

type Listed = PromptCommandFile & { readonly origin: "project" | "mine" };
type Readable = Extract<Listed, { text: string }>;
/** What the next send is made from: a listed command (`listed`, read again with the list) or `/init`. */
type Chosen = { readonly name: string; readonly text: string; readonly takes_arguments: boolean; readonly source: string; readonly listed: boolean };
/** The ways of working that write, in the order `/init` takes them. */
const WRITES = ["execute", "edit"] as const;

const AGAIN_MS = 30_000;
/** Typing `/` reads them again (a file just added shows up), at most this often. */
const SLASH_MS = 3_000;
const PROBLEMS = { "front-matter": "coding.commands.why-front-matter", "too-large": "coding.commands.why-too-large", "not-text": "coding.commands.why-not-text", link: "coding.commands.why-link", unreadable: "coding.commands.why-unreadable" } as const;

export interface PromptCommands {
  /** The menu rows, built-in commands' slashes taken first (a file named like one is listed as not usable). */
  commands(builtIn: ReadonlySet<string>): CommandItem[];
  /** `/init`, among the built-in commands. */
  init(): CommandItem;
  readonly menu: () => ComposerCommandMenu;
  /** The chip for the command chosen for the next send, with the prompt it makes from what is typed now. */
  chip(): ComposerChip | null;
  /** The task the next send carries: the chosen command filled with `words`, or null when none is chosen. */
  task(words: string): string | null;
  /** The chosen command was sent: the chip goes. */
  sent(): void;
}

export function promptCommands(page: Page): PromptCommands {
  const { readText, refs, s, input } = page;
  let list: Listed[] = [], read = { workspace: "\u0000", at: 0 }, loading: Promise<void> | null = null, chosen: Chosen | null = null;
  const groups = { builtin: readText("coding.commands.builtin"), project: readText("coding.commands.project"), mine: readText("coding.commands.mine") };
  const load = (wait = AGAIN_MS) => {
    const workspace = s.workspaceId || "";
    if (loading || (read.workspace === workspace && Date.now() - read.at < wait)) return;
    loading = api<{ commands: Listed[] }>(page, "/commands" + (workspace ? "?workspace=" + encodeURIComponent(workspace) : ""))
      .then(found => {
        if ((s.workspaceId || "") !== workspace) return;
        read = { workspace, at: Date.now() };
        const before = JSON.stringify(list);
        list = found.commands;
        if (chosen?.listed) {
          const again = list.find((one): one is Readable => one.name === chosen!.name && "text" in one);
          chosen = again ? listed(again) : null;
        }
        if (JSON.stringify(list) !== before) refs.composer?.refresh();
      }, () => undefined)
      .finally(() => {
        loading = null;
        if ((s.workspaceId || "") !== workspace) load(0);
      });
  };
  // What is typed after the chip is its argument: the prompt under the box follows it.
  page.lifetime.listen(input, "input", () => { if (chosen) refs.composer?.refresh("lines"); else if (input.value === "/") load(SLASH_MS); });
  const words = () => input.value;
  const source = (one: Listed) => readText(one.origin === "project" ? "coding.commands.from-project" : "coding.commands.from-mine");
  const listed = (one: Readable): Chosen => ({ name: one.name, text: one.text, takes_arguments: one.takes_arguments, source: source(one), listed: true });
  const writes = () => WRITES.find(value => s.intents.some(option => option.value === value && !option.disabled));
  return {
    commands(builtIn) {
      load();
      return list.map((one): CommandItem => {
        const group = one.origin === "project" ? groups.project : groups.mine;
        if (!("text" in one) || builtIn.has(one.name)) {
          const why = !("text" in one) ? readText(PROBLEMS[one.unreadable]) : readText("coding.commands.why-built-in", { name: one.name });
          return { slash: one.name, label: one.name, hint: why, group, source: source(one), warning: readText("coding.commands.unreadable"),
            run: () => status(page, readText("coding.commands.unreadable-status", { path: `${one.location}/${one.path}`, why }), true) };
        }
        const hints = [...(one.argument_hint || one.takes_arguments ? [readText("coding.commands.takes", { hint: one.argument_hint || readText("coding.commands.argument") })] : []),
          ...(one.location === ".claude/commands" ? [readText("coding.commands.also-claude")] : [])];
        return { slash: one.name, label: one.description, ...(hints.length ? { hint: hints.join(readText("coding.commands.joiner")) } : {}), group, source: source(one), keywords: [one.path],
          run: () => { chosen = listed(one); refs.composer?.refresh("lines"); refs.composer?.focus(); } };
      });
    },
    init() {
      const intent = writes();
      return { slash: "init", label: readText("coding.commands.init"), hint: readText(intent ? "coding.commands.init-hint" : "coding.commands.init-no-write"), keywords: ["AGENTS.md", "CLAUDE.md", "说明", "instructions"],
        enabled: Boolean(intent) && !shut(page) && !roundActive(page),
        run: () => {
          chosen = { name: "init", text: readText("coding.commands.init-prompt"), takes_arguments: false, source: readText("coding.commands.from-builtin"), listed: false };
          if (intent) chooseIntent(page, intent);
          refs.composer?.refresh("lines"); refs.composer?.focus();
        } };
    },
    menu: () => ({ groups: [{ label: groups.builtin }, { label: groups.project, empty: readText("coding.commands.project-empty") }, { label: groups.mine }], note: readText("coding.commands.note") }),
    chip() {
      if (!chosen) return null;
      const one = chosen;
      return { name: one.name, source: one.source, remove: { label: readText("coding.commands.remove", { name: one.name }), run: () => { chosen = null; } },
        prompt: { label: readText("coding.commands.prompt"), text: fillPromptCommand(one, words()) } };
    },
    task: typed => chosen ? fillPromptCommand(chosen, typed) : null,
    sent() { if (!chosen) return; chosen = null; refs.composer?.refresh("lines"); },
  };
}
