import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_TYPE, CHARACTER_PLUGIN_ID, CHARACTER_PUBLISHER_SIGNATURE, parseCharacterContent, type CharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { PluginArtifactPublishInput } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createCharactersActionHandlers, openCharacters, type CharactersActionPorts, type CharactersImportPorts } from "@molis-ai/molis-work-module-characters";
import * as plugin from "@molis-ai/molis-work-plugin-characters";

const PROJECT = "project-a", OWNER = "actor-a";
const pluginSource = new URL("../plugins/native/characters/", import.meta.url);
const patch = { title: "核对者", instructions: "先核对证据，再给结论。", host_tools: ["read-file"] };
const key = (reference: ArtifactReference) => `${reference.artifact_id}@${reference.version}`;
const beforeWrite = async () => {};
const unused = () => { throw new Error("not used by this test"); };
/** The local Agent imports are not the subject here; a run only asks what the Character would start with. */
const imports: CharactersImportPorts = { previewFile: unused, discover: () => [], import: unused, launch: unused, runs: async () => [],
  execution: async content => ({ executable: null, workspaces: [], notice: content.character_id }) };
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

/** One person's drafts in a real Characters database, and a 成果库 that keeps what the handlers publish (and what a test plants beside it). */
function fixture(t: { after(callback: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), "molis-characters-handlers-")), opened = [] as ReturnType<typeof openCharacters>[];
  t.after(() => { for (const handle of opened.reverse()) handle.close(); rmSync(directory, { recursive: true, force: true }); });
  const records = new Map<string, ArtifactVersionRecord>(), published: PluginArtifactPublishInput[] = [];
  const record = (content: CharacterContent, version: number, over: Partial<ArtifactVersionRecord> = {}): ArtifactVersionRecord => ({
    artifact_id: `character:${PROJECT}:${content.character_id}`, version, project_id: PROJECT, artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
    producer_plugin_id: CHARACTER_PLUGIN_ID, producer_plugin_version: "1.0.0", producer_binding_signature: CHARACTER_PUBLISHER_SIGNATURE, owner_actor_id: OWNER,
    content_kind: "inline", payload: JSON.parse(JSON.stringify(content)), content_ref: null, content_digest: "digest", size_bytes: 1, metadata: {}, scope: "personal",
    availability: "available", unavailable_reason: null, lifecycle_state: "active", supersedes_version: null, created_by: OWNER, created_at: "2026-10-21T00:00:00Z",
    archived_at: null, archived_by: null, origin: { kind: "pinned", subject: { kind: "character", id: content.character_id }, revision: String(content.source.draft_revision) },
    title: content.title, media_type: "application/json", trace: [], ...over });
  const artifacts = {
    publish(input: PluginArtifactPublishInput) {
      published.push(input);
      assert.equal(input.content.kind, "inline");
      const stored = record(parseCharacterContent(input.content.kind === "inline" ? input.content.payload : null), input.version, { supersedes_version: input.supersedes_version ?? null });
      records.set(key(stored), stored);
      return { artifact: stored, observed_event_cursor: 0, replayed: false };
    },
    read: (reference: ArtifactReference) => records.get(key(reference)) ?? null,
  };
  /** The handlers one person gets: their own drafts and the project's publication list. */
  const handlersFor = (actorId: string) => {
    const handle = openCharacters(directory, actorId); opened.push(handle);
    const ports: CharactersActionPorts = { actorId, drafts: handle.service, references: () => [...records.values()].map(({ artifact_id, version }) => ({ artifact_id, version })),
      publish: (id, revision, publisher) => handle.service.publish(id, revision, publisher), imports };
    return { drafts: handle.service, handlers: createCharactersActionHandlers(ports, { projectId: PROJECT, artifacts }) };
  };
  return { records, published, record, handlersFor };
}

/** A draft that was edited once, so its revision is 2. */
function editedDraft(person: ReturnType<ReturnType<typeof fixture>["handlersFor"]>) {
  const created = person.drafts.create();
  return person.drafts.update(created.character_id, created.revision, patch);
}

test("RAC-63 every Characters action has exactly one handler in the Module, and the plugin binds them without holding any", () => {
  const person = fixture({ after() {} }).handlersFor("actor-a");
  assert.deepEqual(Object.keys(person.handlers).sort(), Object.keys(plugin.charactersActions).sort());
  // The plugin keeps the Manifest, the action definitions and the routes; the logic and the data ports are the owner's.
  const sources = readdirSync(new URL("src/", pluginSource)).filter(name => name.endsWith(".ts")).map(name => ({ name, text: readFileSync(new URL(`src/${name}`, pluginSource), "utf8") }));
  for (const { name, text } of sources) assert.ok(!/@molis-ai\/molis-work-module-characters/.test(text), `${name} must not import the Module (a plugin may not import a Module)`);
  assert.ok(!JSON.parse(readFileSync(new URL("package.json", pluginSource), "utf8")).dependencies?.["@molis-ai/molis-work-module-characters"], "the plugin package does not depend on the Module");
});

test("RAC-64 the handlers serve one person: another person's draft is neither read, changed nor published", t => {
  const space = fixture(t), owner = space.handlersFor("actor-a"), other = space.handlersFor("actor-b");
  const draft = editedDraft(owner);
  assert.deepEqual(owner.handlers.subject({ subject_id: draft.character_id }).subject, { kind: "character", id: draft.character_id });
  assert.throws(() => other.handlers.subject({ subject_id: draft.character_id }), code("characters.not_found"));
  assert.throws(() => other.handlers.update({ id: draft.character_id, expected_revision: draft.revision, title: "改名", instructions: "改写", host_tools: null }), code("characters.not_found"));
  assert.deepEqual(other.handlers.list().drafts, []);
  assert.deepEqual(owner.handlers.list().drafts.map(row => row.character_id), [draft.character_id]);
  return assert.rejects(other.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite), code("characters.conflict"))
    .then(() => assert.equal(space.published.length, 0, "a refused publish writes no 成果"));
});

test("RAC-65 only this person's Character publications of this project are listed or runnable", async t => {
  const space = fixture(t), owner = space.handlersFor(OWNER), draft = editedDraft(owner);
  const own = await owner.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite);
  const content = parseCharacterContent(space.records.get(key(own.reference))!.payload);
  // The same Character's line, but not this project, owner, producer, signature, type or schema: none of them is listed or selectable.
  const strangers: Array<[string, Partial<ArtifactVersionRecord>]> = [["project", { project_id: "project-b" }], ["owner", { owner_actor_id: "actor-b" }],
    ["producer", { producer_plugin_id: "io.molis.work.other" }], ["signature", { producer_binding_signature: "someone-else" }],
    ["type", { artifact_type_id: "note.v1" }], ["schema", { schema_version: 2 }]];
  strangers.forEach(([, over], index) => { const stranger = space.record(content, 10 + index, over); space.records.set(key(stranger), stranger); });
  const listed = owner.handlers.list().publications;
  assert.deepEqual(listed.map(row => row.version), [1], "only the person's own version is listed");
  for (const [label] of strangers) {
    const version = 10 + strangers.findIndex(([name]) => name === label);
    const answer = owner.handlers.runnable({ reference: { artifact_id: `character:${PROJECT}:${content.character_id}`, version } });
    assert.deepEqual(answer, { available: false, reason: "请选择当前项目已发布的角色版本" }, `a ${label} that is not this person's is not runnable`);
  }
  assert.deepEqual(owner.handlers.runnable({ reference: own.reference }), { available: true });
  // An owned version whose identity disagrees with its content is an error, never a version to overwrite.
  const forged = space.record({ ...content, character_id: "another" }, 1, { artifact_id: `character:${PROJECT}:${content.character_id}-forged` });
  space.records.set(key(forged), forged);
  assert.throws(() => owner.handlers.list(), /角色发布的来源或身份不一致/);
});

test("RAC-66 a publication is runnable only while its draft is active and the revision it was made from exists", async t => {
  const space = fixture(t), owner = space.handlersFor(OWNER), draft = editedDraft(owner);
  const { reference } = await owner.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite);
  assert.deepEqual(owner.handlers.runnable({ reference }), { available: true });
  assert.equal((await owner.handlers.execution({ reference })).notice, draft.character_id);
  // A disabled draft is not one to run, and neither is a deleted one; the answer carries Characters' own reason, not a failed call.
  const revision = () => owner.drafts.get(draft.character_id)!.revision;
  for (const state of ["disabled", "tombstoned"] as const) {
    owner.drafts.setState(draft.character_id, revision(), state);
    assert.deepEqual(owner.handlers.runnable({ reference }), { available: false, reason: "该角色已停用或删除" });
    await assert.rejects(async () => owner.handlers.execution({ reference }), /该角色已停用或删除/);
    if (state === "disabled") owner.drafts.setState(draft.character_id, revision(), "active");
  }
  // A publication made from a draft revision that does not exist (the draft never got that far) is not one to run either.
  const fresh = fixture(t), second = fresh.handlersFor(OWNER), young = editedDraft(second);
  const ahead = fresh.record({ character_id: young.character_id, title: "核对者", instructions: "先核对证据，再给结论。", host_tools: null, source: { owner_actor_id: OWNER, draft_revision: 99 } }, 1);
  fresh.records.set(key(ahead), ahead);
  assert.deepEqual(second.handlers.runnable({ reference: { artifact_id: ahead.artifact_id, version: 1 } }), { available: false, reason: "Character 发布来源不是已有草稿修订" });
});

test("RAC-67 pinning the same content again returns the pinned version; changed content pins the next version over it", async t => {
  const space = fixture(t), owner = space.handlersFor(OWNER), draft = editedDraft(owner);
  const first = await owner.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite);
  assert.deepEqual([first.replayed, first.reference.version], [false, 1]);
  assert.equal(space.published[0]!.supersedes_version, undefined);
  const again = await owner.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite);
  assert.deepEqual([again.replayed, again.reference.version, space.published.length], [true, 1, 1], "the same content writes nothing");
  const changed = owner.drafts.update(draft.character_id, draft.revision, { ...patch, instructions: "先核对证据，再给结论，并列出未验证项。" });
  const next = await owner.handlers.publish({ id: draft.character_id, expected_revision: changed.revision }, beforeWrite);
  assert.deepEqual([next.replayed, next.reference.version, space.published[1]!.supersedes_version], [false, 2, 1]);
  assert.equal(space.published[1]!.artifact_id, `character:${PROJECT}:${draft.character_id}`);
  await assert.rejects(owner.handlers.publish({ id: draft.character_id, expected_revision: draft.revision }, beforeWrite), code("characters.conflict"), "a stale revision is not published");
});

test("RAC-68 the registered action ids, versions and provider are the ones the contract snapshot already holds", () => {
  const rows = readFileSync(new URL("../tooling/gates/actions/actions.tsv", import.meta.url), "utf8").split("\n")
    .filter(line => line.startsWith("characters.")).map(line => line.split("\t"));
  const defined = plugin.CHARACTERS_ACTIONS.map(definition => `${definition.capability_id}@${definition.version}`).sort();
  assert.deepEqual(rows.map(row => `${row[0]}@${row[1]}`).sort(), defined);
  assert.ok(rows.every(row => row[2] === plugin.charactersManifest.plugin_id && row[3] === plugin.charactersManifest.plugin_id), "the provider stays the plugin id");
});

test("RAC-69 the Characters browser client holds no empty catch, no raw fetch and no *_SCRIPT constant, and asks through the workbench's request helper", () => {
  const client = plugin.CHARACTERS_CLIENT_FACTORY;
  assert.ok(!/\bcatch\s*(\([^)]*\))?\s*\{\s*\}/.test(client), "no empty catch in the browser program");
  assert.ok(!/\bfetch\(/.test(client), "no raw fetch in the browser program");
  assert.ok(client.includes("molisWorkRequest("), "the program asks through the request helper");
  assert.deepEqual(Object.keys(plugin).filter(name => /_SCRIPT$/.test(name)), []);
});
