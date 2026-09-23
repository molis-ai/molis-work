import assert from "node:assert/strict";
import test from "node:test";
import { createWorkbenchGoalsPlanningRenderer, matchGoalsPlanningRoute, renderWorkbenchPlanningRequest } from "@molis-ai/molis-work-app-workbench";
import type { PlanningMethodPack, PlanningMethodComposition } from "@molis-ai/molis-work-contracts/modules/goals";
import { L, listJoin, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { icon } from "@molis-ai/molis-work-design-system";
import { withDesktopQuery } from "@molis-ai/molis-work-app-desktop";

const escapeHtml = (v: string) => v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const renderer = createWorkbenchGoalsPlanningRenderer({
  translate: L, escapeHtml, icon, listJoin, withDesktopQuery,
  settingsContextHref: (path, project, desktop) => {
    const href = project ? path + "?project=" + encodeURIComponent(project.project_id) : path;
    return desktop ? withDesktopQuery(href) : href;
  },
  renderPage: page => "<title>" + escapeHtml(page.title) + "</title>" + page.body,
});
const project = { project_id: "project/a", display_name: 'Project "<safe>' };
const method: PlanningMethodPack = {
  method_id: "method/a", version: 3, scope: "built_in", kind: "domain", name: 'Method "<safe>',
  summary: "For real delivery", instructions: "<script>unsafe</script>\nRead the whole method.",
  applies_to: ["Build", "Fix", "Ship", "Learn"], domain_tags: ["product"], steps: ["First", "Second"],
  required_coverage: [{ area: "result", label: "Result", question: "Who uses it?" }],
  dependency_rules: [{ rule_id: "consumption", statement: "consumer depends_on provider", direction_hint: "consumer depends_on provider" }],
  evidence_requirements: ["Observed"], completion_checks: ["Working"], failure_modes: ["Wrong direction"],
  source_refs: ["project://method.md"], confidence: 0.8, enabled: true, created_at: "2026-09-05", updated_at: "2026-09-05",
};

test("Planning request composition preserves lazy loading, scope selection, new pages and missing-method errors", () => {
  const projectMethod = { ...method, scope: "project" as const };
  const calls: unknown[][] = [];
  const request = (path: string, scope: "personal" | "project" = "personal", httpMethod = "GET") =>
    renderWorkbenchPlanningRequest(httpMethod, path, scope, route => {
      calls.push(["load", route]);
      return {
        methods: [method, projectMethod],
        library: () => { calls.push(["library"]); return "library"; },
        method: (value, mode) => { calls.push(["method", value, mode]); return "method"; },
      };
    }, text => text);
  assert.equal(request("/settings/planning", "personal", "POST"), null);
  assert.equal(request("/settings/planning/id/other"), null);
  assert.throws(() => request("/settings/planning/%"), URIError);
  assert.deepEqual(calls, [], "Rejected paths never query methods or render");
  assert.deepEqual(request("/settings/planning"), { status: 200, html: "library" });
  assert.deepEqual(calls.at(-1), ["library"]);
  for (const scope of ["personal", "project"] as const) {
    assert.deepEqual(request("/settings/planning/method%2Fa/edit", scope), { status: 200, html: "method" });
    assert.equal(calls.at(-1)![1], scope === "personal" ? method : projectMethod);
    assert.equal(calls.at(-1)![2], "edit");
    assert.deepEqual(request("/settings/planning/new", scope), { status: 200, html: "method" });
    assert.deepEqual(calls.at(-1), ["method", null, "new"]);
    calls.length = 0;
    assert.deepEqual(request("/settings/planning/missing", scope), { status: 404,
      error: scope === "personal" ? "找不到这套规划方法" : "找不到这个项目方法" });
    assert.deepEqual(calls, [["load", { kind: "method", method_id: "missing", mode: "detail" }]]);
  }
  const rejected = renderWorkbenchPlanningRequest("GET", "/settings/planning/method%2Fa", "project",
    () => ({ methods: [method], library: () => { throw Error("Wrong library"); },
      method: () => { throw Error("Built-in cannot be opened as a project method"); } }), text => text);
  assert.deepEqual(rejected, { status: 404, error: "找不到这个项目方法" });
});

test("Planning routes preserve library/new/edit and decode an identifier exactly once", () => {
  for (const scope of ["personal", "project"] as const) {
    assert.deepEqual(matchGoalsPlanningRoute("/settings/planning", scope), { kind: "library" });
    assert.deepEqual(matchGoalsPlanningRoute("/settings/planning/new", scope), { kind: "method", method_id: "new", mode: "new" });
    assert.deepEqual(matchGoalsPlanningRoute("/settings/planning/method%252Fa/edit", scope), { kind: "method", method_id: "method%2Fa", mode: "edit" });
    assert.deepEqual(matchGoalsPlanningRoute("/settings/planning/edit", scope), { kind: "method", method_id: "edit", mode: "detail" });
    assert.deepEqual(matchGoalsPlanningRoute("/settings/planning/new/edit", scope), { kind: "method", method_id: "new", mode: "new" });
    assert.equal(matchGoalsPlanningRoute("/settings/planning/id/other", scope), null);
    assert.equal(matchGoalsPlanningRoute("/settings/planning/", scope), null);
    assert.equal(matchGoalsPlanningRoute("/api/settings/planning-methods", scope), null);
    assert.throws(() => matchGoalsPlanningRoute("/settings/planning/%zz", scope), URIError);
  }
});

test("Planning library mounts categorized cards, escaped copy and contextual desktop links", () => {
  const html = renderer.renderLibrary([method], project, true);
  assert.match(html, /Method &quot;&lt;safe&gt;/);
  assert.match(html, /href="\/settings\/planning\/method%2Fa\?project=project%2Fa&desktop=1"/);
  assert.match(html, /data-kind="domain" data-scope="built_in"/);
  assert.match(html, /data-planning-filter="mine"/);
  assert.match(html, /<span>Ship<\/span>/);
  assert.doesNotMatch(html, /<span>Learn<\/span>/);
  assert.match(html, /2 个规划阶段 · 1 个必答问题/);
  assert.match(renderer.renderLibrary([]), /data-planning-filter-empty hidden/);
});

test("Planning details and editors preserve scope, instructions, blank rows and disabled state", () => {
  const html = renderer.renderMethod(method, "detail", "personal", project);
  assert.match(html, /<p>For real delivery<\/p><div class="planning-detail-tags" aria-label="适合哪些工作">/);
  assert.match(html, /planning-detail-lede[\s\S]*planning-detail-tags[\s\S]*mw-btn--primary/);
  assert.doesNotMatch(html, /mw-btn--primary[\s\S]*planning-detail-tags/);
  assert.match(html, /创建我的版本/);
  assert.doesNotMatch(renderer.renderMethod({ ...method, applies_to: [] }, "detail", "personal", project), /planning-detail-tags/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /consumer 依赖关系 provider/);
  assert.match(html, /先完成可交付结果，再开始使用它的工作/);
  assert.doesNotMatch(html, /<form/);
  const edit = renderer.renderMethod(method, "edit", "personal", project);
  assert.match(edit, /系统模板不会被修改/);
  assert.match(edit, /data-save-scope="personal" data-api-endpoint="\/api\/settings\/planning-methods"/);
  for (const field of ["method_id", "instructions", "steps", "coverage_label", "dependency_direction", "evidence_requirements", "source_refs", "confidence", "enabled"]) {
    assert.ok(edit.includes('name="' + field + '"'));
  }
  const disabled = renderer.renderMethod({ ...method, scope: "project", enabled: false }, "edit", "project", project, true);
  assert.match(disabled, /data-api-endpoint="\/projects\/project%2Fa\/api\/settings\/planning-methods"/);
  assert.match(disabled, /name="enabled" type="checkbox"><span>/);
  assert.match(disabled, /data-return-href="\/projects\/project%2Fa\/settings\/planning\/method%2Fa\?desktop=1"/);
  const blank = renderer.renderMethod(null, "new", "personal", null);
  assert.match(blank, /data-coverage-row/);
  assert.match(blank, /data-dependency-row/);
  assert.match(blank, /name="instructions" rows="10" required/);
  assert.match(runWithLocale("en", () => renderer.renderMethod(null, "new", "personal", null)), /Save to my method library/);
});

test("project Planning presents the supplied composition and separates inactive and adoptable methods", () => {
  const active = { ...method, scope: "project" as const };
  const inactive = { ...active, method_id: "inactive", name: "Inactive", enabled: false };
  const source = { ...method, scope: "built_in" as const };
  const available = { ...method, method_id: "available", scope: "personal" as const };
  // Independent read model: the UI must not recompute or silently replace Module output.
  const composition: PlanningMethodComposition = { method_pack_ids: [active.method_id], method_names: ["Module-composed name"],
    method_paths: [], required_coverage: [method.required_coverage[0]!], dependency_rules: [], evidence_requirements: [],
    completion_checks: ["One", "Two"], failure_modes: [] };
  const html = renderer.renderProject({ project, route_prefix: "/projects/project%2Fa" }, [active, inactive, source, available], composition);
  assert.match(html, /work-planning-layout/);
  assert.match(html, /data-planning-fold="domain"/);
  assert.match(html, /data-planning-fold="mine"/);
  assert.match(html, /data-planning-open/);
  assert.match(html, /data-planning-detail-path="\/settings\/planning\/method%2Fa\?project=/);
  assert.doesNotMatch(html, /href="\/settings\/planning\/method/);
  assert.match(html, /id="planning-composition-title">当前规划组合/);
  assert.match(html, /Module-composed name/);
  assert.match(html, /2 项完成检查/);
  assert.match(html, /0 条依赖规则/);
  assert.match(html, /planning-inactive-section/);
  assert.match(html, /data-joined="true">已加入/);
  assert.match(html, /data-joined="false">未加入/);
  assert.match(html, /data-adopt-planning-method="available"/);
  assert.doesNotMatch(html, /data-adopt-planning-method="inactive"/);
  assert.doesNotMatch(html, /data-adopt-planning-method="method\/a"/);
  const empty = renderer.renderProject({ project: null, route_prefix: "" }, [], { ...composition, method_pack_ids: [] });
  assert.match(empty, /尚未建立项目规划组合/);
  assert.match(empty, /data-planning-filter-empty>/);
});
