import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { UI_FORMAT_VERSIONS, type OwnedTextRef, type UiLocalePack, type UiMessage, type UiTextProvider } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, dateArg, escapeHtml, format, installTextForTest, installUiText, numberArg, parseLocalePack, say, t, tryOwnedTextRef, UI_TEXT_UNAVAILABLE } from "@molis-ai/molis-work-plugin-sdk/ui";

// `t`, `say`, `format` and the context behind them: FSS-44, FSS-69 and FSS-70 (specs/font-and-skin-system/spec.md §11). What needs a real Host and a
// real page (requests, timers, a sandbox) is slice T8's; the bundled copy of the SDK reading the context is tests/ui-text-bundle.test.ts.

const OWNER = "io.molis.work.example.notes";
const pack = (owner: string, locale: string, messages: Readonly<Record<string, UiMessage>>): UiLocalePack => ({ format_version: UI_FORMAT_VERSIONS.locale, owner, locale, messages });

test("FSS-74 FSS-52 a valid numeric owner keeps its full binding and no other key segment is widened", () => {
  const owner = "io.molis.work.generated.294ae82b-b3fe-4dd6-8e65-28613de2a18e";
  const key = "294ae82b-b3fe-4dd6-8e65-28613de2a18e.stage.title";
  const words = pack(owner, "en", { [key]: "Reading excerpts" });
  assert.ok(parseLocalePack(JSON.stringify(words)).ok);
  assert.deepEqual(tryOwnedTextRef({ key }, owner), { owner, key });
  assert.equal(tryOwnedTextRef({ key }, OWNER), null);
  assert.equal(tryOwnedTextRef({ key: key.replace(".stage", ".2stage") }, owner), null);
  assert.ok(!parseLocalePack(JSON.stringify({ ...words, owner: "io.molis.work.common", messages: { "common.stage.title": "Wrong owner" } })).ok);
  const restore = installTextForTest({ packs: [words], locale: "en" });
  try { assert.equal(t.text(key), "Reading excerpts"); }
  finally { restore(); }
});

const NOTES_EN = pack(OWNER, "en", {
  "notes.main.title": "Notes",
  "notes.main.only-en": "Only in English",
  "notes.main.rename": "Rename {title}",
  "notes.main.saved": { plural_arg: "count", forms: { one: "Saved {count} note", other: "Saved {count} notes" } },
  "notes.main.when": "Saved on {at}",
  "notes.main.year": "Since {year}",
  "notes.main.total": "{total} in all",
});
const NOTES_ZH = pack(OWNER, "zh", {
  "notes.main.title": "笔记",
  "notes.main.rename": "重命名 {title}",
  "notes.main.saved": "保存了 {count} 条",
  "notes.main.when": "保存于 {at}",
  "notes.main.year": "始于 {year}",
  "notes.main.total": "共 {total}",
});
const WORKBENCH_EN = pack("workbench", "en", { "common.save": "Save", "common.text.unavailable": "Not available" });
const WORKBENCH_ZH = pack("workbench", "zh", { "common.save": "保存", "common.text.unavailable": "暂不可用" });
const PACKS = [NOTES_EN, NOTES_ZH, WORKBENCH_EN, WORKBENCH_ZH];
const ref = (key: string, fields: Partial<Extract<OwnedTextRef, { key: string }>> = {}): OwnedTextRef => ({ owner: OWNER, key, ...fields });

function withText<T>(locale: string | null, run: () => T, packs: readonly UiLocalePack[] = PACKS): T {
  const uninstall = installTextForTest({ packs, locale });
  try {
    return run();
  } finally {
    uninstall();
  }
}

/** What a running Host gives: no language means the owner's default, and problems are recorded. */
function production(locale: string | null, overrides: Partial<UiTextProvider> = {}) {
  const problems: Array<{ code: string; key?: string }> = [];
  const provider: UiTextProvider = {
    locale: () => locale,
    noContext: () => "default",
    ownerOfPrefix: (prefix) => (prefix === "notes" ? OWNER : null),
    message: (owner, key, tag) => PACKS.find((one) => one.owner === owner && one.locale === tag)?.messages[key] ?? null,
    defaultLocale: (owner) => (owner === OWNER ? "en" : owner === "workbench" ? "zh" : null),
    problem: (problem) => problems.push(problem),
    ...overrides,
  };
  return { provider, problems, install: () => installUiText(provider) };
}

function inProduction<T>(locale: string | null, run: (problems: ReadonlyArray<{ code: string; key?: string }>) => T, overrides: Partial<UiTextProvider> = {}): T {
  const { problems, install } = production(locale, overrides);
  const uninstall = install();
  try {
    return run(problems);
  } finally {
    uninstall();
  }
}

test("FSS-42: say treats { owner, key, literal: undefined } as the key it is, never as an empty literal", () => {
  const input: unknown = { owner: OWNER, key: "notes.main.title", literal: undefined };
  assert.equal(withText("en", () => say.text(input as OwnedTextRef)), "Notes");
  assert.equal(withText("zh", () => say(input as OwnedTextRef)), "笔记");
});

test("FSS-44: `t` and `format` take the language from the context, with no parameter for it", () => {
  const text = () => [t("notes.main.title"), t("notes.main.saved", { count: 3 }), t("common.save")];
  assert.deepEqual(withText("en", text), ["Notes", "Saved 3 notes", "Save"]);
  assert.deepEqual(withText("zh", text), ["笔记", "保存了 3 条", "保存"]);
  assert.equal(withText("en", () => t("notes.main.saved", { count: 1 })), "Saved 1 note");
});

test("FSS-44: one stored reference is formatted again in each language: numbers and dates hold no text of a language", () => {
  const stored = ref("notes.main.when", { args: [{ name: "at", kind: "date", at: "2026-11-07", style: "date" }] });
  assert.equal(withText("en", () => say(stored)), "Saved on Nov 7, 2026");
  assert.equal(withText("zh", () => say(stored)), "保存于 2026年11月7日");
  const total = ref("notes.main.total", { args: [{ name: "total", kind: "number", number: 12345, style: "decimal" }] });
  assert.equal(withText("en", () => say(total)), "12,345 in all");
  assert.equal(withText("zh", () => say(total)), "共 12,345");
});

test("FSS-44: a date without a time stays on its day in any time zone", () => {
  const zone = process.env.TZ;
  try {
    for (const name of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
      process.env.TZ = name;
      assert.equal(withText("en", () => format.date("2026-11-07", "date")), "Nov 7, 2026", name);
      assert.equal(withText("en", () => t("notes.main.when", { at: dateArg("2026-11-07", "month-day") })), "Saved on November 7", name);
    }
    process.env.TZ = "Asia/Shanghai";
    assert.equal(withText("en", () => format.date("2026-11-07T23:30:00Z", "month-day")), "November 8", "a moment is shown where the reader is");
  } finally {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});

test("FSS-69: where no language is given in a test, `t`, `format` and `say` throw ui.text_no_context, naming the key", () => {
  withText(null, () => {
    assert.throws(() => t("notes.main.title"), (error: Error & { code?: string }) => {
      assert.equal(error.code, "ui.text_no_context");
      assert.match(error.message, /notes\.main\.title/);
      assert.match(error.message, /TextRef/, "the error says what to do instead");
      return true;
    });
    assert.throws(() => t.text("notes.main.title"), { code: "ui.text_no_context" });
    assert.throws(() => say(ref("notes.main.title")), (error: Error) => /notes\.main\.title/.test(error.message));
    assert.throws(() => format.date("2026-11-07", "date"), { code: "ui.text_no_context" });
    assert.throws(() => format.number(1), { code: "ui.text_no_context" });
    // Naming the language is what a platform service does, and a literal needs none.
    assert.equal(say(ref("notes.main.title"), { locale: "zh" }), "笔记");
    assert.equal(say(ref("notes.main.title"), { locale: null }), "Notes");
    assert.equal(say({ literal: "甲" }), "甲");
  });
});

test("FSS-69: with no context installed at all it is the same mistake, and a literal still reads", () => {
  assert.throws(() => t("notes.main.title"), (error: Error & { code?: string }) => error.code === "ui.text_no_context" && /notes\.main\.title/.test(error.message));
  assert.throws(() => format.number(1), { code: "ui.text_no_context" });
  assert.throws(() => say(ref("notes.main.title")), { code: "ui.text_no_context" });
  assert.equal(say({ literal: "R&D" }), "R&amp;D");
  assert.equal(say({} as OwnedTextRef), UI_TEXT_UNAVAILABLE);
});

test("FSS-69: in production no language means the owner's default and one problem, never a throw", () => {
  inProduction(null, (problems) => {
    assert.equal(t("notes.main.title"), "Notes");
    assert.deepEqual(problems.map(({ code }) => code), ["ui.text_no_context"]);
    assert.match(problems[0]!.key!, /notes\.main\.title/);
    assert.equal(say(ref("notes.main.title")), "Notes");
    assert.equal(format.number(1234), "1,234");
    assert.equal(problems.filter(({ code }) => code === "ui.text_no_context").length, 3);
  });
});

test("FSS-69: in production a broken language pack does not throw, and text on an error path does not replace the error", () => {
  inProduction("en", (problems) => {
    assert.equal(t("notes.main.title"), UI_TEXT_UNAVAILABLE);
    assert.equal(say(ref("notes.main.title", { fallback: "原文" })), "原文");
    assert.equal(problems[0]!.code, "ui.text_read_failed");
    const original = new Error("还没有配置模型");
    const onTheErrorPath = () => {
      try {
        throw original;
      } catch (error) {
        (error as Error).message += ` (${t("notes.main.title")})`;
        throw error;
      }
    };
    assert.throws(onTheErrorPath, (error) => error === original);
  }, { message: () => { throw new Error("语言包读不了"); } });
  inProduction("en", () => assert.equal(t("notes.main.nothing"), "Not available"), { problem: () => { throw new Error("记录失败"); } });
});

test("FSS-69: a test sees the same broken pack as an error", () => {
  const uninstall = installUiText({ ...production("en").provider, noContext: () => "throw", message: () => { throw new Error("语言包读不了"); } });
  try {
    assert.throws(() => t("notes.main.title"), /语言包读不了/);
  } finally {
    uninstall();
  }
});

test("FSS-69: a process installs one context: the same provider again changes nothing, another waits for the first to go", () => {
  const { provider, install } = production("en");
  const uninstall = install();
  try {
    const again = installUiText(provider);
    again();
    assert.equal(t("notes.main.title"), "Notes", "taking back a repeat leaves the first in place");
    assert.throws(() => installUiText(production("zh").provider), { code: "ui.text_provider_conflict" });
    assert.throws(() => installTextForTest({ packs: PACKS, locale: "zh" }), { code: "ui.text_provider_conflict" });
  } finally {
    uninstall();
    uninstall();
  }
  assert.throws(() => t("notes.main.title"), { code: "ui.text_no_context" });
  const next = installUiText(production("zh").provider);
  assert.equal(t("notes.main.title"), "笔记", "a provider installed later is what is read: the SDK kept nothing of the first");
  next();
});

test("FSS-69: two owners of one name cannot share `t`'s index, and say looks each up by its full owner", () => {
  const other = pack("io.molis.work.b.notes", "en", { "notes.main.title": "Other notes" });
  assert.throws(() => installTextForTest({ packs: [NOTES_EN, other], locale: "en" }), { code: "ui.text_owner_conflict" });
  const read = createTextReader({ packs: [NOTES_EN, other], locale: "en" });
  assert.equal(read(ref("notes.main.title")), "Notes");
  assert.equal(read({ owner: other.owner, key: "notes.main.title" }), "Other notes");
});

test("FSS-69: no module of the text tools keeps language or words in a variable of its own", () => {
  const directory = fileURLToPath(new URL("../packages/plugin-sdk/src/ui/", import.meta.url));
  const files = readdirSync(directory).filter((name) => /^(?:text|message-format|locale-pack)/u.test(name));
  assert.ok(files.includes("text.ts") && files.includes("text-lookup.ts"), files.join());
  for (const name of files) {
    const source = ts.createSourceFile(name, readFileSync(directory + name, "utf8"), ts.ScriptTarget.ES2022);
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      assert.ok((statement.declarationList.flags & ts.NodeFlags.Const) !== 0, `${name}: ${statement.getText(source).slice(0, 60)}`);
      for (const { initializer } of statement.declarationList.declarations) assert.ok(initializer === undefined || !/^new (?:Map|WeakMap)\b/u.test(initializer.getText(source)), `${name}: no table at module level`);
    }
  }
});

test("finding a word goes through the language, its base, the owner's default, the fallback, then the platform's sentence", () => {
  const problems: Array<{ code: string; locale?: string }> = [];
  const uninstall = installTextForTest({ packs: PACKS, locale: "zh-CN", problem: (problem) => problems.push(problem) });
  try {
    assert.equal(t("notes.main.title"), "笔记", "zh-CN reads zh");
    assert.equal(t("notes.main.only-en"), "Only in English", "the default language next");
    assert.deepEqual(problems, []);
    assert.equal(t("notes.main.nothing"), "暂不可用");
    assert.equal(problems[0]?.code, "ui.text_missing");
    assert.equal(say(ref("notes.main.nothing", { fallback: "默认原文 {n}", args: [{ name: "n", kind: "number", number: 2 }] })), "默认原文 2");
    assert.equal(say(ref("notes.main.nothing")), "暂不可用");
    assert.equal(say({ owner: "io.molis.work.gone.notes", key: "notes.main.title", fallback: "主人卸载了" }), "主人卸载了");
  } finally {
    uninstall();
  }
  assert.equal(withText("en", () => t("notes.main.nothing"), [NOTES_EN]), UI_TEXT_UNAVAILABLE, "an author with two packages has no platform words: never a bare key");
  assert.equal(withText("en", () => t("中文原文")), "Not available");
});

test("FSS-42: a page reading a bad reference shows the platform's sentence and records one problem", () => {
  for (const bad of [{}, { key: "notes.a", literal: "x" }, { fallback: "x" }, { literal: "x", args: [] }, { owner: OWNER, key: "notes.a", args: [{ name: "n", kind: "number" }] }, { key: "notes.a" }]) {
    const problems: Array<{ code: string }> = [];
    const uninstall = installTextForTest({ packs: PACKS, locale: "en", problem: (problem) => problems.push(problem) });
    try {
      assert.equal(say(bad as OwnedTextRef), "Not available", JSON.stringify(bad));
      assert.equal(say.text(bad as OwnedTextRef), "Not available", JSON.stringify(bad));
      assert.deepEqual(problems.map(({ code }) => code), ["ui.text_ref_invalid", "ui.text_ref_invalid"]);
    } finally {
      uninstall();
    }
  }
});

test("say: a page adds the arguments a stored reference left out", () => {
  const same = ref("notes.main.rename");
  assert.equal(withText("en", () => say.text(same, { extra: [{ name: "title", kind: "text", text: "周报" }] })), "Rename 周报");
});

test("FSS-70: a string argument is escaped by `t` and not by `t.text`, with an argument holding ' and &", () => {
  const title = "O'Brien & <Co>";
  withText("en", () => {
    assert.equal(t("notes.main.rename", { title }), "Rename O&#039;Brien &amp; &lt;Co&gt;");
    assert.equal(t.text("notes.main.rename", { title }), `Rename ${title}`);
    const html = `<button title="${t("notes.main.rename", { title: `"><script>` })}">x</button>`;
    assert.equal(html, '<button title="Rename &quot;&gt;&lt;script&gt;">x</button>', "an HTML attribute cannot be broken out of");
  });
});

test("FSS-70: `say` escapes the whole text once, whatever it came from, and `say.text` not at all", () => {
  const stored: ReadonlyArray<readonly [OwnedTextRef, string]> = [
    [{ literal: "R&D" }, "R&D"],
    [ref("notes.main.nothing", { fallback: "R&D {n}", args: [{ name: "n", kind: "text", text: "A&B" }] }), "R&D A&B"],
    [ref("notes.main.rename", { args: [{ name: "title", kind: "text", text: "O'Brien & Co" }] }), "Rename O'Brien & Co"],
  ];
  withText("en", () => {
    for (const [one, plain] of stored) {
      assert.equal(say.text(one), plain);
      assert.equal(say(one), escapeHtml(plain));
      assert.doesNotMatch(say(one), /&amp;amp;/, "escaped once");
    }
  });
});

test("FSS-70: a content pack's word R&D reads R&amp;D through say and createTextReader, and R&D through .text", () => {
  const content = pack("io.molis.work.example.skills", "en", { "skills.a.name": "R&D don't", "skills.a.bad": "<img onerror=x>" });
  const name: OwnedTextRef = { owner: content.owner, key: "skills.a.name" };
  const bad: OwnedTextRef = { owner: content.owner, key: "skills.a.bad" };
  withText("en", () => {
    assert.equal(say(name), "R&amp;D don&#039;t");
    assert.equal(say.text(name), "R&D don't");
    assert.equal(say(bad), "&lt;img onerror=x&gt;", "shown as text");
  }, [content]);
  for (const locale of ["en", null]) {
    const read = createTextReader({ packs: [content], locale });
    assert.equal(read(name), "R&amp;D don&#039;t");
    assert.equal(read.text(name), "R&D don't");
    assert.equal(read(bad), "&lt;img onerror=x&gt;", "shown as text");
  }
});

test("FSS-70: a call without string arguments reads the same in HTML, in textContent and through one more escape", () => {
  withText("en", () => {
    for (const text of [t("notes.main.title"), t("notes.main.saved", { count: 3 }), t("notes.main.year", { year: 2026 }), t("notes.main.when", { at: dateArg("2026-11-07", "date") }), t("notes.main.nothing")]) {
      assert.equal(text, escapeHtml(text));
    }
    assert.equal(t("notes.main.saved", { count: 3 }), t.text("notes.main.saved", { count: 3 }));
  });
});

test("FSS-70: a plain number is not grouped, and grouping is asked for by a style", () => {
  withText("en", () => {
    assert.equal(t("notes.main.year", { year: 2026 }), "Since 2026");
    assert.equal(t("notes.main.total", { total: numberArg(2026, "decimal") }), "2,026 in all");
    assert.equal(format.number(2026), "2,026");
    assert.equal(format.number(0.4, "percent"), "40%");
    assert.equal(format.number(1200, "compact"), "1.2K");
  });
});

test("FSS-70: a bad date does not throw: it shows as written, safe in HTML, and records a problem", () => {
  const problems: Array<{ code: string }> = [];
  const uninstall = installTextForTest({ packs: PACKS, locale: "en", problem: (problem) => problems.push(problem) });
  try {
    assert.equal(format.date("not-a-date", "date"), "not-a-date");
    assert.equal(format.date("2026-02-31", "date"), "2026-02-31");
    assert.equal(format.date("<b>", "date"), "&lt;b&gt;");
    assert.equal(t("notes.main.when", { at: dateArg("13/13", "date") }), "Saved on 13/13");
    assert.deepEqual([...new Set(problems.map(({ code }) => code))], ["ui.text_bad_date"]);
    assert.equal(problems.length, 4);
  } finally {
    uninstall();
  }
});

test("FSS-70: `t` with another owner's prefix, where only one's own words are, goes to the unavailable text", () => {
  // The index of an iframe or a sandbox: this plugin and common.
  const uninstall = installTextForTest({ packs: [NOTES_EN, WORKBENCH_EN], locale: "en" });
  try {
    assert.equal(t("todo.main.title"), "Not available");
    assert.equal(t("notes.main.title"), "Notes");
  } finally {
    uninstall();
  }
});

test("a browser records which sentence a text is, in plain text, for a change of language in place", () => {
  const produced: Array<readonly [string, OwnedTextRef]> = [];
  const uninstall = installUiText({ ...production("en").provider, produced: (output, one) => produced.push([output, one]) });
  try {
    t("notes.main.rename", { title: "A&B" });
    say(ref("notes.main.title"));
    say({ literal: "不翻译" });
  } finally {
    uninstall();
  }
  assert.deepEqual(produced, [
    ["Rename A&B", { owner: OWNER, key: "notes.main.rename", args: [{ name: "title", kind: "text", text: "A&B" }] }],
    ["Notes", { owner: OWNER, key: "notes.main.title" }],
  ]);
});
