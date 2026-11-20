import assert from "node:assert/strict";
import { get as httpGet } from "node:http";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { automationRecommendationActions, type AutomationPreferences, type AutomationReport } from "@molis-ai/molis-work-contracts/services/automation-recommender";
import { newPublisher } from "./fixtures/sandbox-package.js";
import { attachAutomationWorkspace } from "./fixtures/automation-workspace.js";
import { signedContentPackage } from "./fixtures/content-package.js";
import { openTestHome, type TestHome, type TestProject } from "./fixtures/test-home.js";

const pathFor = (project: TestProject) => `/projects/${project.project_id}/api/automation/recommendations`;
const preferencesPath = (home: string) => join(home, "config", "automation-recommendations.json");

function scan(fixture: TestHome, project: TestProject): Promise<AutomationReport> {
  return new Promise((resolve, reject) => {
    httpGet(fixture.origin + pathFor(project), { headers: { "x-molis-work-control-token": fixture.controlToken } }, response => {
      response.setEncoding("utf8");
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.once("error", reject);
      response.once("end", () => {
        try {
          if (response.statusCode !== 200) throw Object.assign(new Error(body), { status: response.statusCode });
          resolve(JSON.parse(body) as AutomationReport);
        }
        catch (error) { reject(error); }
      });
    }).once("error", reject);
  });
}

// AUT-03, AUT-04 and AUT-05 are proven by the gap, de-duplication and availability cases in this file.
test("AUT-01–05: cold project uses its authorized folder, a bounded parser and a read-only action", { timeout: 40_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Report project");
  const own = join(fixture.home, "own"), unrelated = join(fixture.home, "other");
  await mkdir(join(own, ".claude"), { recursive: true });
  await mkdir(unrelated);
  const packageText = JSON.stringify({ scripts: { test: "never execute this script" }, dependencies: { react: "*", "@notionhq/client": "*" } });
  await writeFile(join(own, "package.json"), packageText);
  await writeFile(join(own, ".mcp.json"), JSON.stringify({ mcpServers: { notion: { env: { SECRET: "do-not-return-this-value" } } } }));
  await writeFile(join(own, ".claude", "commands.json"), "{broken");
  await writeFile(join(own, ".claude", "private-entry-name"), "Never expose this file name");
  await writeFile(join(unrelated, "go.mod"), "module elsewhere");
  await symlink(join(unrelated, "go.mod"), join(own, ".claude", "settings.json"));
  await attachAutomationWorkspace(fixture, project, own);
  await attachAutomationWorkspace(fixture, project, unrelated, "binding:script");
  await assert.rejects(fixture.web.get(pathFor(project)), { code: "actions.forbidden" });
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user" as const, permissions: [] };
  await assert.rejects(fixture.host.projectCatalogActions.passiveClient(project.reference).invoke(caller, automationRecommendationActions.scan, {}), { code: "actions.forbidden" });
  const before = fixture.host.projects().map(row => row.project_id);
  const report = await scan(fixture, project);
  assert.deepEqual(fixture.host.projects().map(row => row.project_id), before, "scanning never opens the project runtime");
  assert.deepEqual(report.groups.map(group => group.category), ["hooks", "skills", "connections", "roles", "commands"]);
  assert.ok(report.evidence.some(row => row.path === "package.json" && row.signals.includes("tests") && row.signals.includes("frontend")));
  assert.ok(report.evidence.some(row => row.path === ".mcp.json"));
  assert.ok(!report.evidence.some(row => row.path === "go.mod"));
  assert.doesNotMatch(JSON.stringify(report), /do-not-return-this-value|never execute this script|private-entry-name/);
  assert.ok(report.gaps.some(gap => gap.code === "unreadable" && gap.path === ".claude/commands.json"));
  assert.ok(report.groups.every(group => group.suggestions.length <= 2));
  await assert.rejects(access(preferencesPath(fixture.home)), { code: "ENOENT" });
  assert.equal(await readFile(join(own, "package.json"), "utf8"), packageText);

  // Onboarding binds the chosen workspace via set_output (without adding an input role); recommendations must still scan it.
  const onboarded = await fixture.createProject("Onboarding output workspace project");
  const onboardFolder = join(fixture.home, "onboard-output");
  await mkdir(onboardFolder);
  await writeFile(join(onboardFolder, "package.json"), JSON.stringify({ devDependencies: { vitest: "1.0.0" } }));
  await fixture.host.ensureWebCatalog(fixture.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: fixture.home }, owner => {
    const beforeDirs = owner.projectDirectories(onboarded.project_id);
    owner.changeDirectories({ project_id: onboarded.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, expected_revision: beforeDirs.revision,
      change: { kind: "set_output", target: { workspace_path: onboardFolder } } });
  });
  const onboardReport = await scan(fixture, onboarded);
  assert.ok(!onboardReport.gaps.some(gap => gap.code === "no-workspace"));
  assert.ok(onboardReport.evidence.some(row => row.path === "package.json" && row.signals.includes("tests")));
});

test("AUT-01/05: a directory removed during its original read cannot produce or save a report", { timeout: 40_000 }, async t => {
  const waiting = Promise.withResolvers<void>(), released = Promise.withResolvers<void>();
  t.after(() => released.resolve());
  let held = false;
  const fixture = await openTestHome(t, { host: { actionAvailability: async (_caller, view) => {
    if (!held && view.capability_id === "projects.workspace.files.read") {
      held = true; waiting.resolve(); await released.promise;
    }
    return { available: true };
  } } });
  const project = await fixture.createProject("Directory grant changes", ["pages"]);
  const folder = join(fixture.home, "workspace-to-remove");
  await mkdir(folder); await writeFile(join(folder, "package.json"), '{"dependencies":{"react":"1.0.0"}}');
  await attachAutomationWorkspace(fixture, project, folder);
  const pending = scan(fixture, project);
  const refused = assert.rejects(pending, { status: 409 });
  try {
    await waiting.promise;
    await fixture.host.ensureWebCatalog(fixture.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: fixture.home }, owner => {
      const { directories, revision } = owner.projectDirectories(project.project_id);
      const input = directories.find(row => row.roles.includes("input"));
      assert.ok(input);
      owner.changeDirectories({ project_id: project.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, expected_revision: revision,
        change: { kind: "remove_input", workspace_id: input.workspace_id } });
    });
  } finally { released.resolve(); }
  await refused;
  const final = await scan(fixture, project);
  assert.equal(final.evidence.length, 0);
  assert.ok(final.gaps.some(row => row.code === "no-workspace"));
  const persisted = await fixture.web.get<{ documents: unknown[] }>(`/projects/${project.project_id}/api/plugins/io.molis.work.pages/pages`);
  assert.deepEqual(persisted.documents, []);
});

// AUT-02 through AUT-07 are cited individually in this file; the range in the name is only a summary.
// AUT-02, AUT-03, AUT-04, AUT-05, AUT-06 and AUT-07 are cited individually here; the range is a summary.
test("AUT-02–07: only actual Skill matches, setting state stays with the Skill owner, and Pages saves once", { timeout: 70_000 }, async t => {
  const fixture = await openTestHome(t);
  const project = await fixture.createProject("Recommendations with a signed Skill", ["pages"]);
  const other = await fixture.createProject("Separate project", ["pages"]);
  const base = `/projects/${project.project_id}`;
  const workspace = join(fixture.home, "workspace");
  await mkdir(join(workspace, ".claude", "skills"), { recursive: true });
  await mkdir(join(workspace, ".claude", "skills", "coverage-tests"));
  await writeFile(join(workspace, "package.json"), JSON.stringify({ scripts: { test: "local fixture" }, devDependencies: { vitest: "*" } }));
  await attachAutomationWorkspace(fixture, project, workspace);
  const bundle = signedContentPackage(newPublisher(), { skills: [{ id: "coverage-tests" }, { id: "review-tests" }] });
  const preview = await fixture.web.post<{ preview_id: string }>(base + "/api/plugin-trust/install/preview", { bundle });
  await fixture.web.post(base + "/api/plugin-trust/install/confirm", { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
  const first = await scan(fixture, project);
  const suggestions = first.groups.find(group => group.category === "skills")?.suggestions ?? [];
  assert.deepEqual(suggestions.map(row => row.title), ["review-tests"], "the installed Skill already named in .claude is omitted");
  const suggestion = suggestions[0]!;
  assert.equal(suggestion.next.kind, "skill");
  assert.ok(suggestion.evidence.some(row => row.path === "package.json"));
  assert.ok(suggestion.effect && suggestion.requirements.length && suggestion.risk);
  assert.equal(first.preferences?.revision, "absent");
  const save = (at: TestProject) => fixture.web.post<{ document_id: string; open: { surface: string; id: string; title: string } }>(pathFor(at) + "/save", { save_token: first.save_token });
  await assert.rejects(save(other), { status: 409, code: "actions.conflict" });
  const saved = await save(project);
  assert.equal((await save(project)).document_id, saved.document_id);
  const persisted = await fixture.web.get<{ documents: Array<{ id: string }> }>(base + "/api/plugins/io.molis.work.pages/pages");
  assert.deepEqual(persisted.documents.map(row => row.id), [saved.document_id]);
  // The report went to the project's `documents` keeper by its declaration, and opens where that keeper says (here Pages).
  assert.deepEqual([saved.open.surface, saved.open.id], ["pages", saved.document_id]);
  const bare = await fixture.createProject("No document keeper", []);
  await fixture.host.ensureWebCatalog(fixture.home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: fixture.home },
    owner => owner.removeProjectPlugin({ project_id: bare.project_id, plugin_id: "pages", actor_id: LOCAL_PERSON_ACTOR_ID }));
  const bareReport = await scan(fixture, bare);
  await assert.rejects(fixture.web.post(pathFor(bare) + "/save", { save_token: bareReport.save_token }), { code: "actions.service_unavailable" },
    "with no plugin in the project that keeps a handed-over text, nothing names one to save to");
  const set = (choice: "ignored" | "show", expected_revision: string) => fixture.web.post<AutomationPreferences>(pathFor(project) + "/preference",
    { save_token: first.save_token, suggestion_id: suggestion.id, choice, expected_revision });
  const hidden = await set("ignored", "absent");
  await assert.rejects(set("show", "absent"), { status: 409, code: "actions.conflict" });
  assert.deepEqual((await scan(fixture, project)).groups.find(group => group.category === "skills")?.suggestions, []);
  assert.equal((await scan(fixture, other)).preferences?.choices.length, 0);
  await set("show", hidden.revision);
  assert.equal((await scan(fixture, project)).groups.find(group => group.category === "skills")?.suggestions[0]?.id, suggestion.id);
  const raw = await readFile(preferencesPath(fixture.home), "utf8");
  assert.doesNotMatch(raw, /package.json|markdown|request_id/);
  await writeFile(preferencesPath(fixture.home), "{broken");
  const partial = await scan(fixture, project);
  assert.equal(partial.preferences, null);
  assert.ok(partial.gaps.some(gap => gap.code === "preferences-unavailable"));
  await assert.rejects(set("ignored", "absent"), { code: "actions.service_unavailable" });
  assert.equal(await readFile(preferencesPath(fixture.home), "utf8"), "{broken");
});
