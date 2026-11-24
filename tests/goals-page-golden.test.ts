import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { hostTextProblems, registeredBuiltinText, runWithLocale, runWithRegisteredText } from "@molis-ai/molis-work-app-local-host";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { t as uiText, say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pageTextScript } from "./fixtures/page-text.js";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { assertGoalsDictionaryMove, expectedGoalsDictionaryMove } from "./fixtures/goals-dictionary-move.js";
import * as renderers from "./workbench-renderer-fixture.js";
import type { MolisWorkWebView } from "./workbench-renderer-fixture.js";

// RAC-2680: the project page, its three fragments and the settings and planning pages of Goals, as the Host draws them, are recorded once
// (MOLIS_WORK_GOLDEN_RECORD=1) and every later change to who draws them (T-116 moves the drawing from the workbench and the Host into the
// Goals package) has to give the same bytes, in both interface languages. Batch 39 (#2105) re-recorded golden.json for the intentional
// trusted-decision `data-review-version` attributes, unified authorization settings navigation, and retired `policy_bindings` removal.
// QEA-83 combines those changes with QEA-06 import batch guidance and its action label; the underlying frozen business view is unchanged.
// Screen polish P5 (#2127, POLISH-29, POLISH-30) re-recorded the sixteen page-* and four settings-general entries for two intended changes,
// checked line by line against main's drawing: the appearance page's ⓘ became one sentence under the title, and the project's maintenance
// section became a title over one card. Its second part (POLISH-29) re-recorded the same twenty for one intended change, checked hunk by
// hunk against the drawing of #2127's head (4aae9decfa): the four appearance preference rows and the project's name and AI-tool rows are
// now drawn by the SDK's setting row and section (the form error moved under the sentence, each choice group and field is named by its
// row's title); nothing outside those two sections changed and the other 32 records did not move. Merged with main f5efe316a2 (#2101,
// the QEA notes below), the same twenty were recorded again on top of main's accepted records: they move by the same amounts as before
// the merge (+605 in each whole page, +382 in each settings-general) and the other 32 equal main's. The same held once more when main
// a8d998935d (#2133) re-recorded the whole pages again: same twenty, same amounts, on top of main's records.
// Batch 38 adds a project settings link to scene adoption. Removing only that link and its section from each of the 20 changed
// renders reproduced main a8d998935d's length and SHA-256, including the desktop query. The 32 other records match directly.
// B35-R1 adds the Sessions link to onboarding for the current project. Sessions sets its tab state after mounting.
// Main ffd077b2df reproduced all 52 accepted hashes. Applying just these changes to its Sessions template matched the 16
// whole pages byte for byte, including the desktop link. The other 36 hashes matched directly.
// Batch 40 (#2204, VUX-55, VUX-58) adds Scheme A on-demand help: the hidden right-side help tab/body (`side-panel-help.ts`)
// and sibling `<script type="application/json" data-plugin-help>` payloads on framed pages shift all 16 `page-*` records by
// a uniform +2632 (zh) / +3174 (en), and the header Help trigger + `<script data-mw-help-data>` (plus `<section>` around
// project rules) update the 12 `settings-*` records; all 24 `refresh-*`, `momentum-*`, and `document-*` records stay byte-for-byte identical.
// Batch 40 post-audit fix switches settings help from pre-resolved `data-mw-help-data` to live-translatable `data-mw-help-declaration`
// (updating the 12 `settings-*` records symmetrically: general +216/-67, guidance +235/+8, rules +209/-89), removes the duplicate outer
// `data-side-help-body` attribute, and adds Scheme A Help triggers/declarations on Goals stage, Project Home, Artifacts, and Sessions
// (shifting all 8 `page-current*` records uniformly by +3801 zh / +3289 en and all 8 `page-{archive,trash}*` records by +2800 zh / +2284 en;
// all 24 `refresh-*`, `momentum-*`, and `document-*` records remain byte-for-byte identical).
// Batch 36A-3 (shell conversation batch, PR #2218): the bottom bar's markup changed (the conversation column's head and more menu,
// the info column and its lists, the three first-place glyphs, the expand key), and only it. All 66 pages were drawn on an
// independently built main 73d6667760 (each matched its record there) and on this branch and compared token by token: every changed
// token of the 16 whole pages lies inside the bar (`data-assistant-island` and the work line beside it), a uniform -3154 (zh) /
// -3134 (en) characters; the Goals content, JSON blocks and the other 50 records are byte for byte the same. The 16 were then
// recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// Batch 91-0b (#2222, Decision 60) adds the global↔project scope switch (`settings-scope-switch`) and real-time sidebar filter
// (`[data-settings-nav-filter]` / `[data-settings-nav-empty]`) in standalone & drawer settings navigation (shifting all 8 `page-*.zh`
// records uniformly by +1246, all 8 `page-*.en` by +1360, all 3 standalone `settings-*.zh` by +496, and all 3 standalone `settings-*.en`
// by +553; all 24 `refresh-*`, `momentum-*`, and `document-*` records and all 6 `settings-*-embedded.*` records remain byte-for-byte identical).
// Batch 36A-6 (the project's first page, PR #2232): the home's frame inside the project page changed, and only it: the heading bar
// became the first page's column (its kind, the version slot, the read-again key and help on one line, then the name), the margin of
// sources was added beside it and the old lead bar went. All 52 dumped pages were drawn on an independently built main 8959498c9a and
// on this branch and compared token by token: the 16 whole pages differ by the same 65 tokens, all inside `data-work-surface="home"`
// (besides the language resource's file hash, which the recorded markup leaves out), a uniform +383 (zh) / +395 (en) characters; the
// other records are byte for byte the same. The 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// Removing `overview.lead` (decision 62 ③) took the home's empty lead box (`data-home-lead`) out of the same 16 pages, and only it:
// drawn on the 36A-6 branch and on this one and compared token by token, each page loses that one element, a uniform -56 characters
// in both languages; the other records are byte for byte the same. The 16 were recorded again.
// The view is the demo project read once by the real owners (times and ids fixed), so the pages have a Goal tree with children, a decision
// waiting, an archived and a trashed Goal and a proposal.
const GOLDEN = new URL("./fixtures/goals-page-golden/", import.meta.url);
const record = process.env.MOLIS_WORK_GOLDEN_RECORD === "1";
const TOKEN = "golden-control-token";
const NOW = Date.parse("2026-10-30T09:00:00.000Z"); // The instant held by the view fixture.
const PROJECT = { project_id: "golden", display_name: "Golden project" };

const baseView = JSON.parse(readFileSync(new URL("view.json", GOLDEN), "utf8")) as MolisWorkWebView;
const view: MolisWorkWebView = { ...baseView, project: PROJECT, projects: [PROJECT], route_prefix: "/projects/golden", demo: false, shown_plugins: ["goals"], enabled_plugins: ["goals"] };
// The existing frozen view contains Chinese DTO labels. These English fields come from an independent production read of
// the same seeded Goal states; all business values and every other fixture field stay in the original view.
type ViewWords = Pick<MolisWorkWebView["goals"][number], "status_label" | "main_action_label" | "action_summary">;
const englishWords = JSON.parse(readFileSync(new URL("view-words-en.json", GOLDEN), "utf8")) as Record<string, Partial<ViewWords>>;
function viewFor(locale: "zh" | "en"): MolisWorkWebView {
  if (locale === "zh") return view;
  const localized = (goal: MolisWorkWebView["goals"][number]) => ({ ...goal, ...englishWords[goal.goal.goal_id] });
  return { ...view, goals: view.goals.map(localized), archived_goals: view.archived_goals.map(localized), trashed_goals: view.trashed_goals.map(localized) };
}
const guidance = { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" };
const SECTIONS = ["general", "guidance", "rules"] as const;

type Draw = (view: MolisWorkWebView) => string;
const pages: Record<string, Draw> = {
  "page-current": (view) => renderers.renderMolisWorkWeb(view, "V1", false, false, TOKEN, false),
  "page-current-decision": (view) => renderers.renderMolisWorkWeb(view, "DECIDE", false, false, TOKEN, false),
  "page-current-desktop": (view) => renderers.renderMolisWorkWeb(view, "V1", false, false, TOKEN, true, { claude: true }),
  "page-current-none": (view) => renderers.renderMolisWorkWeb(view, undefined, false, false, TOKEN, false),
  "page-archive": (view) => renderers.renderMolisWorkWeb(view, "GRAPH", true, false, TOKEN, false),
  "page-archive-none": (view) => renderers.renderMolisWorkWeb({ ...view, archived_goals: [] }, undefined, true, false, TOKEN, false),
  "page-trash": (view) => renderers.renderMolisWorkWeb(view, "AUTO-CONNECT", false, true, TOKEN, false),
  "page-trash-none": (view) => renderers.renderMolisWorkWeb({ ...view, trashed_goals: [] }, undefined, false, true, TOKEN, false),
  "refresh-current": (view) => renderers.renderMolisWorkRefreshFragment(view, "V1", false, false),
  "refresh-current-none": (view) => renderers.renderMolisWorkRefreshFragment(view, undefined, false, false),
  "refresh-archive": (view) => renderers.renderMolisWorkRefreshFragment(view, "GRAPH", true, false),
  "refresh-trash": (view) => renderers.renderMolisWorkRefreshFragment(view, "AUTO-CONNECT", false, true),
  "momentum-current": (view) => renderers.renderMolisWorkMomentumFragment(view, "V1", "current") ?? "(none)",
  "momentum-archive": (view) => renderers.renderMolisWorkMomentumFragment(view, "GRAPH", "archive") ?? "(none)",
  "momentum-missing": (view) => renderers.renderMolisWorkMomentumFragment(view, "NO-SUCH", "current") ?? "(none)",
  "document-current": (view) => renderers.renderGoalDocumentFragment(view, "V1", "current") ?? "(none)",
  "document-decision": (view) => renderers.renderGoalDocumentFragment(view, "DECIDE", "current") ?? "(none)",
  "document-archive": (view) => renderers.renderGoalDocumentFragment(view, "GRAPH", "archive") ?? "(none)",
  "document-trash": (view) => renderers.renderGoalDocumentFragment(view, "AUTO-CONNECT", "trash") ?? "(none)",
  "document-missing": (view) => renderers.renderGoalDocumentFragment(view, "NO-SUCH", "current") ?? "(none)",
  ...Object.fromEntries(SECTIONS.map(section => [`settings-${section}`, (view: MolisWorkWebView) => renderers.renderMolisWorkProjectSettingsHub(view, guidance, TOKEN, false, section)])),
  ...Object.fromEntries(SECTIONS.map(section => [`settings-${section}-embedded`, (view: MolisWorkWebView) => renderers.renderMolisWorkProjectSettingsHub(view, guidance, TOKEN, false, section, section)])),
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
// Batch 47-1 C (user 2026-11-22: the plugin studio is the platform's, in every project, not a plugin): main 2caa6fe38b and batch 47
// merged with it were both built and drawn with MOLIS_WORK_GOLDEN_DUMP=1; diff -rq found 22 files changed. Each of the 16 page-* draws
// differs in exactly six places: the studio's 创作台 button at the switcher's head, its (hidden, deferred) stage frame, its market
// card gone, its row moved to the end of the directory JSON and of the tab titles, and the workbench language file's hash (its words
// changed). The six settings and planning pages differ only in that hash, which their records already leave out. No Goals markup or
// JSON changed; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1 and the other 50 records did not change.
// On the merge of main f19f4100da (#2243 retires Text Stats) the batch's tab-title map, which reads one placement registry, lost its
// `,"text-stats":"Text Stats"` row: a uniform -26 characters on the 16 pages in both languages, the only change between the drawn
// pages of ee4a3c0a03 and the merge (token diff); they were recorded again with MOLIS_WORK_GOLDEN_RECORD=1.
// On the merge of main 5bfd52b87b (#2240 removes `overview.lead`, its -56 noted above) the 16 were recorded once more: each is exactly
// 56 characters shorter than this batch's record in both languages, the other 50 records are unchanged, and against main each stays
// the batch's own +4982 (zh) / +5338 (en), as before the merge.
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
// Batch 41 (41-2, 用户 2026-11-14: the planning methods are Skills of the catalog and nothing of Goals): the 14 planning records
// (library, method detail/new/edit, the settings planning page and its embedded form, in two languages) went with the pages. Of the
// 52 left, 30 changed and 22 did not. Checked on the whole drawn pages against the checkout before the change: the six document-*
// and the eight refresh-* lose the empty line the document template left where the adopted-method block was (−9 characters); the 16
// page-* lose, besides that, the settings directory's planning entry, and the eight page-current*/page-archive ones the 「Work
// planning」 button with its pane. The 24 page-* and refresh-* records were already stale on main 4417d2bcd3 (page-* +155 en / +166 zh,
// refresh-* +169 en / +146 zh; this test fails there, and the pages it draws are the ones this branch drew before 41-2, line for
// line), so their new records carry that difference as well. Recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// Batch 41 merged with main 7a4c7f982d (batches 12, 17 and 28 landed there): the 16 page-* records were stale again on that main (this
// test fails there on those 16 and on the eight refresh-*, +2163 zh on page-current; this branch draws the same pages less the planning
// entry 41-2 removed, +1997 zh / +2185 en against its own records). No Goals markup of this batch changed with the merge; the 16 were
// recorded with MOLIS_WORK_GOLDEN_RECORD=1 and the other 36 records did not change.
// Batch 41 merged with main 4e2d506adc (batch 19, Work Brief): both sides had recorded the 16 page-* records, main for its new plugin in the
// switcher and Home plugin list (+2193 zh / +2403 en on every page), this branch for the removed planning entry. No Goals markup of this
// batch changed with the merge; the 16 were recorded with MOLIS_WORK_GOLDEN_RECORD=1 and the other 36 records did not change.
// Batch 08 (Skills): all 66 normalized draws were checked against the old records before updating. Removing only the new
// Skills navigation restores every old hash and length: 16 whole pages have two directory buttons (706 zh / 722 en characters),
// six personal planning records one link (92 zh / 96 en), and twelve project planning/settings records one link with its line
// (115 zh / 119 en). Only those 34 records changed; the other 32, Goals JSON, view fixture and golden Home fixtures stayed fixed.
// Batch 10 closeout after main 416ee8cef0: each of the 16 whole pages independently reproduced its previous hash and
// length after removing only the two Skills buttons and replacing the receiver button with the former span (+41).
// All other records retained the accepted main records; no Goals markup, data or assertions changed.
// D0013: the current kanban and momentum fragments add one cancelled column. Removing only that complete column restores
// all 66 prior hashes and lengths (14 changed: zh +2955 / en +2968); no other markup, JSON or view fixture was changed.
// Main #2002: removing only the restored answer chip and changing English Send to: back to To: reproduces
// all 66 previous hashes and lengths. Only the 16 whole-page records changed (zh +94 / en +99); Goals data stayed exact.
// D0014/D0015 (2026-11-09): all 66 baseline renders on independently built ecdfe102d matched the accepted records.
// Token comparison with the candidate found 22 changed records, solely the shared state labels/title/aria text,
// the blocked count label, and the cancelled kanban column (including its paused ring and zero count). The other 44 stay byte-identical.
// Main #2002 integration: all 66 preserved A-1 draws first reproduced their accepted hashes.
// Derive only the hidden assistant-answer button and English To: → Send to: from that main change.
// All 16 whole-page draws match the derived markup byte for byte; the other 50 remain identical.
// Batch 16 (FSS-36): independently built B 33aa421ed59edf69ffbb6880a805918ffd640970 matched 50 old records directly. Reversing only
// B's appearance hint, introduction and menu whitespace, plus the desktop stylesheet query, reproduced the other 16 hashes and lengths.
// Of the 49 C/B changes, the markup was checked token by token for language and shell changes. The JSON still matches B except for
// the Goal DTO labels checked against view-words-en.json, the workbench's owner title model, and the exact Goals planner startup words.
// Candidate RECORD mode was never used for these expectations.
// The six trash document/page/refresh drawings later replace only the reason label and wrap the exact stored reason in translate="no".
// The final main sync changes 48 drawings. A token comparison against all 66 verified pre-sync hashes isolates the new composer,
// Skills links and Goals state words and cancellation column. The stored view and the independently checked Goal words stay fixed.
// Batch 09 (#2015, AI kits): all 66 pages drawn on independently built main bac5d62b9e (each matched its record there) and on this branch,
// compared token by token: the 34 changed records (17 pages in two languages) differ only in the shell's settings navigation — the global
// rows 提示词 and 技能 (Prompts, Skills; icons text and book) became one 能力包 / AI kits row (icon sparkles, `data-settings-section="kit"`),
// and the settings links /settings/prompts, /settings/skills and the project's /settings/skills became /settings/kit — besides executable
// scripts and dictionaries, which the hash leaves out. No Goals markup or JSON changed; the 34 were recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// Batch 11 (#2016, one input, UIV-19): all 66 pages drawn on independently built main ef06fed60 (each matched its record there) and on
// this branch, compared token by token: the 16 page-* records (8 pages in two languages) differ only in the shell's bar — the receiver
// moved from a row above the box into the foot after ＋ (`mw-composer__to` now after the box, its 发给： / Send to: in
// `mw-composer__to-label`, the Assistant's sparkles icon before the name) and the bar is drawn ` data-bar-placing` (the input stays
// unseen until bar-column.ts places it, VUX-31): +110 characters in each — besides executable scripts and dictionaries, which the hash
// leaves out. No Goals markup or JSON changed; the 16 were recorded with MOLIS_WORK_GOLDEN_RECORD=1 and the other 50 did not change.
// Batch 16 final integration: an independent build of main 2630160877 reproduced all 66 accepted hashes and lengths. The token
// comparison found 49 changed drawings from the approved language and appearance work, including the display-only Goal labels,
// two added language data blocks and the translated planning methods. The Goal data, fixed view and golden Homes were unchanged.
// Batch 15 (#2017): main eee4ec34cb already drew 28 records differently from golden.json — batch 27 (#2010) changed the shell's settings
// and immersive markup without re-recording, and batches 16 and 25 each recorded on their own base. Those 28 were first recorded on an
// independently built eee4ec34cb (the accepted product). Against that record, this branch differs in 24 (the 12 project and refresh
// pages in two languages) and only by its reviewed changes: the Goals tree row's leading cell is a `<div>` that can hold the owner's
// presentation chip (the fallback branch keeps the title button, its attributes now on two lines), and the old project home
// (shortcuts, dates, day list, detail) is replaced by the composed home's shell (heading, read state, groups, offers, quick look);
// the home's lost Todo rows are BL-todo-home-presentation. Those 24 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1; the other 42 match main's record.
// After merging main f32d8f9d98, #2035 dropped the curly quotes around English input-receipt words; the 11 English records changed
// by 5 bytes each and were re-recorded with MOLIS_WORK_GOLDEN_RECORD=1; no Chinese record moved.
// Batch 06 (#2009, after merging main b819373250): the Files plugin package is retired and the side panel and work stage gained the
// shell's materials tools. All 66 pages were drawn on an independently built b819373250 (each matched its record there) and on this branch,
// and compared token by token: the 16 records of the 8 project pages differ only in the Files rail tile and market card gone, the
// shell's materials toolbar and materials stage added, and the plugin-title model without Files (162 / 184 characters shorter in
// zh / en); the other differences are in executable scripts, the plugin directory and the locale script's address, outside the hash.
// No Goals markup or JSON changed. The 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1; the other 50 records did not change.
// Main #2056 (2026-11-14, global design language round 1): the current collection fold draws its column names once above the rows
// (`tree-columns`, +169 en / +146 zh), and the hidden project-home tab's heading became the project's own name under a quiet
// "Project home" line (en −14 / zh +20). All 66 records matched on independently built 6306758c22. Removing only the column names
// from the current draws left the 8 refresh records exact, and the 16 whole pages differed only in the home heading. The 24 were
// then recorded with MOLIS_WORK_GOLDEN_RECORD=1; the other 42 records did not change.
// Main #2058 (batch 17, risk plugin) with #2063 (design closeout): the shell gained the risk plugin's rail tile and settings
// row (and the closeout's shell wording), so every whole-page record moved by +2185 en / +1997 zh; the 50 fragment records did
// not change. The 16 whole pages were re-recorded with MOLIS_WORK_GOLDEN_RECORD=1 on the merge of main 7a4c7f982d; they are
// the shell's reviewed additions, not a Goals markup change.
// Batch 19 (Work Brief plugin): the shell gained the Work Brief plugin's rail tile and settings row, so every whole-page record
// moved by +2403 en / +2193 zh; the 50 fragment records did not change. The 16 whole pages were re-recorded with
// MOLIS_WORK_GOLDEN_RECORD=1 on the merge of main 653cf456d4; not a Goals markup change.
// Batch 29 (#2084, work-records settings): independently built main 8d1771839e reproduced all 52 accepted hashes and lengths.
// The 16 page-* expectations were derived from those baseline draws by adding only the global settings directory row
// `data-settings-section="work-records"` after `memory` (+367 zh / +383 en characters); candidate normalized draws matched
// every derived page byte for byte, removing only that row reproduced all 16 prior hashes, and the other 36 records stayed exact.
// Candidate RECORD mode was not used; no Goals markup or JSON changed.
// Batch 32 (work line, WLN-16), on the merge of main 605696e3cf (re-recorded again on the merges of main a20d260dfe, with batch 19's tile and row, and fbc95f41ce, with batch 29's settings row: each page is this branch's change plus main's, +367 zh / +383 en on that merge): the 16 whole pages moved by +1346 zh / +1434 en and the 50
// fragment records did not change. It is the shell alone: the Dock, the start page behind ＋, the person's tray and the project
// button went from the foot to the top strip, the foot is the work line with the Assistant in its slot, and the side's
// background-tasks tab and page are gone from a project page (the task panel beside the dialog replaces them). Every page state
// grew by the same amount in each language and no document or settings record moved, so no Goals markup changed here. The 16
// were recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// QEA-03/05: independently built main bd537b7d9 matched all 52 accepted records. Only the import-help text and English
// Import button were replaced in those baseline draws: +7 zh / +38 en in the 16 whole pages. Candidate draws matched each
// derived expectation byte for byte; all 36 fragment records stayed exact. No candidate RECORD mode or normalization change.
// Batch 34 (external sessions, SRB-08), on the merge of main 0d45ba58b: the 16 whole pages moved by +5805 zh / +6358 en and all 36
// fragment, document and settings records stayed byte-identical. Only the shell changed: the `sessions` picker/rail tile, the deferred
// `<section data-work-surface="sessions">` stage, the Read Scope `<dialog data-sessions-scope-sheet>` overlay, and the `"sessions"` entry
// in the shell's plugin title map. Every whole-page state grew by the exact same constant in each language; no Goals markup or JSON
// changed, and the 16 were recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// QEA integration of main 4a08c41ca: all 16 normalized whole pages reproduce main's accepted hash and length exactly when only
// this audit's import-help sentence and English import-submit label are reversed (+7 zh / +38 en). Those two proved changes are
// retained in the merged expectations; the other 36 records are unchanged. Candidate RECORD mode and normalization were not changed.
// Copywriting polish (2026-11-17, on main 8d9f1fb0): 30 of the 52 records changed solely from the reviewed zh/en microcopy edits
// (`workbench.project-settings-folds.*`, `workbench.side-panel-files.*`, `workbench.pane.*`, `workbench.immersive-shell.*`,
// `goals.dialogs-ui.means-part-that-goal-only-decides-tree-placement`, `goals.guidance-document.only-active-revisions-sent-placed-before-round-s`,
// `coding.directory.summary`, `git.directory.summary`, and `Text Stats` → `Text stats`). Reversing only those string edits on all 30
// candidate draws reproduces every main 8d9f1fb0 SHA-256 and byte length exactly; the other 22 records did not change.
// Screen polish P0 (the next wing shows whole events only): the shell's work line no longer marks its next run ` data-overflow-fade`
// (−19 characters, once, in each of the 16 page-* records). Each of the 16 drawn pages, with only that attribute put back, has its old
// hash and length exactly; the other 36 records did not change. Checked again on the merges of main 6359987103 (batch 34's records)
// and of a717e44284, bdfcc36454 and 43a3c3fa2f (the copywriting polish) after it, and the 16 recorded there with MOLIS_WORK_GOLDEN_RECORD=1.
// Screen polish P1 (specs/screen-polish §3 方案 C, the top strip as tabs on paper), on main 0dceaca09: the 16 page-* records grew
// by 627 zh / 647 en characters and the 50 fragment records did not change. It is the shell's top strip alone, in three places:
// the person's tray (`data-bar-own`) gave way to the side sheet's own tab (`data-side-ear data-ear`), the side's glyph row became the list
// of its views (`side-strip side-views`, `data-side-menu hidden`), and the layout button is preceded by the side's switch
// (`data-side-toggle`). Each of the 16 candidate normalized draws, with only those three put back as they were, had its prior hash
// and length exactly; the new expectations are those draws' own. Candidate RECORD mode was not used; no Goals markup or JSON changed.
// On the merges of main 4aa5496e3f (batch 34's records above) and then eafff2b526 the same 16 stood 627 zh / 647 en over main's
// records, every one by that constant, and the other 36 matched main's; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// The directory's two buttons in the top strip (collapse and show) changed their glyph from `panel`, the right-hand panel the side's
// switch now carries, to `sidebar`: the 16 page-* records grew by 4 characters each (`#icon-panel` to `#icon-sidebar`, twice) in both
// languages and the other 36 did not change; the 16 were recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// On the merge of main 77954f0100 the 16 stood 631 zh / 651 en over main's records (the strip and the glyph above), every one by that
// constant, and the other 36 matched main's; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// After the review of P1 the side sheet's tab lost `aria-haspopup="true"` (21 characters) and the side's switch's tooltip gained
// ` ⌘\` (3): on the merge of main e56bd6701a the 16 page-* records stood 613 zh / 633 en over main's records, every one by that
// constant, and the other 36 matched main's; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// The top keeps no plugin (specs/screen-polish §3 方案 C, confirmed by the user 2026-11-18「确认，拿掉」): the start page's
// entries lost their keep pin and kept mark, the Dock's holder its role and label, and the shell its kept-plugin glyphs. The 16
// page-* records shrank by 9931 zh / 10430 en characters, every one by that constant, and the other 36 did not change; they then
// stood 9318 zh / 9797 en under main's records (on main e56bd6701a), every one by that constant, and the 16 were recorded with
// MOLIS_WORK_GOLDEN_RECORD=1.
// On the merge of main f1e875d11e (P0's records above) the 16 stood 9318 zh / 9797 en under main's records, every one by that
// constant, and the other 36 matched main's; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// On the merge of main e5e565411b (P5's records above) the 16 again stood 9318 zh / 9797 en under main's records, every one by that
// constant, and the other 36 matched main's; the 16 were then recorded with MOLIS_WORK_GOLDEN_RECORD=1.
// Unified screen-polish PR #2142 (P5 Part 2 + Coding P4a + P1 top-strip scheme C / v13 top corner / v13 bottom bar) audited against
// an independently built clean main a462bf81f2 (all 56 reference assertions passed and all 52 draws were dumped and compared hunk by
// hunk): 32 records (all document-*, momentum-*, refresh-*, settings-guidance*, settings-rules*) match a462bf81f2 byte for byte, and
// all `application/json` data blocks (`molis-work-data` and `data-project-guidance-json`) are unchanged byte for byte in every page.
// The 4 settings-general* records move by +382 in both zh and en (P5 Part 2 SDK setting rows/sections alone). The 16 page-* records
// move by +3856 zh / +3548 en on the 7 web pages (+605 P5 Part 2 + 3251 zh / +2943 en P1 top corner, scheme C, no kept plugins, and
// v13 bottom bar account bar / counts / lists / stack) and +3886 zh / +3578 en on page-current-desktop (+30 from four added `?desktop=1`
// / `&desktop=1` links on top-corner and bar-account minus one removed `/settings/sync?desktop=1` link). Keeping `/onboarding` unprefixed
// in `prefixLocalLinks` (so the top-corner "New project" link `/onboarding?mode=new-project` does not 404 under `/projects/<id>`) removes
// 16 characters (`/projects/golden`) from each of the 16 page-* records alone (final net +3840 zh / +3532 en on the 7 web pages and
// +3870 zh / +3562 en on page-current-desktop). On the merges of main 820c13d498 (#2157, B35-R1 Sessions onboarding link) and main
// b819fbbf61 (#2155, Batch 44 plugin equal standing), all 20 moved by the exact same constants (+3840/+3870 zh, +3532/+3562 en,
// +382 settings-general*) over each accepted main's records while the other 32 matched directly. On user's 2026-11-20 decision to
// unify 「项目首页」 → 「项目主页」 across the product, only the 8 `page-*.zh` records changed hashes at exact +0 character delta
// (all 26 en records and 18 zh fragments/settings stayed byte-identical). The changed records were recorded with
// MOLIS_WORK_GOLDEN_RECORD=1 and re-verified with RECORD unset; no Goals markup or JSON changed.
// The hashes below come from the checked draws with RECORD unset. The independent text and data assertions stay in place.
// QEA-94/109: all 52 normalized draws reproduce their previous hashes and lengths when only the retired final
// `inbox_judgment:null` client-data property is restored and the Sessions SSR `maxlength="200"` is removed.
// The 16 whole pages therefore change by -6 characters (-22 +16), and the 8 full refresh fragments by -22;
// the other 28 records are unchanged. Expectations were derived after this exact reverse check, without RECORD mode.
// QEA-112's collection projection has separate actual owner-read/HTTP assertions; the original full-page checks remain exact.
// QEA-148: all 52 normalized shapes from independently built main 8d9f1fb01e matched its accepted hashes. Applying the
// accepted import text and button, Sessions length and retired inbox_judgment changes to those reference draws matched
// the merged draws exactly. This updates 24 expectations; the other 28 hashes and the comparison rules stay intact.
// QEA-178: the same four edits independently predict all 52 merged draws from the accepted main 43a3c3fa2f bytes,
// including both languages of Copywriting polish. All 52 match exactly; 24 expectations change.
// QEA-196: adding back only the next-wing attribute restores all 52 accepted records of 811e28f368.
// Sixteen whole pages change by 19 characters each. The other 36 records are unchanged.
// QEA-204 applies those four independently checked audit edits to the accepted P5 main drawings.
// The settings appearance and project maintenance changes follow main, and the comparison covers every original record.
// Batch 44 (PEQ-03/08/17, items 3–6, on main 9d25c9d1cd): 30 of the 52 records changed from four reviewed Batch 44 changes, while all
// 22 momentum-*, document-trash/missing and settings-* records stayed byte-identical:
// (1) Item 3 (event-document-ui.ts): Goals' private requirement/acceptance buttons moved to the platform acceptance review trigger (−129 en / −109 zh on document-current/decision/archive);
// (2) Item 5 (tree-ui.ts): treeColumns() uses @molis-ai/molis-work-plugin-sdk/ui renderListColumns (−2 on refresh-trash; −131 en / −111 zh = −129/−109 − 2 on refresh-current/none/archive);
// (3) Item 4 (terminal/pane.ts, documents.ts) & Item 6 (shell-page-renderer.ts, immersive-shell.ts): platform work-terminal attributes and clientData terminal_read_only, pluginShellStyleLinks goals.css, removal of data-feed-preset="feed", and platform-owned project settings (+792 en / +748 zh on page-archive-none/trash-none/trash; +663 en / +639 zh = +792/+748 − 129/−109 on page-archive; −340 en / −188 zh on page-current/none; −370 en / −218 zh on page-current-desktop; +424 en / +522 zh on page-current-decision).
// The underlying frozen view.json and view-words-en.json stayed untouched.
// Batch 101 (101-1 item 5, on main cb03f3e196): `apps/workbench/src/plugin-event-recovery.ts` removed the raw JSON disclosure,
// manual reason textarea, and self-accepted duplicate-risk radio group from the workbench shell dialog (−509 zh / −598 en on every
// one of the 16 `page-*` whole-page records); all 36 fragment/settings records and JSON data blocks stayed byte-identical.
// BL-b44-feed-home-dir-and-styles (on main 263d50061b): the shared list class `feed-stage-tree` is `mw-stage-tree`. Drawn independently
// from that main, the 16 `page-*` records differ only on the artifact directory's class (-2 each); the other 36 records are unchanged.
// BL-b44-shell-goals-state (PCL-01, on main 2d8244c287): the shell finds its panes by generic marks instead of Goals' ids, and the
// page client reads the project title from the page. Drawn independently from that main, the 16 `page-*` records differ only by
// ` data-project-title="Golden project"` on <body> (+36), ` data-directory-pane` on the tree pane (+20), ` data-surface-stage` on each
// stage (+19 each) and ` data-surface-host` on the canvas shell (+18): +75 on archive/trash, +131 on current. The other 36 records are unchanged.
// Batch 44 audit cleanup (PEQ-08 / BL-b44-shared-styles-plugin-names / MR21-07, on main 5bfd52b87b): (1) platform-neutral classes and
// attributes (`mw-object-status`, `mw-tree`, `data-craft-land`, `data-craft-focal`, `data-placement-linked-materials`) replace plugin-named
// shared selectors across Goals tree, canvas, kanban, and event document; (2) dead `data-immersive-goal-tools` buttons removed from
// `immersive-shell.ts`; (3) hardcoded Feed/Inbox/Session/Artifact `<option>` elements removed from `frame-stage.ts` (populated dynamically
// in `frame-container.ts`). All 12 `settings-*` and 2 `document-missing` records stayed byte-identical.
// On merging main 1ab4eb5b (#2239, Batch 47-1 C moving Plugin Studio onto the platform), all 16 `page-*` records were re-recorded
// (`MOLIS_WORK_GOLDEN_RECORD=1`): uniform +5008 (zh) / +5364 (en) vs pre-merge #2258 (exact #2239 studio delta after #2243's -26),
// and all 36 fragment/settings records stayed byte-identical.
// Batch 37 (37-1 generated home page & 37-2 mainline workbench, PR #2288): `apps/workbench/src/project-home.ts` added the generated-page
// mount/compare/adopt containers, `apps/workbench/src/side-panel.ts` added the hidden conditional `item-contents` tab (`order: 52`), and
// `apps/workbench/src/shell-page-renderer.ts` loaded `/assets/molis-work-mainline.js`. Re-recorded (`MOLIS_WORK_GOLDEN_RECORD=1`):
// uniform +1814 (zh) / +1892 (en) on 14 `page-*` records and +1834 (zh) / +1912 (en) on `page-current-desktop`; all 36 fragment/settings
// records stayed byte-identical.
// Batch 44B PR1 (#2279, deleting the old Alchemist): the inline page client no longer carries Alchemist's storage-key prefixes and
// the built-in catalog no longer lists it. Re-recorded (`MOLIS_WORK_GOLDEN_RECORD=1`) and re-verified with RECORD unset: uniform -1998 (zh)
// / -2189 (en) on all 16 `page-*` records; all 36 fragment/settings records stayed byte-identical, and no draw names Alchemist.
// Batch 44B PR3 (M2～M13, on batch/44b-4): Goals' input and fixed-material rows carry the platform placement marks (`data-placement-input-*`,
// `data-placement-snapshot*` instead of `data-goal-input-*` / `data-goal-material-snapshot*`, M3), and the shell carries the receive, character-run
// and event-owner changes (M4, M6) plus PR1's Alchemist removal. Re-recorded (`MOLIS_WORK_GOLDEN_RECORD=1`), re-verified with RECORD unset:
// +51 on the 6 document-* and 6 refresh-* records with Goals inputs; -1525 zh / -1711 en on page-current*/page-archive, -1576 zh / -1762 en on
// page-archive-none and page-trash*; all 12 settings-*, the momentum-*, document-trash/missing and refresh-trash records stayed byte-identical.
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
    const whole = runWithLocale(locale, () => draw(viewFor(locale)));
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
  owner: string; words: Record<string, string>;
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

// Pair the independently recorded B expectations with the exact new owners. Only typographic apostrophes change; the Chinese
// copy, argument values and complete sentences still come from B. (The capsule's words went with the capsule, batch 44.)
const keys = JSON.parse(readFileSync(new URL("stable-keys.json", GOLDEN), "utf8")) as Record<"words" | "interpolation", string[]>;

const reviewedChinese: Readonly<Record<string, string>> = {
  "goals.chrome.goal-view": "目标视图",
  "goals.capsule-items.open-goal-see-latest-progress-next-step": "打开这个目标，查看最新进展和下一步。",
  "goals.guidance-document.long-term-guidance-shared-all-work-project-assistant": "这是整个项目共享的长期做事说明：项目里的个人助理、各插件 AI 和你连接的外部 AI 工具都会参考它。这里只展示当前生效的内容，可随时修改并查看历史版本。",
  "goals.guidance-document.write-complete-instruction-future-runtime-can-understand-follow": "写清楚背景和要求，方便 AI 不用猜就能直接照着做",
  "goals.guidance-document.how-runtime-uses": "AI 会怎么参考这份说明",
  "goals.guidance-document.only-active-revisions-sent-placed-before-round-s": "每次只把当前生效的说明发给 AI（放在具体任务之前）；修改或停用后，从下一次对话起生效。",
  "goals.chrome.goal-info-timeline": "目标信息与时间线",
  "goals.inputs.create-goal": "或为这个目标新建",
  "goals.workbench-stage.goal-workspace": "目标工作区",
};

const reviewedEnglish: Readonly<Record<string, string>> = {
  "goals.guidance-document.project-s-stable-way-working": "The project’s stable way of working",
  "goals.guidance-document.long-term-guidance-shared-all-work-project-assistant": "Long-term instructions shared across all work in this project — used by the assistant, plugin AI features and connected external AI tools. Edit anytime and view full revision history.",
  "goals.guidance-document.write-complete-instruction-future-runtime-can-understand-follow": "Write clear background and rules that AI can follow directly without guessing",
  "goals.guidance-document.how-runtime-uses": "How AI uses this guidance",
  "goals.guidance-document.only-active-revisions-sent-placed-before-round-s": "Only active entries are sent to AI ahead of each turn’s task; edits or pauses take effect on the next turn.",
  "goals.inputs.couldn-t-remove": "Couldn’t remove it",
  "goals.inputs.couldn-t-accept": "Couldn’t accept it",
  "goals.inputs.version-can-t-be-found": "This version can’t be found",
  "goals.inputs.follow-original-goal-sees-now-fix-version-goal": "“Follow the original”: the goal sees it as it is now. “Fix this version”: the goal uses the version saved when it was added; later edits don’t change it.",
};

// Batch 44 (contract-design §9) gave the project guidance to the platform: its words keep their text under the workbench's own keys,
// `workbench.project-guidance.*` with the same endings, and are read here from that owner.
const GUIDANCE_WORDS = "goals.guidance-document.";
const ownedKey = (key: string) => key.startsWith(GUIDANCE_WORDS) ? "workbench.project-guidance." + key.slice(GUIDANCE_WORDS.length) : key;

function examples(locale: "zh" | "en") {
  const text = (key: string, zh: string, en: string) => {
    const expected = locale === "zh" ? (reviewedChinese[key] ?? zh) : (reviewedEnglish[key] ?? en);
    return { key: ownedKey(key), expected, args: undefined };
  };
  const result = (["words"] as const).flatMap(section => {
    assert.equal(keys[section].length, Object.keys(moved[section]).length);
    return Object.entries(moved[section]).flatMap(([zh, en], index) =>
      zh.includes("{") ? [] : [text(keys[section][index]!, zh, en)]);
  });
  assert.equal(keys.interpolation.length, moved.interpolation.length);
  return [...result, ...moved.interpolation.map((sample, index) => ({ key: ownedKey(keys.interpolation[index]!), expected: sample[locale], args: sample.vars })),
    { key: "workbench.project-guidance.count-count", expected: locale === "en" ? "1 change" : "共 1 次变更", args: { count: 1 } },
    { key: "workbench.project-guidance.count-count-2", expected: locale === "en" ? "1 item" : "共 1 条", args: { count: 1 } },
    { key: "goals.inputs.fixed-version-version", expected: locale === "en" ? "Fixed version North's 原文" : "固定的第 North's 原文 版", args: { version: "North's 原文" } }];
}

test("FSS-36 RAC-2686 moved words retain the actual Goals reader on the Host and in Chrome, including complete plurals", { timeout: 60_000 }, async t => {
  const executable = process.env.MOLIS_WORK_TEST_CHROME;
  assert.ok(executable, "an explicit dedicated test browser executable is required; no default browser fallback");
  const directory = await mkdtemp(join(tmpdir(), "goals-word-browser-"));
  let browser: ChromeHarness | null = null;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  browser = await ChromeHarness.start(directory, { executable }); assert.ok(browser);
  const page = await browser.page(), owner = registeredBuiltinText(goalsManifest);
  assert.ok(owner);
  for (const locale of ["zh", "en"] as const) {
    const cases = examples(locale), expected = cases.map(sample => sample.expected);
    const server = runWithLocale(locale, () => cases.map(({ key, args }) => key.startsWith("workbench.") ? uiText.text(key, args)
      : runWithRegisteredText(owner, () => uiText.text(key, args))));
    assert.deepEqual(server, expected, locale + " exact Host owners");
    const script = pageTextScript(locale, "goals");
    const actual = await page.evaluate<{ words: string[]; wrong: string }>(`(() => {
      ${script}
      return { words:${JSON.stringify(cases)}.map(({key,args})=>t.text(key,args)),
        wrong:say.text({owner:"workbench",key:"goals.chrome.goal-view"}) };
    })()`);
    assert.deepEqual(actual.words, expected, locale + " exact browser owners");
    const missing = locale === "en" ? "This text cannot be shown right now" : "这句话暂时显示不了";
    assert.equal(actual.wrong, missing, "the platform owner cannot borrow a Goals word");
    const wrong = runWithLocale(locale, () => say.text({ owner: "workbench", key: "goals.chrome.goal-view" }));
    assert.equal(wrong, missing);
    assert.deepEqual(hostTextProblems().at(-1), { code: "ui.text_missing", owner: "workbench", key: "goals.chrome.goal-view", locale });
  }
  const drawnEnglish = drawn["page-current.en"] ?? runWithLocale("en", () => pages["page-current"]!(viewFor("en")));
  assert.ok(markup(drawnEnglish).includes('aria-label="Goal view"'), "the actual Goals contribution draws its English label");
});
