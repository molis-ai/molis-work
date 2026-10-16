import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ensureStorageSpace, personalStorageSpace } from "@molis-ai/molis-work-storage";
import { openCharacters, createCharactersReplicationBinding } from "../src/index.js";

test("personal Character draft transfers with target-local revision, without publishing an Artifact", () => {
  const root = mkdtempSync(join(tmpdir(), "character-sync-"));
  try {
    const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
    const homes = [join(root, "a"), join(root, "b")];
    homes.forEach(home => ensureStorageSpace(home, space));
    const owner = openCharacters(homes[0]!, LOCAL_PERSON_ACTOR_ID);
    const initial = owner.service.create();
    const saved = owner.service.update(initial.character_id, initial.revision, {
      title: "跨设备角色", instructions: "先核对事实", host_tools: null,
    });
    owner.close();
    const a = createCharactersReplicationBinding(homes[0]!, "alice"), b = createCharactersReplicationBinding(homes[1]!, "alice");
    try {
      const context = { spaceId: space.spaceId, authorize: () => {} };
      const outgoing = a.replica(context).next();
      assert.ok(outgoing);
      b.replica(context).receive({ ...outgoing, revision: 1 });
      const received = openCharacters(homes[1]!, LOCAL_PERSON_ACTOR_ID);
      try {
        const draft = received.service.get(saved.character_id);
        assert.equal(draft?.title, "跨设备角色");
        assert.equal(draft?.revision, saved.revision);
        assert.throws(() => received.service.update(saved.character_id, initial.revision, {
          title: "旧窗口", instructions: "旧版本", host_tools: null,
        }), { code: "character.conflict" });
      } finally { received.close(); }
      assert.equal(b.replica(context).next(), null);
    } finally { a.close(); b.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an empty new draft transfers; malformed or foreign-owner content cannot be restored", () => {
  const root = mkdtempSync(join(tmpdir(), "character-sync-"));
  try {
    const space = personalStorageSpace("http://127.0.0.1:8787", "work", "alice");
    const homes = [join(root, "a"), join(root, "b")];
    homes.forEach(home => ensureStorageSpace(home, space));
    const owner = openCharacters(homes[0]!, LOCAL_PERSON_ACTOR_ID);
    const draft = owner.service.create();
    owner.close();
    const a = createCharactersReplicationBinding(homes[0]!, "alice"), b = createCharactersReplicationBinding(homes[1]!, "alice");
    try {
      const context = { spaceId: space.spaceId, authorize: () => {} };
      const outgoing = a.replica(context).next();
      assert.ok(outgoing);
      const foreign = structuredClone(outgoing.value) as { record: { owner_actor_id: string } };
      foreign.record.owner_actor_id = "bob";
      b.replica(context).receive({ ...outgoing, value: foreign, revision: 1 });
      assert.equal(b.replica(context).conflicts().length, 1);
      assert.throws(() => b.replica(context).resolve(outgoing.key, "remote"));
      const absent = openCharacters(homes[1]!, LOCAL_PERSON_ACTOR_ID);
      try { assert.equal(absent.service.get(draft.character_id), null); }
      finally { absent.close(); }
      b.replica(context).receive({ ...outgoing, revision: 2 });
      b.replica(context).resolve(outgoing.key, "remote");
      const received = openCharacters(homes[1]!, LOCAL_PERSON_ACTOR_ID);
      try { assert.equal(received.service.get(draft.character_id)?.instructions, ""); }
      finally { received.close(); }
    } finally { a.close(); b.close(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
