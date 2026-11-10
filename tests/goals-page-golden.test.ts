import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { L, clientI18nScript, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { inWordsOf } from "@molis-ai/molis-work-app-workbench";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { assertGoalsDictionaryMove, expectedGoalsDictionaryMove } from "./fixtures/goals-dictionary-move.js";
import { BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-plugin-goals/module";
import * as renderers from "./workbench-renderer-fixture.js";
import type { MolisWorkWebView } from "./workbench-renderer-fixture.js";

// RAC-2680: the project page, its three fragments and the settings and planning pages of Goals, as the Host draws them, are recorded once
// (MOLIS_WORK_GOLDEN_RECORD=1) and every later change to who draws them (T-116 moves the drawing from the workbench and the Host into the
// Goals package) has to give the same bytes, in both interface languages. The view is the demo project read once by the real owners
// (times and ids fixed), so the pages have a Goal tree with children, a decision waiting, an archived and a trashed Goal and a proposal.
const GOLDEN = new URL("./fixtures/goals-page-golden/", import.meta.url);
const record = process.env.MOLIS_WORK_GOLDEN_RECORD === "1";const TOKEN = "golden-control-token";
const NOW = Date.parse("2026-10-30T09:00:00.000Z"); // The instant held by the view fixture.
const PROJECT = { project_id: "golden", display_name: "Golden project" };

const baseView = JSON.parse(readFileSync(new URL("view.json", GOLDEN), "utf8")) as MolisWorkWebView;
const view: MolisWorkWebView = { ...baseView, project: PROJECT, projects: [PROJECT], route_prefix: "/projects/golden", demo: false, shown_plugins: ["goals"], enabled_plugins: ["goals"] };
const methods = BUILTIN_PLANNING_METHOD_PACKS.map(pack => ({ ...pack }));
const guidance = { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" };
const SECTIONS = ["general", "guidance", "planning", "rules"] as const;

type Draw = () => string;
const pages: Record<string, Draw> = {
  "page-current": () => renderers.renderMolisWorkWeb(view, "V1", false, false, TOKEN, false),
  "page-current-decision": () => renderers.renderMolisWorkWeb(view, "DECIDE", false, false, TOKEN, false),
  "page-current-desktop": () => renderers.renderMolisWorkWeb(view, "V1", false, false, TOKEN, true, { claude: true }),
  "page-current-none": () => renderers.renderMolisWorkWeb(view, undefined, false, false, TOKEN, false),
  "page-archive": () => renderers.renderMolisWorkWeb(view, "GRAPH", true, false, TOKEN, false),
  "page-archive-none": () => renderers.renderMolisWorkWeb({ ...view, archived_goals: [] }, undefined, true, false, TOKEN, false),
  "page-trash": () => renderers.renderMolisWorkWeb(view, "AUTO-CONNECT", false, true, TOKEN, false),
  "page-trash-none": () => renderers.renderMolisWorkWeb({ ...view, trashed_goals: [] }, undefined, false, true, TOKEN, false),
  "refresh-current": () => renderers.renderMolisWorkRefreshFragment(view, "V1", false, false),
  "refresh-current-none": () => renderers.renderMolisWorkRefreshFragment(view, undefined, false, false),
  "refresh-archive": () => renderers.renderMolisWorkRefreshFragment(view, "GRAPH", true, false),
  "refresh-trash": () => renderers.renderMolisWorkRefreshFragment(view, "AUTO-CONNECT", false, true),
  "momentum-current": () => renderers.renderMolisWorkMomentumFragment(view, "V1", "current") ?? "(none)",
  "momentum-archive": () => renderers.renderMolisWorkMomentumFragment(view, "GRAPH", "archive") ?? "(none)",
  "momentum-missing": () => renderers.renderMolisWorkMomentumFragment(view, "NO-SUCH", "current") ?? "(none)",
  "document-current": () => renderers.renderGoalDocumentFragment(view, "V1", "current") ?? "(none)",
  "document-decision": () => renderers.renderGoalDocumentFragment(view, "DECIDE", "current") ?? "(none)",
  "document-archive": () => renderers.renderGoalDocumentFragment(view, "GRAPH", "archive") ?? "(none)",
  "document-trash": () => renderers.renderGoalDocumentFragment(view, "AUTO-CONNECT", "trash") ?? "(none)",
  "document-missing": () => renderers.renderGoalDocumentFragment(view, "NO-SUCH", "current") ?? "(none)",
  "planning-library-personal": () => renderers.renderMolisWorkPlanningLibrary(methods, null, TOKEN, false, [PROJECT], ["goals"]),
  "planning-library-project": () => renderers.renderMolisWorkPlanningSettings(view, methods, TOKEN, false),
  "planning-method-detail": () => renderers.renderMolisWorkPlanningMethodPage(methods[0]!, "detail", "personal", null, TOKEN, false),
  "planning-method-edit": () => renderers.renderMolisWorkPlanningMethodPage(methods[0]!, "edit", "project", PROJECT, TOKEN, false),
  "planning-method-new": () => renderers.renderMolisWorkPlanningMethodPage(null, "new", "personal", null, TOKEN, false),
  ...Object.fromEntries(SECTIONS.map(section => [`settings-${section}`, () => renderers.renderMolisWorkProjectSettingsHub(view, guidance, methods, TOKEN, false, section)])),
  ...Object.fromEntries(SECTIONS.map(section => [`settings-${section}-embedded`, () => renderers.renderMolisWorkProjectSettingsHub(view, guidance, methods, TOKEN, false, section, section)])),
};

// A page is 0.4 to 1.4 MB with the shell's own styles and scripts in it, so what is recorded is a SHA-256 and a length, not the text, and of
// the page without what other owners wrote into it: the executable scripts (each plugin's client script and dictionary), the styles, the
// icon sprite and the plugin directory (`data-plugin-directory`) are the shell's and the plugins' bytes, they change with those owners and
// are held by the page-assets budget. What Goals itself puts into the page IS in the hash, JSON data included: the `molis-work-data` block
// the page's scripts read (about 57 KB a page) and `data-project-guidance-json`. A mismatch writes what
// was drawn to the temp directory. Each draw fixes Date.now and the default time zone: the new method id and the trash dates stay in
// the output and the hash. The clock mock and time zone are restored after each test; the generated method id is no longer masked.
// To re-record: use a clean production reference without the renderer migration (the original baseline, or accepted main when
// integrating newer product changes). Copy this test and fixtures/goals-page-golden/view.json into its tests/ directory,
// keeping their relative paths. Build that whole workspace first (MOLIS_HELPER_SIGNING_IDENTITY=- pnpm build); stale dist is not evidence.
// Then run MOLIS_WORK_GOLDEN_RECORD=1 MOLIS_WORK_GOLDEN_DUMP=1 node scripts/run-tests.mjs --jobs 1 tests/goals-page-golden.test.ts.
// Copy only the resulting golden.json back to the candidate, build it, then run the same complete test with MOLIS_WORK_GOLDEN_DUMP=1 and MOLIS_WORK_GOLDEN_RECORD unset.
// Use separate TMPDIR directories for those two runs: compare their goals-golden-recorded and goals-golden-drawn directories with
// diff -rq (66 full HTML files, including scripts, styles and JSON). On this machine, wrap builds in the build slot and all test runs
// in the browser slot using scripts/machine-slot.mjs; set TMPDIR inside the slot so both checkouts share the machine's slot directory.
// RAC-2680 / RAC-2508 (T402): the Goals-only view no longer draws the hidden Sources stage of an unshown Feed owner.
// The sixteen whole-page records were derived from independently built B ab82142f71761af160f9fc5103d6e2fe6933fa65:
// each draw first matched its original record, then only the complete source-workbench section and its call whitespace were removed.
// Every other byte, JSON block and record stayed fixed; the candidate was not used to record these expectations.
// WORK-03 / T01-ACCOUNT-ENTRY-01: the earlier 16 whole-page account-entry records derived from independently built main 9f00fd0dad.
// Its 66 normalized draws first matched every original hash. Only the personal-account button's disabled attribute
// and unavailable title were replaced by the enabled Sign in / 登录 entry. All other markup and JSON stayed fixed;
// each candidate draw matched that derived expectation byte for byte, without candidate RECORD mode.
// Work #1846 after #1952: removing only the unified account button from the 16 normalized whole pages
// reproduces their main ad25b414e hashes and lengths. The other 50 records match without changes.
// PR #1877: all 66 original hashes were first reproduced by independently built main b1e0e5b6.
// The 26 changed records were derived from those pages by only the reviewed personal-shell additions:
// sync indicator/settings links, active account label/local-space status, and the observed project-name attribute
// (plus its settings whitespace). The derived markup matched every candidate byte; no Goals content was re-recorded.
// PR #1929 (batch 18 P3-3): the project settings gained the 「授权与放行」 section, so the shell's settings directory row
// (`data-settings-section="grants"`, 361 / 391 characters in zh / en) is in the 16 records of the 8 project pages and the settings
// link (120 / 135 characters with its line) in the 12 records of the 6 settings and planning pages. Each of those 28 records (14 pages
// in two languages), drawn with only that row or link taken out, had its old hash and length exactly; they were then recorded with
// MOLIS_WORK_GOLDEN_RECORD=1. The other 38 records (19 pages in two languages) did not change.
// PR #1952 (batch 12 item 3, draft and return, specs/draft-and-return §9 U4): the shell's two settings surfaces each carry the return
// bar's template (`<template data-settings-return-bar-template>`, the SDK's renderReturnBar; 546 / 568 characters in zh / en), so the
// 16 records of the 8 project pages grew by 1092 / 1136. Each of those 16, drawn with only the two templates taken out, had its old hash
// and length exactly; they were then recorded with MOLIS_WORK_GOLDEN_RECORD=1. The other 50 records did not change.
// 07-1 S3–S5 (product-flow-governance §4.6.2; on main 6f39755f00, where S1+S2 landed as #1853): the shell's bar and titlebar changed, and
// only they. All 66 pages were drawn on an independently built 6f39755f00 (each matched its record there) and on this branch, and compared token by token: the
// 16 records of the 8 project pages differ in 22 distinct shell hunks and nothing else — the titlebar's personal-tool slot gone
// (`data-home-plugin-open`), the Issue side glyph's title and `aria-keyshortcuts`, `data-rail-group` on the switcher's tiles, the
// switcher's name (切换插件 ⌘K), the bar's side button replaced by the person's own tray (`data-bar-own`), and the 个人 group of the
// switcher emptied here (this view has no Host directory, so no plugin carries the Host's personal and home marks that 个人 now reads;
// 灵光, 待办, Jelly and Cognia list under 更多). No Goals markup or JSON changed; the 16 were then recorded with
// MOLIS_WORK_GOLDEN_RECORD=1. The other 50 records did not change.
// D0038: independently built main cee9bb122 reproduced all 66 original hashes. The 34 changed expectations were
// derived only by renaming the complete meta name molis-work-control-token to molis-work-page-session in those draws.
// Candidate normalized markup matched each derived page byte for byte; the other 32 records remained exact.
// Candidate RECORD mode was not used; executable scripts remain covered by the existing page-asset checks.
// Batch 05 (#1979, shared sources and surfaces): the shell's project settings section 工作目录 / its English is now 输入与输出 / its English
// (the directory row and settings link), and the shell's project-delete dialog carries the default-output choice, the busy alert and the
// kept-folder view. All 66 pages were drawn on an independently built main 481e3d7500 (with D0038) (each matched its record there) and on this branch merged with it,
// and compared token by token: the 20 records of the 8 project pages and settings-general(-embedded) differ in the label and the dialog,
// the other 10 (5 settings and planning pages) in the label alone; no Goals markup or JSON changed. The 30 were then recorded with
// MOLIS_WORK_GOLDEN_RECORD=1. The other 36 records did not change.
// Batch 10 (unified input): the 16 page-* records carry the shell's bar, where the platform composer replaced the assistant's own
// input (the inputs, attachment block and private @ went with it); that change was recorded on its merge with main 500d868df3. After
// it, the composer at rest carries ` data-rest` (+10 characters in every page-*), and the English placeholder is 「Ask the assistant…」
// (16 fewer than 「…to do something…」): zh +10, en −6 on all 16, checked against the drawn pages. No Goals markup or JSON changed;
// the 16 were recorded with MOLIS_WORK_GOLDEN_RECORD=1 and the other 50 records did not change.
// Batch 08 (Skills): all 66 normalized draws were checked against the old records before updating. Removing only the new
// Skills navigation restores every old hash and length: 16 whole pages have two directory buttons (706 zh / 722 en characters),
// six personal planning records one link (92 zh / 96 en), and twelve project planning/settings records one link with its line
// (115 zh / 119 en). Only those 34 records changed; the other 32, Goals JSON, view fixture and golden Home fixtures stayed fixed.
// Batch 10 closeout after main 416ee8cef0: each of the 16 whole pages independently reproduced its previous hash and
// length after removing only the two Skills buttons and replacing the receiver button with the former span (+41).
// All other records retained the accepted main records; no Goals markup, data or assertions changed.
// D0014/D0015 (2026-11-09): all 66 baseline renders on independently built ecdfe102d matched the accepted records.
// Token comparison with the candidate found 22 changed records, solely the shared state labels/title/aria text,
// the blocked count label, and the cancelled kanban column (including its paused ring and zero count). The other 44 stay byte-identical.
// Main #2002 integration: all 66 preserved A-1 draws first reproduced their accepted hashes.
// Derive only the hidden assistant-answer button and English To: → Send to: from that main change.
// All 16 whole-page draws match the derived markup byte for byte; the other 50 remain identical.
const RECORDED = new URL("golden.json", GOLDEN);
interface Recorded { sha256: string; length: number }
const recorded: Record<string, Recorded> = record ? {} : JSON.parse(readFileSync(RECORDED, "utf8"));
const dataBlock = /type="application\/json"/;
const markup = (html: string): string => html
  .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g, (script, attributes: string) => dataBlock.test(attributes) && !attributes.includes("data-plugin-directory") ? script : "<script></script>")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "<style></style>")
  .replace(/<svg class="icon-sprite"[^>]*>[\s\S]*?<\/svg>/, '<svg class="icon-sprite"></svg>');
const drawn: Record<string, string> = {};

for (const locale of ["zh", "en"] as const) for (const [name, draw] of Object.entries(pages)) {
  test(`RAC-2680: Goals ${name} in ${locale} is the recorded markup, byte for byte`, (t) => {
    const timeZone = process.env.TZ;
    t.after(() => { if (timeZone === undefined) delete process.env.TZ; else process.env.TZ = timeZone; });
    process.env.TZ = "UTC";
    t.mock.method(Date, "now", () => NOW);
    const whole = runWithLocale(locale, draw);
    const html = markup(whole);
    const key = `${name}.${locale}`;
    drawn[key] = whole;
    if (process.env.MOLIS_WORK_GOLDEN_DUMP === "1") {
      const dumped = join(tmpdir(), record ? "goals-golden-recorded" : "goals-golden-drawn");
      mkdirSync(dumped, { recursive: true });
      writeFileSync(join(dumped, `${key}.html`), whole);
    }
    const actual: Recorded = { sha256: createHash("sha256").update(html).digest("hex"), length: html.length };
    if (record) { recorded[key] = actual; return; }
    if (actual.sha256 !== recorded[key]?.sha256) {
      const out = join(tmpdir(), "goals-golden-actual");
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, `${key}.html`), html);
      assert.fail(`${key} is not the recorded page (recorded ${recorded[key]?.length}, drawn ${actual.length} characters; drawn text in ${out})`);
    }
  });
}

test("RAC-2680: the recorded pages differ by locale and name the Goals the view holds", () => {
  const zh = drawn["page-current.zh"], en = drawn["page-current.en"];
  assert.ok(zh && en, "the pages were drawn above");
  assert.notEqual(zh, en);
  for (const html of [zh, en]) assert.ok(html.includes("data-goal-id=\"V1\""), "the selected Goal is on the page");
  assert.ok(Object.keys(recorded).length === 2 * Object.keys(pages).length || record, "every page has a record, no more");
});

// The view the pages are drawn from (`fixtures/goals-page-golden/view.json`, 210 KB) is made by `fixtures/goals-page-golden-view.ts`:
// MOLIS_WORK_GOLDEN_VIEW=1 seeds the demo project into a temporary database, reads the view with the real owners, fixes the clock and
// numbers the ids, and writes it. The same bytes come out on every run. To make the view again: build the workspace, run this file with
// MOLIS_WORK_GOLDEN_VIEW=1 (it writes view.json and nothing else), then record the hashes (MOLIS_WORK_GOLDEN_RECORD=1) on the commit
// before the change that is to be proved byte-for-byte. A view made again changes every page: do it only for a deliberate new baseline.
test("RAC-2680: the view is made again", { skip: process.env.MOLIS_WORK_GOLDEN_VIEW !== "1" }, async () => {
  const { recordGoldenView } = await import("./fixtures/goals-page-golden-view.js");
  writeFileSync(new URL("view.json", GOLDEN), await recordGoldenView());
});

test("RAC-2680: recording writes the hashes", { skip: !record }, () => {
  writeFileSync(RECORDED, `${JSON.stringify(Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`);
});

// Root's 2026-11-01 RAC-2680/2686 ruling: fixed words/consumption come from independent B, never a candidate RECORD.
const moved = JSON.parse(readFileSync(new URL("moved-words.json", GOLDEN), "utf8")) as {
  owner: string; words: Record<string, string>; capsule_words: Record<string, string>;
  interpolation: Array<{ key: string; vars: Record<string, string | number>; en: string; zh: string }>;
};

test("RAC-2680 the precise owner move retains non-moved tokens and rejects changes outside the approved dictionary properties", () => {
  const tokens = Object.entries(moved.words).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  const stable = '"untouched":"\\u0041","after":"second"';
  const page = (messages: string, own: string) => `<main data-proof="same"></main><script>globalThis.MOLIS_WORK_MESSAGES = ${messages};\nglobalThis.MOLIS_WORK_PLUGIN_WORDS = {"io.example.other":{"stable":"same"},"${moved.owner}":${own}};\nglobalThis.L = function L(key) { return key; };\nglobalThis.LF = function LF(owner, key) { return key; };</script>`;
  const reference = page(`{${stable},${tokens.join(",")}}`, '{"kept":"same"}');
  const expected = page(`{${stable}}`, `{"kept":"same",${tokens.join(",")}}`);
  assert.equal(expectedGoalsDictionaryMove(reference, moved.words, "en"), expected, "the expected payload is specified independently of the transformer");
  assert.doesNotThrow(() => assertGoalsDictionaryMove(reference, expected, moved.words, "en"));
  const changed = (before: string, after: string) => {
    assert.ok(expected.includes(before), "the negative must change a real byte");
    const candidate = expected.replace(before, after); assert.notEqual(candidate, expected); return candidate;
  };
  const [key, value] = Object.entries(moved.words)[0]!;
  for (const candidate of [
    changed('data-proof="same"', 'data-proof="sXme"'),
    changed(`${tokens[0]},`, ""),
    changed(tokens[0]!, `${JSON.stringify(key)}:${JSON.stringify(value + " changed")}`),
    changed(JSON.stringify(moved.owner), '"io.example.wrong-owner"'),
    changed(stable, '"untouched":"A","after":"second"'),
    changed(stable, '"after":"second","untouched":"\\u0041"'),
    changed("function L(key)", "function changedL(key)"),
    changed("function LF(owner, key)", "function changedLF(owner, key)"),
  ]) assert.throws(() => assertGoalsDictionaryMove(reference, candidate, moved.words, "en"));
});

test("RAC-2680 exact dictionary comparison checks assignment boundaries and retains Chinese and script-free fragments byte for byte", () => {
  const zh = '<script>globalThis.MOLIS_WORK_MESSAGES = {};\nglobalThis.MOLIS_WORK_PLUGIN_WORDS = {};</script>';
  assert.doesNotThrow(() => assertGoalsDictionaryMove(zh, zh, moved.words, "zh"));
  for (const candidate of [
    zh.replace("MOLIS_WORK_MESSAGES = {}", 'MOLIS_WORK_MESSAGES = {"injected":"English"}'),
    zh.replace("</script>", "globalThis.MOLIS_WORK_MESSAGES = {};</script>"),
    zh.replace("MOLIS_WORK_MESSAGES = {}", "MOLIS_WORK_MESSAGES = {} || {}"),
    zh.replace("PLUGIN_WORDS = {}", 'PLUGIN_WORDS = {"broken":}'),
    zh.replace("globalThis.MOLIS_WORK_PLUGIN_WORDS", "</script><script>globalThis.MOLIS_WORK_PLUGIN_WORDS"),
  ]) { assert.notEqual(candidate, zh); assert.throws(() => assertGoalsDictionaryMove(zh, candidate, moved.words, "zh")); }
  const fragment = '<section>Unchanged</section><script type="application/json">{"x":1}</script>';
  assert.doesNotThrow(() => assertGoalsDictionaryMove(fragment, fragment, moved.words, "en"));
  assert.throws(() => assertGoalsDictionaryMove(fragment, fragment.replace('"x":1', '"x":2'), moved.words, "en"));
});

test("RAC-2686 moved words retain B's server and browser translation, including Capsule, placeholders and number agreement", { timeout: 60_000 }, async t => {
  const executable = process.env.MOLIS_WORK_TEST_CHROME;
  assert.ok(executable, "an explicit dedicated test browser executable is required; no default browser fallback");
  const directory = await mkdtemp(join(tmpdir(), "goals-word-browser-"));
  let browser: ChromeHarness | null = null;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  browser = await ChromeHarness.start(directory, { executable }); assert.ok(browser);
  const page = await browser.page();
  for (const locale of ["zh", "en"] as const) {
    const script = runWithLocale(locale, clientI18nScript);
    const actual = await page.evaluate<{ words: string[][]; capsule: string[][]; interpolation: string[] }>(`(() => {
      ${script}
      const spec=${JSON.stringify(moved)}, own=globalThis.LFor(spec.owner), other=globalThis.LFor("io.example.no-words");
      return { words:Object.keys(spec.words).map(key=>[key,own(key),globalThis.L(key),other(key)]),
        capsule:Object.keys(spec.capsule_words).map(key=>[key,own(key)]),
        interpolation:spec.interpolation.map(sample=>own(sample.key,sample.vars)) };
    })()`);
    runWithLocale(locale, () => {
      const server = inWordsOf(moved.owner, L);
      for (const [key, value] of Object.entries(moved.words)) {
        assert.equal(server(key), locale === "en" ? value : key);
        assert.equal(L(key), key, "moved words have no global copy");
      }
      assert.deepEqual(actual.words, Object.entries(moved.words).map(([key, value]) => [key, locale === "en" ? value : key, key, key]),
        "real browser LFor uses the owner; global L and another owner have no restored copy");
      for (const [key, value] of Object.entries(moved.capsule_words)) assert.equal(server(key), locale === "en" ? value : key);
      assert.deepEqual(actual.capsule, Object.entries(moved.capsule_words).map(([key, value]) => [key, locale === "en" ? value : key]));
      for (const sample of moved.interpolation) assert.equal(server(sample.key, sample.vars), sample[locale]);
      assert.deepEqual(actual.interpolation, moved.interpolation.map(sample => sample[locale]));
    });
  }
  assert.ok(markup(drawn["page-current.en"]!).includes('aria-label="Goal view"'), "the real Goals contribution draws the moved English in its markup");
});
