import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLANNING_METHOD_PACKS } from "@molis-ai/molis-work-plugin-goals/module";
import * as renderers from "./workbench-renderer-fixture.js";
import type { MolisWorkWebView } from "./workbench-renderer-fixture.js";

// RAC-2680: the project page, its three fragments and the settings and planning pages of Goals, as the Host draws them, are recorded once
// (MOLIS_WORK_GOLDEN_RECORD=1) and every later change to who draws them (T-116 moves the drawing from the workbench and the Host into the
// Goals package) has to give the same bytes, in both interface languages. The view is the demo project read once by the real owners
// (times and ids fixed), so the pages have a Goal tree with children, a decision waiting, an archived and a trashed Goal and a proposal.
const GOLDEN = new URL("./fixtures/goals-page-golden/", import.meta.url);
const record = process.env.MOLIS_WORK_GOLDEN_RECORD === "1";const TOKEN = "golden-control-token";
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
// was drawn to the temp directory; the recorded hashes come from running this file with MOLIS_WORK_GOLDEN_RECORD=1 on the commit before
// the change. MOLIS_WORK_GOLDEN_DUMP=1 writes every whole page (scripts and styles included) to the temp directory, in either mode, so a
// change that must not alter a byte is proved by a diff of the two directories against a baseline built from a clean checkout. Build the
// whole workspace first: a stale dist draws a page nobody is served.
const RECORDED = new URL("golden.json", GOLDEN);
interface Recorded { sha256: string; length: number }
const recorded: Record<string, Recorded> = record ? {} : JSON.parse(readFileSync(RECORDED, "utf8"));
// Drawn from the clock: a new method's id.
const settled = (html: string): string => html.replace(/custom-method-[0-9a-z]+/g, "custom-method-ID");
const dataBlock = /type="application\/json"/;
const markup = (html: string): string => html
  .replace(/<script\b([^>]*)>[\s\S]*?<\/script>/g, (script, attributes: string) => dataBlock.test(attributes) && !attributes.includes("data-plugin-directory") ? script : "<script></script>")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "<style></style>")
  .replace(/<svg class="icon-sprite"[^>]*>[\s\S]*?<\/svg>/, '<svg class="icon-sprite"></svg>');
const drawn: Record<string, string> = {};

for (const locale of ["zh", "en"] as const) for (const [name, draw] of Object.entries(pages)) {
  test(`RAC-2680: Goals ${name} in ${locale} is the recorded markup, byte for byte`, () => {
    const whole = settled(runWithLocale(locale, draw));
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

test("RAC-2680: recording writes the hashes", { skip: !record }, () => {
  writeFileSync(RECORDED, `${JSON.stringify(Object.fromEntries(Object.entries(recorded).sort(([a], [b]) => a.localeCompare(b))), null, 1)}\n`);
});
