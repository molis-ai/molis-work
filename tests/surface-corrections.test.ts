import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceCorrectionInput, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { createSurfaceCorrections } from "@molis-ai/molis-work-service-surfaces";

const user = { actor_id: "first", audience: "user" } as const;
const slot = { kind: "plugin-slot", plugin_id: "owner:part", slot_id: "surface" } as const;
const subject = { kind: "record:part", id: "one" };
const empty = { revision: "0", corrections: [] };
const now = () => "2026-11-08T00:00:00.000Z";
const active = { beforeEffect: async () => undefined, current: () => undefined };
const choose = (slot: SurfaceSlot, expected_revision = "0"): SurfaceCorrectionInput => ({
  slot, expected_revision, correction: "form", form: "row",
});

test("SCS-10 persists separate form, pin and remove choices, with one revision per actor and slot", async t => {
  const directory = mkdtempSync(join(tmpdir(), "surface-corrections-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "first.db");
  const first = new LocalProjectDatabase(path);
  const other = new LocalProjectDatabase(join(directory, "other.db"));
  try {
    const store = createSurfaceCorrections(first.db, user);
    const otherSubject = { kind: "record", id: "part:one" };
    const otherSlot = { ...slot, plugin_id: "owner", slot_id: "part:surface" };
    assert.deepEqual(store.read(slot), empty);
    assert.deepEqual(await store.correct(choose(slot), active, now), { corrections_revision: "1" });
    assert.deepEqual(await store.correct({ ...choose(slot, "1"), form: "card" }, active, now), { corrections_revision: "2" });
    assert.deepEqual(await store.correct({ ...choose(slot, "2"), subject }, active, now), { corrections_revision: "3" });
    assert.deepEqual(await store.correct({ slot, expected_revision: "3", correction: "pin", subject, position: 0 }, active, now), { corrections_revision: "4" });
    assert.deepEqual(await store.correct({ slot, expected_revision: "4", correction: "remove", subject: otherSubject }, active, now), { corrections_revision: "5" });

    const otherActor = createSurfaceCorrections(first.db, { ...user, actor_id: "second" });
    const otherProject = createSurfaceCorrections(other.db, user);
    const plugin = createSurfaceCorrections(first.db, { ...user, audience: "plugin" });
    for (const isolated of [otherActor, otherProject, plugin]) assert.deepEqual(isolated.read(slot), empty);
    assert.deepEqual(store.read(otherSlot), empty);
    await assert.rejects(plugin.correct(choose(slot), active, now), { code: "actions.forbidden" });
    assert.deepEqual(await otherActor.correct(choose(slot), active, now), { corrections_revision: "1" });
    assert.deepEqual(await otherProject.correct(choose(slot), active, now), { corrections_revision: "1" });
    assert.deepEqual(await store.correct(choose(otherSlot), active, now), { corrections_revision: "1" });
  } finally {
    first.close();
    other.close();
  }

  const reopened = new LocalProjectDatabase(path);
  try {
    assert.deepEqual(createSurfaceCorrections(reopened.db, user).read(slot), {
      revision: "5",
      corrections: [
        { subject: { kind: "record", id: "part:one" }, correction: "remove", form: null, position: null },
        { subject, correction: "pin", form: null, position: 0 },
        { subject, correction: "form", form: "row", position: null },
        { correction: "form", form: "card", position: null },
      ],
    });
  } finally { reopened.close(); }
});

test("SCS-10 one overlapping command wins and stale, revoked or cancelled commands leave its correction intact", async t => {
  const directory = mkdtempSync(join(tmpdir(), "surface-corrections-fence-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = new LocalProjectDatabase(join(directory, "project.db"));
  try {
    const store = createSurfaceCorrections(database.db, user);
    const waiting = Promise.withResolvers<void>();
    const delayed = store.correct({ ...choose(slot), form: "card" }, { ...active, beforeEffect: () => waiting.promise }, now);
    await store.correct(choose(slot), active, now);
    waiting.resolve();
    await assert.rejects(delayed, { code: "surfaces.correction_conflict", details: { corrections_revision: "1" } });

    const abort = new AbortController();
    const cancelled = store.correct(choose(slot, "1"), {
      ...active, current: () => abort.signal.throwIfAborted(),
    }, now);
    abort.abort();
    await assert.rejects(cancelled, { name: "AbortError" });

    let authorized = true;
    await assert.rejects(store.correct(choose(slot, "1"), {
      ...active,
      current: () => { if (!authorized) throw new ActionError("actions.forbidden", "Authority was revoked"); },
    }, () => { authorized = false; return now(); }), { code: "actions.forbidden" });
    assert.deepEqual(store.read(slot), {
      revision: "1", corrections: [{ correction: "form", form: "row", position: null }],
    });
  } finally { database.close(); }
});
