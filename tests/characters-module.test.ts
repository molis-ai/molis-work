import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CharacterError, openCharacters } from "@molis-ai/molis-work-module-characters";
import { parseCharacterContent, parseCharacterTools } from "@molis-ai/molis-work-contracts/modules/characters";

const patch = { title: "核对者", instructions: "先核对证据，再给结论。\n保留未验证项。", host_tools: ["read-file", "search"] };
function home(t: { after(callback: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), "molis-characters-"));
  const handles: ReturnType<typeof openCharacters>[] = [];
  t.after(() => { for (const handle of handles.reverse()) handle.close(); rmSync(directory, { recursive: true, force: true }); });
  return { directory, open(actor = "actor-a") { const handle = openCharacters(directory, actor); handles.push(handle); return handle.service; } };
}
const code = (expected: string) => (error: unknown) => error instanceof CharacterError && error.code === expected;

test("personal Character drafts survive reopening, isolate actors and do not expose mutable stored objects", t => {
  const fixture = home(t), first = fixture.open(), other = fixture.open("actor-b");
  const created = first.create();
  assert.equal(created.revision, 1);
  assert.equal(created.host_tools, null);
  const edited = first.update(created.character_id, created.revision, patch);
  const reopened = fixture.open();
  assert.deepEqual(reopened.get(created.character_id), edited);
  edited.host_tools!.push("run-command");
  assert.deepEqual(reopened.get(created.character_id)?.host_tools, patch.host_tools);
  assert.deepEqual(other.list(), []);
  assert.equal(other.get(created.character_id), null);
  assert.throws(() => other.update(created.character_id, 2, patch), code("character.not_found"));
});

test("stale windows cannot overwrite, disable or publish a newer Character draft", t => {
  const fixture = home(t), first = fixture.open(), second = fixture.open();
  const created = first.create();
  const edited = second.update(created.character_id, 1, patch);
  let published = false;
  assert.throws(() => first.update(created.character_id, 1, { ...patch, title: "过期窗口" }), code("character.conflict"));
  assert.throws(() => first.setState(created.character_id, 1, "disabled"), code("character.conflict"));
  assert.throws(() => first.publish(created.character_id, 1, () => { published = true; return "unexpected"; }), code("character.conflict"));
  assert.equal(published, false);
  assert.deepEqual(first.get(created.character_id), edited);
});

test("Character writes require a confirmed positive revision even from an untyped caller", t => {
  const service = home(t).open(), created = service.create();
  for (const revision of [undefined, null, 0, -1, NaN, 1.5, "1"]) {
    assert.throws(() => service.update(created.character_id, revision as number, patch), code("character.invalid"));
    assert.throws(() => service.setState(created.character_id, revision as number, "disabled"), code("character.invalid"));
    assert.throws(() => service.publish(created.character_id, revision as number, () => "unexpected"), code("character.invalid"));
  }
  assert.deepEqual(service.get(created.character_id), created);
});

test("empty Character drafts cannot publish; publisher failure releases the transaction for a later edit", t => {
  const service = home(t).open(), created = service.create();
  let calls = 0;
  assert.throws(() => service.publish(created.character_id, 1, () => { calls++; return "unexpected"; }), code("character.invalid"));
  assert.equal(calls, 0);
  const edited = service.update(created.character_id, 1, patch);
  const failure = new Error("Artifact unavailable");
  assert.throws(() => service.publish(created.character_id, edited.revision, () => { throw failure; }), error => error === failure);
  assert.deepEqual(service.get(created.character_id), edited);
  assert.equal(service.update(created.character_id, edited.revision, { ...patch, title: "可继续编辑" }).revision, 3);
});

test("published Character body is a fixed draft snapshot, and disabling or deleting blocks new publication", t => {
  const service = home(t).open(), created = service.create();
  let current = service.update(created.character_id, 1, patch);
  const frozen = service.publish(current.character_id, current.revision, content => content);
  assert.deepEqual(frozen, { character_id: current.character_id, ...patch, source: { owner_actor_id: "actor-a", draft_revision: 2 } });
  current = service.update(current.character_id, current.revision, { ...patch, instructions: "新的正文", host_tools: [] });
  current = service.setState(current.character_id, current.revision, "disabled");
  assert.throws(() => service.requireActive(current.character_id), code("character.disabled"));
  assert.throws(() => service.publish(current.character_id, current.revision, content => content), code("character.disabled"));
  assert.equal(frozen.instructions, patch.instructions);
  assert.deepEqual(frozen.host_tools, patch.host_tools);
  current = service.setState(current.character_id, current.revision, "active");
  assert.deepEqual(service.publish(current.character_id, current.revision, content => content).host_tools, []);
  current = service.setState(current.character_id, current.revision, "tombstoned");
  assert.equal(service.get(current.character_id)?.state, "tombstoned");
  assert.throws(() => service.setState(current.character_id, current.revision, "active"), code("character.deleted"));
  assert.throws(() => service.update(current.character_id, current.revision, patch), code("character.deleted"));
  assert.throws(() => service.publish(current.character_id, current.revision, content => content), code("character.deleted"));
  assert.notEqual(service.create().character_id, current.character_id);
  assert.equal(frozen.instructions, patch.instructions);
});

test("Character payload validation distinguishes inherited tools from no tools and strips non-contract authority", () => {
  const source = { owner_actor_id: "actor-a", draft_revision: 1 };
  const input = { character_id: "character-a", ...patch, source, approved: true, workspace: "/private" };
  const parsed = parseCharacterContent(input);
  assert.equal("approved" in parsed, false);
  assert.equal("workspace" in parsed, false);
  parsed.host_tools!.push("run-command");
  parsed.source.draft_revision = 99;
  assert.equal(source.draft_revision, 1);
  assert.deepEqual(input.host_tools, patch.host_tools);
  assert.equal(parseCharacterTools(null), null);
  assert.deepEqual(parseCharacterTools([]), []);
  for (const tools of [undefined, "inherit", ["read-file", "read-file"], ["mcp:*"], [42]]) assert.throws(() => parseCharacterTools(tools));
  for (const value of [null, {}, { ...input, instructions: "  " }, { ...input, source: { ...source, draft_revision: 0 } }]) assert.throws(() => parseCharacterContent(value));
});
