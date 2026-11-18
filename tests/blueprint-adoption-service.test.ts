import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Blueprint } from "@molis-ai/molis-work-contracts/platform/blueprints";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import type { SettingsValues, SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { blueprintActions as a } from "@molis-ai/molis-work-contracts/services/blueprints";
import { serveTestHost } from "./fixtures/test-home.js";

const title = { literal: "Weekly review" };
const body: Blueprint = {
  title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
  parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key: "projects.runtime", value: "prologue" } },
    { part_id: "note", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
  steps: [{ step_id: "review", title, part_ids: ["engine", "note"] }],
  example_task: { title, input: title, step_ids: ["review"], result: { part_id: "note", location: title } },
};

async function open(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home });
  const web = await serveTestHost(null, { home, host });
  return { host, web, close: async () => { await web.close(); await host.close(); } };
}

test("ONB-22/28/30: preview, adopt, reopen and undo through the Host preserve the real runtime setting and later edits", async () => {
  const home = await mkdtemp(join(tmpdir(), "blueprint-host-"));
  let running = await open(home);
  try {
    const project = await running.web.createProject("Weekly"), other = await running.web.createProject("Other");
    const inProject = async (ref = project.reference) => {
      // Exercise the same guarded caller as the person's settings page, including plugin authority.
      const caller = await running.host.localPersonContext(ref);
      return bindActionClient(running.host.actionClient(ref), () => caller);
    };
    let user = await inProject();
    await running.web.web.get("/projects/" + project.project_id + "/api/project-settings/runtime");
    const { draft } = await user.invoke(a.draftSave, { blueprint: body, expected_revision: null });
    assert.deepEqual((await user.invoke(a.draftRead, { draft_id: draft.source.draft_id })).draft, draft);
    assert.deepEqual((await user.invoke(a.library, {})).drafts, [{ title, source: draft.source }]);
    assert.deepEqual((await (await inProject(other.reference)).invoke(a.library, {})).drafts, []);
    await assert.rejects((await inProject(other.reference)).invoke(a.draftRead, { draft_id: draft.source.draft_id }), { code: "actions.missing" });
    await assert.rejects(user.invoke(a.draftSave, { draft_id: draft.source.draft_id, expected_revision: draft.source.revision + 1, blueprint: body }), { code: "blueprints.step_conflict" });
    const preview = () => user.invoke(a.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["engine", "note"] });
    const first = await preview();
    assert.deepEqual(first.parts.map(p => p.decision), ["update", "skip"]);
    const owner = first.parts[0]!.candidates[0];
    assert.ok(owner?.kind === "owner" && owner.current.state === "present");
    assert.equal(owner.current.setting_source, "provider_default");
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
    const request = { preview_id: first.preview_id, part_ids: ["engine"], request_id: "apply-weekly" };
    const person = await running.host.localPersonContext(project.reference);
    await assert.rejects(running.host.actionClient(project.reference).invoke({ ...person, actor_id: "system.blueprints" }, a.apply, request), { code: "actions.forbidden" });
    assert.deepEqual((await user.invoke(a.library, { preview_id: first.preview_id })).adoptions, []);
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
    const receiptCount = () => {
      const db = new DatabaseSync(project.database_path, { readOnly: true });
      try { return db.prepare("SELECT count(*) AS n FROM project_runtime_setting_receipts").get()!.n; } finally { db.close(); }
    };
    const [saved, repeated] = await Promise.all([user.invoke(a.apply, request), user.invoke(a.apply, request)]);
    const located = await user.invoke(a.library, { adoption_id: saved.adoption_id });
    assert.deepEqual(located.adoptions[0]?.request, request);
    assert.deepEqual(located.preview, first);
    await assert.rejects((await inProject(other.reference)).invoke(a.library, { preview_id: first.preview_id }), { code: "actions.missing" });
    assert.equal(saved.adoption_id, repeated.adoption_id);
    assert.deepEqual(saved.steps.map(step => step.state), ["applied", "skipped"]);
    assert.equal(receiptCount(), 1);
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
    await running.close();
    running = await open(home);
    user = await inProject();
    assert.equal((await user.invoke(a.apply, request)).adoption_id, saved.adoption_id);
    assert.equal(receiptCount(), 1, "the same request on a new Host does not write again");
    await assert.rejects(user.invoke(a.apply, { ...request, part_ids: ["note"] }), { code: "blueprints.step_conflict" });
    const reverted = await user.invoke(a.revert, { adoption_id: saved.adoption_id, request_id: "undo-first" });
    assert.equal(reverted.undo.steps[0]?.state, "restored");
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null, "undo restores inheritance");
    assert.equal(receiptCount(), 2);
    const second = await preview();
    const adopted = await user.invoke(a.apply, { ...request, preview_id: second.preview_id, request_id: "second" });
    await user.invoke(projectSettingsCapabilities.selectRuntime, ["another"]);
    const read = await user.invoke(a.read, { adoption_id: adopted.adoption_id });
    assert.ok(read.apply_steps[0]?.state === "applied" && read.apply_steps[0].current === "changed");
    const removed = await user.invoke(a.remove, { adoption_id: adopted.adoption_id, request_id: "remove" });
    assert.deepEqual(removed.undo.steps[0], { part_id: "engine", state: "skipped", reason: "revision_changed" });
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "another");
  } finally { await running.close(); await rm(home, { recursive: true, force: true }); }
});

test("ONB-22/29: a new project starts with inherited settings and resumes using its own grants and stable catalog identity", async () => {
  const home = await mkdtemp(join(tmpdir(), "blueprint-new-project-"));
  const running = await open(home);
  try {
    const origin = await running.web.createProject("Existing");
    const person = await running.host.localPersonContext(origin.reference);
    const from = bindActionClient(running.host.actionClient(origin.reference), () => person);
    await from.invoke(projectSettingsCapabilities.selectRuntime, ["unavailable-in-existing-project"]);
    const { draft } = await from.invoke(a.draftSave, { blueprint: body, expected_revision: null });
    const preview = await from.invoke(a.preview, { source: draft.source, target: { kind: "new_project", display_name: "Weekly" }, part_ids: ["engine"] });
    assert.equal(preview.parts[0]!.decision, "update", "new projects use provider defaults independent of the origin project");
    const request = { preview_id: preview.preview_id, part_ids: ["engine"], request_id: "new-scene" };
    const first = await from.invoke(a.apply, request);
    assert.equal(first.steps[0]?.state, "not_started");
    assert.ok(first.target.kind === "project");
    const id = first.target.project_id;
    assert.deepEqual((await from.invoke(a.apply, request)).target, first.target);
    await assert.rejects(from.invoke(a.revert, { adoption_id: first.adoption_id, request_id: "wrong-project" }), { code: "actions.scope_mismatch" });
    const managed = await running.host.ensureWebCatalog(home, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: home }, catalog => {
      assert.equal(catalog.listProjects().filter(row => row.display_name === "Weekly").length, 1); return catalog.getProject(id);
    });
    const reference = molisWorkHostProjectReference({ projectId: id, databasePath: managed.database_path });
    const targetCaller = await running.host.localPersonContext(reference), inside = bindActionClient(running.host.actionClient(reference), () => targetCaller);
    assert.deepEqual((await inside.invoke(a.library, {})).adoptions[0]?.request, request);
    assert.equal((await inside.invoke(a.apply, request)).steps[0]?.state, "applied");
    assert.equal(await inside.invoke(projectSettingsCapabilities.runtime, []), "prologue");
    assert.equal(await from.invoke(projectSettingsCapabilities.runtime, []), "unavailable-in-existing-project");
  } finally { await running.close(); await rm(home, { recursive: true, force: true }); }
});

test("ONB-30: removing the original scene retains a setting that a second scene reused in the same project", async () => {
  const home = await mkdtemp(join(tmpdir(), "blueprint-shared-"));
  const running = await open(home);
  try {
    const project = await running.web.createProject("Shared work");
    const person = await running.host.localPersonContext(project.reference);
    const user = bindActionClient(running.host.actionClient(project.reference), () => person);
    const adopt = async (name: string) => {
      const { draft } = await user.invoke(a.draftSave, { expected_revision: null, blueprint: { ...body, title: { literal: name } } });
      const { preview_id } = await user.invoke(a.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["engine"] });
      return user.invoke(a.apply, { preview_id, part_ids: ["engine"], request_id: name });
    };
    const first = await adopt("Writing"), second = await adopt("Editing");
    assert.deepEqual(second.steps[0], { part_id: "engine", state: "applied", outcome: "reused" });
    const removed = await user.invoke(a.remove, { adoption_id: first.adoption_id, request_id: "remove-writing" });
    assert.deepEqual(removed.undo.steps[0], { part_id: "engine", state: "skipped", reason: "shared" });
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
    assert.deepEqual((await user.invoke(a.read, { adoption_id: second.adoption_id })).apply_steps, second.steps);
    const detached = await user.invoke(a.remove, { adoption_id: second.adoption_id, request_id: "remove-editing" });
    assert.equal(detached.undo.steps[0]?.state, "detached", "a scene which only reused a value cannot claim the original write");
    assert.deepEqual((await user.invoke(a.remove, { adoption_id: first.adoption_id, request_id: "remove-writing" })).undo, removed.undo);
    assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
  } finally { await running.close(); await rm(home, { recursive: true, force: true }); }
});

test("SPC-05/ONB-29: cancel after the owner commits, reopen, and reconcile the original receipt without overwriting a later choice", async () => {
  const home = await mkdtemp(join(tmpdir(), "blueprint-resume-"));
  let running = await open(home);
  try {
    const project = await running.web.createProject("Review");
    const person = await running.host.localPersonContext(project.reference);
    const client = running.host.actionClient(project.reference);
    const user = bindActionClient(client, () => person);
    const { draft } = await user.invoke(a.draftSave, { blueprint: body, expected_revision: null });
    const { preview_id } = await user.invoke(a.preview, { source: draft.source, target: { kind: "current_project" }, part_ids: ["engine"] });
    const request = { preview_id, part_ids: ["engine"], request_id: "apply-before-close" };
    const db = new DatabaseSync(project.database_path, { readOnly: true });
    try {
      const committed = db.prepare("SELECT count(*) AS n FROM project_runtime_setting_receipts");
      const stop = new AbortController();
      const original = person.assert_authority_current;
      const interrupted = bindActionClient(client, () => ({
        ...person, signal: stop.signal, assert_authority_current(ref, permissions) {
          original?.(ref, permissions);
          if (committed.get()!.n === 1) stop.abort(new ActionError("actions.cancelled", "关闭了采用页面"));
          stop.signal.throwIfAborted();
        },
      }));
      await assert.rejects(interrupted.invoke(a.apply, request), { code: "actions.cancelled" });
      assert.equal(committed.get()!.n, 1, "owner committed even though the coordinator has not acknowledged it");
      assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
      await user.invoke(projectSettingsCapabilities.selectRuntime, ["another"]);
    } finally { db.close(); }
    await running.close();
    running = await open(home);
    const personAfter = await running.host.localPersonContext(project.reference);
    const resumed = bindActionClient(running.host.actionClient(project.reference), () => personAfter);
    const recovered = await resumed.invoke(a.apply, request);
    const step = recovered.steps[0];
    assert.ok(step?.state === "applied" && "receipt" in step && step.current === "changed");
    const dbAfter = new DatabaseSync(project.database_path, { readOnly: true });
    try {
      const receipts = dbAfter.prepare("SELECT request_id, result_json FROM project_runtime_setting_receipts").all();
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0]!.request_id, recovered.adoption_id + ":engine");
      assert.equal(step.receipt.revision, JSON.parse(String(receipts[0]!.result_json)).values[0].revision);
    } finally { dbAfter.close(); }
    assert.equal(await resumed.invoke(projectSettingsCapabilities.runtime, []), "another");
  } finally { await running.close(); await rm(home, { recursive: true, force: true }); }
});

test("ONB-28/SPC-04: the Assistant keeps the setting and original receipt together through rollback and a Home restart", async () => {
  const home = await mkdtemp(join(tmpdir(), "blueprint-assistant-"));
  let running = await open(home);
  try {
    const key = "assistant.lookback", provider_id = "system.assistant-settings";
    async function invoke(action: "read" | "write", input: SettingsWriteInput | { keys: string[] }) {
      const who = await running.host.localPersonContext();
      return await running.host.homeActionClient().invoke(who, { capability_id: "assistant.preferences." + action, version: 1, provider_id }, input) as SettingsValues;
    }
    const original = (await invoke("read", { keys: [key] })).values[0]!;
    const request: SettingsWriteInput = { key, layer: "personal", request_id: "resume-assistant", expected_revision: original.revision, change: { set: { count: 3, unit: "days" } } };
    const db = new DatabaseSync(homeSqlitePath(home, "assistant"));
    try {
      db.exec("CREATE TRIGGER interrupt_receipt BEFORE INSERT ON assistant_settings WHEN NEW.key LIKE 'preferences/receipt/%' BEGIN SELECT RAISE(ABORT,'interrupted'); END");
      await assert.rejects(invoke("write", request));
      assert.deepEqual((await invoke("read", { keys: [key] })).values[0], original);
      assert.equal(db.prepare("SELECT count(*) AS n FROM assistant_settings WHERE key LIKE 'preferences/receipt/%'").get()!.n, 0);
      db.exec("DROP TRIGGER interrupt_receipt");
    } finally { db.close(); }
    const accepted = await invoke("write", request);
    await invoke("write", { ...request, expected_revision: accepted.values[0]!.revision, request_id: "shorter",
      change: { set: { count: 4, unit: "hours" } } });
    await running.close(); running = await open(home);
    const later = (await invoke("read", { keys: [key] })).values[0]!;
    assert.deepEqual(later.state === "ok" && later.value, { count: 4, unit: "hours" });
    assert.deepEqual(await invoke("write", request), accepted);
    assert.deepEqual((await invoke("read", { keys: [key] })).values[0], later);
    await assert.rejects(invoke("write", { ...request, change: { inherit: true } }), { code: "assistant.setting_conflict" });
  } finally { await running.close(); await rm(home, { recursive: true, force: true }); }
});
