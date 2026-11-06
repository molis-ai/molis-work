import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { assertMaterialRef } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { actionEffect, ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { materialRecentActions, PROJECT_WORKSPACE_PROVIDER_ID, projectDirectoryActions, projectDirectoryErrors, projectWorkspaceActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { FILE_PATH_MAX_SEGMENTS, FILE_SEGMENT_MAX_LENGTH, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { MATERIAL_RECENT_KEEP, MATERIAL_RECENT_RECORD_MAX, MATERIAL_REF_LIMITS, type MaterialOrigin, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";

// specs/shared-sources-and-surfaces §2, §2.1, §3, §7 (C-1): the contract alone. Nothing registers these actions in the product yet, so the
// provider here is a stand-in that answers what each test gives it; the refusals are the schema's and the SDK's own, and the behaviour behind
// the actions (SSC-02, SSC-04, SSC-05, the rest of SSC-03, SSC-12 and SSC-16) waits for the implementation.
const declared = [...Object.values(projectDirectoryActions), ...Object.values(materialRecentActions)] as ActionDefinition[];
const context = (audience: ActionCallContext["audience"], permissions: string[] = []): ActionCallContext => ({ actor_id: `${audience}:someone`, project_id: "p", audience, permissions });
const person = context("user", ["projects:settings"]);

function serving(answer: (capabilityId: string) => unknown = () => ({})) {
  const service = new ActionService();
  const calls: string[] = [];
  service.registerProvider({ provider: { provider_id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目工作目录", kind: "system", project_id: "p" }, definitions: declared,
    handlers: declared.map(definition => ({ capability_id: definition.capability_id, version: definition.version, handle: () => { calls.push(definition.capability_id); return answer(definition.capability_id); } })) });
  return { service, calls };
}
const reference = (definition: unknown) => { const { capability_id, version } = definition as ActionDefinition; return { capability_id, version }; };
const code = (expected: string) => (error: unknown) => (error as ActionError).code === expected;
const invalid = code("actions.input_invalid");

const currentFile: MaterialRef = { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: "ws1:docs/plan.md" }, pin: { mode: "current", read_revision: "sha:1" } };
const fixedArtifact: MaterialRef = { subject: { kind: "artifact", id: "a1" }, pin: { mode: "fixed", version: { artifact_id: "a1", version: 3 } } };
const selection: MaterialRef = { subject: { kind: "pages.page", id: "page-1" }, pin: { mode: "snapshot", version: { artifact_id: "p9", version: 1 } }, range: { anchor: "intro", line: 4, length: 2, page: 1 } };

/** Malformed in JSON shape: the schema and the SDK refuse each of these. */
const malformed: ReadonlyArray<readonly [string, unknown]> = [
  ["not an object", "ws1:docs/plan.md"],
  ["an array", [currentFile]],
  ["no subject", { pin: currentFile.pin }],
  ["no pin", { subject: currentFile.subject }],
  ["a claimed owner", { ...currentFile, owner: { kind: "plugin", id: "someone-else" } }],
  ["a claimed project", { ...currentFile, project_id: "other" }],
  ["a claimed plugin inside the subject", { ...currentFile, subject: { ...currentFile.subject, plugin_id: "someone-else" } }],
  ["an empty subject id", { ...currentFile, subject: { kind: "artifact", id: "" } }],
  ["a subject id over the limit", { ...currentFile, subject: { kind: "artifact", id: "x".repeat(MATERIAL_REF_LIMITS.subject_id + 1) } }],
  ["an unknown pin mode", { ...currentFile, pin: { mode: "latest", read_revision: "sha:1" } }],
  ["a current pin without a revision", { ...currentFile, pin: { mode: "current" } }],
  ["a current pin carrying a version", { ...currentFile, pin: { mode: "current", read_revision: "sha:1", version: { artifact_id: "a", version: 1 } } }],
  ["a fixed pin carrying a revision", { ...fixedArtifact, pin: { ...fixedArtifact.pin, read_revision: "sha:1" } }],
  ["a fixed pin without a version", { ...fixedArtifact, pin: { mode: "fixed" } }],
  ["a snapshot pin with version zero", { ...selection, pin: { mode: "snapshot", version: { artifact_id: "p9", version: 0 } } }],
  ["a version with an extra field", { ...selection, pin: { mode: "snapshot", version: { artifact_id: "p9", version: 1, title: "x" } } }],
  ["an empty range", { ...selection, range: {} }],
  ["a range with an unknown key", { ...selection, range: { offset: 1 } }],
  ["a line that is not 1-based", { ...selection, range: { line: 0 } }],
  ["a fractional page", { ...selection, range: { page: 1.5 } }],
];

test("SSC-01: a local file, an imported file and a plugin object share one reference, and the three pins are told apart", async () => {
  for (const ref of [currentFile, fixedArtifact, selection]) assert.doesNotThrow(() => assertMaterialRef(ref));
  assert.deepEqual([currentFile, fixedArtifact, selection].map(ref => ref.pin.mode), ["current", "fixed", "snapshot"]);
  const { service, calls } = serving();
  await service.invoke(context("plugin"), reference(materialRecentActions.record), { refs: [currentFile, fixedArtifact, selection] });
  assert.deepEqual(calls, ["materials.recent.record"]);
});

test("SSC-01: assertMaterialRef and the action's schema refuse the same malformed references, and the provider never sees them", async () => {
  const { service, calls } = serving();
  for (const [what, value] of malformed) {
    assert.throws(() => assertMaterialRef(value), invalid, `SDK accepted ${what}`);
    await assert.rejects(service.invoke(person, reference(materialRecentActions.record), { refs: [value] }), invalid, `schema accepted ${what}`);
  }
  assert.deepEqual(calls, []);
});

test("SSC-01: a workspace file id has to name a path inside its folder, which the SDK refuses and the JSON shape cannot see", () => {
  for (const id of ["no-separator", ":docs/plan.md", "ws1:", "ws1:/etc/passwd", "ws1:../secret", "ws1:docs/../../secret", "ws1:docs\\plan.md", "ws1:docs/\u0000plan.md"]) {
    assert.throws(() => assertMaterialRef({ ...currentFile, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id } }), invalid, JSON.stringify(id));
  }
  // The limit is the longest id a real folder and path can make: exactly that fits, one more does not.
  const longest = `${"w".repeat(200)}:${Array.from({ length: FILE_PATH_MAX_SEGMENTS }, () => "s".repeat(FILE_SEGMENT_MAX_LENGTH)).join("/")}`;
  assert.equal(longest.length, MATERIAL_REF_LIMITS.subject_id);
  assert.doesNotThrow(() => assertMaterialRef({ ...currentFile, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: longest } }));
  // The same id under a plugin's own kind is that plugin's to read: it is an opaque string, not a path.
  assert.doesNotThrow(() => assertMaterialRef({ ...currentFile, subject: { kind: "pages.page", id: "../not-a-path" } }));
});

test("SSC-01: a refusal names the part that is wrong and does not repeat the value", () => {
  const outsideFolder = "ws1:../../private/hidden-name.md";
  assert.throws(() => assertMaterialRef({ ...currentFile, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: outsideFolder } }),
    (error: Error) => error instanceof ActionError && error.message.includes("subject.id") && !error.message.includes("hidden-name"));
});

test("the declarations are complete, version 1, and the ones the design names", () => {
  assert.deepEqual(inspectActionDeclarations(declared, undefined), []);
  assert.deepEqual(declared.map(definition => `${definition.capability_id}@${definition.version}:${definition.operation}`), [
    "projects.directories.get@1:query",
    "projects.directories.add_input@1:command",
    "projects.directories.remove_input@1:command",
    "projects.directories.set_output@1:command",
    "projects.directories.repair@1:command",
    "materials.recent@1:query",
    "materials.recent.record@1:command",
  ]);
  assert.equal(PROJECT_WORKSPACE_PROVIDER_ID, "system.project-workspaces");
  // The Host registers `Object.values(projectWorkspaceActions)` with a handler each: a declaration only stays out of that list until it has one.
  const registered = new Set(Object.values(projectWorkspaceActions).map(definition => definition.capability_id));
  for (const definition of declared) assert.ok(!registered.has(definition.capability_id), definition.capability_id);
});

test("who may call each: reading directories is open to four audiences, changing them only to the person, recent materials to the person and plugins", () => {
  const { service } = serving();
  const offered = (caller: ActionCallContext) => service.discover(caller).map(view => view.capability_id).sort();
  assert.deepEqual(offered(person), declared.map(definition => definition.capability_id).sort());
  assert.deepEqual(offered(context("plugin")), ["materials.recent", "materials.recent.record", "projects.directories.get"]);
  assert.deepEqual(offered(context("agent")), ["projects.directories.get"]);
  assert.deepEqual(offered(context("mcp")), ["projects.directories.get"]);
});

test("a plugin cannot change a project's directories, whatever it sends", async () => {
  const { service, calls } = serving();
  for (const definition of [projectDirectoryActions.addInput, projectDirectoryActions.removeInput, projectDirectoryActions.setOutput, projectDirectoryActions.repair]) {
    await assert.rejects(service.invoke(context("plugin", ["projects:settings"]), reference(definition), { workspace_id: "w", expected_revision: "r" }));
  }
  assert.deepEqual(calls, []);
});

test("WMD-02: removing an input leaves the folder on disk, so its id does not make it irreversible", () => {
  const { capability_id, action } = projectDirectoryActions.removeInput;
  assert.equal(actionEffect(action, capability_id), "write");
});

test("SSC-03: every change to the directories commits from a revision; a call without one is refused", async () => {
  const { service, calls } = serving(() => ({ project_id: "p", directories: [], revision: "r2" }));
  const ask = (definition: unknown, input: unknown) => service.invoke(person, reference(definition), input);
  await assert.rejects(ask(projectDirectoryActions.addInput, { workspace_path: "/w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.removeInput, { workspace_id: "w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.setOutput, { workspace_id: "w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.repair, { workspace_id: "w", workspace_path: "/w" }), invalid);
  assert.deepEqual(calls, []);
  await ask(projectDirectoryActions.addInput, { workspace_path: "/w", expected_revision: "r1" });
  await ask(projectDirectoryActions.removeInput, { workspace_id: "w", expected_revision: "r1" });
  await ask(projectDirectoryActions.repair, { workspace_id: "w", workspace_path: "/w", expected_revision: "r1" });
  assert.equal(calls.length, 3);
});

test("SSC-03: an output is set from one folder, named by id or by path, never both or neither", async () => {
  const { service, calls } = serving(() => ({ project_id: "p", directories: [], revision: "r2" }));
  const set = (input: unknown) => service.invoke(person, reference(projectDirectoryActions.setOutput), input);
  await set({ workspace_id: "w", expected_revision: "r1" });
  await set({ workspace_path: "/w", expected_revision: "r1" });
  assert.equal(calls.length, 2);
  await assert.rejects(set({ workspace_id: "w", workspace_path: "/w", expected_revision: "r1" }), invalid);
  await assert.rejects(set({ expected_revision: "r1" }), invalid);
  assert.equal(calls.length, 2);
});

test("trusted identity does not come from input: the project, the actor and the confirmation are refused as fields", async () => {
  const { service, calls } = serving();
  await assert.rejects(service.invoke(person, reference(projectDirectoryActions.get), { project_id: "other" }), invalid);
  await assert.rejects(service.invoke(person, reference(projectDirectoryActions.addInput), { workspace_path: "/w", expected_revision: "r", user_confirmed: true }), invalid);
  await assert.rejects(service.invoke(person, reference(materialRecentActions.read), { actor_id: "someone-else" }), invalid);
  await assert.rejects(service.invoke(person, reference(materialRecentActions.record), { refs: [currentFile], actor_id: "someone-else" }), invalid);
  assert.deepEqual(calls, []);
});

test("SSC-03: a directory has at least one role, none repeated, and a known state", async () => {
  const directory = { workspace_id: "w", canonical_path: "/w", realpath_verified: true, display_name: "w" };
  const answer = (directories: unknown[]) => serving(() => ({ project_id: "p", directories, revision: "r" })).service.invoke(person, reference(projectDirectoryActions.get), {});
  await answer([{ ...directory, roles: ["input", "output"], state: "ok" }]);
  await assert.rejects(answer([{ ...directory, roles: [], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["input", "input"], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["reference"], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["output"], state: "gone" }]));
  await assert.rejects(answer([{ ...directory, roles: ["output"], state: "ok", is_default: true }]));
});

test("SSC-12: one record call takes 1 to 10 references, and its answer cannot say which were kept", async () => {
  const { service, calls } = serving();
  const record = (refs: unknown[]) => service.invoke(person, reference(materialRecentActions.record), { refs });
  await assert.rejects(record([]), invalid);
  await assert.rejects(record(Array.from({ length: MATERIAL_RECENT_RECORD_MAX + 1 }, () => currentFile)), invalid);
  assert.deepEqual(calls, []);
  assert.deepEqual(await record(Array.from({ length: MATERIAL_RECENT_RECORD_MAX }, () => currentFile)), {});
  // A provider that tried to report a count would hand a caller a probe for objects it cannot read.
  const counting = serving(() => ({ recorded: 1 })).service;
  await assert.rejects(counting.invoke(person, reference(materialRecentActions.record), { refs: [currentFile] }));
});

test("SSC-12: recent materials come back with an origin read just now, at most 20 of them", async () => {
  const origin: MaterialOrigin = { source: "directory", owner: { kind: "system", id: PROJECT_WORKSPACE_PROVIDER_ID, title: "项目工作目录" },
    directory: { workspace_id: "ws1", display_name: "docs", roles: ["input"] }, state: "ok" };
  const read = (items: unknown[]) => serving(() => ({ items })).service.invoke(person, reference(materialRecentActions.read), {});
  const item = { ref: currentFile, origin };
  assert.deepEqual(await read([item]), { items: [item] });
  await read(Array.from({ length: MATERIAL_RECENT_KEEP }, () => item));
  await assert.rejects(read(Array.from({ length: MATERIAL_RECENT_KEEP + 1 }, () => item)));
  await assert.rejects(read([{ ref: currentFile }]), "the origin is part of the answer");
  // SSC-02's wording of a lost material rests on these states.
  await read([{ ref: fixedArtifact, origin: { source: "object", owner: origin.owner, state: "forbidden" } }]);
  await assert.rejects(read([{ ref: fixedArtifact, origin: { source: "object", owner: origin.owner, state: "cached" } }]));
  await assert.rejects(read([{ ref: currentFile, origin: { source: "directory", owner: origin.owner, state: "ok" } }]), "a directory origin says which directory");
  await assert.rejects(read([{ ref: fixedArtifact, origin: { ...origin, source: "object" } }]), "only a directory origin carries one");
});

test("the three refusals are declared codes of one error model, not error classes", () => {
  const cases = [
    [projectDirectoryErrors.directory_missing("x"), "projects.directory_missing", "not_found"],
    [projectDirectoryErrors.directory_revoked("x"), "projects.directory_revoked", "forbidden"],
    [projectDirectoryErrors.directory_duplicate("x"), "projects.directory_duplicate", "conflict"],
  ] as const;
  for (const [error, expectedCode, kind] of cases) {
    assert.equal(error.constructor, ActionError);
    assert.equal(error.code, expectedCode);
    assert.equal(error.kind, kind);
  }
});
