import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// A project's guidance is the long-lived rules the user confirmed for it. Goals limits one entry to 4000 characters and the active
// entries of a project to 32000 in all, and its error messages say 「个字符」: a character is a code point, and one may take two UTF-16
// units (an emoji does). This file drives `addProjectGuidance` and `updateProjectGuidance` through the Goals commands over a project
// library, the way tests/goals-command-module.test.ts does, so it adds no import of the Goals package.

const PROJECT = "board-guidance-characters";
const PAIR = "\u{1F600}"; // one character, two UTF-16 units (U+D83D U+DE00)
const ENTRY_TOO_LARGE = "goals.project_guidance.entry_too_large";
const TOTAL_TOO_LARGE = "goals.project_guidance.total_too_large";
const ENTRY_MESSAGE = "单条项目说明不能超过 4000 个字符";
const TOTAL_MESSAGE = "项目说明总长度不能超过 32000 个字符";

type Commands = GoalProjectApplication["goals"]["commands"];
type Kind = Parameters<Commands["addProjectGuidance"]>[0]["kind"];
type Data = ReturnType<typeof fixture>;

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goals-guidance-characters-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: PROJECT, actor_id: "user-1", idempotency_key: "init" });
  return { directory, store, app };
}

function close(data: Data) {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

/** Runs `body` on a fresh project library with its board made, and closes the library after. */
function withProject(body: (data: Data) => void) {
  const data = fixture();
  try {
    body(data);
  } finally {
    close(data);
  }
}

let writes = 0;
/** What every guidance write carries besides its own fields; each call gets a key of its own. */
const confirmed = () => ({
  project_id: PROJECT,
  actor_id: "user-1",
  reason: "项目长期规则",
  confirmation_summary: "用户确认了这条原文",
  user_confirmed: true,
  idempotency_key: `write-${++writes}`,
});

function add(data: Data, content: string, kind: Kind = "context") {
  return data.app.goals.commands.addProjectGuidance({ ...confirmed(), kind, content });
}

function edit(data: Data, guidanceId: string, content: string, kind: Kind = "context") {
  return data.app.goals.commands.updateProjectGuidance({ ...confirmed(), guidance_id: guidanceId, action: "edit", kind, content });
}

function change(data: Data, guidanceId: string, action: "deactivate" | "restore") {
  return data.app.goals.commands.updateProjectGuidance({ ...confirmed(), guidance_id: guidanceId, action });
}

const view = (data: Data) => data.app.readProjectGuidance(PROJECT);
const contents = (data: Data) => view(data).entries.map((entry) => entry.content);

/** The check `assert.throws` takes: an `ActionError` with this code, and this message when one is given. */
function refusedWith(code: string, message?: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof ActionError, "an ActionError");
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
    return true;
  };
}

const entryTooLarge = refusedWith(ENTRY_TOO_LARGE, ENTRY_MESSAGE);
const totalTooLarge = refusedWith(TOTAL_TOO_LARGE, TOTAL_MESSAGE);

/** The write is refused the way `check` says, and the project's guidance (entries and revisions) is what it was. */
function assertRefusedUnchanged(data: Data, write: () => unknown, check: (error: unknown) => boolean) {
  const before = view(data);
  assert.throws(write, check);
  assert.deepEqual(view(data), before, "a refused write leaves no entry or revision behind");
}

for (const { name, text } of [
  { name: "4000 two-unit characters (8000 units)", text: PAIR.repeat(4000) },
  { name: "3999 plain characters and one two-unit character (4001 units)", text: `${"a".repeat(3999)}${PAIR}` },
  { name: "2500 two-unit characters (5000 units)", text: PAIR.repeat(2500) },
  { name: "4000 plain characters (4000 units)", text: "a".repeat(4000) },
]) {
  test(`RAC-2110 adding an entry of ${name} is accepted and kept whole`, () => {
    withProject((data) => {
      const added = add(data, text);
      assert.equal(added.created, true);
      assert.equal(added.entry.content, text);
      assert.deepEqual(contents(data), [text]);
      assert.ok(view(data).runtime_prompt_prefix.includes(text), "the prompt prefix carries it whole");
    });
  });

  test(`RAC-2110 editing an entry to ${name} is accepted and kept whole`, () => {
    withProject((data) => {
      const first = add(data, "原来的说明");
      const edited = edit(data, first.entry.guidance_id, text);
      assert.equal(edited.entry.revision, 2);
      assert.equal(edited.entry.content, text);
      assert.equal(edited.revision.content, text);
      assert.deepEqual(contents(data), [text]);
    });
  });
}

for (const { name, text } of [
  { name: "4001 two-unit characters (8002 units)", text: PAIR.repeat(4001) },
  { name: "4000 plain characters and one two-unit character (4002 units)", text: `${"a".repeat(4000)}${PAIR}` },
  { name: "4001 plain characters (4001 units)", text: "a".repeat(4001) },
  { name: "5000 plain characters (5000 units)", text: "a".repeat(5000) },
]) {
  test(`RAC-2111 adding an entry of ${name} is refused and nothing is recorded`, () => {
    withProject((data) => {
      add(data, "已有的说明");
      assertRefusedUnchanged(data, () => add(data, text, "constraint"), entryTooLarge);
    });
  });

  test(`RAC-2111 editing an entry to ${name} is refused and the entry stays as it was`, () => {
    withProject((data) => {
      const first = add(data, "已有的说明");
      assertRefusedUnchanged(data, () => edit(data, first.entry.guidance_id, text), entryTooLarge);
    });
  });
}

// A text of more than 8000 UTF-16 units holds more than 4000 characters, so it is refused before anything is counted. The string
// iterator is wrapped around the write: it counts the strings of more than 8000 units that anything spreads or iterates.
function longStringsIterated(write: () => void): { failure: unknown; iterated: number } {
  const original = String.prototype[Symbol.iterator];
  let iterated = 0;
  String.prototype[Symbol.iterator] = function (this: string) {
    if (String(this).length > 8000) iterated += 1;
    return original.call(this);
  };
  let failure: unknown;
  try {
    write();
  } catch (error) {
    failure = error;
  } finally {
    String.prototype[Symbol.iterator] = original;
  }
  return { failure, iterated };
}

for (const { name, text } of [
  { name: "8002 units, the shortest one over the bound", text: PAIR.repeat(4001) },
  { name: "20000 units", text: "a".repeat(20_000) },
  { name: "2000000 units", text: "a".repeat(2_000_000) },
]) {
  test(`RAC-2112 adding an entry of ${name} is refused without being spread`, () => {
    withProject((data) => {
      const { failure, iterated } = longStringsIterated(() => { add(data, text); });
      assert.ok(entryTooLarge(failure));
      assert.equal(iterated, 0, "the long text is not spread or iterated");
    });
  });

  test(`RAC-2112 editing an entry to ${name} is refused without being spread`, () => {
    withProject((data) => {
      const first = add(data, "已有的说明");
      const { failure, iterated } = longStringsIterated(() => { edit(data, first.entry.guidance_id, text); });
      assert.ok(entryTooLarge(failure));
      assert.equal(iterated, 0, "the long text is not spread or iterated");
    });
  });
}

/** 4000 characters, 7999 units, and a different one for each index. */
const bigEntry = (index: number) => `${index}${PAIR.repeat(3999)}`;

test("RAC-2113 eight entries of 4000 characters reach the total limit of 32000 exactly, and one more character is refused", () => {
  withProject((data) => {
    for (let index = 0; index < 8; index += 1) add(data, bigEntry(index));
    assert.equal(view(data).entries.length, 8);
    assertRefusedUnchanged(data, () => add(data, "超"), totalTooLarge);
  });
});

test("RAC-2113 an edit that brings the total to exactly 32000 characters is accepted, and one more character is refused", () => {
  withProject((data) => {
    for (let index = 0; index < 7; index += 1) add(data, bigEntry(index));
    add(data, "乙"); // 28001 characters in all
    const target = add(data, "甲");
    const fits = `甲${PAIR.repeat(3998)}`; // 3999 characters: 28001 + 3999 = 32000
    const edited = edit(data, target.entry.guidance_id, fits);
    assert.equal(edited.entry.content, fits);
    assertRefusedUnchanged(data, () => edit(data, target.entry.guidance_id, `${fits}${PAIR}`), totalTooLarge); // 4000 characters: 32001
  });
});

test("RAC-2113 restoring an entry counts it in characters: 32000 in all is accepted, 32001 is refused", () => {
  withProject((data) => {
    const ids: string[] = [];
    for (let index = 0; index < 8; index += 1) ids.push(add(data, bigEntry(index)).entry.guidance_id);
    const first = ids[0]!;
    change(data, first, "deactivate"); // 28000 characters are active
    change(data, first, "restore"); // back to 32000
    assert.equal(view(data).entries.length, 8);
    change(data, first, "deactivate");
    add(data, "甲"); // 28001
    assertRefusedUnchanged(data, () => change(data, first, "restore"), totalTooLarge); // 32001
  });
});

test("RAC-2114 an ordinary entry is accepted, recorded as the first revision and read back whole", () => {
  withProject((data) => {
    const added = add(data, "所有导出必须由用户发起。", "constraint");
    assert.equal(added.created, true);
    assert.equal(added.entry.kind, "constraint");
    assert.equal(added.entry.content, "所有导出必须由用户发起。");
    assert.equal(added.entry.revision, 1);
    assert.equal(added.entry.active, true);
    assert.equal(view(data).revisions.length, 1);
  });
});

test("RAC-2114 the text is trimmed and its line breaks are made \\n before it is counted", () => {
  withProject((data) => {
    const padded = add(data, `  \n${"a".repeat(4000)}\r\n  `);
    assert.equal(padded.entry.content, "a".repeat(4000));
    const joined = add(data, `${"a".repeat(3998)}\r\nb`); // 4001 units as sent, 4000 once \r\n is one \n
    assert.equal(joined.entry.content, `${"a".repeat(3998)}\nb`);
    assert.throws(() => add(data, `${"a".repeat(3999)}\r\nb`), entryTooLarge); // 4001 once normalized
  });
});

test("RAC-2114 a blank text is refused when added and when edited", () => {
  withProject((data) => {
    assert.throws(() => add(data, "  \n  "), refusedWith("goals.project_guidance.invalid"));
    const first = add(data, "有内容");
    assert.throws(() => edit(data, first.entry.guidance_id, "  \n  "), refusedWith("goals.project_guidance.invalid"));
  });
});

test("RAC-2114 an entry that is not confirmed, or has an unknown kind, is refused", () => {
  withProject((data) => {
    assert.throws(
      () => data.app.goals.commands.addProjectGuidance({ ...confirmed(), kind: "context", content: "没有确认", user_confirmed: false }),
      refusedWith("goals.project_guidance.user_confirmation_required"),
    );
    assert.throws(() => add(data, "不支持的分类", "temporary" as never), refusedWith("goals.project_guidance.kind_invalid"));
  });
});

test("RAC-2114 the same kind and text added twice is one entry, and an edit to the same text is refused", () => {
  withProject((data) => {
    const first = add(data, "只记一次");
    const again = add(data, "只记一次");
    assert.equal(again.created, false);
    assert.equal(again.entry.guidance_id, first.entry.guidance_id);
    assert.deepEqual(contents(data), ["只记一次"]);
    assert.throws(() => edit(data, first.entry.guidance_id, "只记一次"), refusedWith("goals.project_guidance.no_changes"));
  });
});

test("RAC-2114 an entry of 4000 characters can be deactivated and restored", () => {
  withProject((data) => {
    const first = add(data, "a".repeat(4000));
    change(data, first.entry.guidance_id, "deactivate");
    assert.deepEqual(contents(data), []);
    change(data, first.entry.guidance_id, "restore");
    assert.deepEqual(contents(data), ["a".repeat(4000)]);
  });
});
