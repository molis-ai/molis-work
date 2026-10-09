import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createGoalIntentCapability, configureGoalEventsCapability, reportGoalEventsCapability, recordGoalProgressCapability,
  applyGoalConcernCapability, requestGoalDecisionCapability, citeGoalDecisionCapability, setGoalEventAgreementCapability,
  submitGoalEventClosureCapability, resumeGoalEventWorkCapability, recordGoalNoteCapability, setActiveGoalCapability,
  readGoalEventStateCapability, goalTreeCapabilities } from "@molis-ai/molis-work-plugin-goals";
import { goalProgressCapabilities } from "@molis-ai/molis-work-contracts/modules/goals";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityCallOptions, HostCapabilityDefinition, HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";
import { createPluginCapabilityClient } from "@molis-ai/molis-work-plugin-runtime";
import { filesManifest } from "@molis-ai/molis-work-plugin-files";

const door = (name: string, capability: unknown, business: Record<string, unknown>) =>
  ({ name, capability: capability as HostCapabilityDefinition<unknown, unknown>, business });

/** The eleven writes that take the project and the key plus their own business fields; the identity is looked at before those. */
const managementDoors = (goal_id: string, cursor: number) => [
  door("create intent", createGoalIntentCapability, { title: "目标" }),
  door("configure", configureGoalEventsCapability, { goal_id, expected_version: 0 }),
  door("report", reportGoalEventsCapability, { goal_id, events: [] }),
  door("progress", recordGoalProgressCapability, { goal_id, based_on_cursor: cursor, summary: "进展" }),
  door("concern", applyGoalConcernCapability, { goal_id, action: "open", title: "问题" }),
  door("request decision", requestGoalDecisionCapability, { goal_id, question: "是否继续？" }),
  door("cite decision", citeGoalDecisionCapability, { goal_id, decision_id: "d" }),
  door("agreement", setGoalEventAgreementCapability, { goal_id }),
  door("closure", submitGoalEventClosureCapability, { goal_id, kind: "complete", reason: "收尾" }),
  door("resume", resumeGoalEventWorkCapability, { goal_id, reason: "继续" }),
  door("note", recordGoalNoteCapability, { goal_id, body: "便笺" }),
];

/**
 * The CLI and the typed Host client are the management door. It has no caller identity of its own, so it records the person on
 * this machine and refuses an actor_id or actor_kind carried in the arguments instead of trusting it
 * (specs/goal-closure-identity). The project is checked first: a foreign project stays a scope mismatch.
 */
test("every management write records the person on this machine and refuses an identity in its arguments", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-identity-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Identity", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "IDENTITY-GOAL";
  const cursor = async () => (await typed.invoke(readGoalEventStateCapability, { project_id, goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  try {
    const intent = { project_id, goal_id, title: "管理入口", outcome: "记在本机这个人身上", idempotency_key: "create" };
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, false);
    assert.equal((await typed.invoke(createGoalIntentCapability, intent)).replayed, true, "the same key replays for the same person");
    const before = await cursor();

    // Each door takes the project and the key and nothing about who writes. The business fields are left out on purpose: the
    // identity is refused before they are read, and a refused call writes nothing.
    for (const { name, capability, business } of managementDoors(goal_id, before)) {
      for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }, { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" }]) {
        await assert.rejects(typed.invoke(capability, { project_id, idempotency_key: `refused-${name}`, ...business, ...identity }),
          { code: "actions.input_invalid" }, `${name} refuses ${Object.keys(identity).join(" and ")}`);
      }
      await assert.rejects(typed.invoke(capability, { ...business, project_id: "foreign", idempotency_key: `foreign-${name}`, actor_id: "someone-else" }),
        { code: "actions.scope_mismatch" }, `${name}: a foreign project is a scope mismatch before the identity is looked at`);
    }
    // The current Goal and the tree check carry the project in a wrapper: a nested write, and a one-element argument list.
    const forgedActive = { goal: { goal_id, reason: "当前" }, write: { idempotency_key: "refused-active", actor_id: "someone-else" } };
    await assert.rejects(typed.invoke(setActiveGoalCapability, { project_id, ...forgedActive } as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(setActiveGoalCapability, { project_id: "foreign", ...forgedActive } as never), { code: "actions.scope_mismatch" });
    const forgedCheck = { proposal_id: "p", idempotency_key: "refused-check", actor_id: "someone-else" };
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ project_id, ...forgedCheck }] as never), { code: "actions.input_invalid" });
    await assert.rejects(typed.invoke(goalTreeCapabilities.checkGoalTreeProposal, [{ project_id: "foreign", ...forgedCheck }] as never), { code: "actions.scope_mismatch" });
    // The progress capability Coding uses has no project in its input; the typed Host client is the management door there too.
    for (const identity of [{ actor_id: "someone-else" }, { actor_kind: "runtime" }]) {
      await assert.rejects(typed.invoke(goalProgressCapabilities.record, { goal_id, based_on_cursor: before, summary: "进展", idempotency_key: "refused-record", ...identity } as never),
        { code: "actions.input_invalid" });
    }
    assert.equal(await cursor(), before, "a refused call writes nothing");

    // Without an identity the writer is the person on this machine, and the same key replays for that person.
    const note = { project_id, goal_id, body: "便笺", idempotency_key: "note" };
    const noted = await typed.invoke(recordGoalNoteCapability, note);
    assert.equal(noted.recorded, true);
    const written = await event(noted.event_id);
    assert.equal(written.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(written.actor_kind, "user");
    assert.equal((await typed.invoke(recordGoalNoteCapability, note)).replayed, true);
    const progress = { project_id, goal_id, based_on_cursor: await cursor(), summary: "进展", idempotency_key: "progress" };
    assert.equal((await typed.invoke(recordGoalProgressCapability, progress)).progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    const record = { goal_id, based_on_cursor: await cursor(), summary: "再一条进展", idempotency_key: "record" };
    const recorded = await typed.invoke(goalProgressCapabilities.record, record);
    assert.equal(recorded.progress_summary.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal((await typed.invoke(goalProgressCapabilities.record, record)).replayed, true);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/**
 * The management door records the person on this machine, so it has to stay out of a plugin's reach: a plugin that lists one of
 * these entries under capabilities.consumes would otherwise be recorded as that person. The entries are `host_only`. What a plugin
 * may still reach is a registered action, and that takes the identity from the call context.
 */
test("a plugin that lists a management entry under consumes is refused and is never recorded as the person on this machine", async () => {
  const home = await mkdtemp(join(tmpdir(), "goal-management-plugin-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Plugin", actor_id: "user" }));
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const typed = host.client(ref), project_id = project.project_id, goal_id = "PLUGIN-GOAL";
  const cursor = async () => (await typed.invoke(readGoalEventStateCapability, { project_id, goal_id })).goal_event_cursor;
  const event = (eventId: string) => host.withProject(ref, runtime => runtime.coordinator.goalEvents.readEvent(project_id, goal_id, eventId));
  // What the plugin executor binds around every call a plugin makes: the plugin consumer and the plugin's own call context.
  const asPlugin = (actor_id: string): HostCapabilityCallOptions => ({ consumer: "plugin", before_effect: async () => {},
    plugin_caller: { plugin_id: "io.molis.work.test.goal-writer", install_id: "install-1", actor_id, project_id,
      declaration: { manifest: {} as HostPluginCaller["declaration"]["manifest"] }, assertActive: () => {} } });
  try {
    await typed.invoke(createGoalIntentCapability, { project_id, goal_id, title: "插件", outcome: "不能冒充本机这个人", idempotency_key: "create" });
    const before = await cursor();
    const entries = [
      ...managementDoors(goal_id, before).map(({ name, capability, business }) =>
        ({ name, capability, input: { project_id, idempotency_key: `plugin-${name}`, ...business } as unknown })),
      { name: "set current goal", capability: setActiveGoalCapability as HostCapabilityDefinition<unknown, unknown>,
        input: { project_id, goal: { goal_id, reason: "当前" }, write: { idempotency_key: "plugin-active" } } as unknown },
      { name: "check structure proposal", capability: goalTreeCapabilities.checkGoalTreeProposal as HostCapabilityDefinition<unknown, unknown>,
        input: [{ project_id, proposal_id: "p", idempotency_key: "plugin-check" }] as unknown },
    ];
    const manifest = { ...filesManifest, plugin_id: "io.molis.work.test.goal-writer",
      capabilities: { provides: [], consumes: entries.map(entry => entry.capability.capability_id) } };
    const sdk = createPluginCapabilityClient(manifest, typed);
    for (const { name, capability, input } of entries) {
      // Listing the entry in the manifest does not make it reachable, and neither does a copy of the definition without the flag.
      const available = sdk.availability(capability);
      assert.equal(available.available, false, `${name} is not available to a plugin`);
      assert.equal(!available.available && available.code, "actions.host_only", name);
      await assert.rejects(sdk.invoke(capability, input), { code: "actions.host_only" }, `${name}: through the plugin client`);
      await assert.rejects(sdk.invoke({ ...capability, host_only: false }, input), { code: "actions.host_only" }, `${name}: through an unflagged copy`);
      await assert.rejects(typed.invoke(capability, input, asPlugin("plugin-person")), { code: "actions.host_only" }, `${name}: with the plugin's own call context`);
    }
    assert.equal(await cursor(), before, "a refused call writes nothing");

    // With valid arguments the refusal is the only thing between the plugin and a record under the person's name.
    const note = { project_id, goal_id, body: "插件写的便笺", idempotency_key: "plugin-note" };
    await assert.rejects(typed.invoke(recordGoalNoteCapability, note, asPlugin("plugin-person")), { code: "actions.host_only" });
    assert.equal(await cursor(), before, "no record was left behind");
    const noted = await typed.invoke(recordGoalNoteCapability, note);
    assert.equal((await event(noted.event_id)).actor_id, LOCAL_PERSON_ACTOR_ID, "the same arguments from the Host's own client are recorded as the person");

    // What a plugin is meant to reach stays open: Goal progress takes the actor from the plugin's own call context.
    assert.equal(typed.availability(goalProgressCapabilities.record, { consumer: "plugin" }).available, true);
    const recorded = await typed.invoke(goalProgressCapabilities.record,
      { goal_id, based_on_cursor: await cursor(), summary: "插件的进展", idempotency_key: "plugin-progress" } as never, asPlugin("plugin-person"));
    assert.equal(recorded.progress_summary.actor_id, "plugin-person");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

/** Type errors a small caller gets from the built declarations. The test runner strips types, so the types are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./goal-management-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => `line ${diagnostic.file ? ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start ?? 0).line + 1 : 0}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`);
}

const FREE_OF_IDENTITY = `
type Identity = "actor_id" | "actor_kind";
type KeysOf<Input> = Input extends readonly [infer First, ...unknown[]] ? keyof First : keyof Input;
type Free<Input> = [Extract<KeysOf<Input>, Identity>] extends [never] ? true : false;`;

/**
 * The host refuses an actor_id or actor_kind in these entries' arguments, so a caller that follows the types must not be asked for
 * one. `GoalTreeProposalCheckInput` is the domain input and still names the actor, so the typed check has an input type of its own.
 */
test("the typed management entries are typed without an identity, so a caller that follows the types is not refused", { timeout: 180_000 }, () => {
  const writes = managementDoors("g", 0).map(({ capability }) => Object.entries(
    { createGoalIntentCapability, configureGoalEventsCapability, reportGoalEventsCapability, recordGoalProgressCapability,
      applyGoalConcernCapability, requestGoalDecisionCapability, citeGoalDecisionCapability, setGoalEventAgreementCapability,
      submitGoalEventClosureCapability, resumeGoalEventWorkCapability, recordGoalNoteCapability })
    .find(([, candidate]) => candidate === capability)![0]);
  assert.equal(writes.length, 11);
  const source = `
import type { HostCapabilityInput, LocalHostProjectClient } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ${writes.join(", ")}, setActiveGoalCapability, goalTreeCapabilities, createGoalProposalClients } from "@molis-ai/molis-work-plugin-goals";
${FREE_OF_IDENTITY}
${writes.map(name => `export const ${name}Free: Free<HostCapabilityInput<typeof ${name}>> = true;`).join("\n")}
export const setActiveGoalFree: Free<HostCapabilityInput<typeof setActiveGoalCapability>["write"]> = true;
export const checkGoalTreeProposalFree: Free<HostCapabilityInput<typeof goalTreeCapabilities.checkGoalTreeProposal>> = true;

declare const client: LocalHostProjectClient;
const { goalTree } = createGoalProposalClients(client);
export const checked = goalTree.checkGoalTreeProposal({ project_id: "p", proposal_id: "x", idempotency_key: "k" });
// @ts-expect-error the host records the person on this machine and refuses an actor_id
export const forged = goalTree.checkGoalTreeProposal({ project_id: "p", proposal_id: "x", idempotency_key: "k", actor_id: "someone" });
`;
  assert.deepEqual(typeErrors(source), []);
});

test("the type check flags an entry whose input still names who writes", { timeout: 180_000 }, () => {
  const errors = typeErrors(`${FREE_OF_IDENTITY}
export const named: Free<{ project_id: string; actor_id: string }> = true;
export const nested: Free<[{ project_id: string; actor_kind: "user" }]> = true;
export const clean: Free<{ project_id: string }> = true;
`);
  assert.deepEqual(errors.map(error => error.split(":")[0]), ["line 5", "line 6"], errors.join("\n"));
});
