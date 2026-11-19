import assert from "node:assert/strict";
import test from "node:test";
import { fillPromptCommand, mergePromptCommands, promptCommandName, readPromptCommand } from "@molis-ai/molis-work-plugin-sdk/prompt-commands";
import { renderComposerCommands } from "@molis-ai/molis-work-design-system";
import { renderCommandChip, renderCommandPrompt } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { MwComposerLabels } from "@molis-ai/molis-work-plugin-sdk/ui";

// Coding A2 (specs/coding-plugin/next-requirements.md, docs/design/coding-daily-basics scheme A): a command is a Markdown file whose
// text becomes the task, `$ARGUMENTS` replaced by what was typed, as written; nothing else in the file comes with it.

const at = (path: string, text: string | null, bytes = text ? new TextEncoder().encode(text).byteLength : 0) => readPromptCommand({ location: ".molis/commands", path, text, bytes });

test("Coding A2 a command's name is its file's, one folder down as folder:name, nothing deeper or hidden", () => {
  assert.equal(promptCommandName("补测试.md"), "补测试");
  assert.equal(promptCommandName("release/check.md"), "release:check");
  assert.equal(promptCommandName("a/b/c.md"), null);
  assert.equal(promptCommandName(".hidden.md"), null);
  assert.equal(promptCommandName("notes.txt"), null);
  assert.equal(promptCommandName("with space.md"), null);
});

test("Coding A2 front matter gives only a description and an argument hint; a broken one, a long file or bytes are unreadable", () => {
  const command = at("tests.md", "---\ndescription: \"Add tests\"\nargument-hint: file\nallowed-tools: Bash(rm:*)\nmodel: other\n---\nAdd tests for $ARGUMENTS.\n");
  assert.deepEqual(command, { name: "tests", location: ".molis/commands", path: "tests.md", description: "Add tests", argument_hint: "file", takes_arguments: true, text: "Add tests for $ARGUMENTS.\n" });
  assert.deepEqual(at("plain.md", "# Run the linters\r\nThen fix them."), { name: "plain", location: ".molis/commands", path: "plain.md", description: "Run the linters", argument_hint: null, takes_arguments: false, text: "# Run the linters\nThen fix them." });
  assert.equal((at("broken.md", "---\ndescription: never closed\n") as { unreadable?: string }).unreadable, "front-matter");
  assert.equal((at("big.md", "x", 64 * 1024 + 1) as { unreadable?: string }).unreadable, "too-large");
  assert.equal((at("bytes.md", null) as { unreadable?: string }).unreadable, "not-text");
  assert.equal((at("nul.md", "a\u0000b") as { unreadable?: string }).unreadable, "not-text");
});

test("Coding A2 $ARGUMENTS is replaced as typed, every time; a command that names none gets the words after a blank line", () => {
  assert.equal(fillPromptCommand({ text: "Fix $ARGUMENTS, then test $ARGUMENTS.", takes_arguments: true }, "  src/a.ts \"quoted\"  "), "Fix src/a.ts \"quoted\", then test src/a.ts \"quoted\".");
  assert.equal(fillPromptCommand({ text: "Review the UI.\n", takes_arguments: false }, "the header"), "Review the UI.\n\nthe header");
  assert.equal(fillPromptCommand({ text: "Review the UI.", takes_arguments: false }, " "), "Review the UI.");
});

test("Coding A2 the first of a name is kept: the project's before the person's, .molis before .claude", () => {
  const project = [at("lint.md", "project lint")!, at("tests.md", "project tests")!];
  const mine = [{ ...at("lint.md", "my lint")!, location: ".claude/commands" as const }, at("review.md", "my review")!];
  assert.deepEqual(mergePromptCommands(project, mine).map(one => [one.name, "text" in one ? one.text : ""]), [["lint", "project lint"], ["tests", "project tests"], ["review", "my review"]]);
});

const labels = { commands: "Commands", nothing: "No matches" } as MwComposerLabels;

test("Coding A2 the / menu groups commands by where they are from, teaches an empty group, marks an unreadable one, and closes with the note", () => {
  const groups = [{ label: "Built-in" }, { label: "This project", empty: "None yet. Put a .md in .molis/commands/." }, { label: "Mine" }];
  const commands = [{ slash: "init", label: "Draft an AGENTS.md", group: "Built-in", at: 0 }, { slash: "release", label: "release", hint: "Can’t read", warning: "Unreadable", group: "This project", at: 1 },
    { slash: "review-ui", label: "Review the UI", group: "Mine", at: 2 }];
  const all = renderComposerCommands(labels, commands, { groups, note: "Only prompt text." }, true);
  assert.deepEqual([...all.matchAll(/class="mw-menu__label"[^>]*>([^<]+)</g)].map(match => match[1]), ["Built-in", "This project", "Mine"]);
  assert.match(all, /data-composer-command="1"[\s\S]*?mw-badge--warning[^>]*>Unreadable</);
  assert.match(all, /<p class="mw-composer__menu-note">Only prompt text\.<\/p>/);
  const none = renderComposerCommands(labels, [commands[0]!, commands[2]!], { groups }, true);
  assert.match(none, /This project[\s\S]*None yet\. Put a \.md in \.molis\/commands\//);
  assert.doesNotMatch(renderComposerCommands(labels, [commands[0]!], { groups }, false), /None yet/, "the teaching line is for an empty /, not a search");
});

test("Coding A2 the box draws the board's command chip and prompt: the command and where it is from, × naming it, the prompt folded and escaped", () => {
  // What composer-view.ts `chip` draws: the board parts (#coding-basics), marked for the composer.
  const chip = renderCommandChip({ name: "add-tests", source: "Project", removeLabel: "Remove /add-tests", attrs: { "data-composer-chip": "" } });
  assert.match(chip, /class="mw-cmdchip" data-command="add-tests" data-composer-chip=""/); assert.match(chip, />\/add-tests</); assert.match(chip, /data-command-remove="add-tests"/); assert.match(chip, /aria-label="Remove \/add-tests"/);
  const prompt = renderCommandPrompt({ label: "The prompt that will be sent", text: "Add tests for <script>", open: false, attrs: { "data-composer-prompt": "" } });
  assert.match(prompt, /<details class="mw-disclosure mw-cmdprompt" data-composer-prompt="">/);
  assert.match(prompt, /Add tests for &lt;script&gt;/);
  assert.match(renderCommandPrompt({ label: "x", text: "y", open: true, attrs: { "data-composer-prompt": "" } }), /mw-cmdprompt" open data-composer-prompt="">/);
});
