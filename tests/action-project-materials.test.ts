import assert from "node:assert/strict";
import test from "node:test";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { assertMaterialRef } from "@molis-ai/molis-work-plugin-sdk/presentation";
import { actionEffect, ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { materialOriginActions, materialRecentActions, PROJECT_WORKSPACE_PROVIDER_ID, projectDirectoryActions, projectDirectoryErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { FILE_PATH_MAX_SEGMENTS, FILE_SEGMENT_MAX_LENGTH, WORKSPACE_FILE_SUBJECT_KIND } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { MATERIAL_ORIGINS_MAX, MATERIAL_RECENT_KEEP, MATERIAL_RECENT_RECORD_MAX, MATERIAL_REF_LIMITS, type MaterialOrigin, type MaterialRef } from "@molis-ai/molis-work-contracts/platform/project-materials";

// specs/shared-sources-and-surfaces §2, §2.1, §3, §7: the contract alone. The provider here is a stand-in that answers what each test gives it,
// so the refusals are the schema's and the SDK's own; the behaviour behind the actions is the Host's, tested where it registers them
// (tests/project-directories.test.ts, tests/security-invariants-material-origins.test.ts and the rest).
const declared = [...Object.values(projectDirectoryActions), ...Object.values(materialRecentActions), ...Object.values(materialOriginActions)] as ActionDefinition[];
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
const noDirectories = { project_id: "p", directories: [], source_links: [], revision: "r2" };

const currentFile: MaterialRef = { subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: "ws1:docs/plan.md" }, pin: { mode: "current", read_revision: "a".repeat(64) } };
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
  ["an anchor over the limit", { ...selection, range: { anchor: "x".repeat(MATERIAL_REF_LIMITS.anchor + 1) } }],
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
  // The folder id is one map_source can name: at most 200 characters, none of them a control character (SSC-27).
  for (const id of ["no-separator", ":docs/plan.md", "ws1:", "ws1:/etc/passwd", "ws1:../secret", "ws1:docs/../../secret", "ws1:docs\\plan.md", "ws1:docs/\u0000plan.md", `${"w".repeat(201)}:a.md`, "w\u0001s:a.md", "w\u007fs:a.md"]) {
    assert.throws(() => assertMaterialRef({ ...currentFile, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id } }), invalid, JSON.stringify(id));
  }
  // The limit is the longest id a real folder and path can make: exactly that fits, one more does not.
  const longest = `${"w".repeat(200)}:${Array.from({ length: FILE_PATH_MAX_SEGMENTS }, () => "s".repeat(FILE_SEGMENT_MAX_LENGTH)).join("/")}`;
  assert.equal(longest.length, MATERIAL_REF_LIMITS.subject_id);
  assert.doesNotThrow(() => assertMaterialRef({ ...currentFile, subject: { kind: WORKSPACE_FILE_SUBJECT_KIND, id: longest } }));
  // The same id under a plugin's own kind is that plugin's to read: it is an opaque string, not a path.
  assert.doesNotThrow(() => assertMaterialRef({ ...currentFile, subject: { kind: "pages.page", id: "../not-a-path" } }));
});

test("SSC-28: a local file's current pin carries its content's sha256 or its size; any other kind's revision stays its owner's", () => {
  const pinned = (kind: string, id: string, read_revision: string) => ({ subject: { kind, id }, pin: { mode: "current", read_revision } });
  for (const revision of ["a".repeat(64), "0123456789abcdef".repeat(4), "size:0", "size:12"]) assert.doesNotThrow(() => assertMaterialRef(pinned(WORKSPACE_FILE_SUBJECT_KIND, "ws1:a.md", revision)), revision);
  for (const revision of ["sha:1", "a".repeat(63), "a".repeat(65), "A".repeat(64), `sha256:${"a".repeat(64)}`, "size:", "size:-1", "size:1.5"]) {
    assert.throws(() => assertMaterialRef(pinned(WORKSPACE_FILE_SUBJECT_KIND, "ws1:a.md", revision)), (error: Error) => invalid(error) && error.message.includes("pin.read_revision"), revision);
  }
  assert.doesNotThrow(() => assertMaterialRef(pinned("pages.page", "page-1", "sha:1")));
});

test("SSC-01: an anchor is bounded as knowledge.read bounds it, so one that fits a reference can be read back", async () => {
  const readInput = knowledgeActions.read.action.input_schema as { properties: { anchor: { maxLength: number } } };
  assert.equal(MATERIAL_REF_LIMITS.anchor, readInput.properties.anchor.maxLength);
  const longest = { ...selection, range: { anchor: "x".repeat(MATERIAL_REF_LIMITS.anchor) } };
  assert.doesNotThrow(() => assertMaterialRef(longest));
  const { service, calls } = serving();
  await service.invoke(person, reference(materialRecentActions.record), { refs: [longest] });
  assert.deepEqual(calls, ["materials.recent.record"]);
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
    "projects.directories.map_source@1:command",
    "projects.directories.unmap_source@1:command",
    "materials.recent@1:query",
    "materials.recent.record@1:command",
    "materials.origins@1:query",
  ]);
  assert.equal(PROJECT_WORKSPACE_PROVIDER_ID, "system.project-workspaces");
});

test("who may call each: reading directories is open to five audiences, changing them only to the person, materials to the person and plugins", () => {
  const { service } = serving();
  const offered = (caller: ActionCallContext) => service.discover(caller).map(view => view.capability_id).sort();
  assert.deepEqual(offered(person), declared.map(definition => definition.capability_id).sort());
  assert.deepEqual(offered(context("plugin")), ["materials.origins", "materials.recent", "materials.recent.record", "projects.directories.get"]);
  // A workflow step reads the directories with `get`, which replaced projects.workspaces.list (2026-11-08); it changes nothing.
  for (const audience of ["agent", "mcp", "workflow"] as const) assert.deepEqual(offered(context(audience)), ["projects.directories.get"], audience);
});

test("SSC-30: materials.origins takes 1 to 20 references or subjects and answers each in order; agent, mcp and workflow are refused", async () => {
  const { service, calls } = serving(() => ({ items: [{ origin: null }] }));
  const ask = (caller: ActionCallContext, items: unknown[]) => service.invoke(caller, reference(materialOriginActions.read), { items });
  await assert.rejects(ask(person, []), invalid);
  await assert.rejects(ask(person, Array.from({ length: MATERIAL_ORIGINS_MAX + 1 }, () => ({ ref: currentFile }))), invalid, "21 is one too many");
  await assert.rejects(ask(person, [{ ref: currentFile, subject: currentFile.subject }]), invalid, "a reference or a subject, not both");
  await assert.rejects(ask(person, [{ subject: { ...currentFile.subject, plugin_id: "x" } }]), invalid);
  for (const audience of ["agent", "mcp", "workflow"] as const) await assert.rejects(ask(context(audience), [{ ref: currentFile }]), code("actions.forbidden"), audience);
  assert.deepEqual(calls, []);
  assert.deepEqual(await ask(context("plugin"), [{ ref: currentFile }]), { items: [{ origin: null }] });
  await ask(person, Array.from({ length: MATERIAL_ORIGINS_MAX }, () => ({ subject: fixedArtifact.subject })));
  assert.equal(calls.length, 2);
  // An answer longer than any question is refused at the gateway, so a provider cannot add origins nobody asked for.
  const padding = serving(() => ({ items: Array.from({ length: MATERIAL_ORIGINS_MAX + 1 }, () => ({ origin: null })) })).service;
  await assert.rejects(padding.invoke(person, reference(materialOriginActions.read), { items: [{ ref: currentFile }] }));
});

test("a plugin cannot change a project's directories, even with a legal input and the settings permission", async () => {
  const changes: ReadonlyArray<readonly [unknown, unknown]> = [
    [projectDirectoryActions.addInput, { workspace_path: "/w", expected_revision: "r" }],
    [projectDirectoryActions.removeInput, { workspace_id: "w", expected_revision: "r" }],
    [projectDirectoryActions.setOutput, { workspace_id: "w", expected_revision: "r" }],
    [projectDirectoryActions.repair, { workspace_id: "w", workspace_path: "/w", expected_revision: "r" }],
    [projectDirectoryActions.mapSource, { source_workspace_id: "s", workspace_id: "w", expected_revision: "r" }],
    [projectDirectoryActions.unmapSource, { source_workspace_id: "s", expected_revision: "r" }],
  ];
  const { service, calls } = serving(() => noDirectories);
  for (const [definition, input] of changes) await assert.rejects(service.invoke(context("plugin", ["projects:settings"]), reference(definition), input), code("actions.forbidden"));
  assert.deepEqual(calls, []);
  // The same inputs from the person reach the provider, so what refused the plugin was who it is, not what it sent.
  for (const [definition, input] of changes) await service.invoke(person, reference(definition), input);
  assert.equal(calls.length, changes.length);
});

test("SSC-27: plugin, agent and mcp callers are refused map_source itself, whatever they hold", async () => {
  const { service, calls } = serving(() => noDirectories);
  const input = { source_workspace_id: "s", workspace_id: "w", expected_revision: "r" };
  for (const audience of ["plugin", "agent", "mcp"] as const) {
    await assert.rejects(service.invoke(context(audience, ["projects:settings"]), reference(projectDirectoryActions.mapSource), input), code("actions.forbidden"), audience);
  }
  assert.deepEqual(calls, []);
  await service.invoke(person, reference(projectDirectoryActions.mapSource), input);
  assert.deepEqual(calls, ["projects.directories.map_source"]);
});

test("WMD-02: removing an input or a mapping leaves the folder on disk, so neither is irreversible", () => {
  for (const { capability_id, action } of [projectDirectoryActions.removeInput, projectDirectoryActions.unmapSource]) assert.equal(actionEffect(action, capability_id), "write", capability_id);
});

test("SSC-03: every change to the directories commits from a revision; a call without one is refused", async () => {
  const { service, calls } = serving(() => noDirectories);
  const ask = (definition: unknown, input: unknown) => service.invoke(person, reference(definition), input);
  await assert.rejects(ask(projectDirectoryActions.addInput, { workspace_path: "/w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.removeInput, { workspace_id: "w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.setOutput, { workspace_id: "w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.repair, { workspace_id: "w", workspace_path: "/w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.mapSource, { source_workspace_id: "s", workspace_id: "w" }), invalid);
  await assert.rejects(ask(projectDirectoryActions.unmapSource, { source_workspace_id: "s" }), invalid);
  assert.deepEqual(calls, []);
  await ask(projectDirectoryActions.addInput, { workspace_path: "/w", expected_revision: "r1" });
  await ask(projectDirectoryActions.removeInput, { workspace_id: "w", expected_revision: "r1" });
  await ask(projectDirectoryActions.repair, { workspace_id: "w", workspace_path: "/w", expected_revision: "r1" });
  await ask(projectDirectoryActions.unmapSource, { source_workspace_id: "s", expected_revision: "r1" });
  assert.equal(calls.length, 4);
  await assert.rejects(ask(projectDirectoryActions.unmapSource, { expected_revision: "r1" }), invalid);
  assert.equal(calls.length, 4);
});

for (const [name, definition, extra] of [
  ["set_output", projectDirectoryActions.setOutput, {}],
  ["map_source", projectDirectoryActions.mapSource, { source_workspace_id: "s" }],
] as const) {
  test(`SSC-03, SSC-26, SSC-27: ${name} names one folder, by id, by path or as the default location, never both or neither`, async () => {
    const { service, calls } = serving(() => noDirectories);
    const send = (input: Record<string, unknown>) => service.invoke(person, reference(definition), { ...extra, ...input, expected_revision: "r1" });
    await send({ workspace_id: "w" });
    await send({ workspace_path: "/w" });
    await send({ default_output: true });
    assert.equal(calls.length, 3);
    await assert.rejects(send({ default_output: false }), invalid);
    await assert.rejects(send({}), invalid);
    await assert.rejects(send({ workspace_id: "w", workspace_path: "/w" }), invalid);
    await assert.rejects(send({ workspace_id: "w", default_output: true }), invalid);
    await assert.rejects(send({ workspace_id: "w", project_id: "other" }), invalid);
    assert.equal(calls.length, 3);
  });
}

test("SSC-26: map_source says which source it maps", async () => {
  const { service, calls } = serving(() => noDirectories);
  await assert.rejects(service.invoke(person, reference(projectDirectoryActions.mapSource), { workspace_id: "w", expected_revision: "r1" }), invalid);
  assert.deepEqual(calls, []);
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
  const answer = (directories: unknown[]) => serving(() => ({ ...noDirectories, directories })).service.invoke(person, reference(projectDirectoryActions.get), {});
  await answer([{ ...directory, roles: ["input", "output"], state: "ok" }]);
  await assert.rejects(answer([{ ...directory, roles: [], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["input", "input"], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["reference"], state: "ok" }]));
  await assert.rejects(answer([{ ...directory, roles: ["output"], state: "gone" }]));
  await assert.rejects(answer([{ ...directory, roles: ["output"], state: "revoked" }]), "a revoked folder is a refusal when it is used, not a state of the directory");
  await assert.rejects(answer([{ ...directory, roles: ["output"], state: "ok", is_default: true }]));
});

test("SSC-26: the answer always lists the source links, and a link holds two ids and no path", async () => {
  const links = (source_links: unknown) => serving(() => ({ ...noDirectories, source_links })).service.invoke(person, reference(projectDirectoryActions.get), {});
  await links([{ source_workspace_id: "s", workspace_id: "w" }]);
  await assert.rejects(links(undefined));
  await assert.rejects(links([{ source_workspace_id: "s" }]));
  await assert.rejects(links([{ source_workspace_id: "s", workspace_id: "w", canonical_path: "/w" }]));
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

test("SSC-12, SSC-25: recent materials come back with an origin read just now, at most 20 of them", async () => {
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
  // `unmapped`: an id that is not this project's directory and has no folder named for it. Only a directory can be that, and it then has none to name.
  await read([{ ref: currentFile, origin: { source: "directory", owner: origin.owner, state: "unmapped" } }]);
  await assert.rejects(read([{ ref: fixedArtifact, origin: { source: "object", owner: origin.owner, state: "unmapped" } }]));
  await assert.rejects(read([{ ref: fixedArtifact, origin: { source: "import", owner: origin.owner, state: "unmapped" } }]));
  await assert.rejects(read([{ ref: currentFile, origin: { ...origin, state: "unmapped" } }]));
  // A directory origin the caller may not read, or whose file is gone, need not say which directory (SSC-30); one that is there must.
  for (const state of ["forbidden", "missing"] as const) await read([{ ref: currentFile, origin: { source: "directory", owner: origin.owner, state } }]);
  await assert.rejects(read([{ ref: fixedArtifact, origin: { source: "import", owner: origin.owner, directory: origin.directory, state: "ok" } }]), "an import has no directory");
  await read([{ ref: currentFile, origin: { source: "directory", owner: origin.owner, state: "unmapped", note: "这个项目原来的默认输出目录" } }]);
});

test("the four refusals are declared codes of one error model, not error classes", () => {
  const cases = [
    [projectDirectoryErrors.directory_missing("x"), "projects.directory_missing", "not_found"],
    [projectDirectoryErrors.directory_unmapped("x"), "projects.directory_unmapped", "not_found"],
    [projectDirectoryErrors.directory_revoked("x"), "projects.directory_revoked", "forbidden"],
    [projectDirectoryErrors.directory_duplicate("x"), "projects.directory_duplicate", "conflict"],
  ] as const;
  for (const [error, expectedCode, kind] of cases) {
    assert.equal(error.constructor, ActionError);
    assert.equal(error.code, expectedCode);
    assert.equal(error.kind, kind);
  }
});
